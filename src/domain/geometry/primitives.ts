import { Point2D, BoundingBox2D, RotationPivot } from './types';
import { Geometry } from '../models/project';
import { roundMillimeter, roundPoint, roundBoundingBox } from './precision';

/**
 * Convert degrees to radians.
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Normalize angle to [0, 360) degrees range.
 */
export function normalizeAngle(degrees: number): number {
  const mod = degrees % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Vector addition: p1 + p2.
 */
export function vectorAdd(p1: Point2D, p2: Point2D): Point2D {
  return roundPoint({
    x: p1.x + p2.x,
    y: p1.y + p2.y,
  });
}

/**
 * Vector subtraction: p1 - p2.
 */
export function vectorSubtract(p1: Point2D, p2: Point2D): Point2D {
  return roundPoint({
    x: p1.x - p2.x,
    y: p1.y - p2.y,
  });
}

/**
 * Vector scalar multiplication.
 */
export function vectorScale(p: Point2D, scalar: number): Point2D {
  return roundPoint({
    x: p.x * scalar,
    y: p.y * scalar,
  });
}

/**
 * Dot product of two 2D vectors.
 */
export function dotProduct(v1: Point2D, v2: Point2D): number {
  return roundMillimeter(v1.x * v2.x + v1.y * v2.y);
}

/**
 * 2D Cross product (scalar determinant) of two vectors: v1.x * v2.y - v1.y * v2.x.
 */
export function crossProduct2D(v1: Point2D, v2: Point2D): number {
  return roundMillimeter(v1.x * v2.y - v1.y * v2.x);
}

/**
 * Euclidean distance between two 2D points in meters.
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return roundMillimeter(Math.hypot(dx, dy));
}

/**
 * Squared Euclidean distance between two points (avoids Math.sqrt).
 */
export function distanceSquared(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return roundMillimeter(dx * dx + dy * dy);
}

/**
 * Rotate a point around a pivot in Cartesian space (+X right, +Y up).
 * Counter-clockwise rotation is positive.
 */
export function rotatePoint(point: Point2D, angleDegrees: number, pivot: Point2D = { x: 0, y: 0 }): Point2D {
  if (angleDegrees % 360 === 0) {
    return roundPoint(point);
  }

  const rad = degreesToRadians(angleDegrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;

  const rotatedX = dx * cos - dy * sin + pivot.x;
  const rotatedY = dx * sin + dy * cos + pivot.y;

  return roundPoint({ x: rotatedX, y: rotatedY });
}

/**
 * Calculate the 4 oriented corners of a rectangle in CAD Cartesian space.
 * Default corners without rotation:
 * - 0 (Bottom-Left):  (x, y)
 * - 1 (Bottom-Right): (x + width, y)
 * - 2 (Top-Right):    (x + width, y + length)
 * - 3 (Top-Left):     (x, y + length)
 */
export function getOrientedCorners(geometry: Geometry, pivot: RotationPivot = 'bottom-left'): Point2D[] {
  const { x, y, width, length, rotation } = geometry;

  const bl: Point2D = { x, y };
  const br: Point2D = { x: x + width, y };
  const tr: Point2D = { x: x + width, y: y + length };
  const tl: Point2D = { x, y: y + length };

  const rawCorners = [bl, br, tr, tl];

  if (rotation % 360 === 0) {
    return rawCorners.map(roundPoint);
  }

  const pivotPoint: Point2D =
    pivot === 'center'
      ? { x: x + width / 2, y: y + length / 2 }
      : bl;

  return rawCorners.map((corner) => rotatePoint(corner, rotation, pivotPoint));
}

/**
 * Compute the Axis-Aligned Bounding Box (AABB) enclosing a set of 2D points.
 */
export function computeAABB(points: Point2D[]): BoundingBox2D {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return roundBoundingBox({ minX, minY, maxX, maxY });
}

/**
 * Get the Axis-Aligned Bounding Box (AABB) for an oriented rectangle geometry.
 */
export function getGeometryAABB(geometry: Geometry, pivot: RotationPivot = 'bottom-left'): BoundingBox2D {
  const corners = getOrientedCorners(geometry, pivot);
  return computeAABB(corners);
}

/**
 * Snap a single scalar value to a configurable grid step (in meters).
 * Deterministic and millimeter-rounded.
 */
export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) {
    return roundMillimeter(value);
  }
  const sign = value < 0 ? -1 : 1;
  const absVal = Math.abs(value);
  const snapped = sign * Math.round((absVal + 1e-9) / gridSize) * gridSize;
  return roundMillimeter(snapped);
}

/**
 * Snap a 2D point to a configurable grid step.
 */
export function snapPoint(point: Point2D, gridSize: number): Point2D {
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

/**
 * Snap a geometry's position and size to a configurable grid step.
 */
export function snapGeometry(geometry: Geometry, gridSize: number): Geometry {
  return {
    x: snapValue(geometry.x, gridSize),
    y: snapValue(geometry.y, gridSize),
    width: snapValue(geometry.width, gridSize),
    length: snapValue(geometry.length, gridSize),
    rotation: roundMillimeter(geometry.rotation),
  };
}
