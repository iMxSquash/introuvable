import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { DEFAULT_PRNG } from '../modules/math/RandomUtils.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';
import { createWorldBoundsColliders } from '../modules/world/environment/WorldBoundsColliderFactory.js';
import { SpawnAreaSampler, SPAWN_REGION_TYPES } from '../modules/world/environment/SpawnAreaSampler.js';
import { FOLDER_BLUE, TRASH_GRAY } from './Palette.js';
import { createContactShadow } from './ContactShadow.js';

// Provisional macOS-ish tones. The real wallpaper texture is added once the
// actual portfolio wallpaper asset exists (none is committed yet in the
// portfolio repo) - `wallpaperTexture` lets it be swapped in without
// touching this class.
const PLACEHOLDER_GROUND_COLOR = 0x8fadd1;
const PLACEHOLDER_SKY_COLOR = 0xc7d7ea;
const FOLDER_COLOR = FOLDER_BLUE;
const TRASH_CAN_COLOR = TRASH_GRAY;
const FOLDER_SHADOW_RADIUS = 3.2;

const FOLDER_BODY_SIZE = Object.freeze({ right: 4.4, up: 3.0, forward: 3.2 });
const FOLDER_TAB_SIZE = Object.freeze({ right: 1.85, up: 0.66, forward: 1.6 });
const FOLDER_GRID_SPACING = 13;
const FOLDER_GRID_RADIUS_CELLS = 2;
const FOLDER_JITTER = 3;
const FOLDER_WORLD_MARGIN = 9;
const SPAWN_KEEPOUT_RADIUS = 12;
const FOLDER_COLLIDER_FRICTION = 0.9;

const TRASH_CAN_RADIUS = 7;
const TRASH_CAN_HEIGHT = 14;
const TRASH_CAN_MARGIN_FROM_EDGE = 9;
const TRASH_CAN_KEEPOUT_RADIUS = TRASH_CAN_RADIUS + 6;
const TRASH_CAN_ENTRY_RING_INNER = TRASH_CAN_RADIUS * 0.7;
const TRASH_CAN_ENTRY_RING_OUTER = TRASH_CAN_RADIUS * 0.95;

const FRAGMENT_SAMPLE_ATTEMPTS = 30;
const FRAGMENT_MIN_DISTANCE_FROM_SPAWN = 14;
const FRAGMENT_MIN_DISTANCE_BETWEEN = 8;

const WORLD_BOUNDS_WALL_HEIGHT = 16;
const WORLD_BOUNDS_WALL_THICKNESS = 1.6;

const AMBIENT_LIGHT_COLOR = 0xffffff;
const AMBIENT_LIGHT_INTENSITY = 0.65;
const DIRECTIONAL_LIGHT_COLOR = 0xfff3e0;
const DIRECTIONAL_LIGHT_INTENSITY = 1.15;
const SHADOW_MAP_SIZE = 2048;

const folderBodyGeometry = new THREE.BoxGeometry(
  FOLDER_BODY_SIZE.right,
  FOLDER_BODY_SIZE.up,
  FOLDER_BODY_SIZE.forward
);
const folderTabGeometry = new THREE.BoxGeometry(
  FOLDER_TAB_SIZE.right,
  FOLDER_TAB_SIZE.up,
  FOLDER_TAB_SIZE.forward
);
// Folders are visually identical low-poly buildings: one shared material for
// every instance instead of one per folder.
const folderMaterial = new THREE.MeshStandardMaterial({
  color: FOLDER_COLOR,
  roughness: 0.75,
  metalness: 0.05,
  flatShading: true,
});

