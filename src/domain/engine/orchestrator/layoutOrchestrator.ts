// ---------------------------------------------------------------------------
// FASE 4.1 — Layout Generation Orchestrator
//
// Primary orchestration entry point for deterministic workshop layout generation.
//
// Complete Architectural Pipeline:
//   WorkshopLayoutRequirement
//   → RequirementMapper
//   → LayoutEngineInput
//   → Strategy Exploration (CAPACITY, BALANCED, PREMIUM_FLOW)
//   → Spatial Arrangement Exploration (SINGLE_COMB_NORTH, DOUBLE_COMB_OPPOSING, ZONED_BY_SERVICE)
//   → Strict 15-Point HARD Constraint Validation
//   → Strategy Evaluation (Scoring & Normalization via Standard Snapshot)
//   → Deterministic Candidate Ranking
//   → LayoutEngineResult (Deeply Immutable & Fully Explainable)
// ---------------------------------------------------------------------------

import { LayoutEngineInput } from '../types';
import { StandardAccessor } from '../StandardAccessor';
import {
  LayoutStrategyId,
  ALL_LAYOUT_STRATEGY_IDS,
  CandidateStatus,
} from '../strategies/strategyTypes';
import {
  CandidateGenerator,
  SpatialArrangementType,
  ALL_SPATIAL_ARRANGEMENTS,
} from '../generator/candidateGenerator';
import { ConcreteStrategyEvaluator } from '../evaluation/strategyEvaluator';
import { StrategyEvaluator, EvaluationResult } from '../evaluation/evaluationTypes';
import {
  LayoutEngineResult,
  OrchestratedCandidate,
  LayoutOrchestratorOptions,
  deepFreeze,
  toStrategyCandidate,
} from './orchestratorTypes';
import { WorkshopLayoutRequirement } from '../../requirements/requirementTypes';
import { RequirementMapper } from '../../../application/requirements/requirementMapper';

/**
 * Deterministic Layout Generation Orchestrator.
 *
 * Directives & Guardrails:
 * - Zero geometry created inside the orchestrator (delegated to CandidateGenerator).
 * - Zero fallback dimensions (strictly enforced by StandardAccessor).
 * - Zero Math.random() or non-deterministic IDs.
 * - Strict HARD constraint enforcement (disqualified candidates never become bestCandidate).
 * - No silent bay reductions or clearance alterations.
 * - All outputs are 100% deterministic and deeply immutable.
 */
export class LayoutOrchestrator {
  private readonly candidateGenerator: CandidateGenerator;
  private readonly strategyEvaluator: StrategyEvaluator;

  constructor(
    candidateGenerator?: CandidateGenerator,
    strategyEvaluator?: StrategyEvaluator
  ) {
    this.candidateGenerator = candidateGenerator ?? new CandidateGenerator();
    this.strategyEvaluator = strategyEvaluator ?? new ConcreteStrategyEvaluator();
  }

