import { LayoutEngineInput, ObjectEnvelope, CirculationRequirementType } from '../types';
import { LayoutTopology, TopologyProvenance } from '../topology/topologyTypes';
import { StandardAccessor } from '../StandardAccessor';
import { LayoutObject } from '../../models/project';
import { SpatialArrangementType } from '../generator/candidateGenerator';
import {
  overlapsEnvelope,
  containsEnvelope,
  distanceBetweenEnvelopes,
  isInsideBuilding,
  isWithinClearance,
} from '../spatial/spatialRelations';
import {
  calculateAisleEnvelope,
  calculateApproachEnvelope,
  isAisleWidthValid,
} from '../spatial/aisleCalculator';
import {
  isAccessConnected,
  validateApproachConnection,
  validateAccessPointConnection,
} from '../spatial/accessConnectivity';

// ---------------------------------------------------------------------------
// 1. Layout Strategy IDs
// ---------------------------------------------------------------------------

export type LayoutStrategyId = 'CAPACITY' | 'BALANCED' | 'PREMIUM_FLOW';

export const ALL_LAYOUT_STRATEGY_IDS: readonly LayoutStrategyId[] = Object.freeze([
  'CAPACITY',
  'BALANCED',
  'PREMIUM_FLOW',
]);

// ---------------------------------------------------------------------------
// 2. Spatial & Circulation Utilities Contract
// ---------------------------------------------------------------------------

export interface SpatialUtilities {
  readonly overlapsEnvelope: typeof overlapsEnvelope;
  readonly containsEnvelope: typeof containsEnvelope;
  readonly distanceBetweenEnvelopes: typeof distanceBetweenEnvelopes;
  readonly isInsideBuilding: typeof isInsideBuilding;
  readonly isWithinClearance: typeof isWithinClearance;
  readonly calculateAisleEnvelope: typeof calculateAisleEnvelope;
  readonly calculateApproachEnvelope: typeof calculateApproachEnvelope;
  readonly isAisleWidthValid: typeof isAisleWidthValid;
  readonly isAccessConnected: typeof isAccessConnected;
  readonly validateApproachConnection: typeof validateApproachConnection;
  readonly validateAccessPointConnection: typeof validateAccessPointConnection;
}

export const SPATIAL_UTILITIES: SpatialUtilities = Object.freeze({
  overlapsEnvelope,
  containsEnvelope,
  distanceBetweenEnvelopes,
  isInsideBuilding,
  isWithinClearance,
  calculateAisleEnvelope,
  calculateApproachEnvelope,
  isAisleWidthValid,
  isAccessConnected,
  validateApproachConnection,
  validateAccessPointConnection,
});

// ---------------------------------------------------------------------------
// 3. Strategy Context Contract
// ---------------------------------------------------------------------------

export interface StrategyContext {
  readonly input: Readonly<LayoutEngineInput>;
  readonly topology: Readonly<LayoutTopology>;
  readonly accessor: StandardAccessor;
  readonly utilities: Readonly<SpatialUtilities>;
}

/**
 * Creates a frozen, immutable StrategyContext.
 */
export function createStrategyContext(
  input: LayoutEngineInput,
  topology: LayoutTopology,
  accessor: StandardAccessor
): StrategyContext {
  return Object.freeze({
    input: Object.freeze({ ...input }),
    topology: Object.freeze(topology),
    accessor,
    utilities: SPATIAL_UTILITIES,
  });
}

// ---------------------------------------------------------------------------
// 4. Candidate Rejection Contract
// ---------------------------------------------------------------------------

export interface CandidateRejection {
  readonly ruleId: string;
  readonly severity: 'HARD' | 'WARNING' | 'INFO';
  readonly isDisqualifying: boolean;
  readonly relatedObjectIds?: readonly string[];
  readonly relatedNodeIds?: readonly string[];
  readonly reason: string;
  readonly provenance?: TopologyProvenance;
}

// ---------------------------------------------------------------------------
// 5. Strategy Candidate Contract
// ---------------------------------------------------------------------------

