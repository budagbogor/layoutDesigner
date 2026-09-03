import { describe, it, expect } from 'vitest';
import {
  RequirementMapper,
  RequirementMappingResult,
} from '@/application/requirements/requirementMapper';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

// ---------------------------------------------------------------------------
// Standard Fixture (with door.vehicle.width parameter)
// ---------------------------------------------------------------------------

const completeStandard: WorkshopStandard = {
  id: 'mobeng-std-mapper-test',
  name: 'Mobeng Mapper Standard Test',
  version: '1.0-map',
  status: 'published',
  parameters: [
    { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },
  ],
  rules: [
    { id: 'BOUNDARY-001', name: 'Boundary Containment', severity: 'HARD', active: true },
  ],
};

// ---------------------------------------------------------------------------
// Requirement Fixtures
// ---------------------------------------------------------------------------

const minimalRequirement: WorkshopLayoutRequirement = {
  projectName: 'Bengkel Mobeng Cibinong',
  workshopType: 'car_service',
  vehicleCategory: 'mpv',
  priority: 'BALANCED_EFFICIENCY',
  site: { widthMeters: 15, lengthMeters: 25 },
  building: { widthMeters: 12, lengthMeters: 20 },
  access: { entryPosition: 'front_center' },
  services: [{ serviceType: 'general_service', bayCount: 3 }],
  ancillarySpaces: {
    customerLounge: false,
    cashierOffice: false,
    partsWarehouse: false,
    restroom: false,
  },
};

const fullRequirement: WorkshopLayoutRequirement = {
  projectName: 'Mobeng Premium Serpong',
  workshopType: 'car_service',
  vehicleCategory: 'suv',
  priority: 'PREMIUM_EXPERIENCE',
  site: {
    widthMeters: 20,
    lengthMeters: 35,
    roadOrientation: 'south',
  },
  building: {
    widthMeters: 16,
    lengthMeters: 28,
    frontSetbackMeters: 5,
  },
  access: {
    entryPosition: 'front_left',
    exitPosition: 'rear_center',
    pedestrianEntryPosition: 'front_right',
    preferDriveThrough: true,
  },
  services: [
    { serviceType: 'general_service', bayCount: 4, requiredLifts: ['2_post_lift'] },
    { serviceType: 'quick_lube', bayCount: 2 },
    { serviceType: 'tire_service', bayCount: 1, requiredLifts: ['scissor_lift'] },
  ],
  equipmentPreferences: ['tire_changer', 'wheel_balancer'],
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
    customerParkingSpaces: 6,
    staffParkingSpaces: 3,
    vehicleStagingSpaces: 4,
  },
  futureExpansionBays: 2,
  rawUserPrompt: 'Premium bengkel drive through',
  specialInstructions: ['Toilet jauh dari customer entrance'],
};

