import { Vector3 } from 'three';
import { BaseCharacterMotionController } from './BaseCharacterMotionController.js';

export class WorldCardinalCharacterMotionController extends BaseCharacterMotionController {
  constructor({
    turnRate = 2.8,
    // Rotates forward/backward/left/right input by this angle (radians,
    // same convention as PositionFollowCameraRig's `azimuth`) before applying
    // it to the world basis. With the default 0 the four inputs stay aligned
    // to the raw basis axes; set it to the camera rig's azimuth so "forward"
    // moves the character away from the camera on screen instead of along a
    // world axis that looks diagonal once the camera is rotated around it.
    cameraAzimuth = 0,
    ...config
  }) {
    super(config);
    this.cfg.turnRate = turnRate;
    this.cfg.cameraAzimuth = cameraAzimuth;
  }

  // forward/backward: 0..1 moves along the basis forward/backward directions.
  // left/right: 0..1 moves along the basis left/right directions.
  // rotateCCW/rotateCW: 0..1 rotates toward the basis counter-clockwise/clockwise directions.
  planMovement({
    forward = 0,
    backward = 0,
    left = 0,
    right = 0,
    rotateCCW = 0,
    rotateCW = 0,
    sprint = false,
    crouch = false,
    jump = false,
    deltaSeconds = 1 / 60,
    commit = false,
  }) {

    const inputRight = this.basis.controlSignal('left', left) + this.basis.controlSignal('right', right);
    const inputForward = this.basis.controlSignal('backward', backward) + this.basis.controlSignal('forward', forward);
    const turnAxis = this.basis.controlSignal('counterClockWise', rotateCCW) + this.basis.controlSignal('clockWise', rotateCW);
    const nextYaw = this.yaw + turnAxis * this.cfg.turnRate * deltaSeconds;

    const azimuthCos = Math.cos(this.cfg.cameraAzimuth);
    const azimuthSin = Math.sin(this.cfg.cameraAzimuth);
    const moveRight = inputRight * azimuthCos + inputForward * azimuthSin;
    const moveForward = inputForward * azimuthCos - inputRight * azimuthSin;

    const moveDirection = Math.hypot(moveRight, moveForward) > 0
      ? this._planarUnit(this.basis.fromBasisComponents(moveRight, 0, moveForward))
      : new Vector3();

    const intent = this._prepareLocomotion({
      moveDirection,
      facingDirection: turnAxis === 0 && moveDirection.lengthSq() > 0 ? moveDirection : null,
      sprint,
      crouch,
      jump,
      yaw: nextYaw,
      deltaSeconds,
    });

    if (commit) return this.commitMovement(intent);
    return intent;
  }
}
