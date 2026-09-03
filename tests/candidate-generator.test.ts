import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '@/domain/engine/generator/candidateGenerator';
import { validateCandidateConstraints } from '@/domain/engine/generator/candidateValidator';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 4.0 — Deterministic Candidate Generator Foundation', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-cand-test',
    name: 'Candidate Generator Standard Test',
    version: '1.0-cand',
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
  // 1. Minimal Feasible Workshop Candidate
  // -------------------------------------------------------------------------
  describe('1. Minimal Feasible Workshop Candidate', () => {
    const minimalInput: LayoutEngineInput = {
      site: { width: 30, length: 40 },
      building: { width: 20, length: 25 },
      program: {
        bays: [{ serviceType: 'general_service', quantity: 2 }],
        equipment: [{ equipmentType: '2_post_lift', quantity: 2 }],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: false,
        futureExpansionBays: 0,
      },
    };

    it('generates a valid, deterministic candidate for minimal input', () => {
      const candidate = generator.generate(minimalInput, accessor);

      expect(candidate.status).toBe('VALID');
      expect(candidate.validation.isValid).toBe(true);
      expect(candidate.objects.filter((o) => o.type === 'service_bay')).toHaveLength(2);
      expect(candidate.envelopes.length).toBeGreaterThan(5);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Real-World Full Service Program (6 general + 2 suspension + 1 tire + 1 alignment)
  // -------------------------------------------------------------------------
  describe('2. Multi-Service Program Allocation', () => {
    // Note: 10 bays @ 4.0m width + 1.0m working clearance = 50.0m needed for single-line comb.
    // In a 55m x 30m building, all 10 bays fit cleanly in one primary line!
    const multiServiceInput: LayoutEngineInput = {
      site: {
        width: 60,
        length: 45,
        roadSide: 'south',
        parking: {
          customerParkingSpaces: 5,
          staffParkingSpaces: 2,
          vehicleStagingSpaces: 2,
        },
      },
      building: { width: 55, length: 30, frontSetbackMeters: 5 },
      accessPoints: [
        { id: 'ap-01', type: 'entrance', wall: 'south', offsetMeters: 10, widthMeters: 3.5 },
      ],
      program: {
        bays: [
          { serviceType: 'general_service', quantity: 6 },
          { serviceType: 'brake_suspension', quantity: 2 },
          { serviceType: 'tire_service', quantity: 1 },
          { serviceType: 'wheel_alignment', quantity: 1 },
        ],
        equipment: [
          { equipmentType: '2_post_lift', quantity: 6 },
          { equipmentType: 'scissor_lift', quantity: 2 },
        ],
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
          loungeWithBayView: true,
        },
        futureExpansionBays: 2,
      },
    };

    it('generates all 10 service bays with exact serviceTypes and valid envelopes', () => {
      const candidate = generator.generate(multiServiceInput, accessor);

      expect(candidate.metadata.totalBaysRequested).toBe(10);
      expect(candidate.metadata.totalBaysPlaced).toBe(10);

      // Verify specific counts per service type
      const serviceCounts = candidate.metadata.operationalBaysByService;
      expect(serviceCounts['general_service']).toBe(6);
      expect(serviceCounts['brake_suspension']).toBe(2);
      expect(serviceCounts['tire_service']).toBe(1);
      expect(serviceCounts['wheel_alignment']).toBe(1);

      // Verify future expansion is NOT counted in operational bay count
      expect(candidate.metadata.futureExpansionBaysReserved).toBe(2);
      expect(candidate.objects.filter((o) => o.type === 'service_bay')).toHaveLength(10);
    });

    it('allocates all ancillary spaces and site parking stalls without collisions', () => {
      const candidate = generator.generate(multiServiceInput, accessor);

      expect(candidate.metadata.ancillarySpacesPlaced).toContain('customerLounge');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('cashierOffice');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('partsWarehouse');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('restroom');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('compressorRoom');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('oilWasteStorage');
      expect(candidate.metadata.ancillarySpacesPlaced).toContain('staffRoom');

      expect(candidate.metadata.parkingCapacityAllocated.customer).toBe(5);
      expect(candidate.metadata.parkingCapacityAllocated.staff).toBe(2);
      expect(candidate.metadata.parkingCapacityAllocated.staging).toBe(2);

      // Full validation must pass
      expect(candidate.status).toBe('VALID');
      expect(candidate.validation.isValid).toBe(true);
      expect(candidate.rejections).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. HARD Constraint Violations & Structured Disqualification
  // -------------------------------------------------------------------------
  describe('3. HARD Constraint Violations & Rejections', () => {
    it('disqualifies candidate when building exceeds site boundary', () => {
      const invalidSiteInput: LayoutEngineInput = {
        site: { width: 15, length: 20 }, // Too small!
        building: { width: 18, length: 25 },
        program: {
          bays: [{ serviceType: 'general_service', quantity: 2 }],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(invalidSiteInput, accessor);
      expect(candidate.status).toBe('DISQUALIFIED');
      expect(candidate.validation.isValid).toBe(false);
      expect(candidate.rejections.some((r) => r.ruleId === 'BOUNDARY-SITE-001')).toBe(true);
    });

    it('disqualifies candidate when building with front setback exceeds site length', () => {
      const invalidSetbackInput: LayoutEngineInput = {
        site: { width: 30, length: 30 },
        building: { width: 20, length: 25, frontSetbackMeters: 8 }, // 8 + 25 = 33m > 30m!
        program: {
          bays: [{ serviceType: 'general_service', quantity: 1 }],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(invalidSetbackInput, accessor);
      expect(candidate.status).toBe('DISQUALIFIED');
      expect(candidate.rejections.some((r) => r.ruleId === 'SETBACK-002')).toBe(true);
    });

    it('disqualifies candidate when service bay demand exceeds building width capacity', () => {
      // 18m building width can fit ~3 bays (@ 4m width + 1m clearance = 5m per bay)
      // Requesting 8 bays in an 18m building must trigger CAPACITY-BAYS-001 rejection!
      const overloadInput: LayoutEngineInput = {
        site: { width: 25, length: 35 },
        building: { width: 18, length: 25 },
        program: {
          bays: [{ serviceType: 'general_service', quantity: 8 }],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(overloadInput, accessor);
      expect(candidate.status).toBe('DISQUALIFIED');
      expect(candidate.rejections.some((r) => r.ruleId === 'CAPACITY-BAYS-001')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Missing Standard Parameters (Strict Zero Fallback)
  // -------------------------------------------------------------------------
  describe('4. Missing Standard Parameter Handling', () => {
    it('throws MissingStandardParameterError when mandatory parameter is missing from snapshot', () => {
      const brokenStandard: WorkshopStandard = {
        id: 'std-broken',
        name: 'Broken Standard',
        version: '1.0',
        status: 'published',
        parameters: [], // Missing all parameters!
        rules: [],
        scoring: [],
      };
      const brokenAccessor = new StandardAccessor(brokenStandard);

      const input: LayoutEngineInput = {
        site: { width: 30, length: 40 },
        building: { width: 20, length: 25 },
        program: {
          bays: [{ serviceType: 'general_service', quantity: 1 }],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      expect(() => generator.generate(input, brokenAccessor)).toThrow(
        MissingStandardParameterError
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Determinism & Immutability
  // -------------------------------------------------------------------------
  describe('5. Determinism & Deep Immutability', () => {
    const input: LayoutEngineInput = {
      site: { width: 35, length: 45 },
      building: { width: 25, length: 30 },
      program: {
        bays: [{ serviceType: 'general_service', quantity: 3 }],
        equipment: [{ equipmentType: '2_post_lift', quantity: 3 }],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: true,
        futureExpansionBays: 1,
      },
    };

    it('produces identical output across multiple independent invocations', () => {
      const c1 = generator.generate(input, accessor);
      const c2 = generator.generate(input, accessor);

      expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    });

    it('returns deeply frozen, immutable candidate structures', () => {
      const candidate = generator.generate(input, accessor);

      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.objects)).toBe(true);
      expect(Object.isFrozen(candidate.envelopes)).toBe(true);
      expect(Object.isFrozen(candidate.validation)).toBe(true);
      expect(Object.isFrozen(candidate.metadata)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Demo Real-World Fixture Verification (20x30 site, 18x25 building)
  // -------------------------------------------------------------------------
  describe('6. Demo Real-World Fixture (20x30 Site, 18x25 Building)', () => {
    const userPromptDemoFixture: LayoutEngineInput = {
      site: { width: 20, length: 30, roadSide: 'south' },
      building: { width: 18, length: 25, frontSetbackMeters: 4 },
      accessPoints: [
        { id: 'ap-01', type: 'entrance', wall: 'south', offsetMeters: 9, widthMeters: 3.5 },
      ],
      program: {
        bays: [
          { serviceType: 'general_service', quantity: 6 },
          { serviceType: 'brake_suspension', quantity: 2 },
          { serviceType: 'tire_service', quantity: 1 },
          { serviceType: 'wheel_alignment', quantity: 1 },
        ],
        equipment: [
          { equipmentType: '2_post_lift', quantity: 6 },
          { equipmentType: 'scissor_lift', quantity: 2 },
        ],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'back_out_turnaround',
        customerZoneRequired: true,
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
        futureExpansionBays: 0,
      },
    };

    it('correctly assesses capacity feasibility for 10 bays in 18x25m building under standard dimensions', () => {
      const candidate = generator.generate(userPromptDemoFixture, accessor);

      // In an 18m building with 4.0m bays + 1.0m clearance (5.0m per bay):
      // An 18m width can fit exactly 3 bays in a single line.
      // Therefore, placing 10 bays in an 18m building without multi-row/L-shape layout
      // cleanly reports structured capacity disqualification without crashing!
      expect(candidate.candidateId).toBeDefined();
      expect(candidate.validation.hardViolations.length).toBeGreaterThan(0);
      expect(candidate.rejections.some((r) => r.ruleId === 'CAPACITY-BAYS-001')).toBe(true);
      expect(candidate.status).toBe('DISQUALIFIED');
    });
  });
});
