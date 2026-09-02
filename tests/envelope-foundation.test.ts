import { describe, it, expect } from 'vitest';
import {
  createPhysicalEnvelope,
  generatePhysicalEnvelopes,
  PHYSICAL_ENVELOPE_PURPOSE,
  PHYSICAL_VIOLATION_SEMANTICS,
} from '@/domain/engine/envelopes/physicalEnvelope';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutObject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.2 — ObjectEnvelope Foundation & PHYSICAL Envelope Generator', () => {
  const mockStandard: WorkshopStandard = {
    id: 'mobeng-std-m22',
    name: 'Mobeng Workshop Standard Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'vehicle.mpv.length', value: 4.7, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
    ],
  };

  const sampleObjects: LayoutObject[] = [
    {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 2.0004, y: 3.0008, width: 4.0, length: 7.0, rotation: 0 },
      metadata: { name: 'Service Bay 1' },
    },
    {
      id: 'veh-01',
      type: 'vehicle',
      layer: '05-VEHICLE',
      geometry: { x: 3.1, y: 4.2, width: 1.8, length: 4.7, rotation: -45 },
      metadata: { vehicleType: 'mpv' },
    },
    {
      id: 'lift-01',
      type: 'equipment',
      layer: '06-LIFT',
      geometry: { x: 3.0, y: 4.5, width: 2.0, length: 4.0, rotation: 370 },
      metadata: { equipmentType: '2_post_lift' },
    },
  ];

  it('creates an explicit PHYSICAL envelope with standard provenance and millimeter precision', () => {
    const accessor = new StandardAccessor(mockStandard);
    const envelope = createPhysicalEnvelope(sampleObjects[0], accessor);

    expect(envelope.id).toBe('envelope-phys-bay-01');
    expect(envelope.type).toBe('PHYSICAL');
    expect(envelope.sourceObjectId).toBe('bay-01');
    expect(envelope.purpose).toBe(PHYSICAL_ENVELOPE_PURPOSE);
    expect(envelope.violationSemantics).toEqual(PHYSICAL_VIOLATION_SEMANTICS);

    // Millimeter precision rounding verification (2.0004 -> 2.0, 3.0008 -> 3.001)
    expect(envelope.geometry.x).toBe(2.0);
    expect(envelope.geometry.y).toBe(3.001);
    expect(envelope.geometry.width).toBe(4.0);
    expect(envelope.geometry.length).toBe(7.0);
    expect(envelope.geometry.rotation).toBe(0);

    // Provenance verification from StandardAccessor
    expect(envelope.derivedFromStandard.unit).toBe('meter');
    expect(envelope.derivedFromStandard.appliedValue).toBe(7.0);
  });

  it('correctly normalizes rotation angles and captures vehicle provenance', () => {
    const accessor = new StandardAccessor(mockStandard);
    const envelopeVeh = createPhysicalEnvelope(sampleObjects[1], accessor);

    // -45 degrees normalized to 315 degrees
    expect(envelopeVeh.geometry.rotation).toBe(315);
    expect(envelopeVeh.derivedFromStandard.appliedValue).toBe(4.7);

    const envelopeLift = createPhysicalEnvelope(sampleObjects[2], accessor);
    // 370 degrees normalized to 10 degrees
    expect(envelopeLift.geometry.rotation).toBe(10);
  });

  it('batch generates envelopes in deterministic order sorted by sourceObjectId', () => {
    const accessor = new StandardAccessor(mockStandard);

    // Pass shuffled order: veh-01, lift-01, bay-01
    const shuffled = [sampleObjects[1], sampleObjects[2], sampleObjects[0]];
    const envelopes = generatePhysicalEnvelopes(shuffled, accessor);

    expect(envelopes).toHaveLength(3);
    expect(envelopes.map((e) => e.sourceObjectId)).toEqual(['bay-01', 'lift-01', 'veh-01']);
  });

  it('guarantees 100% deterministic output across multiple runs', () => {
    const accessor = new StandardAccessor(mockStandard);

    const run1 = generatePhysicalEnvelopes(sampleObjects, accessor);
    const run2 = generatePhysicalEnvelopes(sampleObjects, accessor);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('does not mutate input layout objects or standard snapshot', () => {
    const accessor = new StandardAccessor(mockStandard);
    const objCopyBefore = JSON.stringify(sampleObjects);
    const stdCopyBefore = JSON.stringify(mockStandard);

    generatePhysicalEnvelopes(sampleObjects, accessor);

    expect(JSON.stringify(sampleObjects)).toBe(objCopyBefore);
    expect(JSON.stringify(mockStandard)).toBe(stdCopyBefore);
  });
});
