// ---------------------------------------------------------------------------
// FASE 4.2C — Scoring Geometry Data Foundation Tests
//
// Tests verify:
//   1. GAP-001: StrategyCandidate carries spatialContext with arrangement, circulationRequirement, and provenance
//   2. GAP-001: toStrategyCandidate() preserves spatialContext and provenance faithfully
//   3. GAP-001: All strategy generators populate spatialContext with correct metadata
//   4. GAP-002: StandardAccessor.getVehicleWidth() retrieves exact standard value without fallback
//   5. GAP-002: StandardAccessor.getVehicleWidth() throws MissingStandardParameterError when absent
//   6. GAP-003: CandidateGenerator deterministically computes buildingInterior (gross, interior dimensions & area)
//   7. GAP-003: buildingInterior respects building.wall_thickness from standard accessor with provenance
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '@/domain/engine/generator/candidateGenerator';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import { toStrategyCandidate } from '@/domain/engine/orchestrator/orchestratorTypes';
import { BalancedStrategyGenerator } from '@/domain/engine/strategies/balancedStrategy';
import { CapacityStrategyGenerator } from '@/domain/engine/strategies/capacityStrategy';
import { PremiumFlowStrategyGenerator } from '@/domain/engine/strategies/premiumFlowStrategy';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { createStrategyContext } from '@/domain/engine/strategies/strategyTypes';
import { roundMillimeter } from '@/domain/geometry/precision';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutEngineInput } from '@/domain/engine/types';

