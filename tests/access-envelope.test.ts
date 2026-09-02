import { describe, it, expect } from 'vitest';
import {
  createAccessEnvelope,
  generateAccessEnvelopes,
  ACCESS_ENVELOPE_PURPOSE,
  ACCESS_VIOLATION_SEMANTICS,
} from '@/domain/engine/envelopes/accessEnvelope';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import type { LayoutObject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.2 — ACCESS Envelope Foundation & Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-access-test',
    name: 'Mobeng Standard Access Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'access.approach_depth.vehicle', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'FLOW-001', name: 'Path Continuity', severity: 'HARD', active: true },
    ],
  };

  const sampleObjects: LayoutObject[] = [
    {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 2.0, y: 5.0, width: 4.0, length: 7.0, rotation: 0 },
      metadata: { name: 'Service Bay 1' },
    },
    {
      id: 'veh-01',
      type: 'vehicle',
      layer: '05-VEHICLE',
      geometry: { x: 3.1, y: 6.0, width: 1.8, length: 4.7, rotation: 90 },
      metadata: { vehicleType: 'mpv' },
    },
    {
      id: 'wall-01',
      type: 'wall',
      layer: '01-WALL',
      geometry: { x: 0, y: 0, width: 0.2, length: 10.0, rotation: 0 },
    },
  ];

  describe('1. Directional Geometry & Parameter Provenance', () => {
    it('creates an explicit directional ACCESS envelope connected to entry threshold with verified provenance', () => {
      const accessor = new StandardAccessor(completeStandard);
      // bay-01 is at (2.0, 5.0), width 4.0m, length 7.0m, rotation 0
      // Approach depth from standard: 3.5m
      const envelope = createAccessEnvelope(sampleObjects[0], accessor);

      expect(envelope.id).toBe('envelope-access-bay-01');
      expect(envelope.type).toBe('ACCESS');
      expect(envelope.sourceObjectId).toBe('bay-01');
      expect(envelope.purpose).toBe(ACCESS_ENVELOPE_PURPOSE);
      expect(envelope.violationSemantics).toEqual(ACCESS_VIOLATION_SEMANTICS);

      // Provenance
      expect(envelope.derivedFromStandard.parameterKey).toBe('circulation.bay_approach_depth');
      expect(envelope.derivedFromStandard.appliedValue).toBe(3.5);
      expect(envelope.derivedFromStandard.unit).toBe('meter');

      // Directional geometry verification:
      // In local coordinates: entrance threshold is at Y = 5.0
      // Access corridor projects outward from Y = 5.0 down to Y = 5.0 - 3.5 = 1.5m
      // BL of access corridor is at (2.0, 1.5)
      // Width = 4.0m, Length = 3.5m
      expect(envelope.geometry.x).toBe(2.0);
      expect(envelope.geometry.y).toBe(1.5);
      expect(envelope.geometry.width).toBe(4.0);
      expect(envelope.geometry.length).toBe(3.5);
      expect(envelope.geometry.rotation).toBe(0);

      // Verify top edge of access corridor touches the bottom edge of the service bay (Y = 1.5 + 3.5 = 5.0)
      expect(envelope.geometry.y + envelope.geometry.length).toBe(sampleObjects[0].geometry.y);
    });

    it('creates a vehicle-specific access clearance corridor', () => {
      const accessor = new StandardAccessor(completeStandard);
      const envelope = createAccessEnvelope(sampleObjects[1], accessor);

      expect(envelope.type).toBe('ACCESS');
      expect(envelope.sourceObjectId).toBe('veh-01');
      expect(envelope.derivedFromStandard.parameterKey).toBe('access.approach_depth.vehicle');
      expect(envelope.derivedFromStandard.appliedValue).toBe(2.0);
      expect(envelope.geometry.width).toBe(1.8);
      expect(envelope.geometry.length).toBe(2.0);
    });
  });

  describe('2. Rotation Preservation', () => {
    it('correctly rotates directional access corridor along with rotated service bay (90 degrees)', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Bay rotated 90 degrees at (10.0, 10.0)
      const rotatedBay: LayoutObject = {
        id: 'bay-rot-90',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 10.0, y: 10.0, width: 4.0, length: 7.0, rotation: 90 },
      };

      const envelope = createAccessEnvelope(rotatedBay, accessor);

      expect(envelope.geometry.rotation).toBe(90);
      expect(envelope.geometry.width).toBe(4.0);
      expect(envelope.geometry.length).toBe(3.5);

      // Unrotated BL was (10.0, 10.0 - 3.5) = (10.0, 6.5)
      // Rotated 90 deg around (10.0, 10.0):
      // dx = 0, dy = -3.5
      // rotated: rx = -dy = +3.5, ry = dx = 0
      // New BL = (10.0 + 3.5, 10.0) = (13.5, 10.0)
      expect(envelope.geometry.x).toBe(13.5);
      expect(envelope.geometry.y).toBe(10.0);
    });

    it('correctly rotates directional access corridor for 180 degrees', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Bay facing opposite direction (rotated 180 deg at 10, 10)
      const rotatedBay: LayoutObject = {
        id: 'bay-rot-180',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 10.0, y: 10.0, width: 4.0, length: 7.0, rotation: 180 },
      };

      const envelope = createAccessEnvelope(rotatedBay, accessor);

      expect(envelope.geometry.rotation).toBe(180);
      // Rotated 180 deg around (10, 10): (10, 6.5) -> (10, 13.5)
      expect(envelope.geometry.x).toBe(10.0);
      expect(envelope.geometry.y).toBe(13.5);
    });
  });

  describe('3. Missing Parameter Behavior (Zero Fallback)', () => {
    it('strictly throws MissingStandardParameterError when approach depth is absent from standard', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-access-std',
        name: 'Standard Without Approach Depth',
        version: '0.1',
        status: 'published',
        parameters: [], // empty!
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);

      expect(() => {
        createAccessEnvelope(sampleObjects[0], accessor);
      }).toThrow(MissingStandardParameterError);

      try {
        createAccessEnvelope(sampleObjects[0], accessor);
      } catch (err) {
        expect(err).toBeInstanceOf(MissingStandardParameterError);
        const missingErr = err as MissingStandardParameterError;
        expect(missingErr.parameterKey).toContain('access.approach_depth');
      }
    });
  });

  describe('4. Determinism & Batch Filtering', () => {
    it('batch generates access envelopes only for applicable objects (service_bay, vehicle) sorted deterministically', () => {
      const accessor = new StandardAccessor(completeStandard);

      // sampleObjects contains: bay-01, veh-01, wall-01 (wall should be ignored!)
      const envelopes = generateAccessEnvelopes(sampleObjects, accessor);

      expect(envelopes).toHaveLength(2);
      expect(envelopes.map((e) => e.sourceObjectId)).toEqual(['bay-01', 'veh-01']);
    });

    it('produces 100% deterministic, byte-for-byte identical output across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);

      const run1 = generateAccessEnvelopes(sampleObjects, accessor);
      const run2 = generateAccessEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });

  describe('5. Immutability Check', () => {
    it('does not mutate input layout objects or standard snapshot in memory', () => {
      const accessor = new StandardAccessor(completeStandard);
      const objectsBefore = JSON.stringify(sampleObjects);
      const standardBefore = JSON.stringify(completeStandard);

      generateAccessEnvelopes(sampleObjects, accessor);

      expect(JSON.stringify(sampleObjects)).toBe(objectsBefore);
      expect(JSON.stringify(completeStandard)).toBe(standardBefore);
    });
  });
});
