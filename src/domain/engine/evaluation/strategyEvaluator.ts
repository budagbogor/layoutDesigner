import { StrategyCandidate } from '../strategies/strategyTypes';
import { StandardAccessor, calculateNormalizedScore } from '../StandardAccessor';
import {
  StrategyEvaluator,
  EvaluationResult,
  CriterionEvaluation,
  EvaluationIssue,
  EvaluationSummary,
} from './evaluationTypes';
import { roundMillimeter } from '../../geometry/precision';

export class UnsupportedScoringCriterionError extends Error {
  public readonly code = 'UNSUPPORTED_SCORING_CRITERION';
  constructor(public readonly criterionKey: string, reason?: string) {
    super(
      `Scoring criterion '${criterionKey}' cannot be evaluated: ${
        reason ??
        'No deterministic metric extractor is supported for this criterion (classified as HARD_CONSTRAINT, DEPRECATED, or SCORING_GAP).'
      }`
    );
    this.name = 'UnsupportedScoringCriterionError';
  }
}

export interface RawMetricExtractionResult {
  readonly rawValue: number;
  readonly provenanceDescription: string;
}

/**
 * Concrete StrategyEvaluator implementation.
 *
 * Responsibilities:
 * - Evaluates only valid scoring metrics whose data foundation and engineering formulas are READY:
 *   1. capacity_throughput (evaluates usable service floor area per bay from buildingInterior)
 *   2. equipment_support (evaluates actual equipment-to-bay service match ratio)
 * - Explicitly rejects unready metrics / heuristics / gaps:
 *   - flow_continuity (SCORING_GAP: requires true geometric path topology & swept path verification)
 *   - maneuvers (SCORING_GAP: requires true geometric swept path turn radius analysis)
 *   - equipment_count (DIAGNOSTIC only: inventory count does not indicate layout quality)
 *   - rejections_count (DIAGNOSTIC / tiebreaker only: not a weighted quality score)
 *   - capacity, bay_count (HARD constraint: CAPACITY-BAYS-001)
 *   - vehicle_flow (DEPRECATED legacy proxy)
 *   - bottlenecks, aisle_congestion (SCORING_GAP)
 * - Zero assumptions, zero fallbacks: missing standard parameters throw MissingStandardParameterError.
 * - Single Source of Truth score normalization (calculateNormalizedScore).
 * - 100% deterministic and deeply immutable output.
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

      // Extract raw metric with provenance deterministically
      const extraction = this.extractRawMetricWithProvenance(candidate, criterionKey, accessor);
      const rawValue = extraction.rawValue;

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
            description: `${extraction.provenanceDescription} [Benchmarks: min=${benchmarkMin}, target=${benchmarkTarget}, weight=${weight}, direction=${direction}]`,
          }),
        })
      );
    }

    // 3. Compute scaled total score (0..100)
    const finalScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;

    const disqualificationReason = !isEligible
      ? `Candidate disqualified due to ${hardViolations.length} disqualifying hard violation(s)${
          isCandidateStatusDisqualified ? ' and DISQUALIFIED candidate status' : ''
        }: ${hardViolations.map((v) => `[${v.ruleId}] ${v.reason}`).join('; ')}`
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
   * Deterministically extracts raw numerical metric with engineering provenance.
   * Throws UnsupportedScoringCriterionError if criterion is not supported/ready.
   */
  public extractRawMetricWithProvenance(
    candidate: StrategyCandidate,
    criterionKey: string,
    accessor: StandardAccessor
  ): RawMetricExtractionResult {
    switch (criterionKey) {
      case 'capacity_throughput':
        return this.extractCapacityThroughput(candidate, accessor);

      case 'equipment_support':
        return this.extractEquipmentSupport(candidate, accessor);

      case 'flow_continuity':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Classified as SCORING_GAP: Evaluating true flow continuity requires actual CAD path topology graphs and door connectivity verification rather than heuristic requirement mapping.'
        );

      case 'maneuvers':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Classified as SCORING_GAP: Evaluating maneuvers requires swept-path turning geometry and clearance calculations rather than arrangement lookup heuristics.'
        );

      case 'equipment_count':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Classified as DIAGNOSTIC only: Equipment count is an inventory descriptor and does not indicate layout quality (more equipment does not equal higher quality layout). Use equipment_support for quality scoring.'
        );

      case 'rejections_count':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Classified as DIAGNOSTIC / tiebreaker only: Soft rejections count must not be evaluated as a weighted quality score.'
        );

      case 'capacity':
      case 'bay_count':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Capacity is classified as a HARD constraint (CAPACITY-BAYS-001) and does not score continuous layout quality.'
        );

      case 'vehicle_flow':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Deprecated legacy metric. Replaced by flow_continuity and maneuvers contracts.'
        );

      case 'bottlenecks':
      case 'aisle_congestion':
        throw new UnsupportedScoringCriterionError(
          criterionKey,
          'Classified as SCORING_GAP: Vehicle width standard parameter and aisle flow clearance calculation are required.'
        );

      default:
        throw new UnsupportedScoringCriterionError(criterionKey);
    }
  }

  /**
   * Diagnostic extractor for non-scoring candidate metrics (e.g. inventory counts, soft warnings).
   */
  public extractDiagnosticMetrics(candidate: StrategyCandidate): {
    readonly equipmentCount: number;
    readonly softRejectionsCount: number;
  } {
    return Object.freeze({
      equipmentCount: candidate.layout.objects.filter((o) => o.type === 'equipment').length,
      softRejectionsCount: candidate.rejections.filter((r) => r.severity !== 'HARD').length,
    });
  }

  /**
   * Legacy raw metric extractor helper for backwards compatibility.
   */
  public extractRawMetric(candidate: StrategyCandidate, criterionKey: string, accessor?: StandardAccessor): number {
    const dummyAccessor = accessor ?? new StandardAccessor({
      id: 'default',
      name: 'Default Standard',
      version: '1.0',
      status: 'published',
      parameters: [],
      rules: [],
    });
    return this.extractRawMetricWithProvenance(candidate, criterionKey, dummyAccessor).rawValue;
  }

  // -------------------------------------------------------------------------
  // Valid Scoring Metric 1: CAPACITY_THROUGHPUT (m² usable service floor per bay)
  // -------------------------------------------------------------------------
  private extractCapacityThroughput(
    candidate: StrategyCandidate,
    accessor: StandardAccessor
  ): RawMetricExtractionResult {
    // Check standard benchmarks exist (zero fallback)
    accessor.getRequiredNumericValue('scoring.capacity_throughput.benchmark_min');
    accessor.getRequiredNumericValue('scoring.capacity_throughput.benchmark_target');

    const bays = candidate.layout.objects.filter((o) => o.type === 'service_bay');
    if (bays.length === 0) {
      return {
        rawValue: 0,
        provenanceDescription: 'Capacity throughput: 0 m²/bay (0 service bays placed).',
      };
    }

    let interiorArea = candidate.spatialContext?.buildingInterior?.interiorArea;
    let wallThickness = candidate.spatialContext?.buildingInterior?.wallThickness;

    if (interiorArea === undefined || wallThickness === undefined) {
      wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
      const buildingObj = candidate.layout.objects.find((o) => o.type === 'building');
      if (buildingObj) {
        const intW = Math.max(0, buildingObj.geometry.width - 2 * wallThickness);
        const intL = Math.max(0, buildingObj.geometry.length - 2 * wallThickness);
        interiorArea = roundMillimeter(intW * intL);
      } else {
        interiorArea = 0;
      }
    }

    // Aisle area from aisle-main envelope
    const aisleEnv = candidate.envelopes.find((e) => e.sourceObjectId === 'aisle-main');
    const aisleArea = aisleEnv ? roundMillimeter(aisleEnv.geometry.width * aisleEnv.geometry.length) : 0;

    // Ancillary rooms area
    const ancillaryObjects = candidate.layout.objects.filter((o) => o.type === 'custom');
    const ancillaryArea = roundMillimeter(
      ancillaryObjects.reduce((sum, o) => sum + o.geometry.width * o.geometry.length, 0)
    );

    const usableServiceArea = Math.max(0, roundMillimeter(interiorArea - aisleArea - ancillaryArea));
    const throughputPerBay = roundMillimeter(usableServiceArea / bays.length);

    return {
      rawValue: throughputPerBay,
      provenanceDescription: `Service floor throughput: ${throughputPerBay} m²/bay (usableServiceArea: ${usableServiceArea} m², bays: ${bays.length}, interiorArea: ${interiorArea} m², aisleArea: ${aisleArea} m², ancillaryArea: ${ancillaryArea} m²).`,
    };
  }

  // -------------------------------------------------------------------------
  // Valid Scoring Metric 2: EQUIPMENT_SUPPORT (Equipment-to-service match ratio)
  // -------------------------------------------------------------------------
  private extractEquipmentSupport(
    candidate: StrategyCandidate,
    accessor: StandardAccessor
  ): RawMetricExtractionResult {
    // Check standard benchmarks exist (zero fallback)
    accessor.getRequiredNumericValue('scoring.equipment_support.benchmark_min');
    accessor.getRequiredNumericValue('scoring.equipment_support.benchmark_target');

    const bays = candidate.layout.objects.filter((o) => o.type === 'service_bay');
    if (bays.length === 0) {
      return {
        rawValue: 0.0,
        provenanceDescription: 'Equipment support: 0.0 (no service bays placed).',
      };
    }

    const equipmentList = candidate.layout.objects.filter((o) => o.type === 'equipment');

    // Check if candidate carries explicit equipment-to-bay association metadata
    const hasExplicitAssociation =
      equipmentList.some(
        (eq) => eq.metadata?.associatedBayId !== undefined || eq.metadata?.serviceType !== undefined
      ) || bays.some((b) => b.metadata?.serviceType !== undefined);

    if (!hasExplicitAssociation && equipmentList.length > 0) {
      throw new UnsupportedScoringCriterionError(
        'equipment_support',
        'Candidate equipment objects lack explicit bay association metadata (associatedBayId or serviceType). Marked as SCORING_GAP.'
      );
    }

    const supportedBaysCount = bays.filter((bay) =>
      equipmentList.some(
        (eq) =>
          eq.metadata?.associatedBayId === bay.id ||
          (eq.metadata?.serviceType !== undefined &&
            eq.metadata.serviceType === bay.metadata?.serviceType)
      )
    ).length;

    const supportRatio = roundMillimeter(supportedBaysCount / bays.length);

    return {
      rawValue: supportRatio,
      provenanceDescription: `Equipment support ratio: ${supportRatio} (${supportedBaysCount}/${bays.length} service bays supported with matching equipment).`,
    };
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
