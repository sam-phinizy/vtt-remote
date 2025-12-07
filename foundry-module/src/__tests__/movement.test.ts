import { describe, it, expect } from 'vitest';
import {
  directionToDelta,
  applyMovement,
  isValidDirection,
  clampPosition,
} from '../core/movement';

describe('directionToDelta', () => {
  it('maps up to negative Y', () => {
    expect(directionToDelta('up')).toEqual({ dx: 0, dy: -1 });
  });

  it('maps down to positive Y', () => {
    expect(directionToDelta('down')).toEqual({ dx: 0, dy: 1 });
  });

  it('maps left to negative X', () => {
    expect(directionToDelta('left')).toEqual({ dx: -1, dy: 0 });
  });

  it('maps right to positive X', () => {
    expect(directionToDelta('right')).toEqual({ dx: 1, dy: 0 });
  });
});

describe('applyMovement', () => {
  it('applies movement with default grid size', () => {
    const pos = applyMovement({ x: 100, y: 100 }, { dx: 1, dy: 0 }, 50);
    expect(pos).toEqual({ x: 150, y: 100 });
  });

  it('moves up (negative Y)', () => {
    const pos = applyMovement({ x: 100, y: 100 }, { dx: 0, dy: -1 }, 50);
    expect(pos).toEqual({ x: 100, y: 50 });
  });

  it('moves down (positive Y)', () => {
    const pos = applyMovement({ x: 100, y: 100 }, { dx: 0, dy: 1 }, 50);
    expect(pos).toEqual({ x: 100, y: 150 });
  });

  it('moves diagonally', () => {
    const pos = applyMovement({ x: 100, y: 100 }, { dx: 1, dy: -1 }, 50);
    expect(pos).toEqual({ x: 150, y: 50 });
  });

  it('handles zero delta', () => {
    const pos = applyMovement({ x: 100, y: 100 }, { dx: 0, dy: 0 }, 50);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it('handles large grid sizes', () => {
    const pos = applyMovement({ x: 0, y: 0 }, { dx: 1, dy: 1 }, 140);
    expect(pos).toEqual({ x: 140, y: 140 });
  });

  it('can result in negative positions', () => {
    const pos = applyMovement({ x: 0, y: 0 }, { dx: -1, dy: -1 }, 50);
    expect(pos).toEqual({ x: -50, y: -50 });
  });
});

describe('isValidDirection', () => {
  it('returns true for valid directions', () => {
    expect(isValidDirection('up')).toBe(true);
    expect(isValidDirection('down')).toBe(true);
    expect(isValidDirection('left')).toBe(true);
    expect(isValidDirection('right')).toBe(true);
  });

  it('returns false for invalid directions', () => {
    expect(isValidDirection('UP')).toBe(false);
    expect(isValidDirection('forward')).toBe(false);
    expect(isValidDirection('')).toBe(false);
    expect(isValidDirection('north')).toBe(false);
  });
});

describe('clampPosition', () => {
  it('clamps negative X to minimum', () => {
    const pos = clampPosition({ x: -50, y: 100 });
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(100);
  });

  it('clamps negative Y to minimum', () => {
    const pos = clampPosition({ x: 100, y: -50 });
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(0);
  });

  it('clamps to custom minimum', () => {
    const pos = clampPosition({ x: 5, y: 5 }, 10, 10);
    expect(pos).toEqual({ x: 10, y: 10 });
  });

  it('clamps to maximum when provided', () => {
    const pos = clampPosition({ x: 500, y: 500 }, 0, 0, 400, 400);
    expect(pos).toEqual({ x: 400, y: 400 });
  });

  it('leaves valid position unchanged', () => {
    const pos = clampPosition({ x: 100, y: 100 }, 0, 0, 200, 200);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it('handles no maximum constraint', () => {
    const pos = clampPosition({ x: 10000, y: 10000 });
    expect(pos).toEqual({ x: 10000, y: 10000 });
  });
});