  /**
   * Primary entry point: Generates, validates, evaluates, and ranks workshop layout candidates
   * from a LayoutEngineInput.
   */
  public generateLayout(
    input: LayoutEngineInput,
    accessor: StandardAccessor,
    options?: LayoutOrchestratorOptions
  ): LayoutEngineResult {
    const executedAt = '2026-09-04T00:00:00.000Z'; // Deterministic timestamp
    const standardVersionId = accessor.getStandardVersion();

    // 1. Resolve strategies requested or allowed
    const targetStrategies: readonly LayoutStrategyId[] =
      options?.strategies && options.strategies.length > 0
        ? options.strategies
        : input.strategies && input.strategies.length > 0
          ? (input.strategies as readonly LayoutStrategyId[])
          : ALL_LAYOUT_STRATEGY_IDS;

    // 2. Resolve spatial arrangements to explore
    const targetArrangements: readonly SpatialArrangementType[] =
      options?.arrangements && options.arrangements.length > 0
        ? options.arrangements
        : ALL_SPATIAL_ARRANGEMENTS;

    const allCandidates: OrchestratedCandidate[] = [];
    const validCandidates: OrchestratedCandidate[] = [];
    const disqualifiedCandidates: OrchestratedCandidate[] = [];
    const disqualificationBreakdown: Record<string, number> = {};

    // 3. Systematically generate candidates for every strategy and arrangement
    for (let stratIdx = 0; stratIdx < targetStrategies.length; stratIdx++) {
      const strategy = targetStrategies[stratIdx];

      for (let arrIdx = 0; arrIdx < targetArrangements.length; arrIdx++) {
        const arrangement = targetArrangements[arrIdx];
        const sequenceIndex = arrIdx + 1;

        // Generate candidate without creating geometry or modifying input
        const layoutCandidate = this.candidateGenerator.generateArrangement(
          input,
          accessor,
          strategy,
          arrangement,
          targetArrangements,
          sequenceIndex
        );

        let score: number | null = null;
        let scoreBreakdown: EvaluationResult | null = null;
        let validity: CandidateStatus = layoutCandidate.status;
        let isValid =
          layoutCandidate.validation.isValid && layoutCandidate.status !== 'DISQUALIFIED';

        // 4. Strategy Evaluation for VALID candidates
        if (isValid) {
          try {
            const strategyCandidate = toStrategyCandidate(layoutCandidate);
            const evalResult = this.strategyEvaluator.evaluate(strategyCandidate, accessor);
            score = evalResult.totalScore;
            scoreBreakdown = evalResult;

            if (!evalResult.isEligible) {
              validity = 'DISQUALIFIED';
              isValid = false;
            }
          } catch {
            // If evaluation throws due to an unconfigured scoring criterion,
            // candidate retains structural validity without numeric score.
            score = null;
            scoreBreakdown = null;
          }
        }

        // 5. Gather structured rejection reasons
        const rejectionReasons: string[] = [
          ...layoutCandidate.rejections.map((r) => `[${r.ruleId}] ${r.reason}`),
        ];

        if (
          scoreBreakdown &&
          !scoreBreakdown.isEligible &&
          scoreBreakdown.summary.disqualificationReason
        ) {
          if (!rejectionReasons.includes(scoreBreakdown.summary.disqualificationReason)) {
            rejectionReasons.push(scoreBreakdown.summary.disqualificationReason);
          }
        }

        // Track disqualification tally for explainability
        if (!isValid) {
          for (const rej of layoutCandidate.rejections) {
            disqualificationBreakdown[rej.ruleId] =
              (disqualificationBreakdown[rej.ruleId] ?? 0) + 1;
          }
        }

        const orchestrated: OrchestratedCandidate = Object.freeze({
          candidateId: layoutCandidate.candidateId,
          strategy,
          arrangement,
          validity,
          isValid,
          rejectionReasons: Object.freeze(rejectionReasons),
          hardViolations: Object.freeze(
            layoutCandidate.rejections.filter((r) => r.severity === 'HARD')
          ),
          warnings: Object.freeze([...layoutCandidate.warnings]),
          score,
          scoreBreakdown,
          provenance: Object.freeze({
            standardVersionId,
            generatorName: layoutCandidate.provenance.generatorName,
            orchestratorName: 'LayoutOrchestrator',
            executedAt,
            strategy,
            arrangement,
          }),
          attemptedArrangements: Object.freeze([...targetArrangements]),
          layout: layoutCandidate,
        });

        allCandidates.push(orchestrated);

        if (isValid && validity !== 'DISQUALIFIED') {
          validCandidates.push(orchestrated);
        } else {
          disqualifiedCandidates.push(orchestrated);
        }
      }
    }

    // 6. Deterministic Candidate Ranking
    const rankedCandidates = this.rankCandidates(validCandidates);

    // 7. Select best candidate and alternatives
    const bestCandidate = rankedCandidates.length > 0 ? rankedCandidates[0] : null;
    const alternativeCandidates = rankedCandidates.length > 1 ? rankedCandidates.slice(1) : [];
    const status: 'SUCCESS' | 'DISQUALIFIED' =
      bestCandidate !== null ? 'SUCCESS' : 'DISQUALIFIED';

    // 8. Explainable Engineering Diagnostics
    let primaryDisqualificationReason: string | undefined = undefined;
    if (status === 'DISQUALIFIED') {
      if (disqualifiedCandidates.length > 0) {
        const topViolationKey = Object.keys(disqualificationBreakdown).sort(
          (a, b) => disqualificationBreakdown[b] - disqualificationBreakdown[a]
        )[0];
        const sampleReason =
          disqualifiedCandidates.find((c) =>
            c.rejectionReasons.some((r) => r.includes(topViolationKey))
          )?.rejectionReasons[0] ?? disqualifiedCandidates[0].rejectionReasons[0];

        primaryDisqualificationReason = `All ${allCandidates.length} candidate layout(s) across ${targetStrategies.length} strategy(ies) and ${targetArrangements.length} arrangement(s) were disqualified by HARD constraints. Primary bottleneck: ${sampleReason}`;
      } else {
        primaryDisqualificationReason =
          'No candidate layouts could be explored for the requested parameters.';
      }
    }

    const result: LayoutEngineResult = {
      status,
      bestCandidate,
      alternativeCandidates: Object.freeze(alternativeCandidates),
      allCandidates: Object.freeze(allCandidates),
      disqualifiedCandidates: Object.freeze(disqualifiedCandidates),
      engineeringSummary: Object.freeze({
        totalStrategiesExplored: targetStrategies.length,
        totalArrangementsExplored: targetArrangements.length,
        totalCandidatesGenerated: allCandidates.length,
        validCandidateCount: validCandidates.length,
        disqualifiedCandidateCount: disqualifiedCandidates.length,
        primaryDisqualificationReason,
        disqualificationBreakdown: Object.freeze({ ...disqualificationBreakdown }),
      }),
      provenance: Object.freeze({
        standardVersionId,
        orchestratorName: 'LayoutOrchestrator',
        executedAt,
      }),
    };

    return deepFreeze(result);
  }