describe('FASE 3.4 — RequirementMapper', () => {
  const mapper = new RequirementMapper();

  // -------------------------------------------------------------------------
  // 1. Minimal Requirement Mapping
  // -------------------------------------------------------------------------

  describe('1. Minimal Requirement Mapping', () => {
    it('maps a minimal requirement to a valid LayoutEngineInput', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(minimalRequirement, accessor);

      expect(result.success).toBe(true);
      expect(result.engineInput).not.toBeNull();

      const input = result.engineInput!;
      expect(input.site.width).toBe(15);
      expect(input.site.length).toBe(25);
      expect(input.building.width).toBe(12);
      expect(input.building.length).toBe(20);
      expect(input.program.bays).toHaveLength(1);
      expect(input.program.bays[0].serviceType).toBe('general_service');
      expect(input.program.bays[0].quantity).toBe(3);
      expect(input.program.vehicleClassKey).toBe('vehicle.mpv');
      expect(input.program.customerZoneRequired).toBe(false);
      expect(input.program.futureExpansionBays).toBe(0);
    });

    it('creates a single entrance access point for minimal requirement', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(minimalRequirement, accessor);
      const input = result.engineInput!;

      expect(input.accessPoints).toHaveLength(1);
      expect(input.accessPoints![0].type).toBe('entrance');
      expect(input.accessPoints![0].widthMeters).toBe(3.5); // from standard
    });
  });

  // -------------------------------------------------------------------------
  // 2. Full Requirement Mapping
  // -------------------------------------------------------------------------

  describe('2. Full Requirement Mapping', () => {
    it('maps a fully populated requirement preserving all mappable fields', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);

      expect(result.success).toBe(true);
      const input = result.engineInput!;

      // Site
      expect(input.site.width).toBe(20);
      expect(input.site.length).toBe(35);
      expect(input.site.roadSide).toBe('south');

      // Building
      expect(input.building.width).toBe(16);
      expect(input.building.length).toBe(28);

      // Vehicle class
      expect(input.program.vehicleClassKey).toBe('vehicle.suv');

      // Future expansion
      expect(input.program.futureExpansionBays).toBe(2);

      // Customer zone
      expect(input.program.customerZoneRequired).toBe(true);
    });

    it('creates entrance, exit, and pedestrian access points', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);
      const input = result.engineInput!;

      expect(input.accessPoints).toHaveLength(3);

      const entrance = input.accessPoints!.find((ap) => ap.type === 'entrance');
      const exit = input.accessPoints!.find((ap) => ap.type === 'exit');
      const pedestrian = input.accessPoints!.find((ap) => ap.type === 'pedestrian');

      expect(entrance).toBeDefined();
      expect(exit).toBeDefined();
      expect(pedestrian).toBeDefined();

      // Vehicle doors use door.vehicle.width from standard
      expect(entrance!.widthMeters).toBe(3.5);
      expect(exit!.widthMeters).toBe(3.5);
      // Pedestrian door uses door.pedestrian.width from standard
      expect(pedestrian!.widthMeters).toBe(1.2);
    });

    it('maps all ancillary spaces, parking, and front setback directly into LayoutEngineInput without data loss', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);

      expect(result.engineInput).not.toBeNull();
      const input = result.engineInput!;

      // 1. Ancillary spaces mapping
      expect(input.program.ancillarySpaces).toBeDefined();
      expect(input.program.ancillarySpaces?.customerLounge).toBe(true);
      expect(input.program.ancillarySpaces?.cashierOffice).toBe(true);
      expect(input.program.ancillarySpaces?.partsWarehouse).toBe(true);
      expect(input.program.ancillarySpaces?.restroom).toBe(true);
      expect(input.program.ancillarySpaces?.compressorRoom).toBe(true);
      expect(input.program.ancillarySpaces?.oilWasteStorage).toBe(true);
      expect(input.program.ancillarySpaces?.staffRoom).toBe(true);
      expect(input.program.ancillarySpaces?.loungeWithBayView).toBe(true);

      // 2. Parking slots mapping
      expect(input.site.parking).toBeDefined();
      expect(input.site.parking?.customerParkingSpaces).toBe(6);
      expect(input.site.parking?.staffParkingSpaces).toBe(3);
      expect(input.site.parking?.vehicleStagingSpaces).toBe(4);

      // 3. Front setback mapping
      expect(input.building.frontSetbackMeters).toBe(5);

      // 4. No gaps reported since all these fields are now fully supported
      expect(result.engineInputGaps).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Service → Bays Mapping
  // -------------------------------------------------------------------------

  describe('3. Service → Bays Mapping', () => {
    it('maps multiple service program items to ProgramBayRequirement[]', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);
      const bays = result.engineInput!.program.bays;

      expect(bays).toHaveLength(3);
      expect(bays[0]).toEqual({ serviceType: 'general_service', quantity: 4, requiredEquipment: ['2_post_lift'] });
      expect(bays[1]).toEqual({ serviceType: 'quick_lube', quantity: 2, requiredEquipment: undefined });
      expect(bays[2]).toEqual({ serviceType: 'tire_service', quantity: 1, requiredEquipment: ['scissor_lift'] });
    });

    it('maps equipment preferences and lift requirements to equipment list', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);
      const equipment = result.engineInput!.program.equipment;

      // 2_post_lift: 4 (from general_service x4), scissor_lift: 1 (from tire_service x1)
      // + tire_changer: 1 (preference), wheel_balancer: 1 (preference)
      const liftEquip = equipment.find((e) => e.equipmentType === '2_post_lift');
      expect(liftEquip).toBeDefined();
      expect(liftEquip!.quantity).toBe(4);

      const scissor = equipment.find((e) => e.equipmentType === 'scissor_lift');
      expect(scissor).toBeDefined();
      expect(scissor!.quantity).toBe(1);

      const changer = equipment.find((e) => e.equipmentType === 'tire_changer');
      expect(changer).toBeDefined();
      expect(changer!.quantity).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Vehicle Category Mapping
  // -------------------------------------------------------------------------

  describe('4. Vehicle Category Mapping', () => {
    const categories = [
      { input: 'motorcycle', expected: 'vehicle.motorcycle' },
      { input: 'city_car', expected: 'vehicle.city_car' },
      { input: 'sedan', expected: 'vehicle.sedan' },
      { input: 'mpv', expected: 'vehicle.mpv' },
      { input: 'suv', expected: 'vehicle.suv' },
      { input: 'pickup_truck', expected: 'vehicle.pickup_truck' },
      { input: 'van', expected: 'vehicle.van' },
      { input: 'light_truck', expected: 'vehicle.light_truck' },
    ] as const;

    for (const { input, expected } of categories) {
      it(`maps "${input}" → "${expected}"`, () => {
        const accessor = new StandardAccessor(completeStandard);
        const req: WorkshopLayoutRequirement = {
          ...minimalRequirement,
          vehicleCategory: input,
        };
        const result = mapper.map(req, accessor);
        expect(result.engineInput!.program.vehicleClassKey).toBe(expected);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 5. Semantic Access → Engine Access Point
  // -------------------------------------------------------------------------

  describe('5. Semantic Access Position → Engine Access Point', () => {
    it('maps front_center to correct wall and centered offset', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(minimalRequirement, accessor);
      const ap = result.engineInput!.accessPoints![0];

      // Default road is south, so front = south wall
      expect(ap.wall).toBe('south');
      expect(ap.type).toBe('entrance');
      expect(ap.offsetMeters).toBeGreaterThan(0);
      expect(ap.widthMeters).toBe(3.5);
    });

    it('respects roadOrientation when resolving wall', () => {
      const accessor = new StandardAccessor(completeStandard);
      const req: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        site: { widthMeters: 15, lengthMeters: 25, roadOrientation: 'east' },
        access: { entryPosition: 'front_center' },
      };
      const result = mapper.map(req, accessor);
      // "front" = road side = east
      expect(result.engineInput!.accessPoints![0].wall).toBe('east');
    });

    it('maps rear_center exit to opposite wall', () => {
      const accessor = new StandardAccessor(completeStandard);
      const req: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        site: { widthMeters: 15, lengthMeters: 25, roadOrientation: 'south' },
        access: { entryPosition: 'front_center', exitPosition: 'rear_center' },
      };
      const result = mapper.map(req, accessor);
      const exit = result.engineInput!.accessPoints!.find((ap) => ap.type === 'exit');
      expect(exit!.wall).toBe('north'); // opposite of south
    });
  });

  // -------------------------------------------------------------------------
  // 6. Priority → Strategies
  // -------------------------------------------------------------------------

  describe('6. Priority → Strategy Ordering', () => {
    it('maps MAXIMIZE_CAPACITY with CAPACITY as first strategy', () => {
      const accessor = new StandardAccessor(completeStandard);
      const req: WorkshopLayoutRequirement = { ...minimalRequirement, priority: 'MAXIMIZE_CAPACITY' };
      const result = mapper.map(req, accessor);
      expect(result.engineInput!.strategies![0]).toBe('CAPACITY');
    });

    it('maps BALANCED_EFFICIENCY with BALANCED as first strategy', () => {
      const accessor = new StandardAccessor(completeStandard);
      const req: WorkshopLayoutRequirement = { ...minimalRequirement, priority: 'BALANCED_EFFICIENCY' };
      const result = mapper.map(req, accessor);
      expect(result.engineInput!.strategies![0]).toBe('BALANCED');
    });

    it('maps PREMIUM_EXPERIENCE with PREMIUM_FLOW as first strategy', () => {
      const accessor = new StandardAccessor(completeStandard);
      const req: WorkshopLayoutRequirement = { ...minimalRequirement, priority: 'PREMIUM_EXPERIENCE' };
      const result = mapper.map(req, accessor);
      expect(result.engineInput!.strategies![0]).toBe('PREMIUM_FLOW');
    });

    it('always includes all three strategies in different order', () => {
      const accessor = new StandardAccessor(completeStandard);
      for (const priority of ['MAXIMIZE_CAPACITY', 'BALANCED_EFFICIENCY', 'PREMIUM_EXPERIENCE'] as const) {
        const req: WorkshopLayoutRequirement = { ...minimalRequirement, priority };
        const result = mapper.map(req, accessor);
        expect(result.engineInput!.strategies).toHaveLength(3);
        expect(new Set(result.engineInput!.strategies)).toEqual(new Set(['CAPACITY', 'BALANCED', 'PREMIUM_FLOW']));
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Missing Standard Parameter → Error
  // -------------------------------------------------------------------------

  describe('7. Missing Standard Parameter → Error', () => {
    it('throws MissingStandardParameterError when door.vehicle.width is absent', () => {
      const noDoorStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.filter((p) => p.key !== 'door.vehicle.width'),
      };
      const accessor = new StandardAccessor(noDoorStandard);

      expect(() => mapper.map(minimalRequirement, accessor)).toThrow(MissingStandardParameterError);
    });
  });

  // -------------------------------------------------------------------------
  // 8. No Engineering Fallback
  // -------------------------------------------------------------------------

  describe('8. No Engineering Fallback', () => {
    it('door width comes from standard, not hardcoded', () => {
      // Create a standard with a different door width
      const customStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.map((p) =>
          p.key === 'door.vehicle.width' ? { ...p, value: 4.2 } : p
        ),
      };
      const accessor = new StandardAccessor(customStandard);
      const result = mapper.map(minimalRequirement, accessor);

      expect(result.engineInput!.accessPoints![0].widthMeters).toBe(4.2);
    });

    it('pedestrian door width comes from standard parameter', () => {
      const customStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.map((p) =>
          p.key === 'door.pedestrian.width' ? { ...p, value: 1.5 } : p
        ),
      };
      const accessor = new StandardAccessor(customStandard);
      const result = mapper.map(fullRequirement, accessor);
      const pedAP = result.engineInput!.accessPoints!.find((ap) => ap.type === 'pedestrian');

      expect(pedAP!.widthMeters).toBe(1.5);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Determinism
  // -------------------------------------------------------------------------

  describe('9. Deterministic Mapping', () => {
    it('produces identical output for identical inputs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result1 = mapper.map(fullRequirement, accessor);
      const result2 = mapper.map(fullRequirement, accessor);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // -------------------------------------------------------------------------
  // 10. Result Immutability
  // -------------------------------------------------------------------------

  describe('10. Result Immutability', () => {
    it('returns a frozen mapping result', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(minimalRequirement, accessor);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.engineInput)).toBe(true);
      expect(Object.isFrozen(result.engineInputGaps)).toBe(true);
      expect(Object.isFrozen(result.warnings)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Circulation Derivation
  // -------------------------------------------------------------------------

  describe('11. Circulation Requirement Derivation', () => {
    it('derives drive_through when entry and exit are on different walls', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(fullRequirement, accessor);
      expect(result.engineInput!.program.circulationRequirement).toBe('drive_through');
    });

    it('derives back_out_turnaround when only entry is specified', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = mapper.map(minimalRequirement, accessor);
      expect(result.engineInput!.program.circulationRequirement).toBe('back_out_turnaround');
    });
  });
});
