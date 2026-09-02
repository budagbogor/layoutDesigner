import { StrategyCandidate } from '../strategies/strategyTypes';
import { StandardAccessor, calculateNormalizedScore } from '../StandardAccessor';
import {
  StrategyEvaluator,
  EvaluationResult,
  CriterionEvaluation,
  EvaluationIssue,
  EvaluationSummary,
} from './evaluationTypes';

export class UnsupportedScoringCriterionError extends Error {
  constructor(public readonly criterionKey: string) {
    super(
      `Scoring criterion '${criterionKey}' from standard snapshot has no deterministic metric extractor defined for StrategyCandidate.`
    );
    this.name = 'UnsupportedScoringCriterionError';
  }
}

/**
 * Concrete StrategyEvaluator implementation.
 *
 * Responsibilities:
 * - Extracts scoring criteria strictly from StandardAccessor.getScoringCriteria().
 * - Uses ScoringDirection as SSOT.
 * - Extracts weights and benchmarks strictly from Standard Snapshot without hardcoded defaults.
 * - Calculates deterministic raw metrics from candidate layout and envelopes.
 * - Uses calculateNormalizedScore() SSOT on consistent 0..100 scale.
 * - Disqualifying HARD violations strictly set isEligible = false regardless of totalScore.
 * - Outputs 100% deterministic and deeply immutable EvaluationResult.
 */
export class ConcreteStrategyEvaluator implements StrategyEvaluator {
  public evaluate(candidate: StrategyCandidate, accessor: StandardAccessor): EvaluationResult {
    const standardVersionId = accessor.getStandardVersion();
    const evaluatedAt = '2026-09-02T00:00:00.000Z'; // Deterministic evaluation timestamp

    // 1. Gather all disqualifying HARD violations from candidate rejections and status
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

    const isCandidateStatusDisqualified = candidate.status === 'DISQUALIFIED';
    const isEligible = hardViolations.length === 0 && !isCandidateStatusDisqualified;

    // 2. Fetch data-driven scoring criteria configs from standard snapshot
    const scoringConfigs = accessor.getScoringCriteria();

    const criteriaEvaluations: CriterionEvaluation[] = [];
    let totalWeight = 0;
    let totalWeightedScore = 0;

    for (const config of scoringConfigs) {
      const { criterionKey, weight, direction, benchmarkMin, benchmarkTarget } = config;

      // Extract raw metric deterministically based on criterion key
      const rawValue = this.extractRawMetric(candidate, criterionKey);

      // Normalize score on 0..100 scale using SSOT function
      const normalizedScore = calculateNormalizedScore(
        rawValue,
        benchmarkMin,
        benchmarkTarget,
        direction
      );

      // Weighted score contribution: (normalizedScore * weight) / 100
      const weightedScore = (normalizedScore * weight) / 100;

      totalWeight += weight;
      totalWeightedScore += weightedScore;

      const explanation = this.formatCriterionExplanation({
        criterionKey,
        rawValue,
        normalizedScore,
        weight,
        direction,
        benchmarkMin,
        benchmarkTarget,
      });

      criteriaEvaluations.push(
        Object.freeze({
          criterionId: criterionKey,
          name: this.formatCriterionDisplayName(criterionKey),
          rawValue,
          normalizedScore,
          weight,
          direction,
          weightedScore,
          explanation,
          provenance: Object.freeze({
            standardVersionId,
            weightParamKey: `scoring.${criterionKey}.weight`,
            minParamKey: `scoring.${criterionKey}.benchmark_min`,
            maxParamKey: `scoring.${criterionKey}.benchmark_target`,
            description: `Evaluated using standard snapshot benchmarks [min=${benchmarkMin}, target=${benchmarkTarget}, weight=${weight}, direction=${direction}]`,
          }),
        })
      );
    }

    // 3. Compute scaled total score (0..100)
    const finalScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;

    const disqualificationReason = !isEligible
      ? `Candidate disqualified due to ${hardViolations.length} disqualifying hard violation(s)${isCandidateStatusDisqualified ? ' and DISQUALIFIED candidate status' : ''}: ${hardViolations.map((v) => `[${v.ruleId}] ${v.reason}`).join('; ')}`
      : undefined;

    const summary: EvaluationSummary = Object.freeze({
      totalCriteriaCount: criteriaEvaluations.length,
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
      criteria: Object.freeze(criteriaEvaluations),
      totalScore: finalScore,
      summary,
      provenance: Object.freeze({
        standardVersionId,
        evaluatedAt,
      }),
    });
  }

  /**
   * Deterministically extracts raw numerical metric for a criterion key.
   * Throws UnsupportedScoringCriterionError if a criterion cannot be extracted deterministically.
   */
  private extractRawMetric(candidate: StrategyCandidate, criterionKey: string): number {
    switch (criterionKey) {
      case 'capacity':
      case 'bay_count':
      case 'capacity_throughput': {
        // Count of successfully placed service bays
        return candidate.layout.objects.filter((o) => o.type === 'service_bay').length;
      }

      case 'equipment_count':
      case 'equipment_support': {
        // Count of stationary equipment units
        return candidate.layout.objects.filter((o) => o.type === 'equipment').length;
      }

      case 'vehicle_flow':
      case 'flow_continuity':
      case 'maneuvers': {
        // Circulation flow metric: count of access corridors reaching drive aisle
        const accessEnvelopes = candidate.envelopes.filter((e) => e.type === 'ACCESS');
        return accessEnvelopes.length;
      }

      case 'bottlenecks':
      case 'aisle_congestion':
      case 'rejections_count': {
        // Rejection / warning index (LOWER_IS_BETTER): count of reported issues
        return candidate.rejections.length;
      }

      default:
        throw new UnsupportedScoringCriterionError(criterionKey);
    }
  }

  private formatCriterionDisplayName(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private formatCriterionExplanation(params: {
    criterionKey: string;
    rawValue: number;
    normalizedScore: number;
    weight: number;
    direction: string;
    benchmarkMin: number;
    benchmarkTarget: number;
  }): string {
    return `Metric '${params.criterionKey}' raw value = ${params.rawValue} evaluated against [worst=${params.benchmarkMin}, target=${params.benchmarkTarget}] in ${params.direction} direction, yielding normalized score ${params.normalizedScore}/100 with weight ${params.weight}.`;
  }
}
