import { describe, it, expect } from 'vitest';
import { RandomGenerator } from './RandomUtils.js';

describe('RandomGenerator', () => {
  it('is deterministic for a given seed', () => {
    const a = new RandomGenerator(42);
    const b = new RandomGenerator(42);
    const sequenceA = Array.from({ length: 5 }, () => a.random());
    const sequenceB = Array.from({ length: 5 }, () => b.random());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new RandomGenerator(1);
    const b = new RandomGenerator(2);
    expect(a.random()).not.toBe(b.random());
  });

  it('random() stays within [0, 1)', () => {
    const rng = new RandomGenerator(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('uniform() stays within [min, max)', () => {
    const rng = new RandomGenerator(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.uniform(-5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }
  });

  it('randint() stays within [min, max] inclusive', () => {
    const rng = new RandomGenerator(7);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.randint(1, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(3);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('randrange() supports a single stop argument', () => {
    const rng = new RandomGenerator(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.randrange(5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it('randrange() respects start, stop and step', () => {
    const rng = new RandomGenerator(7);
    for (let i = 0; i < 200; i += 1) {
      const value = rng.randrange(10, 20, 2);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
      expect((value - 10) % 2).toBe(0);
    }
  });

  it('choice() always returns an item from the list', () => {
    const rng = new RandomGenerator(7);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(rng.choice(items));
    }
  });

  it('seed() resets the sequence', () => {
    const rng = new RandomGenerator(1);
    const first = rng.random();
    rng.random();
    rng.seed(1);
    expect(rng.random()).toBe(first);
  });
});
