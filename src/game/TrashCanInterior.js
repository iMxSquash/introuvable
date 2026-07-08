import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';

const SEGMENT_COUNT = 16;
const HEIGHT_PER_SEGMENT = 1.05;
const TOTAL_DEPTH = SEGMENT_COUNT * HEIGHT_PER_SEGMENT;
const OUTER_RADIUS = 6;
const CORRIDOR_WIDTH = 3.4;
const INNER_RADIUS = OUTER_RADIUS - CORRIDOR_WIDTH;
const WALL_HEIGHT = 2.6;
// Just below the desktop ground plane: the plane's top face hides this from
// above (single-sided material), so no visible hole needs to be cut in it.
const ENTRY_Y_OFFSET = -0.6;

const CHAMBER_RADIUS = OUTER_RADIUS + 2;
const CHAMBER_WALL_SEGMENTS = 28;

const FLOOR_COLOR = 0x2c3038;
const WALL_COLOR = 0x23262c;
const FRAGMENT_GLOW_COLOR = 0x9fd2ff;

export class TrashCanInterior {
  constructor({ scene, trashCanPlanar, floorUp = 0, basis = DEFAULT_WORLD_BASIS }) {
    this.scene = scene;
    this.basis = basis;
    this.center = { right: trashCanPlanar.right, forward: trashCanPlanar.forward };
    this.entryHeight = floorUp + ENTRY_Y_OFFSET;
    this.midRadius = (INNER_RADIUS + OUTER_RADIUS) * 0.5;

    this.group = new THREE.Group();
    this.group.name = 'TrashCanInterior';

    this.physicsWorld = null;
    this.rapier = null;
    this.physicsColliders = [];
  }

  ringPoint(radius, angle, height) {
    return this.basis.fromBasisComponents(
      this.center.right + radius * Math.cos(angle),
      height,
      this.center.forward + radius * Math.sin(angle)
    );
  }

  heightAtTurnRatio(turnRatio) {
    return this.entryHeight - turnRatio * TOTAL_DEPTH;
  }

