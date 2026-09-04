import { describe, it, expect } from 'vitest';
import {
  ConcreteStrategyEvaluator,
  UnsupportedScoringCriterionError,
} from '@/domain/engine/evaluation/strategyEvaluator';
import { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 4.2D-A — Strategy Evaluator Semantic Correction', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-evaluator-4-2d-a',
    name: 'Mobeng Strategy Evaluator Standard Test',
    version: '1.0-eval-test',
    status: 'published',
    scoring: [
      { key: 'capacity_throughput', weight: 60 },
      { key: 'equipment_support', weight: 40 },
    ],
    parameters: [
      // Standard geometry parameters
      { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },

      // Scoring Metric 1: capacity_throughput (HIGHER_IS_BETTER: 20 m2/bay worst, 100 m2/bay target)
      { key: 'scoring.capacity_throughput.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity_throughput.benchmark_min', value: 20.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity_throughput.benchmark_target', value: 100.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },

      // Scoring Metric 2: equipment_support (HIGHER_IS_BETTER: 0 worst, 1.0 target)
      { key: 'scoring.equipment_support.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_support.benchmark_min', value: 0.0, unit: 'ratio', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.equipment_support.benchmark_target', value: 1.0, unit: 'ratio', constraint_level: 'OPTIMIZATION' },
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
    it('evaluates valid candidate across capacity_throughput and equipment_support', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      expect(result.candidateId).toBe('candidate-double-comb-01');
      expect(result.strategyId).toBe('CAPACITY');
      expect(result.isEligible).toBe(true);
      expect(result.hardViolations).toHaveLength(0);
      expect(result.criteria).toHaveLength(2);

      // Criterion 1: capacity_throughput
      // usableServiceArea = 477.75 - 120 = 357.75; 3 bays -> 119.25 m2/bay -> >= 100 target -> 100/100
      const tpCrit = result.criteria.find((c) => c.criterionId === 'capacity_throughput');
      expect(tpCrit).toBeDefined();
      expect(tpCrit?.rawValue).toBe(119.25);
      expect(tpCrit?.normalizedScore).toBe(100);
      expect(tpCrit?.weight).toBe(60);
      expect(tpCrit?.weightedScore).toBe(60.0);

      // Criterion 2: equipment_support
      // 2 supported of 3 bays = 0.667 -> 67/100
      const suppCrit = result.criteria.find((c) => c.criterionId === 'equipment_support');
      expect(suppCrit).toBeDefined();
      expect(suppCrit?.rawValue).toBe(0.667);
      expect(suppCrit?.normalizedScore).toBe(67);
      expect(suppCrit?.weight).toBe(40);
      expect(suppCrit?.weightedScore).toBe(26.8);

      // Total Score: (60.0 + 26.8) / 100 * 100 = 87
      expect(result.totalScore).toBe(87);
      expect(result.summary.finalScore).toBe(87);
    });
  });

  describe('2. Differentiating Candidates with Same Bay Count', () => {
    it('produces DIFFERENT scores for two candidates with 3 bays but different usable floor areas', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const candidateA = sampleCandidate; // interiorArea = 477.75, aisle = 120 -> 119.25 m2/bay

      // Candidate B: smaller building -> interiorArea = 250, aisle = 120 -> usable = 130 -> 43.33 m2/bay
      const candidateB: StrategyCandidate = {
        ...sampleCandidate,
        id: 'candidate-smaller-building-02',
        spatialContext: {
          ...sampleCandidate.spatialContext,
          buildingInterior: {
            grossWidth: 15,
            grossLength: 18,
            grossArea: 270,
            wallThickness: 0.25,
            interiorWidth: 14.5,
            interiorLength: 17.5,
            interiorArea: 253.75,
            provenance: {
              source: 'building_envelope',
              wallThicknessParameterKey: 'building.wall_thickness',
              formula: '(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)',
            },
          },
        },
      };

      const resultA = evaluator.evaluate(candidateA, accessor);
      const resultB = evaluator.evaluate(candidateB, accessor);

      // Both have exactly 3 bays placed
      expect(candidateA.layout.objects.filter((o) => o.type === 'service_bay').length).toBe(3);
      expect(candidateB.layout.objects.filter((o) => o.type === 'service_bay').length).toBe(3);

      expect(resultA.totalScore).toBeGreaterThan(resultB.totalScore);

      const tpA = resultA.criteria.find((c) => c.criterionId === 'capacity_throughput')!;
      const tpB = resultB.criteria.find((c) => c.criterionId === 'capacity_throughput')!;
      expect(tpA.rawValue).toBeGreaterThan(tpB.rawValue);
    });

    it('produces DIFFERENT scores for two candidates with 3 bays but different equipment support', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const candidateA = sampleCandidate; // 2 of 3 bays supported

      // Candidate B: all 3 bays supported
      const candidateB: StrategyCandidate = {
        ...sampleCandidate,
        id: 'candidate-fully-supported-03',
        layout: {
          objects: [
            ...sampleCandidate.layout.objects,
            { id: 'eq-03', type: 'equipment', layer: '07-EQUIPMENT', geometry: { x: 10, y: 15, width: 2, length: 2, rotation: 0 }, metadata: { associatedBayId: 'bay-03', serviceType: 'brake_suspension' } },
          ],
        },
      };

      const resultA = evaluator.evaluate(candidateA, accessor);
      const resultB = evaluator.evaluate(candidateB, accessor);

      expect(resultB.totalScore).toBeGreaterThan(resultA.totalScore);

      const suppA = resultA.criteria.find((c) => c.criterionId === 'equipment_support')!;
      const suppB = resultB.criteria.find((c) => c.criterionId === 'equipment_support')!;
      expect(suppB.rawValue).toBe(1.0);
      expect(suppA.rawValue).toBe(0.667);
    });
  });

  describe('3. Capacity Throughput Missing Parameter Enforcement', () => {
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

  describe('4. Equipment Support & Unassociated Equipment Handling', () => {
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

  describe('5. Diagnostic Metrics Extraction', () => {
    it('extracts diagnostic metrics (equipmentCount, softRejectionsCount) accurately', () => {
      const evaluator = new ConcreteStrategyEvaluator();
      const diag = evaluator.extractDiagnosticMetrics(sampleCandidate);

      expect(diag.equipmentCount).toBe(2);
      expect(diag.softRejectionsCount).toBe(0);
    });

    it('throws UnsupportedScoringCriterionError if equipment_count is placed in scoring criteria (DIAGNOSTIC only)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'equipment_count', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.equipment_count.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.equipment_count.benchmark_min', value: 0, unit: 'units', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.equipment_count.benchmark_target', value: 3, unit: 'units', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/DIAGNOSTIC/);
    });

    it('throws UnsupportedScoringCriterionError if rejections_count is placed in scoring criteria (DIAGNOSTIC only)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'rejections_count', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.rejections_count.direction', value: -1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.rejections_count.benchmark_min', value: 5, unit: 'count', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.rejections_count.benchmark_target', value: 0, unit: 'count', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/DIAGNOSTIC/);
    });
  });

  describe('6. Heuristic & Gap Rejections (flow_continuity, maneuvers, bottlenecks, aisle_congestion)', () => {
    it('throws UnsupportedScoringCriterionError for flow_continuity (SCORING_GAP: requires CAD path topology)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'flow_continuity', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.flow_continuity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.flow_continuity.benchmark_min', value: 0, unit: 'score', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.flow_continuity.benchmark_target', value: 1, unit: 'score', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/SCORING_GAP/);
    });

    it('throws UnsupportedScoringCriterionError for maneuvers (SCORING_GAP: requires swept path turning geometry)', () => {
      const std: WorkshopStandard = {
        ...completeStandard,
        scoring: [{ key: 'maneuvers', weight: 100 }],
        parameters: [
          ...completeStandard.parameters,
          { key: 'scoring.maneuvers.direction', value: -1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.maneuvers.benchmark_min', value: 2, unit: 'count', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.maneuvers.benchmark_target', value: 0, unit: 'count', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(std);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(/SCORING_GAP/);
    });

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

  describe('7. Determinism, Immutability, Provenance & Explanations', () => {
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

