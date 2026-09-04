// ---------------------------------------------------------------------------
// FASE 4.1 — Layout Generation Orchestrator Types
//
// Core contracts and types for deterministic workshop layout orchestration.
// Preserves: strategy, arrangement, validity, rejection reason, score,
// score breakdown, provenance, and attempted arrangements for all candidates.
// ---------------------------------------------------------------------------

import { LayoutEngineInput, ObjectEnvelope } from '../types';
import { LayoutStrategyId, CandidateStatus, CandidateRejection, StrategyCandidate } from '../strategies/strategyTypes';
import { SpatialArrangementType, GeneratedCandidateLayout } from '../generator/candidateGenerator';
import { EvaluationResult } from '../evaluation/evaluationTypes';

/**
 * An individual candidate layout produced and evaluated during orchestration.
 * Retains complete engineering audit trail, scoring, and spatial provenance.
 */
export interface OrchestratedCandidate {
  /** Deterministic identifier e.g. "candidate-balanced-01" */
  readonly candidateId: string;

  /** Architectural layout strategy used to guide placement */
  readonly strategy: LayoutStrategyId;

  /** Physical spatial arrangement (single comb, double comb opposing, zoned) */
  readonly arrangement: SpatialArrangementType;

  /** Validation status: 'VALID' | 'FEASIBLE_WITH_WARNINGS' | 'DISQUALIFIED' */
  readonly validity: CandidateStatus;

  /** True if candidate passes all HARD constraints and is eligible for scoring */
  readonly isValid: boolean;

  /** Structured human-readable list of rejection reasons if disqualified */
  readonly rejectionReasons: readonly string[];

  /** Formal HARD constraint violations */
  readonly hardViolations: readonly CandidateRejection[];

  /** Non-disqualifying soft warnings */
  readonly warnings: readonly CandidateRejection[];

  /** Normalized total score (0..100) from StrategyEvaluator. null if DISQUALIFIED */
  readonly score: number | null;

  /** Detailed criterion-by-criterion evaluation breakdown */
  readonly scoreBreakdown: EvaluationResult | null;

  /** Engineering and system provenance metadata */
  readonly provenance: {
    readonly standardVersionId: string;
    readonly generatorName: string;
    readonly orchestratorName: string;
    readonly executedAt: string;
    readonly strategy: LayoutStrategyId;
    readonly arrangement: SpatialArrangementType;
  };

  /** Complete list of spatial arrangements attempted in this exploration run */
  readonly attemptedArrangements: readonly SpatialArrangementType[];

  /** Underlying CAD layout including placed objects, envelopes, and topology */
  readonly layout: GeneratedCandidateLayout;
}

/**
 * Structured engineering summary of the orchestration run.
 */
export interface OrchestratorEngineeringSummary {
  readonly totalStrategiesExplored: number;
  readonly totalArrangementsExplored: number;
  readonly totalCandidatesGenerated: number;
  readonly validCandidateCount: number;
  readonly disqualifiedCandidateCount: number;
  readonly primaryDisqualificationReason?: string;
  readonly disqualificationBreakdown?: Readonly<Record<string, number>>;
}

/**
 * Primary deterministic output of the Layout Generation Orchestrator.
 */
export interface LayoutEngineResult {
  /** Overall orchestration result: 'SUCCESS' if >= 1 valid candidate, else 'DISQUALIFIED' */
  readonly status: 'SUCCESS' | 'DISQUALIFIED';

  /** Top-ranked valid candidate selected by deterministic scoring and ranking */
  readonly bestCandidate: OrchestratedCandidate | null;

  /** Ranked alternative valid candidates (excluding bestCandidate) */
  readonly alternativeCandidates: readonly OrchestratedCandidate[];

  /** All generated candidates across all explored strategies and arrangements */
  readonly allCandidates: readonly OrchestratedCandidate[];

  /** Disqualified candidates with structured failure reasons */
  readonly disqualifiedCandidates: readonly OrchestratedCandidate[];

  /** Architectural and engineering diagnostics */
  readonly engineeringSummary: OrchestratorEngineeringSummary;

  /** Provenance of the orchestration process */
  readonly provenance: {
    readonly standardVersionId: string;
    readonly orchestratorName: string;
    readonly executedAt: string;
  };
}

/**
 * Configuration options for the Layout Orchestrator.
 */
export interface LayoutOrchestratorOptions {
  /**
   * Explicit strategies to run.
   * If omitted, runs all supported strategies ('CAPACITY', 'BALANCED', 'PREMIUM_FLOW').
   */
  readonly strategies?: readonly LayoutStrategyId[];

  /**
   * Explicit spatial arrangements to explore.
   * If omitted, explores all supported arrangements ('SINGLE_COMB_NORTH', 'DOUBLE_COMB_OPPOSING', 'ZONED_BY_SERVICE').
   */
  readonly arrangements?: readonly SpatialArrangementType[];
}

/**
 * Deeply freezes an object, its sub-objects, and its arrays to guarantee immutability.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Converts a GeneratedCandidateLayout into a StrategyCandidate contract for evaluation.
 */
export function toStrategyCandidate(candidate: GeneratedCandidateLayout): StrategyCandidate {
  return Object.freeze({
    id: candidate.candidateId,
    strategyId: candidate.strategy,
    name: `${candidate.strategy} (${candidate.arrangement})`,
    description: `Generated layout candidate utilizing ${candidate.strategy} strategy with ${candidate.arrangement} arrangement.`,
    topologyId: candidate.topology.id,
    layout: Object.freeze({
      objects: candidate.objects,
    }),
    envelopes: candidate.envelopes,
    status: candidate.status,
    rejections: candidate.rejections,
    provenance: Object.freeze({
      standardVersionId: candidate.provenance.standardVersionId,
      generatorName: candidate.provenance.generatorName,
      generatedAt: candidate.provenance.generatedAt,
    }),
    explanation: Object.freeze({
      strategyRationale: `Strategy: ${candidate.strategy}`,
      layoutSummary: `${candidate.metadata.totalBaysPlaced}/${candidate.metadata.totalBaysRequested} bays placed with ${candidate.arrangement}.`,
      tradeOffs: `Arrangement ${candidate.arrangement} evaluated against site boundary, central drive aisle, and access clearance.`,
    }),
  });
}
