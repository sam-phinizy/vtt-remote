/**
 * Movement calculations - pure functions.
 * No side effects, grid-aware math.
 */

import type { Direction } from './messages';

export interface Position {
  x: number;
  y: number;
}

export interface Delta {
  dx: number;
  dy: number;
}

/**
 * Convert a direction to grid deltas.
 * Returns {dx, dy} where each is -1, 0, or 1.
 */
export function directionToDelta(direction: Direction): Delta {
  const map: Record<Direction, Delta> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };
  return map[direction] ?? { dx: 0, dy: 0 };
}

/**
 * Apply a movement delta to a position.
 * @param current - Current position in pixels
 * @param delta - Grid delta (-1, 0, or 1)
 * @param gridSize - Grid cell size in pixels
 */
export function applyMovement(
  current: Position,
  delta: Delta,
  gridSize: number
): Position {
  return {
    x: current.x + delta.dx * gridSize,
    y: current.y + delta.dy * gridSize,
  };
}

/**
 * Check if a direction string is valid.
 */
export function isValidDirection(dir: string): dir is Direction {
  return ['up', 'down', 'left', 'right'].includes(dir);
}

/**
 * Clamp a position within bounds.
 * @param pos - Position to clamp
 * @param minX - Minimum X (default 0)
 * @param minY - Minimum Y (default 0)
 * @param maxX - Maximum X (optional)
 * @param maxY - Maximum Y (optional)
 */
export function clampPosition(
  pos: Position,
  minX: number = 0,
  minY: number = 0,
  maxX?: number,
  maxY?: number
): Position {
  let { x, y } = pos;
  x = Math.max(minX, x);
  y = Math.max(minY, y);
  if (maxX !== undefined) x = Math.min(maxX, x);
  if (maxY !== undefined) y = Math.min(maxY, y);
  return { x, y };
}