function buildFolderGridCells(worldSize, prng, trashCanPlanar) {
  const halfSize = worldSize * 0.5 - FOLDER_WORLD_MARGIN;
  const cells = [];

  for (let row = -FOLDER_GRID_RADIUS_CELLS; row <= FOLDER_GRID_RADIUS_CELLS; row += 1) {
    for (let col = -FOLDER_GRID_RADIUS_CELLS; col <= FOLDER_GRID_RADIUS_CELLS; col += 1) {
      const right = col * FOLDER_GRID_SPACING + prng.uniform(-FOLDER_JITTER, FOLDER_JITTER);
      const forward = row * FOLDER_GRID_SPACING + prng.uniform(-FOLDER_JITTER, FOLDER_JITTER);

      if (Math.abs(right) > halfSize || Math.abs(forward) > halfSize) continue;
      if (Math.hypot(right, forward) < SPAWN_KEEPOUT_RADIUS) continue;
      if (Math.hypot(right - trashCanPlanar.right, forward - trashCanPlanar.forward) < TRASH_CAN_KEEPOUT_RADIUS) continue;

      cells.push({ right, forward, yaw: prng.uniform(0, Math.PI * 2) });
    }
  }

  return cells;
}

export class DesktopEnvironment {
  constructor({
    scene,
    worldSize = 70,
    floorUp = 0,
    basis = DEFAULT_WORLD_BASIS,
    prng = DEFAULT_PRNG,
    wallpaperTexture = null,
  }) {
    this.scene = scene;
    this.worldSize = worldSize;
    this.floorUp = floorUp;
    this.basis = basis;
    this.prng = prng;
    this.wallpaperTexture = wallpaperTexture;

    this.objectRotation = this.basis.threeObjectCanonicalToBasisQuaternion();
    this.planeRotation = this.basis.threePlaneCanonicalToBasisQuaternion();
    this.group = new THREE.Group();
    this.group.name = 'DesktopEnvironment';

    this.trashCanPosition = this.basis.fromBasisComponents(
      0,
      this.floorUp,
      this.worldSize * 0.5 - TRASH_CAN_MARGIN_FROM_EDGE
    );
    this.trashCanPlanar = this.basis.toPlanar(this.trashCanPosition);

    this.folderLayout = buildFolderGridCells(this.worldSize, this.prng, this.trashCanPlanar);
    this.spawnSampler = this.createSpawnSampler();

    this.physicsWorld = null;
    this.rapier = null;
    this.physicsColliders = [];
  }

  create() {
    this.scene.background = new THREE.Color(PLACEHOLDER_SKY_COLOR);
    this.scene.fog = new THREE.Fog(
      PLACEHOLDER_SKY_COLOR,
      this.worldSize * 0.35,
      this.worldSize * 0.95
    );

    this.createLighting();
    this.createGround();
    this.createFolders();
    this.createTrashCan();
    this.scene.add(this.group);
    return this;
  }

