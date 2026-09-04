import { describe, it, expect } from 'vitest';
import {
  calculateNormalizedScore,
  normalizeCriterionScore,
  evaluateCandidateCriteria,
  CriterionConfig,
  ScoringDirection,
} from '@/domain/engine/evaluation/evaluationTypes';
import { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.6 — Strategy Evaluator Contracts', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-eval',
    name: 'Mobeng Evaluation Standard Test',
    version: '1.0-eval',
    status: 'published',
    parameters: [
      { key: 'scoring.weight.capacity', value: 40.0, unit: 'weight', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.min.capacity', value: 0.0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.max.capacity', value: 10.0, unit: 'bays', constraint_level: 'OPTIMIZATION' },

      { key: 'scoring.weight.aisle_congestion', value: 20.0, unit: 'weight', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.min.aisle_congestion', value: 0.0, unit: 'index', constraint_level: 'OPTIMIZATION' },
      { key: 'scoring.max.aisle_congestion', value: 5.0, unit: 'index', constraint_level: 'OPTIMIZATION' },
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
    envelopes: [],
    status: 'VALID',
    rejections: [],
    provenance: {
      standardVersionId: '1.0-eval',
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

  const criteriaConfigs: CriterionConfig[] = [
    {
      criterionId: 'capacity_throughput',
      name: 'Service Bay Throughput',
      weightParamKey: 'scoring.weight.capacity',
      minParamKey: 'scoring.min.capacity',
      maxParamKey: 'scoring.max.capacity',
      direction: 'HIGHER_IS_BETTER',
      calculateRawValue: (c) => c.layout.objects.filter((o) => o.type === 'service_bay').length,
      formatExplanation: (raw, score, weight) =>
        `Placed ${raw} bays yielding normalized score ${score}/100 with weight ${weight}.`,
    },
    {
      criterionId: 'aisle_congestion',
      name: 'Circulation Bottleneck Index',
      weightParamKey: 'scoring.weight.aisle_congestion',
      minParamKey: 'scoring.min.aisle_congestion',
      maxParamKey: 'scoring.max.aisle_congestion',
      direction: 'LOWER_IS_BETTER', // Lower congestion is better!
      calculateRawValue: () => 1.0, // Low congestion raw value = 1.0 (out of 5.0 max)
      formatExplanation: (raw, score, weight) =>
        `Aisle congestion level ${raw} yields normalized score ${score}/100 (LOWER_IS_BETTER direction).`,
    },
  ];

  describe('1. Single Source of Truth Normalization: HIGHER_IS_BETTER vs LOWER_IS_BETTER (0..100 Scale)', () => {
    it('normalizes correctly in HIGHER_IS_BETTER direction on consistent 0..100 scale', () => {
      // value = 8 in [0, 10] -> 80
      expect(calculateNormalizedScore(8, 0, 10, 'HIGHER_IS_BETTER')).toBe(80);
      // value = 10 -> 100
      expect(calculateNormalizedScore(10, 0, 10, 'HIGHER_IS_BETTER')).toBe(100);
      // value = 0 -> 0
      expect(calculateNormalizedScore(0, 0, 10, 'HIGHER_IS_BETTER')).toBe(0);
    });

    it('normalizes correctly in LOWER_IS_BETTER direction on consistent 0..100 scale', () => {
      // value = 1 in [0, 5] -> score is (5 - 1) / 5 * 100 = 80!
      expect(calculateNormalizedScore(1, 0, 5, 'LOWER_IS_BETTER')).toBe(80);
      // value = 0 (zero congestion) -> score is 100 (perfect)!
      expect(calculateNormalizedScore(0, 0, 5, 'LOWER_IS_BETTER')).toBe(100);
      // value = 5 (max congestion) -> score is 0 (worst)!
      expect(calculateNormalizedScore(5, 0, 5, 'LOWER_IS_BETTER')).toBe(0);
    });

    it('verifies that alias normalizeCriterionScore points to calculateNormalizedScore', () => {
      expect(normalizeCriterionScore).toBe(calculateNormalizedScore);
    });
  });

  describe('2. Weight & Criterion Evaluation from Standard Snapshot', () => {
    it('evaluates candidate using weights strictly resolved from StandardAccessor', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);

      expect(result.candidateId).toBe('candidate-capacity-01');
      expect(result.strategyId).toBe('CAPACITY');
      expect(result.isEligible).toBe(true);
      expect(result.criteria).toHaveLength(2);

      // Verify Criterion 1 (HIGHER_IS_BETTER): 3 bays in [0, 10] -> score 30, weight 40, weightedScore = (30 * 40)/100 = 12.0
      const capCriterion = result.criteria[0];
      expect(capCriterion.criterionId).toBe('capacity_throughput');
      expect(capCriterion.weight).toBe(40.0);
      expect(capCriterion.direction).toBe('HIGHER_IS_BETTER');
      expect(capCriterion.rawValue).toBe(3);
      expect(capCriterion.normalizedScore).toBe(30);
      expect(capCriterion.weightedScore).toBe(12.0);

      // Verify Criterion 2 (LOWER_IS_BETTER): 1.0 congestion in [0, 5] -> score 80, weight 20, weightedScore = (80 * 20)/100 = 16.0
      const congCriterion = result.criteria[1];
      expect(congCriterion.criterionId).toBe('aisle_congestion');
      expect(congCriterion.weight).toBe(20.0);
      expect(congCriterion.direction).toBe('LOWER_IS_BETTER');
      expect(congCriterion.rawValue).toBe(1.0);
      expect(congCriterion.normalizedScore).toBe(80);
      expect(congCriterion.weightedScore).toBe(16.0);

      // Total score: (12.0 + 16.0) / (40 + 20) * 100 = 28 / 60 * 100 = 47
      expect(result.totalScore).toBe(47);
    });
  });

  describe('3. Hard Constraint Disqualification Overrides Score', () => {
    it('strictly marks candidate isEligible = false if hard violation exists regardless of high score', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Create candidate with 10 bays (perfect 100% capacity score) BUT with a disqualifying collision
      const disqualifiedCandidate: StrategyCandidate = {
        ...sampleCandidate,
        status: 'DISQUALIFIED',
        rejections: [
          {
            ruleId: 'COLLISION-001',
            severity: 'HARD',
            isDisqualifying: true,
            relatedObjectIds: ['bay-01', 'bay-02'],
            reason: 'Direct physical collision detected between solid structures.',
            provenance: { source: 'standard', referenceKey: 'COLLISION-001' },
          },
        ],
      };

      const result = evaluateCandidateCriteria(disqualifiedCandidate, accessor, criteriaConfigs);

      // Even though score is calculated, isEligible must be strictly FALSE!
      expect(result.isEligible).toBe(false);
      expect(result.summary.isEligible).toBe(false);
      expect(result.hardViolations).toHaveLength(1);
      expect(result.hardViolations[0].ruleId).toBe('COLLISION-001');
      expect(result.summary.disqualificationReason).toContain('COLLISION-001');
    });
  });

  describe('4. Missing Standard Parameters (Zero Fallback)', () => {
    it('strictly throws MissingStandardParameterError when a required scoring weight is absent', () => {
      const incompleteStandard: WorkshopStandard = {
        ...completeStandard,
        parameters: completeStandard.parameters.filter((p) => p.key !== 'scoring.weight.capacity'),
      };

      const accessor = new StandardAccessor(incompleteStandard);
      expect(() => {
        evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);
      }).toThrow(MissingStandardParameterError);
    });
  });

  describe('5. Provenance, Explanation, Determinism & Immutability', () => {
    it('includes rich provenance and structured explanation for every criterion', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);

      for (const criterion of result.criteria) {
        expect(criterion.provenance).toBeDefined();
        expect(criterion.provenance.standardVersionId).toBe('1.0-eval');
        expect(criterion.provenance.weightParamKey).toBeDefined();
        expect(criterion.explanation).toBeDefined();
        expect(criterion.explanation.length).toBeGreaterThan(10);
      }
    });

    it('produces 100% deterministic evaluation results across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const run1 = evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);
      const run2 = evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability on evaluation result and criteria', () => {
      const accessor = new StandardAccessor(completeStandard);
      const result = evaluateCandidateCriteria(sampleCandidate, accessor, criteriaConfigs);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.criteria)).toBe(true);
      expect(Object.isFrozen(result.hardViolations)).toBe(true);
      expect(Object.isFrozen(result.summary)).toBe(true);
      expect(Object.isFrozen(result.criteria[0])).toBe(true);

      expect(() => {
        (result.criteria as any).push({ criterionId: 'illegal' });
      }).toThrow();
    });
  });
});
