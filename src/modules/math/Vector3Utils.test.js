import { describe, it, expect } from 'vitest';
import { toVec3, toUnitVec3, toPlanarUnitVec3 } from './Vector3Utils.js';

describe('toVec3', () => {
  it('reads x/y/z from the given value', () => {
    const vector = toVec3({ x: 1, y: 2, z: 3 });
    expect(vector).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('falls back to the default fallback for missing components', () => {
    const vector = toVec3({ x: 1 });
    expect(vector).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it('uses a custom fallback', () => {
    const vector = toVec3(null, { x: 7, y: 8, z: 9 });
    expect(vector).toMatchObject({ x: 7, y: 8, z: 9 });
  });
});

describe('toUnitVec3', () => {
  it('normalizes a non-zero vector', () => {
    const vector = toUnitVec3({ x: 3, y: 0, z: 4 });
    expect(vector.length()).toBeCloseTo(1);
    expect(vector.x).toBeCloseTo(0.6);
    expect(vector.y).toBeCloseTo(0);
    expect(vector.z).toBeCloseTo(0.8);
  });

  it('falls back to the default fallback for a zero vector', () => {
    const vector = toUnitVec3({ x: 0, y: 0, z: 0 });
    expect(vector).toMatchObject({ x: 0, y: 1, z: 0 });
  });

  it('returns a zero vector when both value and fallback are zero', () => {
    const vector = toUnitVec3({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(vector).toMatchObject({ x: 0, y: 0, z: 0 });
  });
});

describe('toPlanarUnitVec3', () => {
  it('flattens and normalizes a vector with a vertical component', () => {
    const vector = toPlanarUnitVec3({ x: 0, y: 99, z: -2 });
    expect(vector.y).toBe(0);
    expect(vector.length()).toBeCloseTo(1);
    expect(vector.z).toBeCloseTo(-1);
  });

  it('falls back when the planar projection is zero', () => {
    const vector = toPlanarUnitVec3({ x: 0, y: 5, z: 0 });
    expect(vector).toMatchObject({ x: 0, y: 0, z: -1 });
  });
});
