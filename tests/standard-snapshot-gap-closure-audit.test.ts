import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '@/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard, StandardParameter } from '@/domain/models/standard';

describe('FASE 4.0B — Standard Snapshot Gap Closure Audit', () => {
  const baseParameters: StandardParameter[] = [
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
    { key: 'room.min_width.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.parts_warehouse', value: 4.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.parts_warehouse', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.width', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.length', value: 5.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },
  ];

  function createStandard(overrides?: StandardParameter[]): WorkshopStandard {
    return {
      id: 'mobeng-std-gap-closure',
      name: 'Standard Gap Closure Standard',
      version: '1.0-gap',
      status: 'published',
      parameters: overrides ?? baseParameters,
      rules: [
        { id: 'BOUNDARY-SITE-001', name: 'Building in Site', severity: 'HARD', active: true },
        { id: 'COLLISION-PHYSICAL-001', name: 'Physical Collision', severity: 'HARD', active: true },
        { id: 'FLOW-BAY-AISLE-001', name: 'Bay Approach Accessibility', severity: 'HARD', active: true },
      ],
      scoring: [],
    };
  }

  const fullInput: LayoutEngineInput = {
    site: {
      width: 60,
      length: 40,
      parking: { customerParkingSpaces: 3, staffParkingSpaces: 2, vehicleStagingSpaces: 2 },
    },
    building: { width: 50, length: 30, frontSetbackMeters: 6 },
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 4 },
        { serviceType: 'brake_suspension', quantity: 2 },
      ],
      equipment: [{ equipmentType: '2_post_lift', quantity: 2 }],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
        compressorRoom: true,
        oilWasteStorage: true,
        staffRoom: true,
      },
      futureExpansionBays: 0,
    },
  };

  const generator = new CandidateGenerator();

  // -------------------------------------------------------------------------
  // 1. Full Standard Coverage
  // -------------------------------------------------------------------------
  it('1. successfully generates candidate when all standard parameters are present', () => {
    const accessor = new StandardAccessor(createStandard());
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('VALID');
    expect(candidate.validation.isValid).toBe(true);
    expect(candidate.rejections).toHaveLength(0);
    expect(candidate.metadata.ancillarySpacesPlaced).toHaveLength(7);
  });

  // -------------------------------------------------------------------------
  // 2. Structured MISSING_STANDARD_PARAMETER on Missing Room Standards
  // -------------------------------------------------------------------------
  it('2. emits MISSING_STANDARD_PARAMETER when cashier office standard is missing', () => {
    const withoutCashier = baseParameters.filter((p) => !p.key.includes('cashier_office'));
    const accessor = new StandardAccessor(createStandard(withoutCashier));
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    const rej = candidate.rejections.find((r) => r.ruleId === 'MISSING_STANDARD_PARAMETER');
    expect(rej).toBeDefined();
    expect(rej?.provenance?.referenceKey).toBe('room.min_width.cashier_office');
  });

  it('3. emits MISSING_STANDARD_PARAMETER when parts warehouse standard is missing', () => {
    const withoutWarehouse = baseParameters.filter((p) => !p.key.includes('parts_warehouse'));
    const accessor = new StandardAccessor(createStandard(withoutWarehouse));
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    const rej = candidate.rejections.find((r) => r.ruleId === 'MISSING_STANDARD_PARAMETER');
    expect(rej).toBeDefined();
    expect(rej?.provenance?.referenceKey).toBe('room.min_width.parts_warehouse');
  });

  it('4. emits MISSING_STANDARD_PARAMETER when parking stall standard is missing', () => {
    const withoutParking = baseParameters.filter((p) => !p.key.includes('parking.stall'));
    const accessor = new StandardAccessor(createStandard(withoutParking));
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    const rej = candidate.rejections.find((r) => r.ruleId === 'MISSING_STANDARD_PARAMETER');
    expect(rej).toBeDefined();
    expect(rej?.provenance?.referenceKey).toBe('parking.stall.width');
  });

  it('5. emits MISSING_STANDARD_PARAMETER when compressor room standard is missing', () => {
    const withoutComp = baseParameters.filter((p) => !p.key.includes('compressor_room'));
    const accessor = new StandardAccessor(createStandard(withoutComp));
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    const rej = candidate.rejections.find((r) => r.ruleId === 'MISSING_STANDARD_PARAMETER');
    expect(rej).toBeDefined();
    expect(rej?.provenance?.referenceKey).toBe('room.min_width.compressor_room');
  });

  it('6. emits MISSING_STANDARD_PARAMETER when oil waste storage standard is missing', () => {
    const withoutWaste = baseParameters.filter((p) => !p.key.includes('oil_waste_storage'));
    const accessor = new StandardAccessor(createStandard(withoutWaste));
    const candidate = generator.generate(fullInput, accessor);

    expect(candidate.status).toBe('DISQUALIFIED');
    const rej = candidate.rejections.find((r) => r.ruleId === 'MISSING_STANDARD_PARAMETER');
    expect(rej).toBeDefined();
    expect(rej?.provenance?.referenceKey).toBe('room.min_width.oil_waste_storage');
  });

  // -------------------------------------------------------------------------
  // 3. Immutability and Determinism
  // -------------------------------------------------------------------------
  it('7. maintains 100% determinism and immutability across repeated invocations', () => {
    const accessor = new StandardAccessor(createStandard());
    const c1 = generator.generate(fullInput, accessor);
    const c2 = generator.generate(fullInput, accessor);

    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    expect(Object.isFrozen(c1)).toBe(true);
    expect(Object.isFrozen(c1.objects)).toBe(true);
  });
});
