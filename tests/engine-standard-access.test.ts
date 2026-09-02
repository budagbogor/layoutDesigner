import { describe, it, expect } from 'vitest';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import { checkProgramFeasibility } from '@/domain/engine/feasibility/feasibilityChecker';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutEngineInput } from '@/domain/engine/types';

describe('Milestone 2.1 — Domain Contracts, Standard Access & Feasibility', () => {
  const mockStandard: WorkshopStandard = {
    id: 'mobeng-std-m21',
    name: 'Mobeng Workshop Standard Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      // Scoring parameters with directions & benchmarks
      { key: 'scoring.vehicle_flow.direction', value: 1, unit: 'direction', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.vehicle_flow.benchmark_min', value: 40, unit: 'points', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.vehicle_flow.benchmark_target', value: 100, unit: 'points', constraint_level: 'OPTIMIZATION' },
      // Minimize criterion (lower turnaround maneuvers is better)
      { key: 'scoring.maneuvers.direction', value: -1, unit: 'direction', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.maneuvers.benchmark_min', value: 4, unit: 'maneuvers', constraint_level: 'OPTIMIZATION' }, // worst (4 turns -> 0 pts)
      { key: 'scoring.maneuvers.benchmark_target', value: 1, unit: 'maneuvers', constraint_level: 'OPTIMIZATION' }, // best (1 turn -> 100 pts)
    ],
    rules: [
      { id: 'BOUNDARY-001', name: 'Boundary Containment', severity: 'HARD', active: true },
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
    ],
    scoring: [
      { key: 'vehicle_flow', weight: 25 },
      { key: 'maneuvers', weight: 15 },
    ],
  };

  const validEngineInput: LayoutEngineInput = {
    site: { width: 30, length: 40, roadSide: 'south', roadWidth: 10 },
    building: { width: 18.0, length: 25.0 },
    accessPoints: [
      { id: 'door-in', type: 'entrance', wall: 'south', offsetMeters: 5.0, widthMeters: 4.5 },
      { id: 'door-out', type: 'exit', wall: 'north', offsetMeters: 5.0, widthMeters: 4.5 },
    ],
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 4 },
        { serviceType: 'tire', quantity: 2 },
      ],
      equipment: [
        { equipmentType: '2_post_lift', quantity: 6 },
      ],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      futureExpansionBays: 1,
    },
    strategies: ['PREMIUM_FLOW'],
  };

  describe('Requirement 1 & 2: Zero Fallback & Missing Parameter Error', () => {
    it('throws structured MissingStandardParameterError when a required parameter is missing', () => {
      const accessor = new StandardAccessor(mockStandard);

      expect(() => {
        accessor.getRequiredParameter('non_existent.engineering_dimension');
      }).toThrow(MissingStandardParameterError);

      try {
        accessor.getRequiredParameter('non_existent.engineering_dimension');
      } catch (err) {
        expect(err).toBeInstanceOf(MissingStandardParameterError);
        const missingErr = err as MissingStandardParameterError;
        expect(missingErr.parameterKey).toBe('non_existent.engineering_dimension');
        expect(missingErr.code).toBe('MISSING_STANDARD_PARAMETER');
        expect(missingErr.message).toContain('Missing required engineering parameter in standard snapshot');
      }
    });

    it('proves that no fallback value is ever invented or returned for missing parameters', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'incomplete',
        name: 'Incomplete Standard',
        version: '0.1',
        status: 'draft',
        parameters: [], // empty!
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);

      // Must NOT return a default 4.0 or 0.15 fallback
      expect(() => accessor.getRequiredNumericValue('bay.min_width')).toThrow(MissingStandardParameterError);
      expect(() => accessor.getRequiredNumericValue('building.wall_thickness')).toThrow(MissingStandardParameterError);
    });
  });

  describe('Requirement 3 & 4: Data-Driven Scoring with Maximize & Minimize Directions', () => {
    it('reads scoring configuration directly from StandardSnapshot', () => {
      const accessor = new StandardAccessor(mockStandard);
      const criteria = accessor.getScoringCriteria();

      expect(criteria).toHaveLength(2);

      const flowConfig = criteria.find((c) => c.criterionKey === 'vehicle_flow');
      expect(flowConfig).toBeDefined();
      expect(flowConfig?.weight).toBe(25);
      expect(flowConfig?.direction).toBe('HIGHER_IS_BETTER');
      expect(flowConfig?.benchmarkMin).toBe(40);
      expect(flowConfig?.benchmarkTarget).toBe(100);

      const maneuverConfig = criteria.find((c) => c.criterionKey === 'maneuvers');
      expect(maneuverConfig).toBeDefined();
      expect(maneuverConfig?.weight).toBe(15);
      expect(maneuverConfig?.direction).toBe('LOWER_IS_BETTER');
      expect(maneuverConfig?.benchmarkMin).toBe(4);
      expect(maneuverConfig?.benchmarkTarget).toBe(1);
    });

    it('supports HIGHER_IS_BETTER (maximize) normalization', () => {
      const accessor = new StandardAccessor(mockStandard);

      // benchmarkMin = 40, benchmarkTarget = 100
      expect(accessor.normalizeScore('vehicle_flow', 100)).toBe(100); // at target
      expect(accessor.normalizeScore('vehicle_flow', 120)).toBe(100); // above target clamps to 100
      expect(accessor.normalizeScore('vehicle_flow', 40)).toBe(0);    // at min
      expect(accessor.normalizeScore('vehicle_flow', 20)).toBe(0);    // below min clamps to 0
      expect(accessor.normalizeScore('vehicle_flow', 70)).toBe(50);   // midpoint (70-40)/(100-40) = 50%
    });

    it('supports LOWER_IS_BETTER (minimize) normalization', () => {
      const accessor = new StandardAccessor(mockStandard);

      // benchmarkMin (worst) = 4, benchmarkTarget (best) = 1
      expect(accessor.normalizeScore('maneuvers', 1)).toBe(100); // 1 turn = perfect score 100
      expect(accessor.normalizeScore('maneuvers', 0)).toBe(100); // 0 turns clamps to 100
      expect(accessor.normalizeScore('maneuvers', 4)).toBe(0);   // 4 turns = worst score 0
      expect(accessor.normalizeScore('maneuvers', 6)).toBe(0);   // > 4 turns clamps to 0
      expect(accessor.normalizeScore('maneuvers', 2.5)).toBe(50); // midpoint = 50%
    });
  });

  describe('Requirement 5 & 6: Feasibility Pre-Check & Determinism', () => {
    it('successfully confirms feasibility when geometry and access points satisfy requirements', () => {
      const accessor = new StandardAccessor(mockStandard);
      const report = checkProgramFeasibility(validEngineInput, accessor);

      expect(report.isFeasible).toBe(true);
      expect(report.criticalDeficits).toHaveLength(0);
      expect(report.maxTheoreticallyPossibleBays).toBeGreaterThanOrEqual(validEngineInput.program.bays.reduce((s, b) => s + b.quantity, 0));
      expect(report.accessPointValidation.meetsDriveThroughRequirements).toBe(true);
    });

    it('rejects PREMIUM_FLOW when separate ingress and egress doors are missing without inventing doors', () => {
      const accessor = new StandardAccessor(mockStandard);

      // Only ONE entrance provided, but PREMIUM_FLOW requested
      const singleDoorInput: LayoutEngineInput = {
        ...validEngineInput,
        accessPoints: [
          { id: 'door-1', type: 'entrance', wall: 'south', offsetMeters: 5.0, widthMeters: 4.0 },
        ],
        strategies: ['PREMIUM_FLOW'],
      };

      const report = checkProgramFeasibility(singleDoorInput, accessor);

      expect(report.isFeasible).toBe(false);
      expect(report.accessPointValidation.meetsDriveThroughRequirements).toBe(false);
      expect(report.criticalDeficits.some((d) => d.includes("PREMIUM_FLOW"))).toBe(true);
      expect(report.criticalDeficits.some((d) => d.includes("cannot invent access doors"))).toBe(true);
    });

    it('rejects layout program when requested bays exceed theoretical capacity of building dimensions', () => {
      const accessor = new StandardAccessor(mockStandard);

      // Requesting 50 bays in an 18m x 25m building!
      const overloadedInput: LayoutEngineInput = {
        ...validEngineInput,
        program: {
          ...validEngineInput.program,
          bays: [{ serviceType: 'general_service', quantity: 50 }],
        },
      };

      const report = checkProgramFeasibility(overloadedInput, accessor);

      expect(report.isFeasible).toBe(false);
      expect(report.criticalDeficits.some((d) => d.includes("exceeds the theoretical maximum capacity"))).toBe(true);
    });

    it('produces 100% deterministic feasibility output across multiple identical runs', () => {
      const accessor = new StandardAccessor(mockStandard);

      const run1 = checkProgramFeasibility(validEngineInput, accessor);
      const run2 = checkProgramFeasibility(validEngineInput, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });
});
