import { describe, it, expect } from 'vitest';
import {
  aabbIntersects,
  aabbContains,
  satPolygonsIntersect,
  geometriesIntersect,
  isPointInPolygon,
} from '@/domain/geometry/collision';
import { getOrientedCorners } from '@/domain/geometry/primitives';
import type { Geometry } from '@/domain/models/project';

describe('Collision Geometry Foundation', () => {
  describe('AABB Intersection & Containment', () => {
    it('detects intersecting Axis-Aligned Bounding Boxes', () => {
      const boxA = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
      const boxB = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
      expect(aabbIntersects(boxA, boxB)).toBe(true);
    });

    it('detects non-intersecting AABBs', () => {
      const boxA = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
      const boxB = { minX: 5, minY: 5, maxX: 9, maxY: 9 };
      expect(aabbIntersects(boxA, boxB)).toBe(false);
    });

    it('considers touching edges as intersecting within tolerance', () => {
      const boxA = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
      const boxB = { minX: 5, minY: 0, maxX: 10, maxY: 5 };
      expect(aabbIntersects(boxA, boxB)).toBe(true);
    });

    it('detects full containment of AABBs', () => {
      const outer = { minX: 0, minY: 0, maxX: 20, maxY: 30 };
      const inside = { minX: 2, minY: 2, maxX: 10, maxY: 15 };
      const partial = { minX: 15, minY: 15, maxX: 25, maxY: 35 };

      expect(aabbContains(outer, inside)).toBe(true);
      expect(aabbContains(outer, partial)).toBe(false);
    });
  });

  describe('Separating Axis Theorem (SAT)', () => {
    it('detects overlapping unrotated rectangles', () => {
      const polyA = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ];
      const polyB = [
        { x: 2, y: 2 },
        { x: 6, y: 2 },
        { x: 6, y: 6 },
        { x: 2, y: 6 },
      ];
      expect(satPolygonsIntersect(polyA, polyB)).toBe(true);
    });

    it('detects separated unrotated rectangles', () => {
      const polyA = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ];
      const polyB = [
        { x: 3, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 2 },
        { x: 3, y: 2 },
      ];
      expect(satPolygonsIntersect(polyA, polyB)).toBe(false);
    });

    it('correctly resolves SAT when AABBs overlap but rotated shapes do not collide (false positive avoidance)', () => {
      // Two thin rotated rectangles oriented diagonally near each other:
      // Their AABBs overlap, but there is a clear separating axis between their geometry
      const geoA: Geometry = {
        x: 0,
        y: 0,
        width: 1,
        length: 5,
        rotation: 45,
      };

      const geoB: Geometry = {
        x: 5,
        y: 5,
        width: 1,
        length: 5,
        rotation: 45,
      };

      const cornersA = getOrientedCorners(geoA, 'center');
      const cornersB = getOrientedCorners(geoB, 'center');

      expect(satPolygonsIntersect(cornersA, cornersB)).toBe(false);
    });

    it('detects collision between rotated intersecting geometries', () => {
      const geoA: Geometry = {
        x: 2,
        y: 2,
        width: 4,
        length: 4,
        rotation: 30,
      };

      const geoB: Geometry = {
        x: 3,
        y: 3,
        width: 4,
        length: 4,
        rotation: 60,
      };

      expect(geometriesIntersect(geoA, geoB)).toBe(true);
    });
  });

  describe('Point in Polygon Containment', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it('identifies points strictly inside the polygon', () => {
      expect(isPointInPolygon(polygon, { x: 5, y: 5 })).toBe(true);
      expect(isPointInPolygon(polygon, { x: 1, y: 1 })).toBe(true);
    });

    it('identifies points outside the polygon', () => {
      expect(isPointInPolygon(polygon, { x: -1, y: 5 })).toBe(false);
      expect(isPointInPolygon(polygon, { x: 11, y: 5 })).toBe(false);
      expect(isPointInPolygon(polygon, { x: 5, y: 15 })).toBe(false);
    });
  });
});
