import { LayoutStrategyId, StrategyCandidate } from '../strategies/strategyTypes';
import { StandardAccessor, calculateNormalizedScore } from '../StandardAccessor';
import { TopologyProvenance } from '../topology/topologyTypes';
import { ScoringDirection } from '../types';

// ---------------------------------------------------------------------------
// 1. Scoring Direction & Provenance Contracts
// ---------------------------------------------------------------------------

// Single source of truth for direction is ScoringDirection from types.ts
export type { ScoringDirection };

// Backwards-compatible alias pointing to ScoringDirection
export type CriterionDirection = ScoringDirection;

export interface CriterionProvenance {
  readonly standardVersionId: string;
  readonly weightParamKey: string;
  readonly minParamKey?: string;
  readonly maxParamKey?: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// 2. Individual Criterion Evaluation Contract
// ---------------------------------------------------------------------------

export interface CriterionEvaluation {
  readonly criterionId: string;
  readonly name: string;
  readonly rawValue: number;
  readonly normalizedScore: number; // Consistent 0..100 scale
  readonly weight: number; // Strictly derived from StandardAccessor
  readonly direction: ScoringDirection;
  readonly weightedScore: number; // (normalizedScore * weight) / 100
  readonly explanation: string;
  readonly provenance: CriterionProvenance;
}

// ---------------------------------------------------------------------------
// 3. Evaluation Issues & Summary Contracts
// ---------------------------------------------------------------------------

export interface EvaluationIssue {
  readonly ruleId: string;
  readonly severity: 'HARD' | 'WARNING' | 'INFO';
  readonly isDisqualifying: boolean;
  readonly relatedObjectIds?: readonly string[];
  readonly reason: string;
  readonly provenance?: TopologyProvenance;
}

export interface EvaluationSummary {
  readonly totalCriteriaCount: number;
  readonly totalWeight: number;
  readonly totalWeightedScore: number;
  readonly finalScore: number; // Scaled 0..100
  readonly isEligible: boolean;
  readonly disqualificationReason?: string;
}

// ---------------------------------------------------------------------------
// 4. Overall Candidate Evaluation Result Contract
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  readonly candidateId: string;
  readonly strategyId: LayoutStrategyId;
  readonly isEligible: boolean; // Strictly false if any disqualifying hard violation exists
  readonly hardViolations: readonly EvaluationIssue[];
  readonly criteria: readonly CriterionEvaluation[];
  readonly totalScore: number; // Consistent 0..100 scale
  readonly summary: EvaluationSummary;
  readonly provenance: {
    readonly standardVersionId: string;
    readonly evaluatedAt: string;
  };
}

// ---------------------------------------------------------------------------
// 5. Strategy Evaluator Interface
// ---------------------------------------------------------------------------

export interface StrategyEvaluator {
  evaluate(candidate: StrategyCandidate, accessor: StandardAccessor): EvaluationResult;
}

// ---------------------------------------------------------------------------
// 6. Score Normalization Single Source of Truth Re-export
// ---------------------------------------------------------------------------

// Re-export single source of truth normalization function from StandardAccessor
export { calculateNormalizedScore };

// Backwards-compatible alias for calculateNormalizedScore
export const normalizeCriterionScore = calculateNormalizedScore;

// ---------------------------------------------------------------------------
// 7. Criterion Definition Configuration for Evaluators
// ---------------------------------------------------------------------------

export interface CriterionConfig {
  readonly criterionId: string;
  readonly name: string;
  readonly weightParamKey: string;
  readonly minParamKey: string;
  readonly maxParamKey: string;
  readonly direction: ScoringDirection;
  readonly calculateRawValue: (candidate: StrategyCandidate) => number;
  readonly formatExplanation: (rawValue: number, score: number, weight: number) => string;
}

/**
 * Evaluates a candidate across data-driven criteria configs.
 * Guarantees that:
 * - Weights and bounds come strictly from StandardAccessor.
 * - Disqualifying HARD violations render isEligible = false regardless of score.
 * - Score scale is consistently 0..100.
 * - Output is strictly immutable and 100% deterministic.
 */
export function evaluateCandidateCriteria(
  candidate: StrategyCandidate,
  accessor: StandardAccessor,
  criteriaConfigs: readonly CriterionConfig[]
): EvaluationResult {
  const standardVersionId = accessor.getStandardVersion();
  const evaluatedAt = '2026-09-02T00:00:00.000Z'; // Deterministic timestamp

  // 1. Check disqualifying hard violations
  const hardViolations: EvaluationIssue[] = candidate.rejections
    .filter((r) => r.isDisqualifying && r.severity === 'HARD')
    .map((r) =>
      Object.freeze({
        ruleId: r.ruleId,
        severity: r.severity,
        isDisqualifying: r.isDisqualifying,
        relatedObjectIds: r.relatedObjectIds ? Object.freeze([...r.relatedObjectIds]) : undefined,
        reason: r.reason,
        provenance: r.provenance,
      })
    );

  const isEligible = hardViolations.length === 0 && candidate.status !== 'DISQUALIFIED';

  // 2. Evaluate each criterion
  const criteria: CriterionEvaluation[] = [];
  let totalWeight = 0;
  let totalWeightedScore = 0;

  for (const config of criteriaConfigs) {
    // Look up weight and bounds from standard snapshot (throws MissingStandardParameterError if missing)
    const weight = accessor.getRequiredNumericValue(config.weightParamKey);
    const min = accessor.getRequiredNumericValue(config.minParamKey);
    const target = accessor.getRequiredNumericValue(config.maxParamKey);

    const rawValue = config.calculateRawValue(candidate);
    const normalizedScore = calculateNormalizedScore(rawValue, min, target, config.direction);
    const weightedScore = (normalizedScore * weight) / 100;

    totalWeight += weight;
    totalWeightedScore += weightedScore;

    const explanation = config.formatExplanation(rawValue, normalizedScore, weight);

    criteria.push(
      Object.freeze({
        criterionId: config.criterionId,
        name: config.name,
        rawValue,
        normalizedScore,
        weight,
        direction: config.direction,
        weightedScore,
        explanation,
        provenance: Object.freeze({
          standardVersionId,
          weightParamKey: config.weightParamKey,
          minParamKey: config.minParamKey,
          maxParamKey: config.maxParamKey,
          description: `Score derived from standard parameter keys [${config.weightParamKey}, ${config.minParamKey}, ${config.maxParamKey}]`,
        }),
      })
    );
  }

  // Calculate scaled final score (0..100)
  const finalScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;

  const disqualificationReason = !isEligible
    ? `Candidate disqualified due to ${hardViolations.length} hard constraint violation(s): ${hardViolations.map((v) => `[${v.ruleId}] ${v.reason}`).join('; ')}`
    : undefined;

  const summary: EvaluationSummary = Object.freeze({
    totalCriteriaCount: criteria.length,
    totalWeight,
    totalWeightedScore,
    finalScore,
    isEligible,
    disqualificationReason,
  });

  return Object.freeze({
    candidateId: candidate.id,
    strategyId: candidate.strategyId,
    isEligible,
    hardViolations: Object.freeze(hardViolations),
    criteria: Object.freeze(criteria),
    totalScore: finalScore,
    summary,
    provenance: Object.freeze({
      standardVersionId,
      evaluatedAt,
    }),
  });
}