  create() {
    this.rampGeometry = this._buildRampGeometry();
    this.wallGeometries = this._buildCorridorWallGeometries();
    this.chamberFloorGeometry = this._buildChamberFloorGeometry();
    this.chamberWallGeometry = this._buildChamberWallGeometry();

    const material = (color) => new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    for (const geometry of [this.rampGeometry, this.chamberFloorGeometry]) {
      const mesh = new THREE.Mesh(geometry, material(FLOOR_COLOR));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    for (const geometry of [...this.wallGeometries, this.chamberWallGeometry]) {
      const mesh = new THREE.Mesh(geometry, material(WALL_COLOR));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    const fragmentGlow = new THREE.PointLight(FRAGMENT_GLOW_COLOR, 1.4, CHAMBER_RADIUS * 2.6, 2);
    fragmentGlow.position.copy(this.getFragmentPosition());
    this.group.add(fragmentGlow);

    this.scene.add(this.group);
    return this;
  }

  _buildRampGeometry() {
    const positions = [];
    const indices = [];
    const addVertex = (radius, angle, height) => {
      const point = this.ringPoint(radius, angle, height);
      positions.push(point.x, point.y, point.z);
      return positions.length / 3 - 1;
    };

    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const startRatio = i / SEGMENT_COUNT;
      const endRatio = (i + 1) / SEGMENT_COUNT;
      const angleStart = startRatio * Math.PI * 2;
      const angleEnd = endRatio * Math.PI * 2;
      const heightStart = this.heightAtTurnRatio(startRatio);
      const heightEnd = this.heightAtTurnRatio(endRatio);

      const outerStart = addVertex(OUTER_RADIUS, angleStart, heightStart);
      const innerStart = addVertex(INNER_RADIUS, angleStart, heightStart);
      const innerEnd = addVertex(INNER_RADIUS, angleEnd, heightEnd);
      const outerEnd = addVertex(OUTER_RADIUS, angleEnd, heightEnd);

      indices.push(outerStart, innerStart, innerEnd);
      indices.push(outerStart, innerEnd, outerEnd);
    }

    return this._toGeometry(positions, indices);
  }

  _buildCorridorWallGeometries() {
    return [OUTER_RADIUS, INNER_RADIUS].map((radius) => {
      const positions = [];
      const indices = [];
      const addVertex = (angle, height) => {
        const point = this.ringPoint(radius, angle, height);
        positions.push(point.x, point.y, point.z);
        return positions.length / 3 - 1;
      };

      for (let i = 0; i < SEGMENT_COUNT; i += 1) {
        const startRatio = i / SEGMENT_COUNT;
        const endRatio = (i + 1) / SEGMENT_COUNT;
        const angleStart = startRatio * Math.PI * 2;
        const angleEnd = endRatio * Math.PI * 2;
        const heightStart = this.heightAtTurnRatio(startRatio);
        const heightEnd = this.heightAtTurnRatio(endRatio);

        const bottomStart = addVertex(angleStart, heightStart);
        const topStart = addVertex(angleStart, heightStart + WALL_HEIGHT);
        const topEnd = addVertex(angleEnd, heightEnd + WALL_HEIGHT);
        const bottomEnd = addVertex(angleEnd, heightEnd);

        indices.push(bottomStart, topStart, topEnd);
        indices.push(bottomStart, topEnd, bottomEnd);
      }

      return this._toGeometry(positions, indices);
    });
  }

  _buildChamberFloorGeometry() {
    const chamberHeight = this.entryHeight - TOTAL_DEPTH;
    const positions = [];
    const indices = [];

    const center = this.ringPoint(0, 0, chamberHeight);
    positions.push(center.x, center.y, center.z);
    const centerIndex = 0;

    const ringIndices = [];
    for (let i = 0; i <= CHAMBER_WALL_SEGMENTS; i += 1) {
      const angle = (i / CHAMBER_WALL_SEGMENTS) * Math.PI * 2;
      const point = this.ringPoint(CHAMBER_RADIUS, angle, chamberHeight);
      positions.push(point.x, point.y, point.z);
      ringIndices.push(positions.length / 3 - 1);
    }
    for (let i = 0; i < CHAMBER_WALL_SEGMENTS; i += 1) {
      indices.push(centerIndex, ringIndices[i], ringIndices[i + 1]);
    }

    return this._toGeometry(positions, indices);
  }

  _buildChamberWallGeometry() {
    const chamberHeight = this.entryHeight - TOTAL_DEPTH;
    const positions = [];
    const indices = [];
    const addVertex = (angle, height) => {
      const point = this.ringPoint(CHAMBER_RADIUS, angle, height);
      positions.push(point.x, point.y, point.z);
      return positions.length / 3 - 1;
    };

    for (let i = 0; i < CHAMBER_WALL_SEGMENTS; i += 1) {
      const angleStart = (i / CHAMBER_WALL_SEGMENTS) * Math.PI * 2;
      const angleEnd = ((i + 1) / CHAMBER_WALL_SEGMENTS) * Math.PI * 2;

      const bottomStart = addVertex(angleStart, chamberHeight);
      const topStart = addVertex(angleStart, chamberHeight + WALL_HEIGHT);
      const topEnd = addVertex(angleEnd, chamberHeight + WALL_HEIGHT);
      const bottomEnd = addVertex(angleEnd, chamberHeight);

      indices.push(bottomStart, topStart, topEnd);
      indices.push(bottomStart, topEnd, bottomEnd);
    }

    return this._toGeometry(positions, indices);
  }

  _toGeometry(positions, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  _createTrimeshCollider(geometry) {
    const positionAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();
    const desc = this.rapier.ColliderDesc.trimesh(
      new Float32Array(positionAttr.array),
      new Uint32Array(indexAttr.array)
    ).setFriction(1).setRestitution(0);
    const body = this.physicsWorld.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    const collider = this.physicsWorld.createCollider(desc, body);
    return { body, collider };
  }

  createPhysicsColliders(world, rapier) {
    this.disposePhysicsColliders();
    this.physicsWorld = world;
    this.rapier = rapier;

    const geometries = [
      this.rampGeometry,
      ...this.wallGeometries,
      this.chamberFloorGeometry,
      this.chamberWallGeometry,
    ];
    this.physicsColliders = geometries.map((geometry) => this._createTrimeshCollider(geometry));
    return this.physicsColliders;
  }

  disposePhysicsColliders() {
    if (this.physicsWorld) {
      for (const entry of this.physicsColliders) this.physicsWorld.removeRigidBody(entry.body);
    }
    this.physicsColliders = [];
    this.physicsWorld = null;
    this.rapier = null;
  }

  // Top of the spiral, on the walkway centerline: where the player arrives
  // after entering from the desktop, and where leaving returns them.
  getEntryPoint() {
    return this.ringPoint(this.midRadius, 0, this.entryHeight);
  }

  // Bottom chamber center: where the final fragment sits and glows.
  getFragmentPosition() {
    return this.ringPoint(0, 0, this.entryHeight - TOTAL_DEPTH);
  }

  // Waypoints along the walkway centerline between two points of the spiral
  // (0 = entry turn, 1 = one full turn down), for a guard's patrol arc.
  getArcWaypoints(startTurnRatio, endTurnRatio, count) {
    const waypoints = [];
    const stepCount = Math.max(1, count - 1);
    for (let i = 0; i < count; i += 1) {
      const ratio = startTurnRatio + (endTurnRatio - startTurnRatio) * (i / stepCount);
      waypoints.push(this.ringPoint(this.midRadius, ratio * Math.PI * 2, this.heightAtTurnRatio(ratio)));
    }
    return waypoints;
  }

  dispose() {
    this.disposePhysicsColliders();
    disposeObject3D(this.group);
  }
}
