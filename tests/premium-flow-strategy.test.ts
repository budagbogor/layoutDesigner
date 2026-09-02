import { describe, it, expect } from 'vitest';
import { PremiumFlowStrategyGenerator } from '@/domain/engine/strategies/premiumFlowStrategy';
import { CapacityStrategyGenerator } from '@/domain/engine/strategies/capacityStrategy';
import { BalancedStrategyGenerator } from '@/domain/engine/strategies/balancedStrategy';
import { createStrategyContext } from '@/domain/engine/strategies/strategyTypes';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.5 — Premium Flow Strategy Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-flow-test',
    name: 'Mobeng Flow Standard Test',
    version: '1.0-flow',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'BOUNDARY-001', name: 'Boundary Containment', severity: 'HARD', active: true },
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
      { id: 'CLEARANCE-001', name: 'Working Clearance', severity: 'HARD', active: true },
      { id: 'FLOW-001', name: 'Aisle Flow Continuity', severity: 'HARD', active: true },
    ],
  };

  const baseInput: LayoutEngineInput = {
    site: { width: 35, length: 45 },
    building: { width: 25.0, length: 30.0 },
    accessPoints: [
      { id: 'door-south', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 6.0 },
    ],
    program: {
      bays: [{ serviceType: 'general_service', quantity: 2 }],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'back_out_turnaround',
      customerZoneRequired: true,
      futureExpansionBays: 0,
    },
  };

  describe('1. Valid Single-Entry & Multi-Access-Point Flow', () => {
    it('successfully generates valid layout for single entrance access point', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(baseInput, accessor);
      const context = createStrategyContext(baseInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.status).toBe('VALID');
      expect(result.candidate?.strategyId).toBe('PREMIUM_FLOW');

      // Verify explanation mentions access point used
      expect(result.candidate?.explanation.layoutSummary).toContain('door-south');
    });

    it('successfully configures linear drive-through flow when both entrance and exit doors are provided', () => {
      const accessor = new StandardAccessor(completeStandard);
      const throughInput: LayoutEngineInput = {
        ...baseInput,
        accessPoints: [
          { id: 'door-south-in', type: 'entrance', wall: 'south', offsetMeters: 4.0, widthMeters: 6.0 },
          { id: 'door-north-out', type: 'exit', wall: 'north', offsetMeters: 4.0, widthMeters: 6.0 },
        ],
        program: {
          ...baseInput.program,
          circulationRequirement: 'drive_through',
        },
      };

      const topology = buildLayoutTopology(throughInput, accessor);
      const context = createStrategyContext(throughInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.status).toBe('VALID');
      expect(result.candidate?.explanation.strategyRationale).toContain('Linear One-Way Drive-Through');
      expect(result.candidate?.explanation.strategyRationale).toContain('door-south-in');
      expect(result.candidate?.explanation.strategyRationale).toContain('door-north-out');
    });
  });

  describe('2. Strict Access Point Requirements & Zero Invented Doors', () => {
    it('disqualifies candidate with structured rejection when access points are completely missing', () => {
      const accessor = new StandardAccessor(completeStandard);
      const inputNoDoors: LayoutEngineInput = {
        ...baseInput,
        accessPoints: [], // No access points!
      };

      const topology = buildLayoutTopology(inputNoDoors, accessor);
      const context = createStrategyContext(inputNoDoors, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.status).toBe('DISQUALIFIED');
      expect(result.candidate?.rejections.length).toBeGreaterThan(0);

      const doorRejection = result.candidate?.rejections.find((r) => r.ruleId === 'FLOW-DOOR-001');
      expect(doorRejection).toBeDefined();
      expect(doorRejection?.isDisqualifying).toBe(true);
      expect(doorRejection?.reason).toContain('Engine strictly cannot invent or assume access doors');
    });

    it('rejects candidate when drive-through flow is requested but only 1 access point is provided', () => {
      const accessor = new StandardAccessor(completeStandard);
      const singleDoorThroughInput: LayoutEngineInput = {
        ...baseInput,
        accessPoints: [
          { id: 'door-only-one', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 6.0 },
        ],
        program: {
          ...baseInput.program,
          circulationRequirement: 'drive_through', // Needs 2 doors!
        },
      };

      const topology = buildLayoutTopology(singleDoorThroughInput, accessor);
      const context = createStrategyContext(singleDoorThroughInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.status).toBe('DISQUALIFIED');
      const insuffRejection = result.candidate?.rejections.find((r) => r.ruleId === 'FLOW-DOOR-INSUFFICIENT');
      expect(insuffRejection).toBeDefined();
      expect(insuffRejection?.reason).toContain('requires both an entrance and an exit access point');
    });
  });

  describe('3. Disconnecting Access Point & Boundary Constraints', () => {
    it('detects and rejects access point that does not physically connect to circulation spine', () => {
      const accessor = new StandardAccessor(completeStandard);
      // North door offset far to the right at X = 20.0m while south door is at X = 2.0m!
      const misalignedThroughInput: LayoutEngineInput = {
        ...baseInput,
        accessPoints: [
          { id: 'door-south-in', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 6.0 },
          { id: 'door-north-misaligned', type: 'exit', wall: 'north', offsetMeters: 20.0, widthMeters: 6.0 },
        ],
        program: {
          ...baseInput.program,
          circulationRequirement: 'drive_through',
        },
      };

      const topology = buildLayoutTopology(misalignedThroughInput, accessor);
      const context = createStrategyContext(misalignedThroughInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.status).toBe('DISQUALIFIED');
      const flowRejection = result.candidate?.rejections.find((r) => r.ruleId === 'FLOW-001');
      expect(flowRejection).toBeDefined();
      expect(flowRejection?.reason).toContain('does not connect to the circulation spine');
    });
  });

  describe('4. Intent & Output Differentiation vs CAPACITY and BALANCED', () => {
    it('demonstrates distinct intent, layout summary, and candidate metadata across all 3 strategies', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(baseInput, accessor);
      const context = createStrategyContext(baseInput, topology, accessor);

      const capResult = new CapacityStrategyGenerator().generate(context);
      const balResult = new BalancedStrategyGenerator().generate(context);
      const flowResult = new PremiumFlowStrategyGenerator().generate(context);

      expect(capResult.candidate?.strategyId).toBe('CAPACITY');
      expect(balResult.candidate?.strategyId).toBe('BALANCED');
      expect(flowResult.candidate?.strategyId).toBe('PREMIUM_FLOW');

      expect(flowResult.candidate?.id).toBe('candidate-premium-flow-01');
      expect(flowResult.candidate?.explanation.tradeOffs).toContain('trading off maximum bay count for fluid circulation');
    });
  });

  describe('5. Determinism & Immutability', () => {
    it('produces 100% deterministic results across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(baseInput, accessor);
      const context = createStrategyContext(baseInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const run1 = generator.generate(context);
      const run2 = generator.generate(context);

      expect(run1.candidate?.id).toBe('candidate-premium-flow-01');
      expect(run2.candidate?.id).toBe('candidate-premium-flow-01');
      expect(JSON.stringify(run1.candidate?.layout)).toBe(JSON.stringify(run2.candidate?.layout));
    });

    it('enforces deep immutability on generated candidate and context', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(baseInput, accessor);
      const context = createStrategyContext(baseInput, topology, accessor);

      const generator = new PremiumFlowStrategyGenerator();
      const result = generator.generate(context);

      expect(Object.isFrozen(result.candidate)).toBe(true);
      expect(Object.isFrozen(result.candidate?.layout.objects)).toBe(true);
      expect(Object.isFrozen(result.candidate?.envelopes)).toBe(true);
      expect(Object.isFrozen(result.candidate?.rejections)).toBe(true);

      expect(() => {
        (result.candidate?.layout.objects as any).push({ id: 'illegal' });
      }).toThrow();
    });
  });
});
