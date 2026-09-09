import * as THREE from 'three';
import { createContactShadow } from './ContactShadow.js';
import { createKeycapPlatformModel } from './KeycapPlatformMesh.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';

const PLATFORM_COLLIDER_FRICTION = 0.9;
const CONTACT_SHADOW_RADIUS = 3.2;

// Rotates a local (right, forward) offset by a yaw around the up axis - same
// technique as DesktopEnvironment.js's rotatePlanarOffsetByYaw, used here to
// place the course-end folder's tab collider in world space.
function rotatePlanarOffsetByYaw(localRight, localForward, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    right: localRight * cos - localForward * sin,
    forward: localRight * sin + localForward * cos,
  };
}

// A jump-platforming course: a handful of stepping platforms (some static,
// some sliding back and forth) at increasing height along a fixed direction,
// ending on a folder (built via the injected `createFolderMesh`, standing
// normally on the ground) whose roof holds a fragment. See DesktopEnvironment.js
// for how the 3 courses (easy/medium/hard) configure this generically.
//
// Rapier's kinematic character controller does not carry a character along a
// moving platform automatically (computeColliderMovement/computedGrounded()
// only report a boolean, not the body rested on) - see getMovingPlatforms(),
// consumed by main.js to manually nudge the player each frame.
export class JumpCourse {
  constructor({
    basis,
    floorUp,
    objectRotation,
    createFolderMesh,
    folderBodySize,
    folderTabSize,
    folderTabLocalOffset,
    direction,
    entryDistance,
    platformSize,
    platforms,
    airGap,
    fallCaptureRadius,
    keepoutRadius,
  }) {
    this.basis = basis;
    this.floorUp = floorUp;
    this.objectRotation = objectRotation;
    this.createFolderMesh = createFolderMesh;
    this.folderBodySize = folderBodySize;
    this.folderTabSize = folderTabSize;
    this.folderTabLocalOffset = folderTabLocalOffset;
    this.direction = direction;
    this.platformSize = platformSize;
    this.keepoutRadius = keepoutRadius;

    this.yaw = this.basis.forwardToYaw(
      this.basis.fromBasisComponents(direction.right, 0, direction.forward)
    );

    this.group = new THREE.Group();
    this.physicsWorld = null;
    this.rapier = null;
    this.physicsColliders = [];
    this.movingPlatforms = [];

    this._layout({ entryDistance, platformSize, platforms, airGap, fallCaptureRadius });
  }

  // Computes, for every stepping platform and the final folder, its distance
  // along the course and its "along-travel" half-extent - a moving platform's
  // half-extent is inflated by its oscillation amplitude, so the *next* gap's
  // sizing/checkpoint always stays clear of it regardless of where it is in
  // its cycle. Also builds one fall-checkpoint per gap, at its open-air
  // midpoint (accounting for the differing half-extents on each side), each
  // carrying this course's own entry point.
  _layout({ entryDistance, platformSize, platforms, airGap, fallCaptureRadius }) {
    const staticAlongHalf = platformSize.forward / 2;
    const folderAlongHalf = this.folderBodySize.forward / 2;
    this.entryPlanar = this._pointAt(entryDistance);

    const elements = [];
    let previousDistance = entryDistance;
    let previousAlongHalf = 0;

    for (const platform of platforms) {
      const alongHalf = staticAlongHalf + (platform.moving ? platform.moving.amplitude : 0);
      const gap = previousAlongHalf + airGap + alongHalf;
      const distance = previousDistance + gap;
      const midpointDistance = previousDistance + (gap + previousAlongHalf - alongHalf) / 2;

      elements.push({
        distance,
        alongHalf,
        height: platform.height,
        moving: platform.moving ?? null,
        midpointDistance,
      });

      previousDistance = distance;
      previousAlongHalf = alongHalf;
    }

    const folderGap = previousAlongHalf + airGap + folderAlongHalf;
    const folderDistance = previousDistance + folderGap;
    const folderMidpointDistance = previousDistance + (folderGap + previousAlongHalf - folderAlongHalf) / 2;

    this.platformElements = elements;
    this.folderPlanar = this._pointAt(folderDistance);
    this.folderHeight = this.folderBodySize.up;

    this.fallCheckpoints = [
      ...elements.map((element) => ({
        planar: this._pointAt(element.midpointDistance),
        height: element.height,
      })),
      { planar: this._pointAt(folderMidpointDistance), height: this.folderHeight },
    ].map(({ planar, height }) => ({
      position: this.basis.fromBasisComponents(planar.right, this.floorUp + height, planar.forward),
      captureRadius: fallCaptureRadius,
      entryPoint: this.getEntryPoint(),
    }));
  }

  _pointAt(distance) {
    return { right: this.direction.right * distance, forward: this.direction.forward * distance };
  }

  _rotation(yaw) {
    return new THREE.Quaternion().setFromAxisAngle(this.basis.upVector(), yaw).multiply(this.objectRotation);
  }

  create() {
    for (const element of this.platformElements) {
      const mesh = createKeycapPlatformModel({ size: this.platformSize, moving: Boolean(element.moving) });
      mesh.quaternion.copy(this._rotation(this.yaw));
      mesh.add(createContactShadow({ radius: CONTACT_SHADOW_RADIUS, basis: this.basis }));
      this.group.add(mesh);
      element.mesh = mesh;

      if (element.moving) {
        this.movingPlatforms.push({
          element,
          mesh,
          phase: 0,
          currentPlanar: null,
          previousPlanar: null,
          delta: new THREE.Vector3(),
        });
      }
    }

    const folder = this.createFolderMesh();
    folder.position.copy(this.basis.fromBasisComponents(this.folderPlanar.right, this.floorUp, this.folderPlanar.forward));
    folder.quaternion.copy(this._rotation(this.yaw));
    this.group.add(folder);
    this.folderMesh = folder;

    this._positionElements();
    return this;
  }