const completeStandard: WorkshopStandard = {
  id: 'std-fase-4-2c',
  name: 'FASE 4.2C Standard',
  version: '2026.09-fase4.2c',
  status: 'published',
  parameters: [
    { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.safety_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },

    // Vehicle width standard parameters (GAP-002)
    { key: 'vehicle.motorcycle.width', value: 0.9, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.city_car.width', value: 1.6, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.sedan.width', value: 1.8, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.mpv.width', value: 1.85, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.suv.width', value: 1.95, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.pickup_truck.width', value: 1.9, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.van.width', value: 2.0, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.light_truck.width', value: 2.2, unit: 'meter', constraint_level: 'SOFT' },

    // Ancillary room standards
    { key: 'room.min_area.customer_lounge', value: 12.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.cashier_office', value: 6.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.parts_warehouse', value: 15.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.restroom', value: 3.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.compressor_room', value: 4.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.oil_waste_storage', value: 4.0, unit: 'm2', constraint_level: 'SOFT' },
    { key: 'room.min_area.staff_room', value: 8.0, unit: 'm2', constraint_level: 'SOFT' },

    // Parking standards
    { key: 'parking.stall.width', value: 2.5, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'parking.stall.length', value: 5.0, unit: 'meter', constraint_level: 'SOFT' },

    // Equipment standards
    { key: 'equipment.2_post_lift.width', value: 3.2, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.2_post_lift.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },

    // Scoring benchmark parameters
    { key: 'scoring.capacity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity.benchmark_min', value: 0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity.benchmark_target', value: 6, unit: 'bays', constraint_level: 'OPTIMIZATION' },
  ],
  rules: [
    { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
    { id: 'BOUNDARY-001', name: 'Building Boundary', severity: 'HARD', active: true },
  ],
};

const sampleInput: LayoutEngineInput = {
  site: { width: 25, length: 35 },
  building: { width: 20, length: 30, frontSetbackMeters: 2 },
  program: {
    bays: [
      { serviceType: 'general_service', quantity: 3 },
      { serviceType: 'brake_suspension', quantity: 1 },
    ],
    equipment: [{ equipmentType: '2_post_lift', quantity: 2 }],
    vehicleClassKey: 'vehicle.mpv',
    circulationRequirement: 'back_out_turnaround',
    customerZoneRequired: true,
    futureExpansionBays: 0,
  },
  accessPoints: [
    { id: 'door-south', type: 'bidirectional', wall: 'south', offsetMeters: 5, widthMeters: 4 },
  ],
};

describe('FASE 4.2C — Scoring Geometry Data Foundation', () => {

  // -------------------------------------------------------------------------
  // GAP-001: Arrangement & Circulation Propagation
  // -------------------------------------------------------------------------
  describe('GAP-001 — Arrangement & Circulation Data Propagation', () => {

    it('[GAP-001-01] CandidateGenerator sets spatialContext on base StrategyCandidate', () => {
      const accessor = new StandardAccessor(completeStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      expect(generated.arrangement).toBeDefined();
      expect(generated.circulationRequirement).toBe('back_out_turnaround');
      expect(generated.provenance.arrangement).toBe(generated.arrangement);
    });

    it('[GAP-001-02] toStrategyCandidate() faithfully propagates spatialContext with provenance', () => {
      const accessor = new StandardAccessor(completeStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      const strategyCandidate = toStrategyCandidate(generated);

      expect(strategyCandidate.spatialContext).toBeDefined();
      expect(strategyCandidate.spatialContext.arrangement).toBe(generated.arrangement);
      expect(strategyCandidate.spatialContext.circulationRequirement).toBe('back_out_turnaround');
      expect(strategyCandidate.spatialContext.provenance.source).toBe('generator');
      expect(strategyCandidate.spatialContext.provenance.generatorName).toBe('CandidateGenerator');
      expect(strategyCandidate.spatialContext.provenance.inputProgramField).toBe('circulationRequirement');
    });

    it('[GAP-001-03] BalancedStrategyGenerator populates valid spatialContext', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);
      const generator = new BalancedStrategyGenerator();

      const result = generator.generate(context);
      expect(result.success).toBe(true);
      expect(result.candidate).not.toBeNull();
      expect(result.candidate!.spatialContext).toBeDefined();
      expect(result.candidate!.spatialContext.arrangement).toBe('ZONED_BY_SERVICE');
      expect(result.candidate!.spatialContext.circulationRequirement).toBe('back_out_turnaround');
    });

    it('[GAP-001-04] CapacityStrategyGenerator populates valid spatialContext', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);
      const generator = new CapacityStrategyGenerator();

      const result = generator.generate(context);
      expect(result.success).toBe(true);
      expect(result.candidate).not.toBeNull();
      expect(result.candidate!.spatialContext).toBeDefined();
      expect(result.candidate!.spatialContext.arrangement).toBe('SINGLE_COMB_NORTH');
      expect(result.candidate!.spatialContext.circulationRequirement).toBe('back_out_turnaround');
    });

    it('[GAP-001-05] PremiumFlowStrategyGenerator populates valid spatialContext', () => {
      const inputWithDoors: LayoutEngineInput = {
        ...sampleInput,
        program: {
          ...sampleInput.program,
          circulationRequirement: 'drive_through',
        },
        accessPoints: [
          { id: 'door-in', type: 'entrance', wall: 'south', offsetMeters: 2, widthMeters: 4 },
          { id: 'door-out', type: 'exit', wall: 'north', offsetMeters: 2, widthMeters: 4 },
        ],
      };

      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(inputWithDoors, accessor);
      const context = createStrategyContext(inputWithDoors, topology, accessor);
      const generator = new PremiumFlowStrategyGenerator();

      const result = generator.generate(context);
      expect(result.success).toBe(true);
      expect(result.candidate).not.toBeNull();
      expect(result.candidate!.spatialContext).toBeDefined();
      expect(result.candidate!.spatialContext.arrangement).toBe('SINGLE_COMB_NORTH');
      expect(result.candidate!.spatialContext.circulationRequirement).toBe('drive_through');
    });
  });

  // -------------------------------------------------------------------------
  // GAP-002: Vehicle Width Standard Accessor
  // -------------------------------------------------------------------------
  describe('GAP-002 — Vehicle Width Standard Accessor (Zero Fallback)', () => {

    it('[GAP-002-01] getVehicleWidth() retrieves correct width for vehicle class key', () => {
      const accessor = new StandardAccessor(completeStandard);

      expect(accessor.getVehicleWidth('vehicle.motorcycle')).toBe(0.9);
      expect(accessor.getVehicleWidth('vehicle.city_car')).toBe(1.6);
      expect(accessor.getVehicleWidth('vehicle.sedan')).toBe(1.8);
      expect(accessor.getVehicleWidth('vehicle.mpv')).toBe(1.85);
      expect(accessor.getVehicleWidth('vehicle.suv')).toBe(1.95);
      expect(accessor.getVehicleWidth('vehicle.pickup_truck')).toBe(1.9);
      expect(accessor.getVehicleWidth('vehicle.van')).toBe(2.0);
      expect(accessor.getVehicleWidth('vehicle.light_truck')).toBe(2.2);
    });

    it('[GAP-002-02] getVehicleWidth() handles both with and without .width suffix', () => {
      const accessor = new StandardAccessor(completeStandard);

      expect(accessor.getVehicleWidth('vehicle.mpv')).toBe(1.85);
      expect(accessor.getVehicleWidth('vehicle.mpv.width')).toBe(1.85);
    });

    it('[GAP-002-03] getVehicleWidth() throws MissingStandardParameterError when parameter is missing', () => {
      const incompleteStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.filter((p) => p.key !== 'vehicle.mpv.width'),
      };
      const accessor = new StandardAccessor(incompleteStandard);

      expect(() => accessor.getVehicleWidth('vehicle.mpv')).toThrow(MissingStandardParameterError);
      expect(() => accessor.getVehicleWidth('vehicle.mpv')).toThrow(/vehicle\.mpv\.width/);
    });

    it('[GAP-002-04] getVehicleWidth() throws for unknown vehicle category without hardcoded fallback', () => {
      const accessor = new StandardAccessor(completeStandard);

      expect(() => accessor.getVehicleWidth('vehicle.heavy_truck')).toThrow(MissingStandardParameterError);
      expect(() => accessor.getVehicleWidth('vehicle.airplane')).toThrow(MissingStandardParameterError);
    });
  });

  // -------------------------------------------------------------------------
  // GAP-003: Building Interior Area Calculation
  // -------------------------------------------------------------------------
  describe('GAP-003 — Building Interior Area Calculation & Provenance', () => {

    it('[GAP-003-01] CandidateGenerator computes buildingInterior deterministically in metadata', () => {
      const accessor = new StandardAccessor(completeStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      const interior = generated.metadata.buildingInterior;
      expect(interior).toBeDefined();

      const expectedWallThickness = 0.25;
      const expectedGrossWidth = 20;
      const expectedGrossLength = 30;
      const expectedGrossArea = roundMillimeter(20 * 30); // 600 m²
      const expectedInteriorWidth = roundMillimeter(20 - 2 * expectedWallThickness); // 19.5 m
      const expectedInteriorLength = roundMillimeter(30 - 2 * expectedWallThickness); // 29.5 m
      const expectedInteriorArea = roundMillimeter(expectedInteriorWidth * expectedInteriorLength); // 575.25 m²

      expect(interior.grossWidth).toBe(expectedGrossWidth);
      expect(interior.grossLength).toBe(expectedGrossLength);
      expect(interior.grossArea).toBe(expectedGrossArea);
      expect(interior.wallThickness).toBe(expectedWallThickness);
      expect(interior.interiorWidth).toBe(expectedInteriorWidth);
      expect(interior.interiorLength).toBe(expectedInteriorLength);
      expect(interior.interiorArea).toBe(expectedInteriorArea);
    });

    it('[GAP-003-02] buildingInterior includes complete mathematical provenance', () => {
      const accessor = new StandardAccessor(completeStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      const interior = generated.metadata.buildingInterior;
      expect(interior.provenance).toBeDefined();
      expect(interior.provenance.source).toBe('building_envelope');
      expect(interior.provenance.wallThicknessParameterKey).toBe('building.wall_thickness');
      expect(interior.provenance.formula).toBe('(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)');
    });

    it('[GAP-003-03] toStrategyCandidate() preserves buildingInterior in spatialContext', () => {
      const accessor = new StandardAccessor(completeStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      const strategyCandidate = toStrategyCandidate(generated);
      const interior = strategyCandidate.spatialContext.buildingInterior;

      expect(interior).toBeDefined();
      expect(interior!.interiorArea).toBe(generated.metadata.buildingInterior.interiorArea);
      expect(interior!.interiorWidth).toBe(generated.metadata.buildingInterior.interiorWidth);
      expect(interior!.interiorLength).toBe(generated.metadata.buildingInterior.interiorLength);
      expect(interior!.wallThickness).toBe(0.25);
    });

    it('[GAP-003-04] buildingInterior dynamically adapts when wall_thickness standard changes', () => {
      const customWallStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.map((p) =>
          p.key === 'building.wall_thickness' ? { ...p, value: 0.5 } : p
        ),
      };
      const accessor = new StandardAccessor(customWallStandard);
      const generator = new CandidateGenerator();
      const generated = generator.generate(sampleInput, accessor);

      const interior = generated.metadata.buildingInterior;
      expect(interior.wallThickness).toBe(0.5);
      expect(interior.interiorWidth).toBe(roundMillimeter(20 - 2 * 0.5)); // 19.0 m
      expect(interior.interiorLength).toBe(roundMillimeter(30 - 2 * 0.5)); // 29.0 m
      expect(interior.interiorArea).toBe(roundMillimeter(19.0 * 29.0)); // 551.0 m²
    });
  });
});
