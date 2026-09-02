import { Point2D, BoundingBox2D, RotationPivot } from './types';
import { Geometry } from '../models/project';
import { getOrientedCorners, computeAABB, dotProduct } from './primitives';
import { CAD_EPSILON, approxEqual } from './precision';

/**
 * Check whether two Axis-Aligned Bounding Boxes (AABB) overlap.
 */
export function aabbIntersects(a: BoundingBox2D, b: BoundingBox2D, epsilon: number = CAD_EPSILON): boolean {
  return !(
    a.maxX < b.minX - epsilon ||
    a.minX > b.maxX + epsilon ||
    a.maxY < b.minY - epsilon ||
    a.minY > b.maxY + epsilon
  );
}

/**
 * Check whether container AABB completely contains target AABB.
 */
export function aabbContains(container: BoundingBox2D, target: BoundingBox2D, epsilon: number = CAD_EPSILON): boolean {
  return (
    target.minX >= container.minX - epsilon &&
    target.maxX <= container.maxX + epsilon &&
    target.minY >= container.minY - epsilon &&
    target.maxY <= container.maxY + epsilon
  );
}

/**
 * Project a polygon onto an axis and return the [min, max] scalar interval.
 */
export function projectPolygonOntoAxis(vertices: Point2D[], axis: Point2D): { min: number; max: number } {
  let min = dotProduct(vertices[0], axis);
  let max = min;

  for (let i = 1; i < vertices.length; i++) {
    const projection = dotProduct(vertices[i], axis);
    if (projection < min) min = projection;
    if (projection > max) max = projection;
  }

  return { min, max };
}

/**
 * Get perpendicular normalized-direction axes for each edge of a convex polygon.
 */
export function getPolygonPerpendicularAxes(vertices: Point2D[]): Point2D[] {
  const axes: Point2D[] = [];
  const count = vertices.length;

  for (let i = 0; i < count; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % count];

    const edgeX = p2.x - p1.x;
    const edgeY = p2.y - p1.y;

    // Normal vector (-edgeY, edgeX)
    const length = Math.hypot(edgeX, edgeY);
    if (length > CAD_EPSILON) {
      axes.push({
        x: -edgeY / length,
        y: edgeX / length,
      });
    }
  }

  return axes;
}

/**
 * Separating Axis Theorem (SAT) collision test between two convex 2D polygons.
 * Returns true if polygons intersect, false if a separating axis exists.
 */
export function satPolygonsIntersect(
  polyA: Point2D[],
  polyB: Point2D[],
  epsilon: number = CAD_EPSILON
): boolean {
  if (polyA.length < 3 || polyB.length < 3) {
    return false;
  }

  const axes = [
    ...getPolygonPerpendicularAxes(polyA),
    ...getPolygonPerpendicularAxes(polyB),
  ];

  for (const axis of axes) {
    const projA = projectPolygonOntoAxis(polyA, axis);
    const projB = projectPolygonOntoAxis(polyB, axis);

    // If intervals do not overlap, separating axis found -> no collision
    if (projA.max < projB.min - epsilon || projB.max < projA.min - epsilon) {
      return false;
    }
  }

  return true;
}

/**
 * Check if two oriented 2D geometries intersect.
 * Uses AABB broad-phase test followed by SAT narrow-phase test.
 */
export function geometriesIntersect(
  geoA: Geometry,
  geoB: Geometry,
  pivot: RotationPivot = 'bottom-left'
): boolean {
  const cornersA = getOrientedCorners(geoA, pivot);
  const cornersB = getOrientedCorners(geoB, pivot);

  // 1. Broad-phase AABB test
  const aabbA = computeAABB(cornersA);
  const aabbB = computeAABB(cornersB);

  if (!aabbIntersects(aabbA, aabbB)) {
    return false;
  }

  // If neither is rotated, AABB intersection is exact
  if (geoA.rotation % 360 === 0 && geoB.rotation % 360 === 0) {
    return true;
  }

  // 2. Narrow-phase SAT test
  return satPolygonsIntersect(cornersA, cornersB);
}

/**
 * Check whether a point is inside a polygon using the ray casting algorithm.
 */
export function isPointInPolygon(polygon: Point2D[], point: Point2D): boolean {
  let inside = false;
  const count = polygon.length;

  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
