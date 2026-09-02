import { describe, it, expect } from 'vitest';
import {
  createWorkingEnvelope,
  generateWorkingEnvelopes,
  WORKING_ENVELOPE_PURPOSE,
  WORKING_VIOLATION_SEMANTICS,
} from '@/domain/engine/envelopes/workingEnvelope';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import { distance } from '@/domain/geometry/primitives';
import type { LayoutObject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.2 — WORKING Envelope Foundation & Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-work-test',
    name: 'Mobeng Standard Working Envelope Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'clearance.technician_working_buffer', value: 0.8, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.working_buffer.vehicle', value: 0.9, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'CLEARANCE-001', name: 'Inter-Bay Clearance', severity: 'HARD', active: true },
    ],
  };

  const sampleObjects: LayoutObject[] = [
    {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 2.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 },
      metadata: { name: 'Service Bay 1' },
    },
    {
      id: 'veh-01',
      type: 'vehicle',
      layer: '05-VEHICLE',
      geometry: { x: 3.1, y: 4.2, width: 1.8, length: 4.7, rotation: 90 },
      metadata: { vehicleType: 'mpv' },
    },
    {
      id: 'lift-01',
      type: 'equipment',
      layer: '06-LIFT',
      geometry: { x: 3.0, y: 4.5, width: 2.0, length: 4.0, rotation: 45 },
      metadata: { equipmentType: '2_post_lift' },
    },
  ];

  describe('1. Parameter Provenance & Expansion', () => {
    it('creates an explicit WORKING envelope expanded by the standard buffer with verified provenance', () => {
      const accessor = new StandardAccessor(completeStandard);
      // bay-01: physical width 4.0m, length 7.0m, buffer 0.8m
      const envelope = createWorkingEnvelope(sampleObjects[0], accessor);

      expect(envelope.id).toBe('envelope-work-bay-01');
      expect(envelope.type).toBe('WORKING');
      expect(envelope.sourceObjectId).toBe('bay-01');
      expect(envelope.purpose).toBe(WORKING_ENVELOPE_PURPOSE);
      expect(envelope.violationSemantics).toEqual(WORKING_VIOLATION_SEMANTICS);

      // Provenance
      expect(envelope.derivedFromStandard.parameterKey).toBe('clearance.technician_working_buffer');
      expect(envelope.derivedFromStandard.appliedValue).toBe(0.8);
      expect(envelope.derivedFromStandard.unit).toBe('meter');

      // Expanded geometry:
      // Width: 4.0 + 2 * 0.8 = 5.6m
      // Length: 7.0 + 2 * 0.8 = 8.6m
      // X: 2.0 - 0.8 = 1.2m
      // Y: 3.0 - 0.8 = 2.2m
      expect(envelope.geometry.width).toBe(5.6);
      expect(envelope.geometry.length).toBe(8.6);
      expect(envelope.geometry.x).toBe(1.2);
      expect(envelope.geometry.y).toBe(2.2);
      expect(envelope.geometry.rotation).toBe(0);
    });

    it('applies type-specific working buffer if defined in standard snapshot', () => {
      const accessor = new StandardAccessor(completeStandard);
      // veh-01 matches 'clearance.working_buffer.vehicle' (0.9m)
      const envelope = createWorkingEnvelope(sampleObjects[1], accessor);

      expect(envelope.derivedFromStandard.parameterKey).toBe('clearance.working_buffer.vehicle');
      expect(envelope.derivedFromStandard.appliedValue).toBe(0.9);

      // Original width 1.8 -> expanded 1.8 + 2 * 0.9 = 3.6m
      // Original length 4.7 -> expanded 4.7 + 2 * 0.9 = 6.5m
      expect(envelope.geometry.width).toBe(3.6);
      expect(envelope.geometry.length).toBe(6.5);
    });
  });

  describe('2. Rotation Preservation', () => {
    it('preserves concentric expansion when object is rotated by 90 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      // veh-01 rotated 90 degrees at (3.1, 4.2), buffer 0.9m
      const envelope = createWorkingEnvelope(sampleObjects[1], accessor);

      expect(envelope.geometry.rotation).toBe(90);

      // Physical BL is (3.1, 4.2). Unrotated offset is (-0.9, -0.9).
      // Rotated 90 deg counter-clockwise:
      // dx = -0.9 * cos(90) - (-0.9) * sin(90) = 0 - (-0.9) = +0.9
      // dy = -0.9 * sin(90) + (-0.9) * cos(90) = -0.9 + 0 = -0.9
      // New BL = (3.1 + 0.9, 4.2 - 0.9) = (4.0, 3.3)
      expect(envelope.geometry.x).toBe(4.0);
      expect(envelope.geometry.y).toBe(3.3);

      // Distance from original physical BL to working BL must be sqrt(0.9^2 + 0.9^2) = ~1.273m
      const dist = distance({ x: 3.1, y: 4.2 }, { x: envelope.geometry.x, y: envelope.geometry.y });
      expect(dist).toBeCloseTo(Math.hypot(0.9, 0.9), 3);
    });

    it('preserves concentric expansion when object is rotated by 45 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      // lift-01 rotated 45 degrees at (3.0, 4.5), buffer 0.8m
      const envelope = createWorkingEnvelope(sampleObjects[2], accessor);

      expect(envelope.geometry.rotation).toBe(45);
      expect(envelope.geometry.width).toBe(3.6); // 2.0 + 2 * 0.8
      expect(envelope.geometry.length).toBe(5.6); // 4.0 + 2 * 0.8

      // Distance from physical BL to working BL must be sqrt(0.8^2 + 0.8^2)
      const dist = distance({ x: 3.0, y: 4.5 }, { x: envelope.geometry.x, y: envelope.geometry.y });
      expect(dist).toBeCloseTo(Math.hypot(0.8, 0.8), 3);
    });
  });

  describe('3. Missing Parameter Behavior (Zero Fallback)', () => {
    it('strictly throws MissingStandardParameterError when working buffer is absent from standard', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-buffer-std',
        name: 'Standard Without Buffer',
        version: '0.1',
        status: 'published',
        parameters: [
          // No clearance.working_buffer or clearance.technician_working_buffer!
          { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
        ],
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);

      expect(() => {
        createWorkingEnvelope(sampleObjects[0], accessor);
      }).toThrow(MissingStandardParameterError);

      try {
        createWorkingEnvelope(sampleObjects[0], accessor);
      } catch (err) {
        expect(err).toBeInstanceOf(MissingStandardParameterError);
        const missingErr = err as MissingStandardParameterError;
        expect(missingErr.parameterKey).toContain('clearance.working_buffer');
        expect(missingErr.code).toBe('MISSING_STANDARD_PARAMETER');
      }
    });
  });

  describe('4. Determinism & Batch Generation', () => {
    it('batch generates working envelopes deterministically sorted by sourceObjectId', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Shuffled input order
      const shuffled = [sampleObjects[1], sampleObjects[2], sampleObjects[0]];
      const envelopes = generateWorkingEnvelopes(shuffled, accessor);

      expect(envelopes).toHaveLength(3);
      expect(envelopes.map((e) => e.sourceObjectId)).toEqual(['bay-01', 'lift-01', 'veh-01']);
    });

    it('produces 100% deterministic, byte-for-byte identical output across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);

      const run1 = generateWorkingEnvelopes(sampleObjects, accessor);
      const run2 = generateWorkingEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });

  describe('5. Immutability Check', () => {
    it('does not mutate input layout objects or standard snapshot in memory', () => {
      const accessor = new StandardAccessor(completeStandard);
      const objectsBefore = JSON.stringify(sampleObjects);
      const standardBefore = JSON.stringify(completeStandard);

      generateWorkingEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(sampleObjects)).toBe(objectsBefore);
      expect(JSON.stringify(completeStandard)).toBe(standardBefore);
    });
  });
});
