import { AgentPathNavigator } from '../modules/behavior/AgentPathNavigator.js';
import { WaypointProgressTracker } from '../modules/behavior/WaypointProgressTracker.js';
import { NearbyAvoidanceSteering } from '../modules/behavior/NearbyAvoidanceSteering.js';
import { GeneralObjectModelController } from '../modules/actor-motion/GeneralObjectModelController.js';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { createGuardModel } from './GuardMesh.js';

const STEERING_EPS = 1e-6;
const BREATH_SPEED = 2.2;
const BREATH_AMPLITUDE = 0.035;

export class Guard {
  constructor({
    scene,
    waypoints,
    basis = DEFAULT_WORLD_BASIS,
    maxSpeed = 3,
    catchRadius = 2.6,
  }) {
    this.basis = basis;
    this.catchRadius = catchRadius;
    this.yaw = 0;
    // Idle phase offset so guards don't all breathe in lockstep.
    this.breathPhase = Math.random() * Math.PI * 2;

    this.model = createGuardModel(basis);
    scene.add(this.model);
    this.modelController = new GeneralObjectModelController({ model: this.model, basis, keepBasisUp: true });

    this.position = waypoints[0].clone();
    this.modelController.reset(this.position);

    this.navigator = new AgentPathNavigator({ maxSpeed, arriveRadius: 2, basis });
    this.tracker = new WaypointProgressTracker({ waypoints, reachDistance: 1.4, closed: true, basis });
    this.avoidance = new NearbyAvoidanceSteering({ neighborDistance: 3, basis });
  }

  update(deltaSeconds, neighbors) {
    const progress = this.tracker.step(this.position);
    const waypoint = progress ? progress.currentWaypoint : null;
    const navIntent = this.navigator.step({ position: this.position, waypoint });
    const avoidanceResult = this.avoidance.step({
      selfPosition: this.position,
      neighbors,
      desiredDirection: navIntent.direction,
      self: this,
    });

    const blended = navIntent.direction.add(avoidanceResult.steering);
    if (blended.lengthSq() > STEERING_EPS) {
      blended.normalize();
      this.position.add(blended.clone().multiplyScalar(navIntent.desiredSpeed * deltaSeconds));
      this.yaw = this.basis.forwardToYaw(blended);
    }

    this.modelController.step(this.position, this.basis.yawPitchRollFrame(this.yaw));

    this.breathPhase += deltaSeconds * BREATH_SPEED;
    this.model.userData.visual.scale.setScalar(1 + Math.sin(this.breathPhase) * BREATH_AMPLITUDE);
  }
}