  createLighting() {
    const ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    this.group.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      DIRECTIONAL_LIGHT_COLOR,
      DIRECTIONAL_LIGHT_INTENSITY
    );
    directionalLight.position.copy(
      this.basis.fromBasisComponents(this.worldSize * 0.25, this.worldSize * 0.5, -this.worldSize * 0.2)
    );
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = this.worldSize * 1.5;
    directionalLight.shadow.camera.left = -this.worldSize * 0.6;
    directionalLight.shadow.camera.right = this.worldSize * 0.6;
    directionalLight.shadow.camera.top = this.worldSize * 0.6;
    directionalLight.shadow.camera.bottom = -this.worldSize * 0.6;
    directionalLight.shadow.bias = -0.0015;
    this.group.add(directionalLight);
  }

  createGround() {
    const material = new THREE.MeshStandardMaterial({
      color: this.wallpaperTexture ? 0xffffff : PLACEHOLDER_GROUND_COLOR,
      map: this.wallpaperTexture,
      roughness: 1,
      metalness: 0,
    });

    // A real hole under the entry ring, not just a solid plane: without it,
    // the ground (visible only from above) sits between the elevated follow
    // camera and the Trash Can interior below, hiding it completely.
    const halfSize = this.worldSize * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-halfSize, -halfSize);
    shape.lineTo(halfSize, -halfSize);
    shape.lineTo(halfSize, halfSize);
    shape.lineTo(-halfSize, halfSize);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(this.trashCanPlanar.right, this.trashCanPlanar.forward, TRASH_CAN_ENTRY_RING_OUTER, 0, Math.PI * 2, false);
    shape.holes.push(hole);

    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material);
    ground.position.copy(this.basis.fromBasisComponents(0, this.floorUp, 0));
    ground.quaternion.copy(this.planeRotation);
    ground.receiveShadow = true;
    // Also casts a shadow so the Trash Can interior built just beneath it
    // (Phase 4) reads as genuinely darker without extra fake-dark hacks.
    ground.castShadow = true;
    this.group.add(ground);
    this.groundMesh = ground;
  }

  // Raycast targets for click-to-move aiming (AimResolver).
  getRaycastTargets() {
    return [this.groundMesh];
  }

  createFolderMesh() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(folderBodyGeometry, folderMaterial);
    body.position.copy(this.basis.fromBasisComponents(0, FOLDER_BODY_SIZE.up * 0.5, 0));
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const tab = new THREE.Mesh(folderTabGeometry, folderMaterial);
    tab.position.copy(this.basis.fromBasisComponents(
      -(FOLDER_BODY_SIZE.right * 0.5 - FOLDER_TAB_SIZE.right * 0.5),
      FOLDER_BODY_SIZE.up + FOLDER_TAB_SIZE.up * 0.5,
      -(FOLDER_BODY_SIZE.forward * 0.5 - FOLDER_TAB_SIZE.forward * 0.5)
    ));
    tab.castShadow = true;
    group.add(tab);

    group.add(createContactShadow({ radius: FOLDER_SHADOW_RADIUS, basis: this.basis }));

    return group;
  }

  folderRotation(yaw) {
    return new THREE.Quaternion()
      .setFromAxisAngle(this.basis.upVector(), yaw)
      .multiply(this.objectRotation);
  }

  createFolders() {
    for (const folder of this.folderLayout) {
      const mesh = this.createFolderMesh();
      mesh.position.copy(this.basis.fromBasisComponents(folder.right, this.floorUp, folder.forward));
      mesh.quaternion.copy(this.folderRotation(folder.yaw));
      this.group.add(mesh);
      folder.mesh = mesh;
    }
  }

  createTrashCan() {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: TRASH_CAN_COLOR,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(TRASH_CAN_RADIUS, TRASH_CAN_RADIUS * 1.08, TRASH_CAN_HEIGHT, 24, 1, true),
      bodyMaterial
    );
    body.position.copy(this.basis.fromBasisComponents(
      this.trashCanPlanar.right,
      this.floorUp + TRASH_CAN_HEIGHT * 0.5,
      this.trashCanPlanar.forward
    ));
    body.quaternion.copy(this.objectRotation);
    this.group.add(body);

    const entryRing = new THREE.Mesh(
      new THREE.RingGeometry(TRASH_CAN_ENTRY_RING_INNER, TRASH_CAN_ENTRY_RING_OUTER, 32),
      new THREE.MeshStandardMaterial({
        color: 0xe4e9ee,
        roughness: 0.9,
        side: THREE.DoubleSide,
      })
    );
    entryRing.position.copy(this.basis.fromBasisComponents(
      this.trashCanPlanar.right,
      this.floorUp + 0.01,
      this.trashCanPlanar.forward
    ));
    entryRing.quaternion.copy(this.planeRotation);
    this.group.add(entryRing);
  }

  createSpawnSampler() {
    const halfSize = this.worldSize * 0.5 - FOLDER_WORLD_MARGIN;

    const blockRegions = this.folderLayout.map((folder) => ({
      type: SPAWN_REGION_TYPES.CIRCLE,
      center: { right: folder.right, forward: folder.forward },
      radius: Math.hypot(FOLDER_BODY_SIZE.right, FOLDER_BODY_SIZE.forward) * 0.5,
      clearance: 1.5,
    }));

    blockRegions.push({
      type: SPAWN_REGION_TYPES.CIRCLE,
      center: this.trashCanPlanar,
      radius: TRASH_CAN_KEEPOUT_RADIUS,
      clearance: 0,
    });

    return new SpawnAreaSampler({
      bounds: { rightMin: -halfSize, rightMax: halfSize, forwardMin: -halfSize, forwardMax: halfSize },
      spawnRegions: [{
        type: SPAWN_REGION_TYPES.RECT,
        center: { right: 0, forward: 0 },
        size: { right: halfSize * 2, forward: halfSize * 2 },
      }],
      blockRegions,
    });
  }

  samplePlayerSpawn(prng = this.prng) {
    const planar = this.spawnSampler.sample(prng) ?? { right: 0, forward: 0 };
    return this.basis.fromBasisComponents(planar.right, this.floorUp, planar.forward);
  }

  // Desktop-scattered fragment positions: away from the player's spawn point
  // and from each other, never inside a folder or the trash can (same
  // exclusions as samplePlayerSpawn, via the shared spawnSampler).
  sampleFragmentPositions(count, prng = this.prng, spawnPlanar = { right: 0, forward: 0 }) {
    const planarPoints = [];

    for (let i = 0; i < count; i += 1) {
      let accepted = null;
      for (let attempt = 0; attempt < FRAGMENT_SAMPLE_ATTEMPTS; attempt += 1) {
        const candidate = this.spawnSampler.sample(prng);
        if (!candidate) break;

        const farFromSpawn = Math.hypot(
          candidate.right - spawnPlanar.right,
          candidate.forward - spawnPlanar.forward
        ) >= FRAGMENT_MIN_DISTANCE_FROM_SPAWN;
        const farFromOthers = planarPoints.every((point) => Math.hypot(
          candidate.right - point.right,
          candidate.forward - point.forward
        ) >= FRAGMENT_MIN_DISTANCE_BETWEEN);

        if (farFromSpawn && farFromOthers) {
          accepted = candidate;
          break;
        }
      }
      if (accepted) planarPoints.push(accepted);
    }

    return planarPoints.map((point) => this.basis.fromBasisComponents(point.right, this.floorUp, point.forward));
  }

  createStaticCuboidCollider(box, rotation, friction = 1) {
    const position = this.basis.fromBasisComponents(box.right, box.up, box.forward);
    const body = this.physicsWorld.createRigidBody(
      this.rapier.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    );
    const collider = this.physicsWorld.createCollider(
      this.rapier.ColliderDesc.cuboid(box.spanRight * 0.5, box.spanUp * 0.5, box.spanForward * 0.5)
        .setFriction(friction)
        .setRestitution(0),
      body
    );
    return { body, collider };
  }

  createPhysicsColliders(world, rapier) {
    this.disposePhysicsColliders();
    this.physicsWorld = world;
    this.rapier = rapier;
    this.physicsColliders = [];

    const groundBox = {
      right: 0,
      up: this.floorUp - 0.1,
      forward: 0,
      spanRight: this.worldSize,
      spanUp: 0.2,
      spanForward: this.worldSize,
    };
    this.physicsColliders.push(this.createStaticCuboidCollider(groundBox, this.objectRotation, 1));

    for (const folder of this.folderLayout) {
      const folderBox = {
        right: folder.right,
        up: this.floorUp + FOLDER_BODY_SIZE.up * 0.5,
        forward: folder.forward,
        spanRight: FOLDER_BODY_SIZE.right,
        spanUp: FOLDER_BODY_SIZE.up,
        spanForward: FOLDER_BODY_SIZE.forward,
      };
      this.physicsColliders.push(
        this.createStaticCuboidCollider(folderBox, this.folderRotation(folder.yaw), FOLDER_COLLIDER_FRICTION)
      );
    }

    const halfSize = this.worldSize * 0.5;
    const boundsWalls = createWorldBoundsColliders({
      world,
      rapier,
      minRight: -halfSize,
      maxRight: halfSize,
      minForward: -halfSize,
      maxForward: halfSize,
      wallThickness: WORLD_BOUNDS_WALL_THICKNESS,
      wallHeight: WORLD_BOUNDS_WALL_HEIGHT,
      centerUp: this.floorUp + WORLD_BOUNDS_WALL_HEIGHT * 0.5,
      basis: this.basis,
    });
    this.physicsColliders.push(...boundsWalls);

    return this.physicsColliders;
  }

  disposePhysicsColliders() {
    if (this.physicsWorld) {
      for (const entry of this.physicsColliders) {
        this.physicsWorld.removeRigidBody(entry.body);
      }
    }
    this.physicsColliders = [];
    this.physicsWorld = null;
    this.rapier = null;
  }

  dispose() {
    this.disposePhysicsColliders();
    disposeObject3D(this.group);
  }
}
