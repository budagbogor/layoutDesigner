import { describe, it, expect } from 'vitest';
import {
  ConcreteStrategyEvaluator,
  UnsupportedScoringCriterionError,
} from '@/domain/engine/evaluation/strategyEvaluator';
import { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 4.2D — Concrete Strategy Evaluator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-evaluator-4-2d',
    name: 'Mobeng Strategy Evaluator Standard Test',
    version: '1.0-eval-test',
    status: 'published',
    scoring: [
      { key: 'flow_continuity', weight: 40 },
      { key: 'maneuvers', weight: 30 },
      { key: 'rejections_count', weight: 10 },
    ],
    parameters: [
      // Standard geometry parameters
      { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },

      // Scoring Metric 1: flow_continuity (HIGHER_IS_BETTER: 0.0 worst, 1.0 target)
      { key: 'scoring.flow_continuity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.flow_continuity.benchmark_min', value: 0.0, unit: 'score', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.flow_continuity.benchmark_target', value: 1.0, unit: 'score', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 2: maneuvers (LOWER_IS_BETTER: 2.0 worst, 0.0 target)
      { key: 'scoring.maneuvers.direction', value: -1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.maneuvers.benchmark_min', value: 2.0, unit: 'maneuvers', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.maneuvers.benchmark_target', value: 0.0, unit: 'maneuvers', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 3: capacity_throughput (HIGHER_IS_BETTER: 20 m2/bay worst, 50 m2/bay target)
      { key: 'scoring.capacity_throughput.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity_throughput.benchmark_min', value: 20.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity_throughput.benchmark_target', value: 50.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 4: equipment_count (HIGHER_IS_BETTER: 0 worst, 3 target)
      { key: 'scoring.equipment_count.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_count.benchmark_min', value: 0.0, unit: 'units', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_count.benchmark_target', value: 3.0, unit: 'units', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 5: equipment_support (HIGHER_IS_BETTER: 0 worst, 1.0 target)
      { key: 'scoring.equipment_support.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_support.benchmark_min', value: 0.0, unit: 'ratio', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_support.benchmark_target', value: 1.0, unit: 'ratio', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 6: rejections_count (LOWER_IS_BETTER: 4 worst, 0 target)
      { key: 'scoring.rejections_count.direction', value: -1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.rejections_count.benchmark_min', value: 4.0, unit: 'count', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.rejections_count.benchmark_target', value: 0.0, unit: 'count', constraint_level: 'OPTIMIZATION' },
    ],
    rules: [
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
    ],
  };

  const sampleCandidate: StrategyCandidate = {
    id: 'candidate-double-comb-01',
    strategyId: 'CAPACITY',
    name: 'Double Comb Drive Through Candidate',
    description: 'Opposing double-comb layout with drive-through circulation',
    topologyId: 'topo-01',
    layout: {
      objects: [
        { id: 'bay-01', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 0, y: 15, width: 4, length: 7, rotation: 0 }, metadata: { serviceType: 'general_service' } },
        { id: 'bay-02', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 5, y: 15, width: 4, length: 7, rotation: 0 }, metadata: { serviceType: 'general_service' } },
        { id: 'bay-03', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 10, y: 15, width: 4, length: 7, rotation: 0 }, metadata: { serviceType: 'brake_suspension' } },
        { id: 'eq-01', type: 'equipment', layer: '07-EQUIPMENT', geometry: { x: 0, y: 15, width: 2, length: 2, rotation: 0 }, metadata: { associatedBayId: 'bay-01', serviceType: 'general_service' } },
        { id: 'eq-02', type: 'equipment', layer: '07-EQUIPMENT', geometry: { x: 5, y: 15, width: 2, length: 2, rotation: 0 }, metadata: { associatedBayId: 'bay-02', serviceType: 'general_service' } },
      ],
    },
    envelopes: [
      {
        id: 'env-aisle',
        type: 'ACCESS',
        sourceObjectId: 'aisle-main',
        derivedFromStandard: { parameterKey: 'circulation.drive_aisle.min_width', appliedValue: 6.0, unit: 'meter' },
        geometry: { x: 0, y: 7, width: 20, length: 6, rotation: 0 },
        purpose: 'Central Drive Aisle',
        violationSemantics: { forbiddenOverlapTypes: ['PHYSICAL'], severityOnOverlap: 'WARNING', allowOverlapWithParent: true },
      },
    ],
    status: 'VALID',
    rejections: [],
    provenance: {
      standardVersionId: '1.0-eval-test',
      generatorName: 'CapacityGenerator',
      generatedAt: '2026-09-02T00:00:00.000Z',
    },
    explanation: {
      strategyRationale: 'Double comb drive through',
      layoutSummary: '3 bays placed with 2 equipment units',
      tradeOffs: 'High throughput flow',
    },
    spatialContext: {
      arrangement: 'DOUBLE_COMB_OPPOSING',
      circulationRequirement: 'drive_through',
      buildingInterior: {
        grossWidth: 20,
        grossLength: 25,
        grossArea: 500,
        wallThickness: 0.25,
        interiorWidth: 19.5,
        interiorLength: 24.5,
        interiorArea: 477.75,
        provenance: {
          source: 'building_envelope',
          wallThicknessParameterKey: 'building.wall_thickness',
          formula: '(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)',
        },
      },
      provenance: {
        source: 'generator',
        generatorName: 'CapacityGenerator',
        inputProgramField: 'circulationRequirement',
      },
    },
  };

  describe('1. Valid Candidate Evaluation & Weighted Score', () => {
    it('evaluates valid candidate across flow_continuity, maneuvers, and rejections_count', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      expect(result.candidateId).toBe('candidate-double-comb-01');
      expect(result.strategyId).toBe('CAPACITY');
      expect(result.isEligible).toBe(true);
      expect(result.hardViolations).toHaveLength(0);
      expect(result.criteria).toHaveLength(3);

      // Criterion 1: flow_continuity (drive_through -> 1.0 -> 100/100)
      const flowCrit = result.criteria.find((c) => c.criterionId === 'flow_continuity');
      expect(flowCrit).toBeDefined();
      expect(flowCrit?.rawValue).toBe(1.0);
      expect(flowCrit?.normalizedScore).toBe(100);
      expect(flowCrit?.weight).toBe(40);
      expect(flowCrit?.weightedScore).toBe(40.0);

      // Criterion 2: maneuvers (DOUBLE_COMB + drive_through -> 0.0 maneuvers -> 100/100)
      const manCrit = result.criteria.find((c) => c.criterionId === 'maneuvers');
      expect(manCrit).toBeDefined();
      expect(manCrit?.rawValue).toBe(0.0);
      expect(manCrit?.normalizedScore).toBe(100);
      expect(manCrit?.weight).toBe(30);
      expect(manCrit?.weightedScore).toBe(30.0);

      // Criterion 3: rejections_count (0 warnings -> 100/100)
      const rejCrit = result.criteria.find((c) => c.criterionId === 'rejections_count');
      expect(rejCrit).toBeDefined();
      expect(rejCrit?.rawValue).toBe(0);
      expect(rejCrit?.normalizedScore).toBe(100);
      expect(rejCrit?.weight).toBe(10);
      expect(rejCrit?.weightedScore).toBe(10.0);

      // Total Score: (40 + 30 + 10) / (40 + 30 + 10) * 100 = 100
      expect(result.totalScore).toBe(100);
      expect(result.summary.finalScore).toBe(100);
    });
  });

  describe('2. Differentiating Candidates with Same Bay Count (Flow & Maneuver Geometry)', () => {
    it('produces DIFFERENT scores for two candidates with 3 bays but different flow arrangements', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      // Candidate A: DOUBLE_COMB_OPPOSING + drive_through (Fluid continuous flow)
      const candidateA = sampleCandidate;

      // Candidate B: SINGLE_COMB_NORTH + back_out_turnaround (Reverse egress required)
      const candidateB: StrategyCandidate = {
        ...sampleCandidate,
        id: 'candidate-single-comb-02',
        spatialContext: {
          ...sampleCandidate.spatialContext,
          arrangement: 'SINGLE_COMB_NORTH',
          circulationRequirement: 'back_out_turnaround',
        },
      };

      const resultA = evaluator.evaluate(candidateA, accessor);
      const resultB = evaluator.evaluate(candidateB, accessor);

      // Both have exactly 3 bays placed
      expect(candidateA.layout.objects.filter((o) => o.type === 'service_bay').length).toBe(3);
      expect(candidateB.layout.objects.filter((o) => o.type === 'service_bay').length).toBe(3);

      // Candidate A (drive_through) scores 100 on flow, 100 on maneuvers
      // Candidate B (back_out) scores 25 on flow (0.25), 50 on maneuvers (1.0 maneuver in [2.0, 0.0])
      expect(resultA.totalScore).toBe(100);
      expect(resultB.totalScore).toBeLessThan(resultA.totalScore);

      const flowB = resultB.criteria.find((c) => c.criterionId === 'flow_continuity')!;
      const manB = resultB.criteria.find((c) => c.criterionId === 'maneuvers')!;
      expect(flowB.rawValue).toBe(0.25);
      expect(manB.rawValue).toBe(1.0);
    });

    it('disconnected flow candidate receives 0 flow continuity and maximum maneuver penalty', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const disconnectedCandidate: StrategyCandidate = {
        ...sampleCandidate,
        status: 'DISQUALIFIED',
        rejections: [
          {
            ruleId: 'FLOW-DOOR-001',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing access doors: flow cannot connect.',
          },
        ],
      };

      const result = evaluator.evaluate(disconnectedCandidate, accessor);
      const flowCrit = result.criteria.find((c) => c.criterionId === 'flow_continuity')!;
      const manCrit = result.criteria.find((c) => c.criterionId === 'maneuvers')!;

      expect(flowCrit.rawValue).toBe(0.0);
      expect(flowCrit.normalizedScore).toBe(0);
      expect(manCrit.rawValue).toBe(3.0); // Maximum maneuver penalty
      expect(manCrit.normalizedScore).toBe(0);
      expect(result.isEligible).toBe(false);
    });
  });

  describe('3. Capacity Throughput Metric', () => {
    it('evaluates capacity_throughput based on usable interior floor area per bay', () => {
      const throughputStandard: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'capacity_throughput', weight: 100 }],
      };

      const accessor = new StandardAccessor(throughputStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);
      const tpCrit = result.criteria.find((c) => c.criterionId === 'capacity_throughput')!;

      // interiorArea = 477.75, aisleArea = 20 * 6 = 120, ancillaryArea = 0
      // usableServiceArea = 477.75 - 120 = 357.75
      // 3 bays -> 357.75 / 3 = 119.25 m2/bay
      // benchmark_min = 20, benchmark_target = 50 -> 119.25 >= 50 -> 100/100
      expect(tpCrit).toBeDefined();
      expect(tpCrit.rawValue).toBe(119.25);
      expect(tpCrit.normalizedScore).toBe(100);
    });

    it('throws MissingStandardParameterError if capacity_throughput benchmark is absent from standard', () => {
      const missingTpStandard: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'capacity_throughput', weight: 100 }],
        parameters: completeStandard.parameters.filter(
          (p) => !p.key.startsWith('scoring.capacity_throughput.benchmark_')
        ),
      };

      const accessor = new StandardAccessor(missingTpStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(MissingStandardParameterError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(
        /scoring\.capacity_throughput\.benchmark_min/
      );
    });
  });

  describe('4. Equipment Count & Equipment Support Metrics', () => {
    it('evaluates equipment_count from actual placed equipment units', () => {
      const equipStandard: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'equipment_count', weight: 100 }],
      };

      const accessor = new StandardAccessor(equipStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);
      const eqCrit = result.criteria.find((c) => c.criterionId === 'equipment_count')!;

      // 2 equipment units placed with benchmark_target = 3.0 -> 2/3 = 67/100
      expect(eqCrit.rawValue).toBe(2);
      expect(eqCrit.normalizedScore).toBe(67);
    });

    it('evaluates equipment_support based on explicit bay association', () => {
      const equipSupportStandard: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'equipment_support', weight: 100 }],
      };

      const accessor = new StandardAccessor(equipSupportStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);
      const suppCrit = result.criteria.find((c) => c.criterionId === 'equipment_support')!;

      // bay-01 has eq-01, bay-02 has eq-02, bay-03 has no eq -> 2 of 3 bays supported = 0.667
      // in [0, 1.0] -> 67/100
      expect(suppCrit.rawValue).toBe(0.667);
      expect(suppCrit.normalizedScore).toBe(67);
    });

    it('throws UnsupportedScoringCriterionError if equipment objects lack explicit association (SCORING_GAP)', () => {
      const unassociatedCandidate: StrategyCandidate = {
        ...sampleCandidate,
        layout: {
          objects: [
            { id: 'bay-01', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 0, y: 0, width: 4, length: 7, rotation: 0 } },
            { id: 'eq-01', type: 'equipment', layer: '07-EQUIPMENT', geometry: { x: 0, y: 0, width: 2, length: 2, rotation: 0 } }, // NO metadata!
          ],
        },
      };

      const equipSupportStandard: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'equipment_support', weight: 100 }],
      };

      const accessor = new StandardAccessor(equipSupportStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(unassociatedCandidate, accessor)).toThrow(
        UnsupportedScoringCriterionError
      );
      expect(() => evaluator.evaluate(unassociatedCandidate, accessor)).toThrow(/SCORING_GAP/);
    });
  });

  describe('5. Unsupported Criteria Rejection (Gaps, Deprecations & Hard Constraints)', () => {
    it('throws UnsupportedScoringCriterionError for capacity (HARD constraint)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'capacity', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.capacity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.capacity.benchmark_min', value: 0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.capacity.benchmark_target', value: 5, unit: 'bays', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/HARD constraint/);
    });

    it('throws UnsupportedScoringCriterionError for vehicle_flow (deprecated proxy)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'vehicle_flow', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.vehicle_flow.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.vehicle_flow.benchmark_min', value: 0, unit: 'score', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.vehicle_flow.benchmark_target', value: 1, unit: 'score', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/Deprecated legacy metric/);
    });

    it('throws UnsupportedScoringCriterionError for bottlenecks and aisle_congestion (SCORING_GAP)', () => {
      const gapKeys = ['bottlenecks', 'aisle_congestion'];

      for (const key of gapKeys) {
        const std: WorkshopStandard = {
          ...completeStandard,
          scoring: [{ key, weight: 100 }],
          parameters: [
            ...completeStandard.parameters,
            { key: `scoring.${key}.direction`, value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
            { key: `scoring.${key}.benchmark_min`, value: 0, unit: 'val', constraint_level: 'OPTIMIZATION' },
            { key: `scoring.${key}.benchmark_target`, value: 1, unit: 'val', constraint_level: 'OPTIMIZATION' },
          ],
        };

        const accessor = new StandardAccessor(std);
        const evaluator = new ConcreteStrategyEvaluator();

        expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
        expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/SCORING_GAP/);
      }
    });
  });

  describe('6. Determinism, Immutability, Provenance & Explanations', () => {
    it('produces 100% deterministic evaluation results across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const run1 = evaluator.evaluate(sampleCandidate, accessor);
      const run2 = evaluator.evaluate(sampleCandidate, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability on EvaluationResult', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.criteria)).toBe(true);
      expect(Object.isFrozen(result.hardViolations)).toBe(true);
      expect(Object.isFrozen(result.summary)).toBe(true);
    });

    it('provides rich provenance and structured explanations for each evaluated criterion', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      for (const criterion of result.criteria) {
        expect(criterion.provenance).toBeDefined();
        expect(criterion.provenance.standardVersionId).toBe('1.0-eval-test');
        expect(criterion.provenance.weightParamKey).toContain(criterion.criterionId);
        expect(criterion.provenance.description).toBeDefined();
        expect(criterion.provenance.description!.length).toBeGreaterThan(15);
        expect(criterion.explanation).toContain(criterion.criterionId);
      }
    });
  });
});
