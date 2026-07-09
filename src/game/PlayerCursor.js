import {
  KinematicBatchResolver,
  KINEMATIC_ACTOR_COLLISION_MODES,
} from '../modules/actor-motion/KinematicBatchResolver.js';
import { WorldTargetCharacterMotionController } from '../modules/actor-motion/character/WorldTargetCharacterMotionController.js';
import { WorldCardinalCharacterMotionController } from '../modules/actor-motion/character/WorldCardinalCharacterMotionController.js';
import { GeneralObjectModelController } from '../modules/actor-motion/GeneralObjectModelController.js';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { createCursorModel } from './CursorMesh.js';

const CURSOR_RADIUS = 0.75;
const CURSOR_HALF_HEIGHT = 0.5;
const WALK_SPEED = 9;
const CURSOR_STOP_RADIUS = 0.4;
const TURN_LAG = 0.08;
const GROUNDED_PROBE_DISTANCE = 0.3;

export class PlayerCursor {
  constructor({ scene, physicsWorld, rapier, basis = DEFAULT_WORLD_BASIS, spawnPosition, cameraAzimuth = 0 }) {
    this.basis = basis;

    this.model = createCursorModel(basis);
    scene.add(this.model);
    this.modelController = new GeneralObjectModelController({
      model: this.model,
      basis,
      keepBasisUp: true,
    });
    this.modelController.reset(spawnPosition);

    this.resolver = new KinematicBatchResolver(
      physicsWorld,
      rapier,
      1 / 240,
      KINEMATIC_ACTOR_COLLISION_MODES.startPositions,
      basis
    );
    this.actor = this.resolver.createActor({
      position: spawnPosition,
      bodyOffset: basis.fromBasisComponents(0, CURSOR_HALF_HEIGHT + CURSOR_RADIUS, 0),
      colliderShape: { type: 'capsule', halfHeight: CURSOR_HALF_HEIGHT, radius: CURSOR_RADIUS },
      colliderOptions: { friction: 0 },
      controllerOptions: {
        offset: 0.02,
        autostep: { enabled: true, maxHeight: 0.3, minWidth: 0.2 },
        snapToGround: 0.3,
        maxSlopeClimbAngle: Math.PI / 4,
        minSlopeSlideAngle: Math.PI / 3,
      },
      groundedProbeDistance: GROUNDED_PROBE_DISTANCE,
    });

    const sharedConfig = { walkSpeed: WALK_SPEED, sprintSpeed: WALK_SPEED, turnLag: TURN_LAG, basis };
    this.targetController = new WorldTargetCharacterMotionController({
      stopRadius: CURSOR_STOP_RADIUS,
      ...sharedConfig,
    });
    this.cardinalController = new WorldCardinalCharacterMotionController({ ...sharedConfig, cameraAzimuth });
    this.targetController.setState({ position: spawnPosition, grounded: true });
    this.cardinalController.setState({ position: spawnPosition, grounded: true });

    this.moveTarget = null;
  }

  get position() {
    return this.targetController.position.clone();
  }

  setMoveTarget(point) {
    this.moveTarget = point.clone();
  }

  // Instantly relocates the cursor (spawn respawn, missed-jump course reset)
  // bypassing the normal collision-resolved movement pipeline.
  teleportTo(position) {
    this.resolver.syncActor(this.actor, position);
    this.targetController.setState({ position, velocity: { x: 0, y: 0, z: 0 }, grounded: true });
    this.cardinalController.setState({ position, velocity: { x: 0, y: 0, z: 0 }, grounded: true });
    this.moveTarget = null;
    this.modelController.reset(position);
  }

  update({ deltaSeconds, keyboard }) {
    const keyboardActive = Boolean(
      keyboard.forward || keyboard.backward || keyboard.left || keyboard.right
    );
    if (keyboardActive) this.moveTarget = null;

    const activeController = keyboardActive ? this.cardinalController : this.targetController;
    const intent = keyboardActive
      ? this.cardinalController.planMovement({ ...keyboard, deltaSeconds })
      : this.targetController.planMovement({ moveTarget: this.moveTarget, jump: keyboard.jump, deltaSeconds });

    this.resolver.beginFrame();
    this.resolver.queueMove(this.actor, intent);
    this.resolver.resolveQueuedMoves(deltaSeconds);
    const resolved = this.resolver.getResult(this.actor);

    const snapshot = activeController.commitMovement(intent, resolved);
    const inactiveController = keyboardActive ? this.targetController : this.cardinalController;
    inactiveController.setState({
      position: snapshot.position,
      velocity: snapshot.velocity,
      yaw: snapshot.yaw,
      grounded: snapshot.grounded,
    });

    this.modelController.step(snapshot.position, snapshot.planarMoveFrame);

    return snapshot;
  }
}
