import { describe, it, expect } from 'vitest';
import {
  clamp,
  clamp01,
  toFinite,
  lerp,
  fract,
  toRad,
  toDeg,
  smoothingAlpha,
  smoothToward,
} from './ScalarUtils.js';

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the lower bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to the upper bound', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('clamp01', () => {
  it('clamps negative values to 0', () => {
    expect(clamp01(-1)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clamp01(2)).toBe(1);
  });
});

describe('toFinite', () => {
  it('returns the value when finite', () => {
    expect(toFinite(3.5)).toBe(3.5);
  });

  it('returns the fallback for NaN', () => {
    expect(toFinite(NaN, -1)).toBe(-1);
  });

  it('returns the fallback for Infinity', () => {
    expect(toFinite(Infinity, -1)).toBe(-1);
  });

  it('defaults the fallback to 0', () => {
    expect(toFinite(undefined)).toBe(0);
  });
});

describe('lerp', () => {
  it('returns the start value at alpha 0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('returns the end value at alpha 1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('interpolates in between', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('extrapolates beyond alpha 1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe('fract', () => {
  it('returns the fractional part of a positive number', () => {
    expect(fract(3.25)).toBeCloseTo(0.25);
  });

  it('wraps negative numbers into [0, 1)', () => {
    expect(fract(-0.25)).toBeCloseTo(0.75);
  });
});

describe('toRad / toDeg', () => {
  it('converts 180 degrees to PI radians', () => {
    expect(toRad(180)).toBeCloseTo(Math.PI);
  });

  it('converts PI radians to 180 degrees', () => {
    expect(toDeg(Math.PI)).toBeCloseTo(180);
  });

  it('round-trips a value', () => {
    expect(toDeg(toRad(42))).toBeCloseTo(42);
  });
});

describe('smoothingAlpha', () => {
  it('returns 1 when lag is 0 or negative', () => {
    expect(smoothingAlpha(0, 0.5)).toBe(1);
    expect(smoothingAlpha(-1, 0.5)).toBe(1);
  });

  it('returns 0 when delta time is 0', () => {
    expect(smoothingAlpha(1, 0)).toBe(0);
  });

  it('treats a negative delta as 0', () => {
    expect(smoothingAlpha(1, -1)).toBe(0);
  });

  it('increases toward 1 as delta grows', () => {
    const small = smoothingAlpha(1, 0.1);
    const large = smoothingAlpha(1, 5);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(1);
  });
});

describe('smoothToward', () => {
  it('does not move when delta time is 0', () => {
    expect(smoothToward(0, 10, 1, 0)).toBe(0);
  });

  it('reaches the target as delta time grows large', () => {
    expect(smoothToward(0, 10, 1, 1000)).toBeCloseTo(10);
  });
});