  // Places every platform at its resting (phase=0) position; moving ones are
  // then advanced frame by frame via update().
  _positionElements() {
    for (const element of this.platformElements) {
      const planar = this._pointAt(element.distance);
      element.mesh.position.copy(this.basis.fromBasisComponents(
        planar.right,
        this.floorUp + element.height - this.platformSize.up * 0.5,
        planar.forward
      ));
      const moving = this.movingPlatforms.find((entry) => entry.element === element);
      if (moving) moving.currentPlanar = planar;
    }
  }

  update(deltaSeconds) {
    for (const moving of this.movingPlatforms) {
      const { element } = moving;
      const previousPlanar = moving.currentPlanar;
      moving.phase += deltaSeconds * (Math.PI * 2 / element.moving.periodSeconds);
      const offset = element.moving.amplitude * Math.sin(moving.phase);
      const nextPlanar = {
        right: this.direction.right * (element.distance + offset),
        forward: this.direction.forward * (element.distance + offset),
      };

      const nextPosition = this.basis.fromBasisComponents(
        nextPlanar.right,
        this.floorUp + element.height - this.platformSize.up * 0.5,
        nextPlanar.forward
      );
      element.mesh.position.copy(nextPosition);
      if (moving.body) {
        moving.body.setNextKinematicTranslation(nextPosition);
      }

      moving.delta.copy(this.basis.fromBasisComponents(
        nextPlanar.right - previousPlanar.right,
        0,
        nextPlanar.forward - previousPlanar.forward
      ));
      moving.previousPlanar = previousPlanar;
      moving.currentPlanar = nextPlanar;
    }
  }

  createStaticCuboidCollider(box, rotation, friction) {
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

  createKinematicCuboidCollider(position, rotation, spans, friction) {
    const body = this.physicsWorld.createRigidBody(
      this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    );
    const collider = this.physicsWorld.createCollider(
      this.rapier.ColliderDesc.cuboid(spans.right * 0.5, spans.up * 0.5, spans.forward * 0.5)
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

    for (const element of this.platformElements) {
      const moving = this.movingPlatforms.find((entry) => entry.element === element);
      if (moving) {
        const entry = this.createKinematicCuboidCollider(
          element.mesh.position,
          this._rotation(this.yaw),
          this.platformSize,
          PLATFORM_COLLIDER_FRICTION
        );
        moving.body = entry.body;
        this.physicsColliders.push(entry);
      } else {
        const planar = this._pointAt(element.distance);
        const box = {
          right: planar.right,
          up: this.floorUp + element.height - this.platformSize.up * 0.5,
          forward: planar.forward,
          spanRight: this.platformSize.right,
          spanUp: this.platformSize.up,
          spanForward: this.platformSize.forward,
        };
        this.physicsColliders.push(this.createStaticCuboidCollider(box, this._rotation(this.yaw), PLATFORM_COLLIDER_FRICTION));
      }
    }

    const folderBox = {
      right: this.folderPlanar.right,
      up: this.floorUp + this.folderBodySize.up * 0.5,
      forward: this.folderPlanar.forward,
      spanRight: this.folderBodySize.right,
      spanUp: this.folderBodySize.up,
      spanForward: this.folderBodySize.forward,
    };
    this.physicsColliders.push(this.createStaticCuboidCollider(folderBox, this._rotation(this.yaw), PLATFORM_COLLIDER_FRICTION));

    // The tab sits above the body's own roof and previously had no collider
    // of its own (see DesktopEnvironment.js's matching fix for desktop folders).
    const tabWorldOffset = rotatePlanarOffsetByYaw(
      this.folderTabLocalOffset.right,
      this.folderTabLocalOffset.forward,
      this.yaw
    );
    const tabBox = {
      right: this.folderPlanar.right + tabWorldOffset.right,
      up: this.floorUp + this.folderTabLocalOffset.up,
      forward: this.folderPlanar.forward + tabWorldOffset.forward,
      spanRight: this.folderTabSize.right,
      spanUp: this.folderTabSize.up,
      spanForward: this.folderTabSize.forward,
    };
    this.physicsColliders.push(this.createStaticCuboidCollider(tabBox, this._rotation(this.yaw), PLATFORM_COLLIDER_FRICTION));

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

  getKeepoutPoints() {
    return [
      ...this.platformElements.map((element) => this._pointAt(element.distance)),
      this.folderPlanar,
    ];
  }

  getEntryPoint() {
    return this.basis.fromBasisComponents(this.entryPlanar.right, this.floorUp, this.entryPlanar.forward);
  }

  getFragmentPosition() {
    return this.basis.fromBasisComponents(this.folderPlanar.right, this.floorUp + this.folderHeight, this.folderPlanar.forward);
  }

  getFallCheckpoints() {
    return this.fallCheckpoints;
  }

  // For each moving platform: its footprint *before* this frame's move (to
  // match where the player would have last been resting on it), half-extents
  // along/across this course's own direction (the platform is rotated to
  // face it, see `_rotation`/`courseYaw`), top height, and this frame's
  // movement delta - consumed by main.js's moving-platform rider to carry
  // the player along.
  getMovingPlatforms() {
    return this.movingPlatforms.map((moving) => ({
      previousFootprintCenter: moving.previousPlanar,
      direction: this.direction,
      alongHalf: this.platformSize.forward / 2,
      acrossHalf: this.platformSize.right / 2,
      topHeight: this.floorUp + moving.element.height,
      delta: moving.delta,
    }));
  }

  dispose() {
    this.disposePhysicsColliders();
    disposeObject3D(this.group);
  }
}
