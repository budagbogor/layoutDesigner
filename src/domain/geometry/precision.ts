import { Point2D, BoundingBox2D } from './types';

/**
 * Standard CAD precision constant: 3 decimal places (1 millimeter in meter units).
 */
export const CAD_PRECISION_DECIMALS = 3;
export const CAD_EPSILON = 0.0001;

/**
 * Round a meter value to millimeter precision (3 decimal places) deterministically,
 * eliminating IEEE-754 floating-point drift (e.g., 4.700000000000001 -> 4.7).
 */
export function roundMillimeter(val: number): number {
  if (Object.is(val, -0)) return 0;
  const factor = 1000;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Round 2D point coordinates to millimeter precision.
 */
export function roundPoint(p: Point2D): Point2D {
  return {
    x: roundMillimeter(p.x),
    y: roundMillimeter(p.y),
  };
}

/**
 * Round a bounding box to millimeter precision.
 */
export function roundBoundingBox(box: BoundingBox2D): BoundingBox2D {
  return {
    minX: roundMillimeter(box.minX),
    minY: roundMillimeter(box.minY),
    maxX: roundMillimeter(box.maxX),
    maxY: roundMillimeter(box.maxY),
  };
}

/**
 * Compare two numeric values with millimeter-aware epsilon tolerance.
 */
export function approxEqual(a: number, b: number, epsilon: number = CAD_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

/**
 * Compare two 2D points with millimeter-aware epsilon tolerance.
 */
export function pointsApproxEqual(p1: Point2D, p2: Point2D, epsilon: number = CAD_EPSILON): boolean {
  return approxEqual(p1.x, p2.x, epsilon) && approxEqual(p1.y, p2.y, epsilon);
}