  /**
   * End-to-end convenience entry point:
   * Maps WorkshopLayoutRequirement via RequirementMapper to LayoutEngineInput,
   * then executes the full layout orchestration pipeline.
   */
  public generateFromRequirement(
    requirement: WorkshopLayoutRequirement,
    accessor: StandardAccessor,
    options?: LayoutOrchestratorOptions
  ): LayoutEngineResult {
    const executedAt = '2026-09-04T00:00:00.000Z';
    const standardVersionId = accessor.getStandardVersion();

    const mapper = new RequirementMapper();
    const mappingResult = mapper.map(requirement, accessor);

    if (!mappingResult.success || !mappingResult.engineInput) {
      const mappingErrors = [
        ...mappingResult.engineInputGaps.map(
          (gap) => `[REQUIREMENT_GAP:${gap.field}] ${gap.reason}`
        ),
        ...mappingResult.warnings.map((warn) => `[REQUIREMENT_WARNING] ${warn}`),
      ];
      const primaryReason =
        mappingErrors.length > 0
          ? `Requirement mapping failed: ${mappingErrors.join('; ')}`
          : 'Requirement mapping failed to produce a valid LayoutEngineInput.';

      const failedResult: LayoutEngineResult = {
        status: 'DISQUALIFIED',
        bestCandidate: null,
        alternativeCandidates: Object.freeze([]),
        allCandidates: Object.freeze([]),
        disqualifiedCandidates: Object.freeze([]),
        engineeringSummary: Object.freeze({
          totalStrategiesExplored: 0,
          totalArrangementsExplored: 0,
          totalCandidatesGenerated: 0,
          validCandidateCount: 0,
          disqualifiedCandidateCount: 0,
          primaryDisqualificationReason: primaryReason,
        }),
        provenance: Object.freeze({
          standardVersionId,
          orchestratorName: 'LayoutOrchestrator',
          executedAt,
        }),
      };

      return deepFreeze(failedResult);
    }

    return this.generateLayout(mappingResult.engineInput, accessor, options);
  }

  /**
   * Pure deterministic sorting function for candidate ranking.
   *
   * Tie-breaker hierarchy:
   * 1. Total score descending.
   * 2. Total bays placed descending.
   * 3. Total ancillary spaces placed descending.
   * 4. Strategy priority (BALANCED > CAPACITY > PREMIUM_FLOW).
   * 5. Spatial arrangement priority (SINGLE_COMB_NORTH > DOUBLE_COMB_OPPOSING > ZONED_BY_SERVICE).
   * 6. Candidate ID lexicographical ascending.
   */
  private rankCandidates(candidates: readonly OrchestratedCandidate[]): OrchestratedCandidate[] {
    const strategyPriority: Record<LayoutStrategyId, number> = {
      BALANCED: 0,
      CAPACITY: 1,
      PREMIUM_FLOW: 2,
    };

    const arrangementPriority: Record<SpatialArrangementType, number> = {
      SINGLE_COMB_NORTH: 0,
      DOUBLE_COMB_OPPOSING: 1,
      ZONED_BY_SERVICE: 2,
    };

    return [...candidates].sort((a, b) => {
      // 1. Normalized Score descending
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // 2. Placed bay count descending
      const baysDiff = b.layout.metadata.totalBaysPlaced - a.layout.metadata.totalBaysPlaced;
      if (baysDiff !== 0) {
        return baysDiff;
      }

      // 3. Ancillary rooms placed descending
      const roomsDiff =
        b.layout.metadata.ancillarySpacesPlaced.length -
        a.layout.metadata.ancillarySpacesPlaced.length;
      if (roomsDiff !== 0) {
        return roomsDiff;
      }

      // 4. Strategy priority tie-breaker
      const stratDiff = (strategyPriority[a.strategy] ?? 99) - (strategyPriority[b.strategy] ?? 99);
      if (stratDiff !== 0) {
        return stratDiff;
      }

      // 5. Spatial arrangement priority tie-breaker
      const arrDiff =
        (arrangementPriority[a.arrangement] ?? 99) -
        (arrangementPriority[b.arrangement] ?? 99);
      if (arrDiff !== 0) {
        return arrDiff;
      }

      // 6. Absolute tie-breaker: candidateId
      return a.candidateId.localeCompare(b.candidateId);
    });
  }
}
