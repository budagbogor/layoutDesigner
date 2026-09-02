import { describe, it, expect } from 'vitest';
import { BalancedStrategyGenerator } from '@/domain/engine/strategies/balancedStrategy';
import { CapacityStrategyGenerator } from '@/domain/engine/strategies/capacityStrategy';
import { createStrategyContext } from '@/domain/engine/strategies/strategyTypes';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.5 — Balanced Strategy Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-bal-test',
    name: 'Mobeng Balanced Standard Test',
    version: '1.0-bal',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.comfort_buffer', value: 0.5, unit: 'meter', constraint_level: 'OPTIMIZATION' },
      { key: 'equipment.width', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'equipment.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'BOUNDARY-001', name: 'Boundary Containment', severity: 'HARD', active: true },
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
      { id: 'CLEARANCE-001', name: 'Working Clearance', severity: 'HARD', active: true },
      { id: 'FLOW-001', name: 'Aisle Flow', severity: 'HARD', active: true },
    ],
  };

  const sampleInput: LayoutEngineInput = {
    site: { width: 35, length: 45 },
    building: { width: 25.0, length: 30.0 },
    program: {
      bays: [{ serviceType: 'general_service', quantity: 2 }],
      equipment: [{ equipmentType: '2_post_lift', quantity: 1 }],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      futureExpansionBays: 1,
    },
  };

  describe('1. Single & Multiple Bay Placement', () => {
    it('successfully places a single service bay in BALANCED mode with proper clearances', () => {
      const accessor = new StandardAccessor(completeStandard);
      const singleBayInput: LayoutEngineInput = {
        ...sampleInput,
        program: {
          ...sampleInput.program,
          bays: [{ serviceType: 'general_service', quantity: 1 }],
          equipment: [],
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      const topology = buildLayoutTopology(singleBayInput, accessor);
      const context = createStrategyContext(singleBayInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.status).toBe('VALID');
      const placedBays = result.candidate?.layout.objects.filter((o) => o.type === 'service_bay');
      expect(placedBays).toHaveLength(1);
    });

    it('successfully places multiple service bays in BALANCED mode', () => {
      const accessor = new StandardAccessor(completeStandard);
      const multiBayInput: LayoutEngineInput = {
        ...sampleInput,
        program: {
          ...sampleInput.program,
          bays: [{ serviceType: 'general_service', quantity: 3 }],
          equipment: [],
          customerZoneRequired: false,
          futureExpansionBays: 0,
        },
      };

      const topology = buildLayoutTopology(multiBayInput, accessor);
      const context = createStrategyContext(multiBayInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.status).toBe('VALID');
      const placedBays = result.candidate?.layout.objects.filter((o) => o.type === 'service_bay');
      expect(placedBays).toHaveLength(3);
    });
  });

  describe('2. Intent & Result Contrast vs CAPACITY on Same Input', () => {
    it('produces distinct layout geometry and functional zones compared to CAPACITY', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const capGenerator = new CapacityStrategyGenerator();
      const balGenerator = new BalancedStrategyGenerator();

      const capResult = capGenerator.generate(context);
      const balResult = balGenerator.generate(context);

      // Verify strategy IDs differ
      expect(capResult.candidate?.strategyId).toBe('CAPACITY');
      expect(balResult.candidate?.strategyId).toBe('BALANCED');

      // BALANCED contains customer lounge and equipment, whereas CAPACITY only placed service bays!
      const capHasCustomer = capResult.candidate?.layout.objects.some((o) => o.id === 'customer-lounge');
      const balHasCustomer = balResult.candidate?.layout.objects.some((o) => o.id === 'customer-lounge');
      expect(capHasCustomer).toBe(false);
      expect(balHasCustomer).toBe(true);

      const balHasEquipment = balResult.candidate?.layout.objects.some((o) => o.type === 'equipment');
      expect(balHasEquipment).toBe(true);

      // Explanations reflect their distinct trade-offs
      expect(capResult.candidate?.explanation.strategyRationale).toContain('Packs service bays');
      expect(balResult.candidate?.explanation.strategyRationale).toContain('Apportions space into dedicated functional zones');
    });
  });

  describe('3. Functional Relationships: Equipment, Customer Zone, Expansion Reserve', () => {
    it('positions equipment adjacent to service bays to fulfill SERVES relationship', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      const equipObj = result.candidate?.layout.objects.find((o) => o.type === 'equipment');
      expect(equipObj).toBeDefined();
      expect(equipObj?.metadata?.zone).toBe('EQUIPMENT_ZONE');
      expect(equipObj?.metadata?.servesBayId).toBeDefined();
    });

    it('preserves contiguous expansion reserve for future bays when requested', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.explanation.layoutSummary).toContain('expansion reserve: PRESERVED');
    });
  });

  describe('4. Constraint Rejection & Missing Parameter Handling', () => {
    it('marks candidate DISQUALIFIED on building boundary violation when building is too small', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Extremely small building: 5m width cannot fit customer lounge (3m) + bay (4m) + clearances
      const tinyInput: LayoutEngineInput = {
        ...sampleInput,
        building: { width: 5.0, length: 15.0 },
      };

      const topology = buildLayoutTopology(tinyInput, accessor);
      const context = createStrategyContext(tinyInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.status).toBe('DISQUALIFIED');
      expect(result.candidate?.rejections.some((r) => r.isDisqualifying)).toBe(true);
    });

    it('strictly throws MissingStandardParameterError if required equipment parameter is missing', () => {
      const incompleteStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.filter((p) => p.key !== 'equipment.width'),
      };

      const accessor = new StandardAccessor(incompleteStandard);
      const topology = buildLayoutTopology(sampleInput, new StandardAccessor(completeStandard));
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      expect(() => generator.generate(context)).toThrow(MissingStandardParameterError);
    });
  });

  describe('5. Determinism, Immutability & Provenance', () => {
    it('produces 100% deterministic layout candidate across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const run1 = generator.generate(context);
      const run2 = generator.generate(context);

      expect(run1.candidate?.id).toBe('candidate-balanced-01');
      expect(run2.candidate?.id).toBe('candidate-balanced-01');
      expect(JSON.stringify(run1.candidate?.layout)).toBe(JSON.stringify(run2.candidate?.layout));
    });

    it('enforces deep immutability on generated candidate and context', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(Object.isFrozen(result.candidate)).toBe(true);
      expect(Object.isFrozen(result.candidate?.layout.objects)).toBe(true);
      expect(Object.isFrozen(result.candidate?.envelopes)).toBe(true);
      expect(Object.isFrozen(result.candidate?.rejections)).toBe(true);

      expect(() => {
        (result.candidate?.layout.objects as any).push({ id: 'illegal' });
      }).toThrow();
    });

    it('includes detailed explanation and trade-offs narrative', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new BalancedStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.provenance.standardVersionId).toBe('1.0-bal');
      expect(result.candidate?.provenance.generatorName).toBe('Balanced Strategy Generator');
      expect(result.candidate?.explanation.tradeOffs).toBeDefined();
    });
  });
});
