import { describe, it, expect } from 'vitest';
import { RequirementMapper } from '@/application/requirements/requirementMapper';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

describe('FASE 3.8 — LayoutEngineInput Gap Closure & Semantic Contract Tests', () => {
  const completeStandard: WorkshopStandard = {
    id: 'std-complete',
    name: 'Complete Standard',
    version: '1.0',
    status: 'published',
    parameters: [
      { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD', source_type: 'regulatory' },
      { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD', source_type: 'regulatory' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD', source_type: 'regulatory' },
      { key: 'vehicle.mpv.length', value: 4.7, unit: 'meter', constraint_level: 'SOFT', source_type: 'manufacturer' },
      { key: 'vehicle.mpv.width', value: 1.8, unit: 'meter', constraint_level: 'SOFT', source_type: 'manufacturer' },
    ],
    rules: [],
    scoring: [],
  };

  const comprehensiveRequirement: WorkshopLayoutRequirement = {
    projectName: 'Bengkel Modern Mobeng Full Spec',
    workshopType: 'car_service',
    vehicleCategory: 'mpv',
    priority: 'BALANCED_EFFICIENCY',
    site: {
      widthMeters: 20,
      lengthMeters: 30,
      roadOrientation: 'south',
    },
    building: {
      widthMeters: 18,
      lengthMeters: 25,
      frontSetbackMeters: 4.5,
    },
    access: {
      entryPosition: 'front_center',
      exitPosition: 'rear_center',
      pedestrianEntryPosition: 'front_left',
      preferDriveThrough: true,
    },
    services: [
      { serviceType: 'general_service', bayCount: 6, requiredLifts: ['2_post_lift'] },
      { serviceType: 'brake_suspension', bayCount: 2, requiredLifts: ['2_post_lift'] },
      { serviceType: 'tire_service', bayCount: 1, requiredLifts: ['scissor_lift'] },
      { serviceType: 'wheel_alignment', bayCount: 1, requiredLifts: ['scissor_lift'] },
    ],
    equipmentPreferences: ['tire_changer', 'wheel_balancer', 'compressor'],
    ancillarySpaces: {
      customerLounge: true,
      cashierOffice: true,
      partsWarehouse: true,
      restroom: true,
      compressorRoom: true,
      oilWasteStorage: true,
      staffRoom: true,
      loungeWithBayView: true,
    },
    parking: {
      customerParkingSpaces: 5,
      staffParkingSpaces: 3,
      vehicleStagingSpaces: 2,
    },
    futureExpansionBays: 2,
    rawUserPrompt: 'Full spec workshop prompt',
  };

  const mapper = new RequirementMapper();
  const accessor = new StandardAccessor(completeStandard);

  // -------------------------------------------------------------------------
  // 1. Full Requirement → All Ancillary Spaces Mapped
  // -------------------------------------------------------------------------
  it('1. maps all 8 ancillary space requirements into LayoutEngineInput.program.ancillarySpaces', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    expect(result.success).toBe(true);
    expect(result.engineInput).not.toBeNull();

    const anc = result.engineInput!.program.ancillarySpaces;
    expect(anc).toBeDefined();
    expect(anc?.customerLounge).toBe(true);
    expect(anc?.cashierOffice).toBe(true);
    expect(anc?.partsWarehouse).toBe(true);
    expect(anc?.restroom).toBe(true);
    expect(anc?.compressorRoom).toBe(true);
    expect(anc?.oilWasteStorage).toBe(true);
    expect(anc?.staffRoom).toBe(true);
    expect(anc?.loungeWithBayView).toBe(true);

    // customerZoneRequired boolean flag remains true for backward compatibility
    expect(result.engineInput!.program.customerZoneRequired).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Parking → Slot Counts Mapped
  // -------------------------------------------------------------------------
  it('2. maps customer, staff, and staging parking counts into LayoutEngineInput.site.parking', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    const parking = result.engineInput!.site.parking;

    expect(parking).toBeDefined();
    expect(parking?.customerParkingSpaces).toBe(5);
    expect(parking?.staffParkingSpaces).toBe(3);
    expect(parking?.vehicleStagingSpaces).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 3. Front Setback → Mapped
  // -------------------------------------------------------------------------
  it('3. maps front setback distance into LayoutEngineInput.building.frontSetbackMeters', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    expect(result.engineInput!.building.frontSetbackMeters).toBe(4.5);
  });

  // -------------------------------------------------------------------------
  // 4. Unsupported / Gap Tracking
  // -------------------------------------------------------------------------
  it('4. reports zero gaps when all requirement fields are fully supported by engine contract', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    expect(result.engineInputGaps).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. No Hardcoded Room Dimensions
  // -------------------------------------------------------------------------
  it('5. preserves semantic room requirements without hardcoding room x/y/width/length in LayoutEngineInput', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    const anc = result.engineInput!.program.ancillarySpaces as any;

    expect(typeof anc.customerLounge).toBe('boolean');
    expect(typeof anc.cashierOffice).toBe('boolean');
    expect(typeof anc.partsWarehouse).toBe('boolean');
    expect(typeof anc.restroom).toBe('boolean');

    // Verify no coordinates or geometry dimensions leaked into ancillarySpaces contract
    expect(anc.x).toBeUndefined();
    expect(anc.y).toBeUndefined();
    expect(anc.width).toBeUndefined();
    expect(anc.length).toBeUndefined();
    expect(anc.coordinates).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 6. No Hardcoded Parking Dimensions
  // -------------------------------------------------------------------------
  it('6. preserves parking requirements as numeric slot counts without hardcoded geometry polygons or stall sizes', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    const parking = result.engineInput!.site.parking as any;

    expect(typeof parking.customerParkingSpaces).toBe('number');
    expect(typeof parking.staffParkingSpaces).toBe('number');
    expect(typeof parking.vehicleStagingSpaces).toBe('number');

    // Verify no coordinates or CAD polygon vertices leaked into parking contract
    expect(parking.x).toBeUndefined();
    expect(parking.y).toBeUndefined();
    expect(parking.stallWidth).toBeUndefined();
    expect(parking.stallLength).toBeUndefined();
    expect(parking.vertices).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 7. Missing Standard Parameter → MissingStandardParameterError
  // -------------------------------------------------------------------------
  it('7. throws MissingStandardParameterError if required engineering parameters are absent from snapshot', () => {
    const brokenStandard: WorkshopStandard = {
      id: 'std-broken',
      name: 'Broken Standard',
      version: '1.0',
      status: 'published',
      parameters: [], // Missing 'door.vehicle.width'!
      rules: [],
      scoring: [],
    };
    const brokenAccessor = new StandardAccessor(brokenStandard);

    expect(() => mapper.map(comprehensiveRequirement, brokenAccessor)).toThrow(
      MissingStandardParameterError
    );
  });

  // -------------------------------------------------------------------------
  // 8. Deterministic Output
  // -------------------------------------------------------------------------
  it('8. produces identical, deterministic LayoutEngineInput across multiple invocations', () => {
    const run1 = mapper.map(comprehensiveRequirement, accessor);
    const run2 = mapper.map(comprehensiveRequirement, accessor);

    expect(JSON.stringify(run1.engineInput)).toBe(JSON.stringify(run2.engineInput));
  });

  // -------------------------------------------------------------------------
  // 9. Immutable Output
  // -------------------------------------------------------------------------
  it('9. produces deeply frozen, immutable LayoutEngineInput structures', () => {
    const result = mapper.map(comprehensiveRequirement, accessor);
    const input = result.engineInput!;

    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.program.ancillarySpaces)).toBe(true);
    if (input.site.parking) {
      expect(Object.isFrozen(input.site.parking)).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 10. Vehicle Category Mapping Integrity
  // -------------------------------------------------------------------------
  it('10. maps known vehicle categories to internal vehicle class keys without loss', () => {
    const categories: Array<WorkshopLayoutRequirement['vehicleCategory']> = [
      'motorcycle',
      'city_car',
      'sedan',
      'mpv',
      'suv',
      'pickup_truck',
      'van',
      'light_truck',
    ];

    for (const cat of categories) {
      const req: WorkshopLayoutRequirement = {
        ...comprehensiveRequirement,
        vehicleCategory: cat,
      };
      const res = mapper.map(req, accessor);
      expect(res.engineInput!.program.vehicleClassKey).toBe(`vehicle.${cat}`);
    }
  });
});
