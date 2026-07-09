import { describe, it, expect } from 'vitest';
import { WorldBasis, DEFAULT_WORLD_BASIS, createWorldBasis } from './WorldBasis.js';

describe('WorldBasis (default axes)', () => {
  it('exposes a right-handed +x/+y/-z basis', () => {
    expect(DEFAULT_WORLD_BASIS.rightVector()).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(DEFAULT_WORLD_BASIS.upVector()).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(DEFAULT_WORLD_BASIS.forwardVector()).toMatchObject({ x: 0, y: 0, z: -1 });
  });

  it('downVector is the opposite of upVector', () => {
    const down = DEFAULT_WORLD_BASIS.downVector();
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBe(-1);
    expect(down.z).toBeCloseTo(0);
  });

  it('reads planar components from a plain vector', () => {
    const planar = DEFAULT_WORLD_BASIS.toPlanar({ x: 3, y: 99, z: -4 });
    expect(planar).toEqual({ right: 3, forward: 4 });
  });

  it('flattens a vector by zeroing its height', () => {
    const flattened = DEFAULT_WORLD_BASIS.flatten({ x: 1, y: 5, z: 2 });
    expect(flattened.y).toBe(0);
  });

  it('round-trips basis components through fromBasisComponents/toBasisComponents', () => {
    const vector = DEFAULT_WORLD_BASIS.fromBasisComponents(2, 3, 4);
    const back = DEFAULT_WORLD_BASIS.toBasisComponents(vector);
    expect(back.right).toBeCloseTo(2);
    expect(back.up).toBeCloseTo(3);
    expect(back.forward).toBeCloseTo(4);
  });

  it('forwardToYaw returns 0 for a near-zero planar vector', () => {
    expect(DEFAULT_WORLD_BASIS.forwardToYaw({ x: 0, y: 5, z: 0 })).toBe(0);
  });

  it('forwardToYaw returns 0 when facing the basis forward direction', () => {
    const forward = DEFAULT_WORLD_BASIS.forwardVector();
    expect(DEFAULT_WORLD_BASIS.forwardToYaw(forward)).toBeCloseTo(0);
  });

  it('controlSignal applies the configured sign', () => {
    expect(DEFAULT_WORLD_BASIS.controlSignal('left', 1)).toBe(-1);
    expect(DEFAULT_WORLD_BASIS.controlSignal('right', 1)).toBe(1);
  });

  it('controlSignal throws for an unknown direction', () => {
    expect(() => DEFAULT_WORLD_BASIS.controlSignal('sideways', 1)).toThrow();
  });
});

describe('WorldBasis validation', () => {
  it('accepts a custom basis with three distinct axes forming a right-handed frame', () => {
    expect(() => createWorldBasis({ right: '+x', up: '+z', forward: '+y' })).not.toThrow();
  });

  it('rejects a basis reusing the same axis twice', () => {
    expect(() => new WorldBasis({ right: '+x', up: '+x', forward: '+z' })).toThrow(
      /distinct world axes/
    );
  });

  it('rejects a basis where right x forward does not point along up', () => {
    expect(() => new WorldBasis({ right: '+x', up: '+y', forward: '+z' })).toThrow(
      /right x forward must point along up/
    );
  });

  it('rejects an invalid axis label', () => {
    expect(() => new WorldBasis({ right: '+w', up: '+y', forward: '-z' })).toThrow(
      /invalid right axis/
    );
  });
});
