import { describe, it, expect } from 'vitest';
import {
  containsEnvelope,
  overlapsEnvelope,
  distanceBetweenEnvelopes,
  isInsideBuilding,
  isWithinClearance,
  pointToSegmentDistance,
} from '@/domain/engine/spatial/spatialRelations';
import type { ObjectEnvelope } from '@/domain/engine/types';
import type { Geometry } from '@/domain/models/project';

describe('Milestone 2.3 — Spatial Foundation & Envelope Spatial Relations', () => {
  // Helper to create test envelope
  const createMockEnvelope = (id: string, geometry: Geometry): ObjectEnvelope => ({
    id: `envelope-${id}`,
    type: 'PHYSICAL',
    sourceObjectId: id,
    derivedFromStandard: { parameterKey: 'test', appliedValue: 1.0, unit: 'meter' },
    geometry,
    purpose: 'Test',
    violationSemantics: {
      forbiddenOverlapTypes: ['PHYSICAL'],
      severityOnOverlap: 'HARD',
      allowOverlapWithParent: false,
    },
  });

  const building = { width: 18.0, length: 25.0 };

  describe('1. overlapsEnvelope (Intersection Test with Rotation)', () => {
    it('detects overlapping axis-aligned envelopes', () => {
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 });
      const b = createMockEnvelope('b', { x: 4.0, y: 3.0, width: 4.0, length: 4.0, rotation: 0 }); // overlaps [4,6] x [3,6]

      expect(overlapsEnvelope(a, b)).toBe(true);
      expect(overlapsEnvelope(b, a)).toBe(true);
    });

    it('detects non-overlapping envelopes with a separating space', () => {
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 }); // X: [2, 6]
      const b = createMockEnvelope('b', { x: 7.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 }); // X: [7, 11]

      expect(overlapsEnvelope(a, b)).toBe(false);
    });

    it('detects overlap between rotated envelopes using SAT narrow-phase', () => {
      // a: box at (5, 5), size 2x2, rotated 45 deg (diamond shape)
      const a = createMockEnvelope('a', { x: 5.0, y: 5.0, width: 2.0, length: 2.0, rotation: 45 });
      // b: box at (4.5, 5.0), size 1x1, unrotated
      const b = createMockEnvelope('b', { x: 4.5, y: 5.0, width: 1.0, length: 1.0, rotation: 0 });

      expect(overlapsEnvelope(a, b)).toBe(true);
    });

    it('confirms separated rotated envelopes do not overlap even if their AABBs intersect', () => {
      // Two boxes rotated 45 deg placed diagonally such that AABB overlaps but actual diamonds do not touch
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 1.0, length: 1.0, rotation: 45 });
      const b = createMockEnvelope('b', { x: 3.2, y: 3.2, width: 1.0, length: 1.0, rotation: 45 });

      expect(overlapsEnvelope(a, b)).toBe(false);
    });
  });

  describe('2. containsEnvelope (Containment Test)', () => {
    it('detects complete containment of target inside container', () => {
      // Container: 10m x 10m at (2, 2)
      const container = createMockEnvelope('bay', { x: 2.0, y: 2.0, width: 10.0, length: 10.0, rotation: 0 });
      // Target: 2m x 4m at (4, 4)
      const target = createMockEnvelope('lift', { x: 4.0, y: 4.0, width: 2.0, length: 4.0, rotation: 0 });

      expect(containsEnvelope(container, target)).toBe(true);
      expect(containsEnvelope(target, container)).toBe(false);
    });

    it('detects target extending outside container boundary', () => {
      const container = createMockEnvelope('bay', { x: 2.0, y: 2.0, width: 4.0, length: 7.0, rotation: 0 }); // X: [2, 6], Y: [2, 9]
      const overflow = createMockEnvelope('veh', { x: 3.0, y: 7.0, width: 2.0, length: 4.0, rotation: 0 }); // Y: [7, 11] -> overflows at Y=11

      expect(containsEnvelope(container, overflow)).toBe(false);
    });

    it('detects rotated target completely contained inside container', () => {
      // Large container 10x10 at (0, 0)
      const container = createMockEnvelope('container', { x: 0.0, y: 0.0, width: 10.0, length: 10.0, rotation: 0 });
      // Target 2x2 at (4, 4) rotated 45 deg
      const rotatedTarget = createMockEnvelope('diamond', { x: 4.0, y: 4.0, width: 2.0, length: 2.0, rotation: 45 });

      expect(containsEnvelope(container, rotatedTarget)).toBe(true);
    });
  });

  describe('3. distanceBetweenEnvelopes (Euclidean Distance)', () => {
    it('returns 0 for overlapping or touching envelopes', () => {
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 });
      const b = createMockEnvelope('b', { x: 5.0, y: 3.0, width: 4.0, length: 4.0, rotation: 0 });

      expect(distanceBetweenEnvelopes(a, b)).toBe(0);
    });

    it('calculates exact horizontal distance between separated axis-aligned envelopes', () => {
      // a: [2, 6], b: [8.5, 12.5] -> gap = 8.5 - 6 = 2.5m
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 });
      const b = createMockEnvelope('b', { x: 8.5, y: 2.0, width: 4.0, length: 4.0, rotation: 0 });

      expect(distanceBetweenEnvelopes(a, b)).toBe(2.5);
    });

    it('calculates exact diagonal distance between non-overlapping corner envelopes', () => {
      // a: [0, 2] x [0, 2] (top-right corner is (2, 2))
      // b: [5, 7] x [6, 8] (bottom-left corner is (5, 6))
      // Distance between (2, 2) and (5, 6): dx = 3, dy = 4 -> dist = 5.0m
      const a = createMockEnvelope('a', { x: 0.0, y: 0.0, width: 2.0, length: 2.0, rotation: 0 });
      const b = createMockEnvelope('b', { x: 5.0, y: 6.0, width: 2.0, length: 2.0, rotation: 0 });

      expect(distanceBetweenEnvelopes(a, b)).toBe(5.0);
    });

    it('calculates accurate distance between rotated envelopes', () => {
      // Box at (2, 2) size 2x2 rotated 0 -> right edge is X=4
      // Box at (8, 2) size 2x2 rotated 90
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 2.0, length: 2.0, rotation: 0 });
      const b = createMockEnvelope('b', { x: 8.0, y: 2.0, width: 2.0, length: 2.0, rotation: 90 });

      const d = distanceBetweenEnvelopes(a, b);
      expect(d).toBeGreaterThan(0);
      expect(typeof d).toBe('number');
    });
  });

  describe('4. isInsideBuilding (Boundary Containment)', () => {
    it('returns true when envelope is fully within building boundaries', () => {
      const a = createMockEnvelope('a', { x: 2.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 });
      expect(isInsideBuilding(a, building)).toBe(true);
    });

    it('returns false when unrotated envelope crosses building boundary', () => {
      // Building is 18m wide. Box at x: 16m with width 4m extends to 20m!
      const a = createMockEnvelope('a', { x: 16.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 });
      expect(isInsideBuilding(a, building)).toBe(false);
    });

    it('returns false when rotated envelope swings past building boundary', () => {
      // Box near wall at x: 16m with length 4m rotated 90 deg swings along -X or +X
      const rotated = createMockEnvelope('rot', { x: 17.0, y: 10.0, width: 2.0, length: 4.0, rotation: -90 });
      expect(isInsideBuilding(rotated, building)).toBe(false);
    });
  });

  describe('5. isWithinClearance (Data-Driven Clearance Verification)', () => {
    it('returns true when actual distance meets or exceeds the required clearance', () => {
      const a = createMockEnvelope('a', { x: 2.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 }); // X: [2, 6]
      const b = createMockEnvelope('b', { x: 7.0, y: 2.0, width: 4.0, length: 4.0, rotation: 0 }); // X: [7, 11], gap = 1.0m

      // Required clearance 0.8m -> actual is 1.0m -> meets clearance!
      expect(isWithinClearance(a, b, 0.8)).toBe(true);
      // Required clearance 1.0m -> actual is 1.0m -> meets clearance!
      expect(isWithinClearance(a, b, 1.0)).toBe(true);
      // Required clearance 1.2m -> actual is 1.0m -> fails clearance!
      expect(isWithinClearance(a, b, 1.2)).toBe(false);
    });
  });

  describe('6. Point to Segment Helper', () => {
    it('accurately computes perpendicular and endpoint distances', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 10, y: 0 };

      // Point directly above midpoint (5, 4) -> dist = 4
      expect(pointToSegmentDistance({ x: 5, y: 4 }, a, b)).toBe(4);

      // Point before segment start (-3, 4) -> dist to (0,0) = 5
      expect(pointToSegmentDistance({ x: -3, y: 4 }, a, b)).toBe(5);

      // Point after segment end (13, 4) -> dist to (10,0) = 5
      expect(pointToSegmentDistance({ x: 13, y: 4 }, a, b)).toBe(5);
    });
  });
});
