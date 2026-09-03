import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '@/domain/engine/generator/candidateGenerator';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 4.0A — Candidate Strategy Geometry Audit', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-audit-geom',
    name: 'Candidate Geometry Audit Standard',
    version: '1.0-geom',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.safety_buffer', value: 0.3, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'equipment.width', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'equipment.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'BOUNDARY-SITE-001', name: 'Building in Site', severity: 'HARD', active: true },
      { id: 'COLLISION-PHYSICAL-001', name: 'Physical Collision', severity: 'HARD', active: true },
      { id: 'FLOW-BAY-AISLE-001', name: 'Bay Approach Accessibility', severity: 'HARD', active: true },
    ],
    scoring: [],
  };

  const accessor = new StandardAccessor(completeStandard);
  const generator = new CandidateGenerator();

  // -------------------------------------------------------------------------
  // 1. Single Comb Determinism
  // -------------------------------------------------------------------------
  it('1. generates single-comb arrangement deterministically when requested', () => {
    const input: LayoutEngineInput = {
      site: { width: 30, length: 40 },
      building: { width: 20, length: 25 },
      program: {
        bays: [{ serviceType: 'general_service', quantity: 2 }],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: false,
        futureExpansionBays: 0,
      },
    };

    const candidate = generator.generate(input, accessor, {
      preferredArrangement: 'SINGLE_COMB_NORTH',
      enableMultiArrangementSearch: false,
    });

    expect(candidate.arrangement).toBe('SINGLE_COMB_NORTH');
    expect(candidate.status).toBe('VALID');
    expect(candidate.objects.filter((o) => o.type === 'service_bay')).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 2. Multi-Arrangement Exploration: 6 Bays in 18x25m Building
  // -------------------------------------------------------------------------
  it('2. automatically discovers DOUBLE_COMB_OPPOSING when SINGLE_COMB fails capacity for 6 bays in 18x25m', () => {
    // In an 18m building (width 18m, length 25m):
    // Single comb can fit at most 3 bays.
    // When requesting 6 bays:
    // SINGLE_COMB_NORTH fails with 3/6 bays.
    // Generator explores DOUBLE_COMB_OPPOSING (3 bays on North row + 3 bays on South row = 6 bays).
    // And length is 25m >= (7m + 6m + 7m + clearances = 21.4m), so Double Comb succeeds!
    const sixBayInput: LayoutEngineInput = {
      site: { width: 25, length: 35 },
      building: { width: 18, length: 25 },
      program: {
        bays: [
          { serviceType: 'general_service', quantity: 4 },
          { serviceType: 'brake_suspension', quantity: 2 },
        ],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: false,
        futureExpansionBays: 0,
      },
    };

    const candidate = generator.generate(sixBayInput, accessor);

    expect(candidate.arrangement).toBe('DOUBLE_COMB_OPPOSING');
    expect(candidate.status).toBe('VALID');
    expect(candidate.validation.isValid).toBe(true);
    expect(candidate.metadata.totalBaysPlaced).toBe(6);
    expect(candidate.metadata.attemptedArrangements).toContain('SINGLE_COMB_NORTH');
    expect(candidate.metadata.attemptedArrangements).toContain('DOUBLE_COMB_OPPOSING');
  });

  // -------------------------------------------------------------------------
  // 3. 10 Bays in 18x25m Building (Mathematical Feasibility Audit)
  // -------------------------------------------------------------------------
  it('3. attempts all arrangements and cleanly remains DISQUALIFIED when 10 bays cannot fit in 18x25m building', () => {
    // 10 bays requested in 18x25m building.
    // - Single comb fits 3/10.
    // - Double comb fits 6/10.
    // - Both fail to satisfy the 10-bay requirement without reducing size or clearance.
    // Engine must NOT silently shrink bays or drop spaces. It must cleanly disqualify!
    const tenBayInput: LayoutEngineInput = {
      site: { width: 20, length: 30 },
      building: { width: 18, length: 25, frontSetbackMeters: 4 },
      program: {
        bays: [
          { serviceType: 'general_service', quantity: 6 },
          { serviceType: 'brake_suspension', quantity: 2 },
          { serviceType: 'tire_service', quantity: 1 },
          { serviceType: 'wheel_alignment', quantity: 1 },
        ],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'back_out_turnaround',
        customerZoneRequired: false,
        futureExpansionBays: 0,
      },
    };

    const candidate = generator.generate(tenBayInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    expect(candidate.validation.isValid).toBe(false);
    expect(candidate.metadata.attemptedArrangements).toEqual([
      'SINGLE_COMB_NORTH',
      'DOUBLE_COMB_OPPOSING',
      'ZONED_BY_SERVICE',
    ]);
    expect(candidate.rejections.some((r) => r.ruleId === 'CAPACITY-BAYS-001')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Provenance & Strict Standards Governance
  // -------------------------------------------------------------------------
  it('4. preserves strategy and arrangement provenance on generated candidate and objects', () => {
    const input: LayoutEngineInput = {
      site: { width: 30, length: 40 },
      building: { width: 20, length: 25 },
      program: {
        bays: [{ serviceType: 'general_service', quantity: 2 }],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: false,
        futureExpansionBays: 0,
      },
    };

    const candidate = generator.generate(input, accessor);

    expect(candidate.provenance.strategy).toBe('BALANCED');
    expect(candidate.provenance.arrangement).toBeDefined();

    for (const obj of candidate.objects) {
      if (obj.type === 'service_bay') {
        expect(obj.metadata?.arrangement).toBeDefined();
        expect(obj.metadata?.strategy).toBe('BALANCED');
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. Determinism & Immutability Across Multiple Invocations
  // -------------------------------------------------------------------------
  it('5. guarantees 100% deterministic output and frozen immutability across repeated executions', () => {
    const input: LayoutEngineInput = {
      site: { width: 35, length: 45 },
      building: { width: 25, length: 30 },
      program: {
        bays: [
          { serviceType: 'general_service', quantity: 3 },
          { serviceType: 'tire_service', quantity: 1 },
        ],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: true,
        futureExpansionBays: 1,
      },
    };

    const c1 = generator.generate(input, accessor);
    const c2 = generator.generate(input, accessor);

    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    expect(Object.isFrozen(c1)).toBe(true);
    expect(Object.isFrozen(c1.objects)).toBe(true);
    expect(Object.isFrozen(c1.metadata)).toBe(true);
    expect(Object.isFrozen(c1.provenance)).toBe(true);
  });
});