export type CandidateStatus = 'VALID' | 'DISQUALIFIED' | 'FEASIBLE_WITH_WARNINGS';

export interface BuildingInteriorGeometry {
  /** Gross outer width of the building in meters */
  readonly grossWidth: number;
  /** Gross outer length of the building in meters */
  readonly grossLength: number;
  /** Gross outer footprint area of the building in m² */
  readonly grossArea: number;
  /** Wall thickness applied from building.wall_thickness standard parameter */
  readonly wallThickness: number;
  /** Usable interior width (grossWidth - 2 * wallThickness) in meters */
  readonly interiorWidth: number;
  /** Usable interior length (grossLength - 2 * wallThickness) in meters */
  readonly interiorLength: number;
  /** Usable interior floor area (interiorWidth * interiorLength) in m² */
  readonly interiorArea: number;
  /** Exact engineering provenance for the computed interior geometry */
  readonly provenance: {
    readonly source: string;
    readonly wallThicknessParameterKey: string;
    readonly formula: string;
  };
}

export interface StrategyCandidateSpatialContext {
  /**
   * The physical spatial arrangement used to place service bays.
   * Needed by: flow_continuity, maneuvers scoring metrics.
   */
  readonly arrangement: SpatialArrangementType;

  /**
   * The circulation requirement from LayoutEngineInput.program.
   * Needed by: flow_continuity, maneuvers scoring metrics.
   */
  readonly circulationRequirement: CirculationRequirementType;

  /**
   * FASE 4.2C — GAP-003 closure.
   * Usable building interior geometry calculated deterministically.
   * Needed by: capacity_throughput scoring metric.
   */
  readonly buildingInterior?: BuildingInteriorGeometry;

  /** Provenance: where these values originate */
  readonly provenance: {
    readonly source: 'generator';
    readonly generatorName: string;
    readonly inputProgramField: 'circulationRequirement';
  };
}

export interface StrategyCandidate {
  readonly id: string; // Deterministic candidate ID e.g. "candidate-capacity-01"
  readonly strategyId: LayoutStrategyId;
  readonly name: string;
  readonly description: string;
  readonly topologyId: string;
  readonly layout: {
    readonly objects: readonly LayoutObject[];
  };
  readonly envelopes: readonly ObjectEnvelope[];
  readonly status: CandidateStatus;
  readonly rejections: readonly CandidateRejection[];
  readonly provenance: {
    readonly standardVersionId: string;
    readonly generatorName: string;
    readonly generatedAt: string;
  };
  readonly explanation: {
    readonly strategyRationale: string;
    readonly layoutSummary: string;
    readonly tradeOffs: string;
  };

  /**
   * FASE 4.2C — GAP-001 closure.
   * Spatial context data required for flow and maneuver scoring metrics.
   * Carries arrangement and circulationRequirement from the generator.
   */
  readonly spatialContext: StrategyCandidateSpatialContext;
}

// ---------------------------------------------------------------------------
// 6. Candidate Generation Result & Generator Interface
// ---------------------------------------------------------------------------

export interface CandidateGenerationResult {
  readonly strategyId: LayoutStrategyId;
  readonly candidate: StrategyCandidate | null;
  readonly success: boolean;
  readonly errors: readonly string[];
}

export interface StrategyGenerator {
  readonly strategyId: LayoutStrategyId;
  readonly name: string;
  readonly description: string;
  generate(context: StrategyContext): CandidateGenerationResult;
}

// ---------------------------------------------------------------------------
// 7. Deterministic Candidate ID Helper
// ---------------------------------------------------------------------------

export function generateDeterministicCandidateId(
  strategyId: LayoutStrategyId,
  sequenceIndex: number = 1
): string {
  const pad = String(sequenceIndex).padStart(2, '0');
  const normalizedStrategy = strategyId.toLowerCase().replace(/_/g, '-');
  return `candidate-${normalizedStrategy}-${pad}`;
}
