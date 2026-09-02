import { describe, it, expect } from 'vitest';
import {
  calculateAisleEnvelope,
  calculateApproachEnvelope,
  isAisleWidthValid,
} from '@/domain/engine/spatial/aisleCalculator';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import { overlapsEnvelope } from '@/domain/engine/spatial/spatialRelations';
import { createPhysicalEnvelope } from '@/domain/engine/envelopes/physicalEnvelope';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutObject } from '@/domain/models/project';

describe('Milestone 2.3 — Circulation Foundation & Aisle Calculator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-aisle-test',
    name: 'Mobeng Aisle Standard Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'FLOW-001', name: 'Path Continuity', severity: 'HARD', active: true },
    ],
  };

  describe('1. Minimum & Insufficient Aisle Width', () => {
    it('returns true when aisle width meets or exceeds standard minimum width (6.0m)', () => {
      const accessor = new StandardAccessor(completeStandard);

      expect(isAisleWidthValid(6.0, accessor)).toBe(true);
      expect(isAisleWidthValid(7.5, accessor)).toBe(true);
    });

    it('returns false when aisle width is insufficient (< 6.0m)', () => {
      const accessor = new StandardAccessor(completeStandard);

      expect(isAisleWidthValid(5.99, accessor)).toBe(false);
      expect(isAisleWidthValid(4.5, accessor)).toBe(false);
    });
  });

  describe('2. Aisle Envelope Generation & Rotation', () => {
    it('calculates unrotated horizontal aisle envelope with dimensions from standard', () => {
      const accessor = new StandardAccessor(completeStandard);
      const aisle = calculateAisleEnvelope(
        { id: 'main', origin: { x: 0, y: 7.0 }, length: 18.0, rotation: 0 },
        accessor
      );

      expect(aisle.id).toBe('envelope-aisle-main');
      expect(aisle.derivedFromStandard.parameterKey).toBe('circulation.drive_aisle.min_width');
      expect(aisle.derivedFromStandard.appliedValue).toBe(6.0);
      expect(aisle.geometry.x).toBe(0);
      expect(aisle.geometry.y).toBe(7.0);
      expect(aisle.geometry.width).toBe(6.0);
      expect(aisle.geometry.length).toBe(18.0);
      expect(aisle.geometry.rotation).toBe(0);
    });

    it('calculates vertical aisle envelope rotated 90 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      const aisle = calculateAisleEnvelope(
        { id: 'vert', origin: { x: 6.0, y: 0 }, length: 25.0, rotation: 90 },
        accessor
      );

      expect(aisle.geometry.rotation).toBe(90);
      expect(aisle.geometry.x).toBe(6.0);
      expect(aisle.geometry.y).toBe(0);
      expect(aisle.geometry.width).toBe(6.0);
      expect(aisle.geometry.length).toBe(25.0);
    });

    it('calculates aisle envelope rotated 45 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      const aisle = calculateAisleEnvelope(
        { id: 'diag', origin: { x: 5.0, y: 5.0 }, length: 10.0, rotation: 45 },
        accessor
      );

      expect(aisle.geometry.rotation).toBe(45);
      expect(aisle.geometry.width).toBe(6.0);
      expect(aisle.geometry.length).toBe(10.0);
    });
  });

  describe('3. Approach Envelope Directionality & Rotation', () => {
    const bayGeometry = { x: 5.0, y: 10.0, width: 4.0, length: 7.0, rotation: 0 };

    it('calculates front approach corridor projecting outward along -Y', () => {
      const accessor = new StandardAccessor(completeStandard);
      const approach = calculateApproachEnvelope(
        { id: 'bay-front', targetGeometry: bayGeometry, direction: 'front' },
        accessor
      );

      // Depth is 3.5m from standard
      // Entry threshold is at Y = 10.0. Corridor spans Y: [6.5, 10.0]
      expect(approach.geometry.x).toBe(5.0);
      expect(approach.geometry.y).toBe(6.5);
      expect(approach.geometry.width).toBe(4.0);
      expect(approach.geometry.length).toBe(3.5);
      expect(approach.geometry.rotation).toBe(0);
    });

    it('calculates rear approach corridor projecting outward along +Y', () => {
      const accessor = new StandardAccessor(completeStandard);
      const approach = calculateApproachEnvelope(
        { id: 'bay-rear', targetGeometry: bayGeometry, direction: 'rear' },
        accessor
      );

      // Exit threshold is at Y = 10.0 + 7.0 = 17.0. Corridor spans Y: [17.0, 20.5]
      expect(approach.geometry.x).toBe(5.0);
      expect(approach.geometry.y).toBe(17.0);
      expect(approach.geometry.width).toBe(4.0);
      expect(approach.geometry.length).toBe(3.5);
    });

    it('calculates left and right approach corridors', () => {
      const accessor = new StandardAccessor(completeStandard);
      const leftApproach = calculateApproachEnvelope(
        { id: 'bay-left', targetGeometry: bayGeometry, direction: 'left' },
        accessor
      );

      // Left threshold is X = 5.0. Protrudes left to X = 5.0 - 3.5 = 1.5
      expect(leftApproach.geometry.x).toBe(1.5);
      expect(leftApproach.geometry.y).toBe(10.0);
      expect(leftApproach.geometry.width).toBe(3.5);
      expect(leftApproach.geometry.length).toBe(7.0);

      const rightApproach = calculateApproachEnvelope(
        { id: 'bay-right', targetGeometry: bayGeometry, direction: 'right' },
        accessor
      );
      // Right threshold is X = 5.0 + 4.0 = 9.0
      expect(rightApproach.geometry.x).toBe(9.0);
      expect(rightApproach.geometry.y).toBe(10.0);
    });

    it('preserves approach direction when target geometry is rotated 90 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      const rotatedBay = { x: 10.0, y: 10.0, width: 4.0, length: 7.0, rotation: 90 };

      const approach = calculateApproachEnvelope(
        { id: 'rot-approach', targetGeometry: rotatedBay, direction: 'front' },
        accessor
      );

      expect(approach.geometry.rotation).toBe(90);
      // Rotated 90 deg around (10, 10): local (0, -3.5) rotates to (+3.5, 0)
      expect(approach.geometry.x).toBe(13.5);
      expect(approach.geometry.y).toBe(10.0);
    });
  });

  describe('4. Missing Standard Parameter Behavior (Zero Fallback)', () => {
    it('strictly throws MissingStandardParameterError when aisle parameter is absent from standard', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-aisle-std',
        name: 'Incomplete Standard',
        version: '0.1',
        status: 'published',
        parameters: [], // empty
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);

      expect(() => isAisleWidthValid(6.0, accessor)).toThrow(MissingStandardParameterError);
      expect(() => {
        calculateAisleEnvelope({ id: 'a1', origin: { x: 0, y: 0 }, length: 10 }, accessor);
      }).toThrow(MissingStandardParameterError);
      expect(() => {
        calculateApproachEnvelope(
          { id: 'app1', targetGeometry: { x: 0, y: 0, width: 4, length: 7, rotation: 0 }, direction: 'front' },
          accessor
        );
      }).toThrow(MissingStandardParameterError);
    });
  });

  describe('5. Overlap Evaluation with Other Envelopes', () => {
    it('detects overlap when structural column intrudes into drive aisle', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Horizontal aisle at Y: [7.0, 13.0] with length 18.0m
      const aisle = calculateAisleEnvelope(
        { id: 'main', origin: { x: 0, y: 7.0 }, length: 18.0, rotation: 0 },
        accessor
      );

      // Structural column at (5.0, 9.0) inside the aisle corridor!
      const columnObj: LayoutObject = {
        id: 'col-01',
        type: 'column',
        layer: '02-COLUMN',
        geometry: { x: 5.0, y: 9.0, width: 0.6, length: 0.6, rotation: 0 },
      };
      const colPhys = createPhysicalEnvelope(columnObj, accessor);

      expect(overlapsEnvelope(aisle, colPhys)).toBe(true);
    });

    it('detects approach corridor properly connecting and overlapping drive aisle', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Drive aisle at Y: [2.0, 8.0]
      const aisle = calculateAisleEnvelope(
        { id: 'main', origin: { x: 0, y: 2.0 }, length: 18.0, rotation: 0 },
        accessor
      );

      // Service bay situated above aisle at Y = 8.0.
      // Front approach depth is 3.5m, extending from Y = 8.0 down to Y = 4.5
      // This approach corridor overlaps the aisle between Y = 4.5 and 8.0!
      const bayGeo = { x: 2.0, y: 8.0, width: 4.0, length: 7.0, rotation: 0 };
      const approach = calculateApproachEnvelope(
        { id: 'bay-01-app', targetGeometry: bayGeo, direction: 'front' },
        accessor
      );

      expect(overlapsEnvelope(aisle, approach)).toBe(true);
    });
  });

  describe('6. Determinism & Immutability', () => {
    it('produces 100% deterministic output across multiple runs', () => {
      const accessor = new StandardAccessor(completeStandard);

      const spec = { id: 'main', origin: { x: 0, y: 7.0 }, length: 18.0, rotation: 0 };
      const run1 = calculateAisleEnvelope(spec, accessor);
      const run2 = calculateAisleEnvelope(spec, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('does not mutate input specifications or standard snapshot in memory', () => {
      const accessor = new StandardAccessor(completeStandard);
      const spec = { id: 'main', origin: { x: 0, y: 7.0 }, length: 18.0, rotation: 0 };

      const specBefore = JSON.stringify(spec);
      const stdBefore = JSON.stringify(completeStandard);

      calculateAisleEnvelope(spec, accessor);

      expect(JSON.stringify(spec)).toBe(specBefore);
      expect(JSON.stringify(completeStandard)).toBe(stdBefore);
    });
  });
});
