import { describe, it, expect } from 'vitest';
import {
  createSafetyEnvelope,
  generateSafetyEnvelopes,
  hasSafetyRequirement,
  SAFETY_ENVELOPE_PURPOSE,
} from '@/domain/engine/envelopes/safetyEnvelope';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import { distance } from '@/domain/geometry/primitives';
import type { LayoutObject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.2 — SAFETY Envelope Foundation & Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-safety-test',
    name: 'Mobeng Standard Safety Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'safety.buffer.compressor', value: 1.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'safety.buffer.equipment.2_post_lift', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'safety.buffer.service_bay', value: 0.3, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'SAFETY-001', name: 'Hazardous Machinery Safety Zone', severity: 'HARD', active: true },
    ],
  };

  const sampleObjects: LayoutObject[] = [
    {
      id: 'compressor-01',
      type: 'equipment',
      layer: '07-EQUIPMENT',
      geometry: { x: 1.0, y: 1.0, width: 1.2, length: 1.8, rotation: 0 },
      metadata: { equipmentType: 'compressor', name: 'Main Air Compressor' },
    },
    {
      id: 'lift-01',
      type: 'equipment',
      layer: '06-LIFT',
      geometry: { x: 5.0, y: 5.0, width: 2.0, length: 4.0, rotation: 45 },
      metadata: { equipmentType: '2_post_lift' },
    },
    {
      id: 'wall-01',
      type: 'wall',
      layer: '01-WALL',
      geometry: { x: 0, y: 0, width: 0.2, length: 10.0, rotation: 0 },
    },
    {
      id: 'col-01',
      type: 'column',
      layer: '02-COLUMN',
      geometry: { x: 6.0, y: 6.0, width: 0.6, length: 0.6, rotation: 0 },
    },
  ];

  describe('1. Geometry & Provenance', () => {
    it('creates an explicit SAFETY envelope with verified provenance and data-driven violation semantics', () => {
      const accessor = new StandardAccessor(completeStandard);
      // compressor-01 has width 1.2, length 1.8, safety buffer 1.5m
      const envelope = createSafetyEnvelope(sampleObjects[0], accessor);

      expect(envelope.id).toBe('envelope-safe-compressor-01');
      expect(envelope.type).toBe('SAFETY');
      expect(envelope.sourceObjectId).toBe('compressor-01');
      expect(envelope.purpose).toBe(SAFETY_ENVELOPE_PURPOSE);

      // Provenance from StandardAccessor
      expect(envelope.derivedFromStandard.parameterKey).toBe('safety.buffer.compressor');
      expect(envelope.derivedFromStandard.appliedValue).toBe(1.5);
      expect(envelope.derivedFromStandard.unit).toBe('meter');

      // Violation semantics reflects severity from standard rule 'SAFETY-001'
      expect(envelope.violationSemantics.severityOnOverlap).toBe('HARD');
      expect(envelope.violationSemantics.forbiddenOverlapTypes).toEqual(['PHYSICAL', 'ACCESS']);
      expect(envelope.violationSemantics.allowOverlapWithParent).toBe(true);

      // Geometry expansion:
      // Width: 1.2 + 2 * 1.5 = 4.2m
      // Length: 1.8 + 2 * 1.5 = 4.8m
      // X: 1.0 - 1.5 = -0.5m
      // Y: 1.0 - 1.5 = -0.5m
      expect(envelope.geometry.width).toBe(4.2);
      expect(envelope.geometry.length).toBe(4.8);
      expect(envelope.geometry.x).toBe(-0.5);
      expect(envelope.geometry.y).toBe(-0.5);
      expect(envelope.geometry.rotation).toBe(0);
    });
  });

  describe('2. Rotation Preservation', () => {
    it('preserves concentric expansion when object is rotated (45 degrees)', () => {
      const accessor = new StandardAccessor(completeStandard);
      // lift-01 rotated 45 deg, buffer 0.5m
      const envelope = createSafetyEnvelope(sampleObjects[1], accessor);

      expect(envelope.geometry.rotation).toBe(45);
      // Width: 2.0 + 2 * 0.5 = 3.0m
      // Length: 4.0 + 2 * 0.5 = 5.0m
      expect(envelope.geometry.width).toBe(3.0);
      expect(envelope.geometry.length).toBe(5.0);

      // Distance from physical BL (5.0, 5.0) to safety BL must be sqrt(0.5^2 + 0.5^2)
      const dist = distance({ x: 5.0, y: 5.0 }, { x: envelope.geometry.x, y: envelope.geometry.y });
      expect(dist).toBeCloseTo(Math.hypot(0.5, 0.5), 3);
    });

    it('preserves concentric expansion when object is rotated by 90 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      const rotatedCompressor: LayoutObject = {
        ...sampleObjects[0],
        id: 'comp-90',
        geometry: { x: 10.0, y: 10.0, width: 1.2, length: 1.8, rotation: 90 },
      };

      const envelope = createSafetyEnvelope(rotatedCompressor, accessor);
      expect(envelope.geometry.rotation).toBe(90);

      // Distance from original BL must be sqrt(1.5^2 + 1.5^2)
      const dist = distance({ x: 10.0, y: 10.0 }, { x: envelope.geometry.x, y: envelope.geometry.y });
      expect(dist).toBeCloseTo(Math.hypot(1.5, 1.5), 3);
    });
  });

  describe('3. Parameter Lookup & Missing Parameter (Zero Fallbacks)', () => {
    it('strictly throws MissingStandardParameterError when safety parameter is missing from snapshot', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-safety-std',
        name: 'Standard Without Safety Parameters',
        version: '0.1',
        status: 'published',
        parameters: [], // empty!
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);

      expect(() => {
        createSafetyEnvelope(sampleObjects[0], accessor);
      }).toThrow(MissingStandardParameterError);

      try {
        createSafetyEnvelope(sampleObjects[0], accessor);
      } catch (err) {
        expect(err).toBeInstanceOf(MissingStandardParameterError);
        const missingErr = err as MissingStandardParameterError;
        expect(missingErr.parameterKey).toContain('safety.buffer');
      }
    });

    it('respects metadata override parameter key if specified', () => {
      const standardWithCustomKey: WorkshopStandard = {
        ...completeStandard,
        parameters: [
          ...completeStandard.parameters,
          { key: 'custom.safety.zone_heavy', value: 2.2, unit: 'meter', constraint_level: 'HARD' },
        ],
      };

      const accessor = new StandardAccessor(standardWithCustomKey);
      const customObj: LayoutObject = {
        id: 'heavy-machine-01',
        type: 'equipment',
        layer: '07-EQUIPMENT',
        geometry: { x: 2.0, y: 2.0, width: 2.0, length: 2.0, rotation: 0 },
        metadata: { safetyBufferParameterKey: 'custom.safety.zone_heavy' },
      };

      const envelope = createSafetyEnvelope(customObj, accessor);
      expect(envelope.derivedFromStandard.parameterKey).toBe('custom.safety.zone_heavy');
      expect(envelope.derivedFromStandard.appliedValue).toBe(2.2);
      expect(envelope.geometry.width).toBe(2.0 + 2 * 2.2);
    });
  });

  describe('4. Filtering & Batch Determinism', () => {
    it('correctly filters objects: only objects with standard safety requirements are generated', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Has safety requirement: compressor-01, lift-01
      expect(hasSafetyRequirement(sampleObjects[0], accessor)).toBe(true);
      expect(hasSafetyRequirement(sampleObjects[1], accessor)).toBe(true);

      // Wall and column do not have safety requirements in completeStandard
      expect(hasSafetyRequirement(sampleObjects[2], accessor)).toBe(false);
      expect(hasSafetyRequirement(sampleObjects[3], accessor)).toBe(false);

      // Batch generate: should only include compressor-01 and lift-01
      const envelopes = generateSafetyEnvelopes(sampleObjects, accessor);
      expect(envelopes).toHaveLength(2);
      expect(envelopes.map((e) => e.sourceObjectId)).toEqual(['compressor-01', 'lift-01']);
    });

    it('produces 100% deterministic, byte-for-byte identical output across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);

      const run1 = generateSafetyEnvelopes(sampleObjects, accessor);
      const run2 = generateSafetyEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });

  describe('5. Immutability Check', () => {
    it('does not mutate input layout objects or standard snapshot in memory', () => {
      const accessor = new StandardAccessor(completeStandard);
      const objectsBefore = JSON.stringify(sampleObjects);
      const standardBefore = JSON.stringify(completeStandard);

      generateSafetyEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(sampleObjects)).toBe(objectsBefore);
      expect(JSON.stringify(completeStandard)).toBe(standardBefore);
    });
  });
});
