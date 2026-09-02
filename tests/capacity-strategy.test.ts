import { describe, it, expect } from 'vitest';
import { CapacityStrategyGenerator } from '@/domain/engine/strategies/capacityStrategy';
import { createStrategyContext } from '@/domain/engine/strategies/strategyTypes';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.5 — Capacity Strategy Generator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-cap-test',
    name: 'Mobeng Capacity Standard Test',
    version: '1.0-cap',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'BOUNDARY-001', name: 'Boundary Containment', severity: 'HARD', active: true },
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
      { id: 'CLEARANCE-001', name: 'Working Clearance', severity: 'HARD', active: true },
      { id: 'FLOW-001', name: 'Aisle Flow', severity: 'HARD', active: true },
    ],
  };

  const sampleInput: LayoutEngineInput = {
    site: { width: 30, length: 40 },
    building: { width: 18.0, length: 25.0 },
    program: {
      bays: [{ serviceType: 'general_service', quantity: 3 }],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: false,
      futureExpansionBays: 0,
    },
  };

  describe('1. Single & Multiple Bay Placement', () => {
    it('successfully places a single service bay with valid geometry and envelopes', () => {
      const accessor = new StandardAccessor(completeStandard);
      const singleBayInput: LayoutEngineInput = {
        ...sampleInput,
        program: { ...sampleInput.program, bays: [{ serviceType: 'general_service', quantity: 1 }] },
      };

      const topology = buildLayoutTopology(singleBayInput, accessor);
      const context = createStrategyContext(singleBayInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate).toBeDefined();
      expect(result.candidate?.status).toBe('VALID');
      expect(result.candidate?.layout.objects).toHaveLength(1);

      const placedBay = result.candidate?.layout.objects[0];
      expect(placedBay?.id).toBe('bay-01');
      expect(placedBay?.geometry.width).toBe(4.0);
      expect(placedBay?.geometry.length).toBe(7.0);

      // Verify envelopes include physical, working, access, and drive aisle
      expect(result.candidate?.envelopes.length).toBeGreaterThanOrEqual(4);
    });

    it('successfully places multiple service bays sequentially along the service wall', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.status).toBe('VALID');
      expect(result.candidate?.layout.objects).toHaveLength(3);

      const bayIds = result.candidate?.layout.objects.map((b) => b.id);
      expect(bayIds).toEqual(['bay-01', 'bay-02', 'bay-03']);

      // Verify non-overlapping X coordinates
      const bays = result.candidate!.layout.objects;
      expect(bays[1].geometry.x).toBeGreaterThan(bays[0].geometry.x + bays[0].geometry.width);
      expect(bays[2].geometry.x).toBeGreaterThan(bays[1].geometry.x + bays[1].geometry.width);
    });
  });

  describe('2. Capacity Limit & Boundary Containment', () => {
    it('stops placement gracefully when building width is exhausted (does not force impossible bays)', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Requesting 10 bays in an 18m building!
      // Each bay is 4m + 2*0.5m buffer = 5.0m step.
      // Usable width: 18 - 2*0.2 = 17.6m.
      // Maximum that can fit is 3 bays (3 * 5 = 15m <= 17.6m; 4th bay would reach 20m > 17.6m).
      const overloadedInput: LayoutEngineInput = {
        ...sampleInput,
        program: { ...sampleInput.program, bays: [{ serviceType: 'general_service', quantity: 10 }] },
      };

      const topology = buildLayoutTopology(overloadedInput, accessor);
      const context = createStrategyContext(overloadedInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      expect(result.success).toBe(true);
      expect(result.candidate?.layout.objects).toHaveLength(3); // Exactly 3 placed!

      // Rejection report explains why 4th bay was not placed
      expect(result.candidate?.rejections.length).toBeGreaterThan(0);
      const boundaryRejection = result.candidate?.rejections.find((r) => r.ruleId === 'BOUNDARY-001');
      expect(boundaryRejection).toBeDefined();
      expect(boundaryRejection?.reason).toContain('extends beyond building wall boundary');

      // Explanation narrative describes trade-off
      expect(result.candidate?.explanation.layoutSummary).toContain('Placed 3 of 10 service bays');
      expect(result.candidate?.explanation.tradeOffs).toContain('limits physical capacity to 3 bays');
    });

    it('marks candidate as DISQUALIFIED if not even 1 bay can physically fit', () => {
      const accessor = new StandardAccessor(completeStandard);
      // Tiny building: 3m width (bay requires 4m!)
      const tinyBuildingInput: LayoutEngineInput = {
        ...sampleInput,
        building: { width: 3.0, length: 15.0 },
      };

      const topology = buildLayoutTopology(tinyBuildingInput, accessor);
      const context = createStrategyContext(tinyBuildingInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      expect(result.candidate?.status).toBe('DISQUALIFIED');
      expect(result.candidate?.layout.objects).toHaveLength(0);
      expect(result.candidate?.rejections.some((r) => r.isDisqualifying)).toBe(true);
    });
  });

  describe('3. Drive Aisle Requirement & Missing Parameter Check', () => {
    it('creates drive aisle connecting in front of the bay thresholds', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      const aisle = result.candidate?.envelopes.find((e) => e.sourceObjectId === 'aisle-main');
      expect(aisle).toBeDefined();
      expect(aisle?.geometry.y).toBe(17.3); // bayY threshold = 17.3m
      expect(aisle?.geometry.rotation).toBe(270);
    });

    it('strictly throws MissingStandardParameterError when operational parameters are missing from snapshot', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-param-std',
        name: 'Incomplete Standard',
        version: '0.1',
        status: 'published',
        parameters: [], // empty!
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);
      const topology = buildLayoutTopology(sampleInput, new StandardAccessor(completeStandard));
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      expect(() => generator.generate(context)).toThrow(MissingStandardParameterError);
    });
  });

  describe('4. Determinism, Immutability & Provenance', () => {
    it('produces 100% deterministic layout candidate across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const run1 = generator.generate(context);
      const run2 = generator.generate(context);

      // Compare IDs and layouts
      expect(run1.candidate?.id).toBe('candidate-capacity-01');
      expect(run2.candidate?.id).toBe('candidate-capacity-01');
      expect(JSON.stringify(run1.candidate?.layout)).toBe(JSON.stringify(run2.candidate?.layout));
    });

    it('enforces deep immutability on generated candidate and context', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      expect(Object.isFrozen(result.candidate)).toBe(true);
      expect(Object.isFrozen(result.candidate?.layout.objects)).toBe(true);
      expect(Object.isFrozen(result.candidate?.envelopes)).toBe(true);
      expect(Object.isFrozen(result.candidate?.rejections)).toBe(true);

      expect(() => {
        (result.candidate?.layout.objects as any).push({ id: 'illegal' });
      }).toThrow();
    });

    it('includes complete provenance and explainability metadata', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const generator = new CapacityStrategyGenerator();
      const result = generator.generate(context);

      const candidate = result.candidate;
      expect(candidate?.provenance.standardVersionId).toBe('1.0-cap');
      expect(candidate?.provenance.generatorName).toBe('Capacity Strategy Generator');
      expect(candidate?.explanation.strategyRationale).toBeDefined();
      expect(candidate?.explanation.layoutSummary).toBeDefined();
    });
  });
});
