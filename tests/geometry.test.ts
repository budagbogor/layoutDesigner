import { describe, it, expect } from 'vitest';
import {
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
  vectorAdd,
  vectorSubtract,
  vectorScale,
  dotProduct,
  crossProduct2D,
  distance,
  distanceSquared,
  rotatePoint,
  getOrientedCorners,
  computeAABB,
  getGeometryAABB,
  snapValue,
  snapPoint,
  snapGeometry,
} from '@/domain/geometry/primitives';
import {
  roundMillimeter,
  roundPoint,
  approxEqual,
  pointsApproxEqual,
} from '@/domain/geometry/precision';
import type { Geometry } from '@/domain/models/project';

describe('Deterministic Geometry & Precision', () => {
  describe('Millimeter Precision & Drift Elimination', () => {
    it('eliminates standard floating-point addition drift', () => {
      const raw = 0.1 + 0.2; // 0.30000000000000004
      expect(raw).not.toBe(0.3);
      expect(roundMillimeter(raw)).toBe(0.3);
    });

    it('rounds numbers to exact millimeter precision (3 decimal places)', () => {
      expect(roundMillimeter(4.700000000000001)).toBe(4.7);
      expect(roundMillimeter(1.8005)).toBe(1.801);
      expect(roundMillimeter(1.8004)).toBe(1.8);
      expect(roundMillimeter(-0)).toBe(0);
    });

    it('rounds 2D points accurately', () => {
      const p = roundPoint({ x: 12.34567, y: 8.9991 });
      expect(p.x).toBe(12.346);
      expect(p.y).toBe(8.999);
    });

    it('evaluates approximate equality with CAD tolerance', () => {
      expect(approxEqual(4.70001, 4.7, 0.0001)).toBe(true);
      expect(approxEqual(4.701, 4.7, 0.0001)).toBe(false);

      expect(pointsApproxEqual({ x: 5.00001, y: 3.0 }, { x: 5.0, y: 3.00002 })).toBe(true);
    });
  });

  describe('CAD Cartesian Coordinates & Vectors (+X right, +Y up)', () => {
    it('performs vector addition and subtraction', () => {
      const p1 = { x: 2.0, y: 5.0 };
      const p2 = { x: 3.5, y: -1.5 };

      const sum = vectorAdd(p1, p2);
      expect(sum).toEqual({ x: 5.5, y: 3.5 });

      const diff = vectorSubtract(p1, p2);
      expect(diff).toEqual({ x: -1.5, y: 6.5 });
    });

    it('performs vector scaling and products', () => {
      const v1 = { x: 3.0, y: 4.0 };
      const scaled = vectorScale(v1, 2.5);
      expect(scaled).toEqual({ x: 7.5, y: 10.0 });

      const v2 = { x: 4.0, y: -3.0 };
      expect(dotProduct(v1, v2)).toBe(0); // perpendicular
      expect(crossProduct2D({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1); // right-handed +Z up
    });

    it('calculates Euclidean distance in meters', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3.0, y: 4.0 };

      expect(distance(p1, p2)).toBe(5.0);
      expect(distanceSquared(p1, p2)).toBe(25.0);
    });
  });

  describe('Angle Conversions & Rotation', () => {
    it('converts degrees to radians and radians to degrees', () => {
      expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
      expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
      expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
    });

    it('normalizes angles into [0, 360) range', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(360)).toBe(0);
      expect(normalizeAngle(450)).toBe(90);
      expect(normalizeAngle(-90)).toBe(270);
    });

    it('rotates a point counter-clockwise in Cartesian space (+X right, +Y up)', () => {
      const point = { x: 1.0, y: 0.0 };

      // 90 deg CCW: (1, 0) -> (0, 1)
      const r90 = rotatePoint(point, 90);
      expect(r90.x).toBe(0);
      expect(r90.y).toBe(1);

      // 180 deg CCW: (1, 0) -> (-1, 0)
      const r180 = rotatePoint(point, 180);
      expect(r180.x).toBe(-1);
      expect(r180.y).toBe(0);

      // 270 deg CCW: (1, 0) -> (0, -1)
      const r270 = rotatePoint(point, 270);
      expect(r270.x).toBe(0);
      expect(r270.y).toBe(-1);
    });

    it('rotates around a custom pivot point', () => {
      const point = { x: 3.0, y: 2.0 };
      const pivot = { x: 2.0, y: 2.0 };

      // Rotate 90 deg around (2, 2): relative (1, 0) becomes (0, 1) -> (2, 3)
      const rotated = rotatePoint(point, 90, pivot);
      expect(rotated.x).toBe(2);
      expect(rotated.y).toBe(3);
    });
  });

  describe('Oriented Corners & Bounding Boxes', () => {
    it('calculates unrotated rectangle corners (bottom-left origin)', () => {
      const geo: Geometry = {
        x: 2.0,
        y: 3.0,
        width: 4.0,
        length: 7.0,
        rotation: 0,
      };

      const corners = getOrientedCorners(geo);
      expect(corners).toEqual([
        { x: 2.0, y: 3.0 }, // Bottom-Left
        { x: 6.0, y: 3.0 }, // Bottom-Right
        { x: 6.0, y: 10.0 }, // Top-Right
        { x: 2.0, y: 10.0 }, // Top-Left
      ]);

      const aabb = computeAABB(corners);
      expect(aabb).toEqual({ minX: 2.0, minY: 3.0, maxX: 6.0, maxY: 10.0 });
    });

    it('calculates corners and AABB for 90-degree rotated rectangle', () => {
      const geo: Geometry = {
        x: 5.0,
        y: 5.0,
        width: 4.0,
        length: 2.0,
        rotation: 90,
      };

      // Rotated around bottom-left (5, 5):
      // BL (5, 5) -> (5, 5)
      // BR (9, 5) -> relative (4, 0) rotated 90 deg is (0, 4) -> (5, 9)
      // TR (9, 7) -> relative (4, 2) rotated 90 deg is (-2, 4) -> (3, 9)
      // TL (5, 7) -> relative (0, 2) rotated 90 deg is (-2, 0) -> (3, 5)
      const corners = getOrientedCorners(geo, 'bottom-left');
      expect(corners).toEqual([
        { x: 5.0, y: 5.0 },
        { x: 5.0, y: 9.0 },
        { x: 3.0, y: 9.0 },
        { x: 3.0, y: 5.0 },
      ]);

      const aabb = getGeometryAABB(geo, 'bottom-left');
      expect(aabb).toEqual({ minX: 3.0, minY: 5.0, maxX: 5.0, maxY: 9.0 });
    });

    it('calculates corners rotated around center', () => {
      const geo: Geometry = {
        x: 0,
        y: 0,
        width: 4.0,
        length: 4.0,
        rotation: 45,
      };

      // Center is at (2, 2). Rotated 45 degrees, the corners form a diamond with bounding box expanded
      const corners = getOrientedCorners(geo, 'center');
      const aabb = computeAABB(corners);

      // Half-diagonal of 4x4 square is sqrt(32)/2 = 2 * sqrt(2) ≈ 2.828
      // Expected minX ≈ 2 - 2.828 = -0.828, maxX ≈ 2 + 2.828 = 4.828
      expect(aabb.minX).toBeCloseTo(-0.828, 2);
      expect(aabb.maxX).toBeCloseTo(4.828, 2);
      expect(aabb.minY).toBeCloseTo(-0.828, 2);
      expect(aabb.maxY).toBeCloseTo(4.828, 2);
    });
  });

  describe('Configurable Grid Snapping', () => {
    it('snaps scalar values to 0.1m grid', () => {
      expect(snapValue(1.234, 0.1)).toBe(1.2);
      expect(snapValue(1.268, 0.1)).toBe(1.3);
      expect(snapValue(0.049, 0.1)).toBe(0.0);
      expect(snapValue(0.051, 0.1)).toBe(0.1);
    });

    it('snaps scalar values to 0.5m grid', () => {
      expect(snapValue(1.23, 0.5)).toBe(1.0);
      expect(snapValue(1.26, 0.5)).toBe(1.5);
      expect(snapValue(4.74, 0.5)).toBe(4.5);
      expect(snapValue(4.76, 0.5)).toBe(5.0);
    });

    it('handles zero or negative grid size gracefully', () => {
      expect(snapValue(3.14159, 0)).toBe(3.142);
      expect(snapValue(3.14159, -1)).toBe(3.142);
    });

    it('snaps 2D points to configurable grid size', () => {
      const p = { x: 2.37, y: 7.82 };
      expect(snapPoint(p, 0.5)).toEqual({ x: 2.5, y: 8.0 });
      expect(snapPoint(p, 0.25)).toEqual({ x: 2.25, y: 7.75 });
    });

    it('snaps entire geometry parametrically without mutating rotation', () => {
      const geo: Geometry = {
        x: 1.12,
        y: 2.39,
        width: 3.91,
        length: 6.88,
        rotation: 45.0,
      };

      const snapped = snapGeometry(geo, 0.1);
      expect(snapped).toEqual({
        x: 1.1,
        y: 2.4,
        width: 3.9,
        length: 6.9,
        rotation: 45.0,
      });
    });
  });
});
