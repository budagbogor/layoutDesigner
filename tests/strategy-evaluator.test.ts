import { describe, it, expect } from 'vitest';
import {
  ConcreteStrategyEvaluator,
  UnsupportedScoringCriterionError,
} from '@/domain/engine/evaluation/strategyEvaluator';
import { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.6 — Concrete Strategy Evaluator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-evaluator-test',
    name: 'Mobeng Strategy Evaluator Standard Test',
    version: '1.0-eval-test',
    status: 'published',
    scoring: [
      { key: 'capacity', weight: 40 },
      { key: 'rejections_count', weight: 20 },
    ],
    parameters: [
      // Criterion 1: capacity (HIGHER_IS_BETTER)
      { key: 'scoring.capacity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity.benchmark_min', value: 0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.capacity.benchmark_target', value: 5, unit: 'bays', constraint_level: 'OPTIMIZATION' },

      // Criterion 2: rejections_count (LOWER_IS_BETTER)
      { key: 'scoring.rejections_count.direction', value: -1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.rejections_count.benchmark_min', value: 4, unit: 'count', constraint_level: 'OPTIMIZATION' }, // 4 is worst
      { key: 'scoring.rejections_count.benchmark_target', value: 0, unit: 'count', constraint_level: 'OPTIMIZATION' }, // 0 is best
    ],
    rules: [
      { id: 'COLLISION-001', name: 'Physical Collision', severity: 'HARD', active: true },
    ],
  };

  const sampleCandidate: StrategyCandidate = {
    id: 'candidate-capacity-01',
    strategyId: 'CAPACITY',
    name: 'Capacity Candidate 01',
    description: 'Packed bays layout',
    topologyId: 'topo-01',
    layout: {
      objects: [
        { id: 'bay-01', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 0, y: 0, width: 4, length: 7, rotation: 0 } },
        { id: 'bay-02', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 5, y: 0, width: 4, length: 7, rotation: 0 } },
        { id: 'bay-03', type: 'service_bay', layer: '08-SERVICE-BAY', geometry: { x: 10, y: 0, width: 4, length: 7, rotation: 0 } },
      ],
    },
    envelopes: [
      {
        id: 'env-access-1',
        type: 'ACCESS',
        sourceObjectId: 'bay-01',
        derivedFromStandard: { parameterKey: 'circulation.bay_approach_depth', appliedValue: 3.5, unit: 'meter' },
        geometry: { x: 0, y: 0, width: 4, length: 3.5, rotation: 0 },
        purpose: 'Approach',
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
      strategyRationale: 'Packs 3 bays',
      layoutSummary: '3 bays placed',
      tradeOffs: 'Minimum clearances',
    },
    spatialContext: {
      arrangement: 'SINGLE_COMB_NORTH',
      circulationRequirement: 'back_out_turnaround',
      provenance: {
        source: 'generator',
        generatorName: 'CapacityGenerator',
        inputProgramField: 'circulationRequirement',
      },
    },
  };

  describe('1. Valid Candidate Evaluation & Weighted Score', () => {
    it('evaluates valid candidate across multiple criteria and computes weighted final score', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      expect(result.candidateId).toBe('candidate-capacity-01');
      expect(result.strategyId).toBe('CAPACITY');
      expect(result.isEligible).toBe(true);
      expect(result.hardViolations).toHaveLength(0);
      expect(result.criteria).toHaveLength(2);

      // Criterion 1: capacity (HIGHER_IS_BETTER)
      // 3 bays in [0, 5] -> fraction = 3/5 = 60/100
      const capCrit = result.criteria.find((c) => c.criterionId === 'capacity');
      expect(capCrit).toBeDefined();
      expect(capCrit?.rawValue).toBe(3);
      expect(capCrit?.normalizedScore).toBe(60);
      expect(capCrit?.weight).toBe(40);
      expect(capCrit?.weightedScore).toBe((60 * 40) / 100); // 24.0

      // Criterion 2: rejections_count (LOWER_IS_BETTER)
      // 0 rejections with worst=4, target=0 -> score = (4 - 0)/(4 - 0)*100 = 100/100
      const rejCrit = result.criteria.find((c) => c.criterionId === 'rejections_count');
      expect(rejCrit).toBeDefined();
      expect(rejCrit?.rawValue).toBe(0);
      expect(rejCrit?.normalizedScore).toBe(100);
      expect(rejCrit?.weight).toBe(20);
      expect(rejCrit?.weightedScore).toBe((100 * 20) / 100); // 20.0

      // Total Score: (24.0 + 20.0) / (40 + 20) * 100 = 44 / 60 * 100 = 73.333... -> Math.round = 73
      expect(result.totalScore).toBe(73);
      expect(result.summary.finalScore).toBe(73);
    });
  });

  describe('2. Hard Violation Disqualification Override', () => {
    it('strictly marks candidate isEligible = false if hard violation exists regardless of high score', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const disqualifiedCandidate: StrategyCandidate = {
        ...sampleCandidate,
        status: 'DISQUALIFIED',
        rejections: [
          {
            ruleId: 'COLLISION-001',
            severity: 'HARD',
            isDisqualifying: true,
            relatedObjectIds: ['bay-01', 'bay-02'],
            reason: 'Solid structure physical overlap detected.',
            provenance: { source: 'standard', referenceKey: 'COLLISION-001' },
          },
        ],
      };

      const result = evaluator.evaluate(disqualifiedCandidate, accessor);

      expect(result.isEligible).toBe(false);
      expect(result.summary.isEligible).toBe(false);
      expect(result.hardViolations).toHaveLength(1);
      expect(result.hardViolations[0].ruleId).toBe('COLLISION-001');
      expect(result.summary.disqualificationReason).toContain('COLLISION-001');
      // Total score is still computed for analysis, but isEligible is FALSE
      expect(result.totalScore).toBeGreaterThan(0);
    });
  });

  describe('3. Unsupported Criterion Gap Detection (Zero Assumption/Fallback)', () => {
    it('throws UnsupportedScoringCriterionError if a criterion in standard has no deterministic extractor', () => {
      const standardWithUnknownCriterion: WorkshopStandard = {
        ...completeStandard,
        scoring: [
          { key: 'mysterious_unsupported_metric', weight: 30 },
        ],
        parameters: [
          { key: 'scoring.mysterious_unsupported_metric.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.mysterious_unsupported_metric.benchmark_min', value: 0, unit: 'unit', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.mysterious_unsupported_metric.benchmark_target', value: 10, unit: 'unit', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const accessor = new StandardAccessor(standardWithUnknownCriterion);
      const evaluator = new ConcreteStrategyEvaluator();

      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(UnsupportedScoringCriterionError);
      expect(() => evaluator.evaluate(sampleCandidate, accessor)).toThrow(
        /Scoring criterion 'mysterious_unsupported_metric' from standard snapshot has no deterministic metric extractor/
      );
    });
  });

  describe('4. Determinism, Immutability, Provenance & Explanation', () => {
    it('produces 100% deterministic evaluation results across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const run1 = evaluator.evaluate(sampleCandidate, accessor);
      const run2 = evaluator.evaluate(sampleCandidate, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability on EvaluationResult, criteria, and summary', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.criteria)).toBe(true);
      expect(Object.isFrozen(result.hardViolations)).toBe(true);
      expect(Object.isFrozen(result.summary)).toBe(true);
      expect(Object.isFrozen(result.criteria[0])).toBe(true);

      expect(() => {
        (result.criteria as any).push({ criterionId: 'illegal' });
      }).toThrow();
    });

    it('provides rich provenance and structured explanations for each evaluated criterion', () => {
      const accessor = new StandardAccessor(completeStandard);
      const evaluator = new ConcreteStrategyEvaluator();

      const result = evaluator.evaluate(sampleCandidate, accessor);

      for (const criterion of result.criteria) {
        expect(criterion.provenance).toBeDefined();
        expect(criterion.provenance.standardVersionId).toBe('1.0-eval-test');
        expect(criterion.provenance.weightParamKey).toContain(criterion.criterionId);
        expect(criterion.explanation).toContain(criterion.criterionId);
        expect(criterion.explanation).toContain(String(criterion.normalizedScore));
      }
    });
  });
});
