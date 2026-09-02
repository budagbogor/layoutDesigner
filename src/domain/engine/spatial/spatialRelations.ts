import { Geometry } from '../../models/project';
import { Point2D } from '../../geometry/types';
import { ObjectEnvelope } from '../types';
import {
  getOrientedCorners,
  computeAABB,
} from '../../geometry/primitives';
import {
  aabbIntersects,
  aabbContains,
  satPolygonsIntersect,
  isPointInPolygon,
  geometriesIntersect,
} from '../../geometry/collision';
import { roundMillimeter, CAD_EPSILON } from '../../geometry/precision';

export type SpatialEntity = ObjectEnvelope | Geometry;

/**
 * Extracts pure Geometry from an ObjectEnvelope or direct Geometry object.
 */
export function extractGeometry(entity: SpatialEntity): Geometry {
  return 'geometry' in entity && entity.geometry ? entity.geometry : (entity as Geometry);
}

/**
 * Calculates the shortest Euclidean distance from a point P to a line segment AB in meters.
 */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = p.x - a.x;
  const apY = p.y - a.y;

  const abLenSq = abX * abX + abY * abY;
  if (abLenSq <= 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  // Projection scalar t = (AP · AB) / |AB|²
  let t = (apX * abX + apY * abY) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * abX;
  const projY = a.y + t * abY;

  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Checks whether container completely contains target entity.
 * Supports arbitrary rotations for both container and target.
 *
 * Broad-phase: AABB containment test.
 * Narrow-phase: Verifies all oriented corners of target are strictly inside the container polygon.
 */
export function containsEnvelope(container: SpatialEntity, target: SpatialEntity): boolean {
  const geoContainer = extractGeometry(container);
  const geoTarget = extractGeometry(target);

  const cornersContainer = getOrientedCorners(geoContainer);
  const cornersTarget = getOrientedCorners(geoTarget);

  // 1. Broad-phase AABB test
  const aabbContainer = computeAABB(cornersContainer);
  const aabbTarget = computeAABB(cornersTarget);

  if (!aabbContains(aabbContainer, aabbTarget, CAD_EPSILON)) {
    return false;
  }

  // If neither is rotated, AABB containment is exact
  if (geoContainer.rotation % 360 === 0 && geoTarget.rotation % 360 === 0) {
    return true;
  }

  // 2. Narrow-phase: for convex polygons, target is fully contained if and only if
  // all its vertices are inside the container polygon.
  for (const vertex of cornersTarget) {
    if (!isPointInPolygon(cornersContainer, vertex)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether two spatial entities overlap.
 * Uses AABB broad-phase test followed by pure 2D SAT narrow-phase test.
 * Preserves rotation and millimeter precision.
 */
export function overlapsEnvelope(a: SpatialEntity, b: SpatialEntity): boolean {
  const geoA = extractGeometry(a);
  const geoB = extractGeometry(b);
  return geometriesIntersect(geoA, geoB);
}

/**
 * Calculates the exact minimum Euclidean distance between two envelopes in meters.
 * Returns 0 if envelopes touch or overlap.
 * Evaluates all edge-to-vertex and vertex-to-edge projections between the two oriented polygons.
 */
export function distanceBetweenEnvelopes(a: SpatialEntity, b: SpatialEntity): number {
  const geoA = extractGeometry(a);
  const geoB = extractGeometry(b);

  const cornersA = getOrientedCorners(geoA);
  const cornersB = getOrientedCorners(geoB);

  // 1. Broad-phase AABB intersection
  const aabbA = computeAABB(cornersA);
  const aabbB = computeAABB(cornersB);

  const aabbOverlap = aabbIntersects(aabbA, aabbB, CAD_EPSILON);

  // 2. Narrow-phase SAT intersection test
  if (aabbOverlap && satPolygonsIntersect(cornersA, cornersB, CAD_EPSILON)) {
    return 0;
  }

  // 3. Distance calculation between non-overlapping convex polygons
  let minDistance = Number.POSITIVE_INFINITY;
  const countA = cornersA.length;
  const countB = cornersB.length;

  // Check distance from all vertices of A to all edges of B
  for (const pA of cornersA) {
    for (let j = 0; j < countB; j++) {
      const edgeStart = cornersB[j];
      const edgeEnd = cornersB[(j + 1) % countB];
      const d = pointToSegmentDistance(pA, edgeStart, edgeEnd);
      if (d < minDistance) {
        minDistance = d;
      }
    }
  }

  // Check distance from all vertices of B to all edges of A
  for (const pB of cornersB) {
    for (let i = 0; i < countA; i++) {
      const edgeStart = cornersA[i];
      const edgeEnd = cornersA[(i + 1) % countA];
      const d = pointToSegmentDistance(pB, edgeStart, edgeEnd);
      if (d < minDistance) {
        minDistance = d;
      }
    }
  }

  return roundMillimeter(minDistance);
}

/**
 * Checks whether an envelope is completely within the building boundary.
 * Origin (0, 0) is at bottom-left of the building.
 */
export function isInsideBuilding(
  envelope: SpatialEntity,
  buildingBoundary: { width: number; length: number }
): boolean {
  const geo = extractGeometry(envelope);
  const corners = getOrientedCorners(geo);

  for (const pt of corners) {
    if (
      pt.x < -CAD_EPSILON ||
      pt.x > buildingBoundary.width + CAD_EPSILON ||
      pt.y < -CAD_EPSILON ||
      pt.y > buildingBoundary.length + CAD_EPSILON
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether the distance between an envelope and a reference envelope
 * satisfies a specified clearance distance in meters.
 *
 * NOTE: The required clearance value must be supplied as a parameter (from standard).
 * No engineering clearance values are hardcoded.
 */
export function isWithinClearance(
  envelope: SpatialEntity,
  referenceEnvelope: SpatialEntity,
  requiredClearance: number
): boolean {
  const dist = distanceBetweenEnvelopes(envelope, referenceEnvelope);
  return dist >= roundMillimeter(requiredClearance) - CAD_EPSILON;
}
