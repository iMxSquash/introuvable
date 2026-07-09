import { describe, it, expect } from 'vitest';
import { DEFAULT_WORLD_BASIS } from '../../math/WorldBasis.js';
import { WorldCardinalCharacterMotionController } from './WorldCardinalCharacterMotionController.js';

// Regression test for the ZQSD/WASD-reads-as-diagonal bug: with an isometric
// camera rotated by `azimuth` around the up axis (see PositionFollowCameraRig),
// unrotated cardinal input moved the character along a raw world axis that no
// longer lines up with what the player sees on screen. Passing that same
// azimuth as `cameraAzimuth` must make "forward" move the character along the
// camera's actual view direction (screen-up), not the raw basis forward axis.
describe('WorldCardinalCharacterMotionController', () => {
  function planFirstStep(controller, input) {
    controller.setState({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true });
    return controller.planMovement({ ...input, deltaSeconds: 1 / 60 });
  }

  it('moves along the raw basis forward axis when cameraAzimuth is 0 (unchanged default)', () => {
    const controller = new WorldCardinalCharacterMotionController({ basis: DEFAULT_WORLD_BASIS });
    const intent = planFirstStep(controller, { forward: 1 });
    const planar = DEFAULT_WORLD_BASIS.toBasisComponents(intent.velocity);
    expect(planar.right).toBeCloseTo(0);
    expect(planar.forward).toBeGreaterThan(0);
  });

  it('rotates "forward" to the camera view direction when cameraAzimuth matches the rig azimuth', () => {
    const azimuth = Math.PI / 4;
    const controller = new WorldCardinalCharacterMotionController({ basis: DEFAULT_WORLD_BASIS, cameraAzimuth: azimuth });
    const intent = planFirstStep(controller, { forward: 1 });
    const planar = DEFAULT_WORLD_BASIS.toBasisComponents(intent.velocity);
    const speed = Math.hypot(planar.right, planar.forward);

    // Matches PositionFollowCameraRig's viewDirection formula: (sin(azimuth), cos(azimuth)).
    expect(planar.right / speed).toBeCloseTo(Math.sin(azimuth));
    expect(planar.forward / speed).toBeCloseTo(Math.cos(azimuth));
  });

  it('rotates "right" to the camera-relative right direction when cameraAzimuth matches the rig azimuth', () => {
    const azimuth = Math.PI / 4;
    const controller = new WorldCardinalCharacterMotionController({ basis: DEFAULT_WORLD_BASIS, cameraAzimuth: azimuth });
    const intent = planFirstStep(controller, { right: 1 });
    const planar = DEFAULT_WORLD_BASIS.toBasisComponents(intent.velocity);
    const speed = Math.hypot(planar.right, planar.forward);

    expect(planar.right / speed).toBeCloseTo(Math.cos(azimuth));
    expect(planar.forward / speed).toBeCloseTo(-Math.sin(azimuth));
  });
});
