// ---------------------------------------------------------------------------
// FASE 4.2B — Scoring Metric Contract (SSOT)
//
// Defines the canonical contract for every scoring metric used by the
// ConcreteStrategyEvaluator. This file is the Single Source of Truth for:
//   - Metric classification (HARD, SCORING, DIAGNOSTIC, or SCORING_GAP)
//   - Four-layer separation:
//       RAW GEOMETRY DATA → RAW METRIC → NORMALIZATION → WEIGHTED SCORE
//   - Geometry data requirements and availability status
//   - Standard parameter requirements (no fallbacks permitted)
//   - Semantic validity: can this metric differentiate equal-bay-count candidates?
//
// DIRECTIVES:
//   - No metric may use rejections.length as a proxy for congestion/bottleneck
//   - No metric may use ACCESS envelope count as a proxy for vehicle flow
//   - No metric may use service_bay count as a scoring metric when CAPACITY-BAYS-001 is active
//   - No fallback benchmark values (0 / 100) — missing params → MissingStandardParameterError
//   - All metrics must be deterministic (same input → same output, always)
// ---------------------------------------------------------------------------

import type { ScoringDirection } from '../types';

// ---------------------------------------------------------------------------
// Layer 1: Raw Geometry Data Descriptor
// Describes WHAT data is needed and WHETHER it is currently available.
// ---------------------------------------------------------------------------

export type GeometryDataSource =
  | 'candidate.envelopes'           // from StrategyCandidate.envelopes
  | 'candidate.layout.objects'      // from StrategyCandidate.layout.objects
  | 'candidate.rejections'          // from StrategyCandidate.rejections
  | 'orchestrated.arrangement'      // from OrchestratedCandidate.arrangement
  | 'input.program'                 // from LayoutEngineInput.program (NEEDS PASS-THROUGH)
  | 'standard';                     // from StandardAccessor parameter

export type GeometryDataAvailability =
  | 'AVAILABLE'           // already present and extractable from StrategyCandidate
  | 'GEOMETRY_GAP'        // data exists somewhere but not yet propagated to StrategyCandidate
  | 'STANDARD_GAP';       // requires a standard parameter that does not yet exist

export interface GeometryDataDescriptor {
  /** Human-readable label of the data needed */
  readonly label: string;

  /** Where this data originates */
  readonly source: GeometryDataSource;

  /** How to access this data, expressed as a path or description */
  readonly accessPath: string;

  /** Whether this data is currently extractable */
  readonly availability: GeometryDataAvailability;

  /** If GEOMETRY_GAP or STANDARD_GAP, what is missing */
  readonly gapDescription?: string;
}

// ---------------------------------------------------------------------------
// Layer 2: Raw Metric Definition
// The computation that transforms raw geometry data into a single number.
// ---------------------------------------------------------------------------

export interface RawMetricDefinition {
  /** Mathematical formula expressed in plain language */
  readonly formula: string;

  /** Physical or dimensionless unit of the raw metric */
  readonly unit: string;

  /**
   * True if ALL required geometry data is AVAILABLE and the formula can be
   * computed deterministically from a StrategyCandidate today.
   * False if any required data is GEOMETRY_GAP or STANDARD_GAP.
   */
  readonly isImplementableNow: boolean;

  /** What makes this NOT implementable (if applicable) */
  readonly implementationBlocker?: string;

  /** All geometry data inputs required for this raw metric */
  readonly geometryDataRequired: readonly GeometryDataDescriptor[];

  /** Standard parameter keys that must exist (no fallback) */
  readonly standardParametersRequired: readonly string[];
}

// ---------------------------------------------------------------------------
// Layer 3: Normalization Configuration
// Maps a raw metric value onto a 0..100 score.
// No fallback benchmarks. Every key MUST exist in StandardSnapshot.
// ---------------------------------------------------------------------------

export interface NormalizationConfig {
  /** Optimization direction */
  readonly direction: ScoringDirection;

  /**
   * Standard parameter key for the worst-case benchmark value.
   * MUST exist in standard snapshot. MissingStandardParameterError if absent.
   * For LOWER_IS_BETTER: this is the maximum (worst) tolerated value.
   * For HIGHER_IS_BETTER: this is the minimum (worst) acceptable value.
   */
  readonly benchmarkWorstParamKey: string;

  /**
   * Standard parameter key for the target benchmark value.
   * MUST exist in standard snapshot. MissingStandardParameterError if absent.
   * For HIGHER_IS_BETTER: this is the ideal maximum.
   * For LOWER_IS_BETTER: this is the ideal minimum (0 = perfect).
   */
  readonly benchmarkTargetParamKey: string;

  /** Unit of the benchmark values (must match rawMetric.unit) */
  readonly unit: string;

  /** Normalization curve type */
  readonly curveType: 'linear' | 'step';
}

// ---------------------------------------------------------------------------
// Metric Classification
// ---------------------------------------------------------------------------

export type MetricClassification =
  | 'HARD_CONSTRAINT'       // Already enforced as a HARD rejection. Not a scoring metric.
  | 'SCORING_METRIC'        // Valid scoring metric. isImplementableNow must be true.
  | 'DIAGNOSTIC_TIEBREAKER' // Informational/tiebreaker only. Not a primary quality score.
  | 'SCORING_GAP';          // Contract defined but geometry data not yet available.

// ---------------------------------------------------------------------------
// Layer 0 + Contract: ScoringMetricContract (SSOT definition per metric)
// ---------------------------------------------------------------------------

export interface ScoringMetricContract {
  /**
   * Canonical key used in StandardSnapshot scoring array and parameter keys.
   * e.g. 'aisle_clearance_ratio'
   */
  readonly key: string;

  /** Human-readable display name */
  readonly name: string;

  /** Full description of what this metric measures */
  readonly description: string;

  /** Classification — determines how this metric is used */
  readonly classification: MetricClassification;

  /**
   * Rationale for this classification.
   * Must explain WHY it is a HARD_CONSTRAINT, SCORING_METRIC, DIAGNOSTIC, or GAP.
   */
  readonly classificationRationale: string;

  /**
   * True if this metric can produce DIFFERENT scores for two candidates
   * that have the same number of service bays.
   * If false, this metric cannot meaningfully rank valid candidates.
   */
  readonly canDifferentiateEqualBayCount: boolean;

  /**
   * True if the same LayoutEngineInput always produces the same metric value.
   * Must be true for all active scoring metrics.
   */
  readonly isDeterministic: boolean;

  /**
   * Plain-language explanation suitable for display to the end user (architect/owner).
   * Must be written without engineering jargon.
   */
  readonly userExplanation: string;

  /** Layer 2: Raw metric definition */
  readonly rawMetric: RawMetricDefinition;

  /**
   * Layer 3: Normalization config.
   * Required for SCORING_METRIC and DIAGNOSTIC_TIEBREAKER.
   * Undefined for HARD_CONSTRAINT.
   */
  readonly normalization?: NormalizationConfig;

  /**
   * Old criterion keys that this contract supersedes or replaces.
   * Used for migration tracking.
   */
  readonly deprecates?: readonly string[];

  /**
   * Standard parameters that must be added to the StandardSnapshot
   * before this metric can be activated.
   */
  readonly standardParameterGaps?: readonly string[];
}

// ---------------------------------------------------------------------------
// The SSOT Scoring Metric Catalog
// Contains the authoritative contract for every metric key.
// ---------------------------------------------------------------------------

export const SCORING_METRIC_CATALOG: readonly ScoringMetricContract[] = Object.freeze([

  // =========================================================================
  // 1. capacity
  //    Decision: HARD_CONSTRAINT — Reclassified from scoring to constraint.
  //    Already enforced by CAPACITY-BAYS-001. All VALID candidates satisfy
  //    the requested bay count by definition. Scoring on this creates a
  //    flat metric (all VALID candidates score identically).
  // =========================================================================
  {
    key: 'capacity',
    name: 'Service Bay Capacity',
    description: 'Whether the layout contains all requested service bays.',
    classification: 'HARD_CONSTRAINT',
    classificationRationale:
      'HARD constraint CAPACITY-BAYS-001 already disqualifies any candidate that ' +
      'places fewer bays than requested. By the time a candidate reaches the scorer, ' +
      'bayCount === requested is an invariant. Scoring on this metric produces identical ' +
      'values for all VALID candidates and cannot differentiate quality.',
    canDifferentiateEqualBayCount: false,
    isDeterministic: true,
    userExplanation: 'This layout includes all the service bays you requested. This is a pass/fail requirement, not a quality ranking.',
    rawMetric: {
      formula: 'COUNT(layout.objects WHERE type = "service_bay")',
      unit: 'bays',
      isImplementableNow: true,
      geometryDataRequired: [
        {
          label: 'Placed service bay objects',
          source: 'candidate.layout.objects',
          accessPath: 'candidate.layout.objects.filter(o => o.type === "service_bay").length',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: [],
    },
  },

  // =========================================================================
  // 2. bay_count
  //    Decision: DEPRECATED — Exact duplicate of 'capacity'. Same proxy, same
  //    data source, same value. Double-counting risk. Remove entirely.
  // =========================================================================
  {
    key: 'bay_count',
    name: 'Bay Count (Deprecated)',
    description: 'Count of placed service bays. Deprecated: identical to capacity.',
    classification: 'HARD_CONSTRAINT',
    classificationRationale:
      'Identical implementation to "capacity". Both use the same raw metric ' +
      '(service_bay object count). Activating both in scoring double-counts the ' +
      'same constraint-enforced value. Deprecated in favor of "capacity" HARD classification.',
    canDifferentiateEqualBayCount: false,
    isDeterministic: true,
    userExplanation: 'Duplicate of the service bay capacity check. Not used in scoring.',
    rawMetric: {
      formula: 'COUNT(layout.objects WHERE type = "service_bay") — same as capacity',
      unit: 'bays',
      isImplementableNow: true,
      geometryDataRequired: [],
      standardParametersRequired: [],
    },
    deprecates: ['capacity'],
  },

  // =========================================================================
  // 3. capacity_throughput
  //    Decision: SCORING_GAP
  //    True throughput requires service area net m² per bay type and
  //    service cycle factors — data not yet in GeneratedCandidateLayout.
  // =========================================================================
  {
    key: 'capacity_throughput',
    name: 'Service Throughput Ratio',
    description:
      'Ratio of net usable service floor area to total bay count, normalized by vehicle class footprint. ' +
      'Higher = each bay has more working room, enabling faster cycle times.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'True throughput cannot be derived from bay count alone. It requires net usable ' +
      'floor area per bay (after subtracting aisle, clearances, and walls). This geometry ' +
      'is not yet computed and stored in GeneratedCandidateLayout.metadata.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'How efficiently the workshop uses its floor space. A layout where each bay has more ' +
      'room scores higher because technicians can work faster with less congestion.',
    rawMetric: {
      formula:
        '(buildingInteriorArea - aisleArea - ancillaryRoomsArea - wallArea) / totalBaysPlaced',
      unit: 'm² per bay',
      isImplementableNow: false,
      implementationBlocker:
        'GeneratedCandidateLayout.metadata does not yet include buildingInteriorArea, ' +
        'aisleArea, or ancillaryRoomsArea as computed values. These can be derived from ' +
        'existing envelope geometry but require a dedicated computation step in the generator.',
      geometryDataRequired: [
        {
          label: 'Building interior area (w - 2×wallThickness) × (l - 2×wallThickness)',
          source: 'candidate.layout.objects',
          accessPath: 'Derived from building dimensions and wall_thickness standard param',
          availability: 'GEOMETRY_GAP',
          gapDescription: 'Not stored in GeneratedCandidateLayout.metadata. Must be computed in generator Stage 10.',
        },
        {
          label: 'Aisle area from aisle-main envelope',
          source: 'candidate.envelopes',
          accessPath: 'envelopes[sourceObjectId="aisle-main"].geometry.width × .length',
          availability: 'AVAILABLE',
        },
        {
          label: 'Ancillary room total area from custom-type object geometries',
          source: 'candidate.layout.objects',
          accessPath: 'objects.filter(type="custom").reduce(area)',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: ['building.wall_thickness'],
    },
    standardParameterGaps: [],
  },

  // =========================================================================
  // 4. equipment_count  (conditional)
  //    Decision: SCORING_GAP (conditional — only valid when program.equipment ≠ [])
  //    Requires guard: if no equipment in program, skip entirely.
  // =========================================================================
  {
    key: 'equipment_count',
    name: 'Equipment Allocation Count',
    description:
      'Number of equipment items placed in the layout. Only meaningful when the ' +
      'program requests specific equipment.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'This metric is only valid when program.equipment is non-empty. When equipment ' +
      'is not requested, all candidates score 0 — flat metric, no differentiation. ' +
      'Additionally, count alone does not validate suitability (see equipment_support). ' +
      'Requires activation guard in evaluator.',
    canDifferentiateEqualBayCount: false,
    isDeterministic: true,
    userExplanation: 'Whether the layout includes all the tools and equipment you requested.',
    rawMetric: {
      formula: 'COUNT(layout.objects WHERE type = "equipment")',
      unit: 'units',
      isImplementableNow: true,
      geometryDataRequired: [
        {
          label: 'Placed equipment objects',
          source: 'candidate.layout.objects',
          accessPath: 'objects.filter(o => o.type === "equipment").length',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: [],
    },
  },

  // =========================================================================
  // 5. equipment_support
  //    Decision: SCORING_GAP
  //    Requires cross-reference: equipment.metadata.equipmentType vs
  //    bay.metadata.serviceType. Type-matching logic not implemented.
  // =========================================================================
  {
    key: 'equipment_support',
    name: 'Equipment-to-Service Match Ratio',
    description:
      'Proportion of service bays that have at least one equipment item ' +
      'whose type matches the required service type. Measures HOW WELL equipment ' +
      'supports the actual service program.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'Equipment suitability cannot be determined by count alone. Requires checking ' +
      'whether equipment.metadata.equipmentType matches the serviceType of adjacent or ' +
      'associated service bays. This cross-reference is not yet implemented in the generator.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'Whether the tools in the workshop match the type of work being done. ' +
      'A tire service bay without a tire changer scores lower than one that has it.',
    rawMetric: {
      formula:
        'COUNT(bays WHERE has_matching_equipment) / COUNT(bays WHERE equipment_required)',
      unit: 'ratio (0..1)',
      isImplementableNow: false,
      implementationBlocker:
        'No cross-reference mapping between equipment.metadata.equipmentType and ' +
        'bay.metadata.serviceType exists in the generator or candidate structure. ' +
        'The ProgramBayRequirement.requiredEquipment field exists in LayoutEngineInput ' +
        'but is not propagated to placed bay object metadata.',
      geometryDataRequired: [
        {
          label: 'Service bay service types from object metadata',
          source: 'candidate.layout.objects',
          accessPath: 'objects.filter(type="service_bay").map(o => o.metadata.serviceType)',
          availability: 'AVAILABLE',
        },
        {
          label: 'Equipment types from object metadata',
          source: 'candidate.layout.objects',
          accessPath: 'objects.filter(type="equipment").map(o => o.metadata.equipmentType)',
          availability: 'AVAILABLE',
        },
        {
          label: 'Required equipment per bay type from program',
          source: 'input.program',
          accessPath: 'program.bays[*].requiredEquipment',
          availability: 'GEOMETRY_GAP',
          gapDescription:
            'ProgramBayRequirement.requiredEquipment is available in LayoutEngineInput.program.bays ' +
            'but is not currently embedded in placed bay object metadata. Needs propagation in Stage 5 of generator.',
        },
      ],
      standardParametersRequired: [],
    },
    standardParameterGaps: [],
  },

  // =========================================================================
  // 6. vehicle_flow  →  Redesigned as: AISLE CLEARANCE RATIO
  //    OLD proxy: ACCESS envelope count (INVALID)
  //    NEW: actual aisle margin above minimum required width
  //    Can differentiate same-bay-count layouts: YES
  //    (effectiveAisleWidth varies by arrangement and building dimensions)
  // =========================================================================
  {
    key: 'vehicle_flow',
    name: 'Aisle Clearance Ratio',
    description:
      'Ratio of actual drive aisle width above the minimum required width. ' +
      'Higher = more room for vehicles to maneuver freely in the main circulation corridor.',
    classification: 'SCORING_METRIC',
    classificationRationale:
      'The actual aisle width (effectiveAisleWidth) is already computed in the generator ' +
      'and stored in the aisle-main envelope geometry. It differs between SINGLE_COMB and ' +
      'DOUBLE_COMB arrangements for the same building because DOUBLE_COMB uses the full ' +
      'gap between north and south bay rows as aisle. This metric CAN differentiate ' +
      'candidates with equal bay count.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'How much extra room vehicles have in the main workshop corridor. ' +
      'More clearance means vehicles can move more freely and safely.',
    rawMetric: {
      formula:
        '(aisleMainEnvelope.geometry.width - standard.circulation.drive_aisle.min_width) ' +
        '/ standard.circulation.drive_aisle.min_width',
      unit: 'ratio (dimensionless)',
      isImplementableNow: true,
      geometryDataRequired: [
        {
          label: 'Actual aisle width from aisle-main ACCESS envelope',
          source: 'candidate.envelopes',
          accessPath: 'envelopes.find(e => e.sourceObjectId === "aisle-main").geometry.width',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: ['circulation.drive_aisle.min_width'],
    },
    normalization: {
      direction: 'HIGHER_IS_BETTER',
      benchmarkWorstParamKey: 'scoring.vehicle_flow.benchmark_worst',
      benchmarkTargetParamKey: 'scoring.vehicle_flow.benchmark_target',
      unit: 'ratio',
      curveType: 'linear',
    },
    deprecates: [],
  },

  // =========================================================================
  // 7. flow_continuity  →  Redesigned as: CIRCULATION CONTINUITY SCORE
  //    OLD proxy: ACCESS envelope count (INVALID)
  //    NEW: drive-through path completeness using circulationRequirement + arrangement
  //    Data gap: circulationRequirement and arrangement not on StrategyCandidate
  // =========================================================================
  {
    key: 'flow_continuity',
    name: 'Circulation Continuity',
    description:
      'Whether the layout provides a complete, uninterrupted vehicle path from entry ' +
      'to exit without requiring vehicles to back out. ' +
      'Drive-through = 1.0, one-way-loop = 0.75, back-out = 0.0.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'The geometric data needed (circulationRequirement from LayoutEngineInput.program and ' +
      'arrangement type from OrchestratedCandidate) is not currently part of StrategyCandidate. ' +
      'It exists in the orchestration layer (OrchestratedCandidate.arrangement) but the evaluator ' +
      'only receives StrategyCandidate. Requires pass-through of circulationRequirement and ' +
      'arrangement to scoring context.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'Whether vehicles can drive straight through the workshop without having to ' +
      'reverse or turn around. Drive-through layouts are safer and faster.',
    rawMetric: {
      formula:
        'IF circulationRequirement == "drive_through" AND arrangement == "DOUBLE_COMB_OPPOSING": 1.0 ' +
        'ELIF circulationRequirement == "one_way_loop": 0.75 ' +
        'ELIF circulationRequirement == "back_out_turnaround": 0.0 ' +
        'ELSE: 0.5',
      unit: 'score (0..1)',
      isImplementableNow: false,
      implementationBlocker:
        'circulationRequirement (from input.program) and arrangement type are not part of ' +
        'StrategyCandidate. They are available in OrchestratedCandidate.arrangement and ' +
        'LayoutEngineInput.program.circulationRequirement. Requires ScoringContext to pass ' +
        'these values alongside StrategyCandidate to the evaluator.',
      geometryDataRequired: [
        {
          label: 'Circulation requirement type',
          source: 'input.program',
          accessPath: 'input.program.circulationRequirement',
          availability: 'GEOMETRY_GAP',
          gapDescription:
            'Not in StrategyCandidate. Available in LayoutEngineInput.program.circulationRequirement. ' +
            'Must be added to scoring context or embedded in candidate metadata.',
        },
        {
          label: 'Spatial arrangement type',
          source: 'orchestrated.arrangement',
          accessPath: 'OrchestratedCandidate.arrangement',
          availability: 'GEOMETRY_GAP',
          gapDescription:
            'Only available in OrchestratedCandidate, not in StrategyCandidate passed to evaluator.',
        },
      ],
      standardParametersRequired: [],
    },
    standardParameterGaps: [
      'scoring.flow_continuity.benchmark_worst',
      'scoring.flow_continuity.benchmark_target',
    ],
  },

  // =========================================================================
  // 8. maneuvers  →  Redesigned as: MANEUVER COMPLEXITY INDEX
  //    OLD proxy: ACCESS envelope count (INVALID)
  //    NEW: arrangement + circulation type → maneuvers per bay
  //    Same GEOMETRY_GAP as flow_continuity.
  // =========================================================================
  {
    key: 'maneuvers',
    name: 'Maneuver Complexity Index',
    description:
      'Average number of reversing or turning maneuvers required per service bay access. ' +
      'Lower = simpler vehicle flow. Drive-through double-comb = 0, single-comb back-out = 1 per bay.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'Same geometry gap as flow_continuity: arrangement type and circulationRequirement ' +
      'are not in StrategyCandidate. Once passed through scoring context, this is implementable.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'How many times a vehicle needs to reverse when entering or leaving a service bay. ' +
      'Fewer maneuvers = faster, safer service flow.',
    rawMetric: {
      formula:
        'IF arrangement == "DOUBLE_COMB_OPPOSING" AND circulationRequirement == "drive_through": 0 ' +
        'ELIF arrangement == "ZONED_BY_SERVICE" AND circulationRequirement == "drive_through": 0.5 ' +
        'ELIF arrangement == "SINGLE_COMB_NORTH" OR circulationRequirement == "back_out_turnaround": 1',
      unit: 'maneuvers per bay (0..1+)',
      isImplementableNow: false,
      implementationBlocker: 'Same as flow_continuity — arrangement and circulationRequirement not in StrategyCandidate.',
      geometryDataRequired: [
        {
          label: 'Spatial arrangement type',
          source: 'orchestrated.arrangement',
          accessPath: 'OrchestratedCandidate.arrangement',
          availability: 'GEOMETRY_GAP',
          gapDescription: 'Not in StrategyCandidate. Must be passed through scoring context.',
        },
        {
          label: 'Circulation requirement',
          source: 'input.program',
          accessPath: 'input.program.circulationRequirement',
          availability: 'GEOMETRY_GAP',
          gapDescription: 'Not in StrategyCandidate. Must be passed through scoring context.',
        },
      ],
      standardParametersRequired: [],
    },
    standardParameterGaps: [
      'scoring.maneuvers.benchmark_worst',
      'scoring.maneuvers.benchmark_target',
    ],
  },

  // =========================================================================
  // 9. bottlenecks  →  Redesigned as: AISLE PASSING CLEARANCE RATIO
  //    OLD proxy: rejections.length (INVALID)
  //    NEW: ratio of aisle width to minimum passing width for two vehicles
  //    Measures whether two vehicles can pass side-by-side in the main aisle.
  // =========================================================================
  {
    key: 'bottlenecks',
    name: 'Aisle Passing Clearance Ratio',
    description:
      'Ratio of actual aisle width to the minimum width required for two vehicles ' +
      'to pass simultaneously. Ratio ≥ 1.0 = no bottleneck. Ratio < 1.0 = vehicles must ' +
      'wait for each other.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'Aisle width is already available from aisle-main envelope. However, the vehicle ' +
      'width parameter (needed to compute 2 × vehicle.width + safety_clearance) must ' +
      'come from the standard snapshot via vehicleClassKey. Standard params like ' +
      '"vehicle.sedan.width" or "vehicle.mpv.width" do not yet exist in the standard.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'Whether two cars can pass each other in the main workshop aisle at the same time. ' +
      'A wider aisle means smoother traffic flow and no congestion.',
    rawMetric: {
      formula:
        'aisleMainEnvelope.geometry.width / (2 × vehicle.width + clearance.safety_buffer × 2)',
      unit: 'ratio (dimensionless)',
      isImplementableNow: false,
      implementationBlocker:
        'Vehicle width standard parameter is missing. The standard snapshot does not yet ' +
        'contain "vehicle.{class}.width" parameters. vehicleClassKey is in input.program ' +
        'but corresponding dimension parameters do not exist.',
      geometryDataRequired: [
        {
          label: 'Actual aisle width from aisle-main envelope',
          source: 'candidate.envelopes',
          accessPath: 'envelopes.find(e => e.sourceObjectId === "aisle-main").geometry.width',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: [
        'clearance.safety_buffer',
        // vehicle.{class}.width — STANDARD_GAP
      ],
    },
    standardParameterGaps: [
      'vehicle.sedan.width',
      'vehicle.mpv.width',
      'vehicle.suv.width',
      'scoring.bottlenecks.benchmark_worst',
      'scoring.bottlenecks.benchmark_target',
    ],
  },

  // =========================================================================
  // 10. aisle_congestion  →  Redesigned as: AISLE CAPACITY UTILIZATION
  //    OLD proxy: rejections.length (INVALID)
  //    NEW: ratio of aisle width to single-vehicle clearance
  //    Simpler than bottlenecks — focuses on per-vehicle headroom, not passing
  //    Same standard gap for vehicle width.
  // =========================================================================
  {
    key: 'aisle_congestion',
    name: 'Aisle Capacity Utilization',
    description:
      'Ratio of available aisle width per vehicle. Measures per-vehicle headroom ' +
      'in the main drive aisle. Higher = more per-vehicle clearance, lower congestion risk.',
    classification: 'SCORING_GAP',
    classificationRationale:
      'Same vehicle width standard gap as bottlenecks. The aisle geometry is available ' +
      'but vehicle width standard parameter is missing. These two metrics (bottlenecks + ' +
      'aisle_congestion) can likely be merged into a single metric once vehicle width data ' +
      'is available.',
    canDifferentiateEqualBayCount: true,
    isDeterministic: true,
    userExplanation:
      'How much room each vehicle has when moving through the workshop corridor. ' +
      'More room = less congestion, faster service.',
    rawMetric: {
      formula:
        '(aisleMainEnvelope.geometry.width - vehicle.width) / vehicle.width',
      unit: 'ratio (dimensionless)',
      isImplementableNow: false,
      implementationBlocker: 'Same as bottlenecks — vehicle.{class}.width standard parameter missing.',
      geometryDataRequired: [
        {
          label: 'Actual aisle width from aisle-main envelope',
          source: 'candidate.envelopes',
          accessPath: 'envelopes.find(e => e.sourceObjectId === "aisle-main").geometry.width',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: [],
    },
    standardParameterGaps: [
      'vehicle.sedan.width',
      'vehicle.mpv.width',
      'vehicle.suv.width',
      'scoring.aisle_congestion.benchmark_worst',
      'scoring.aisle_congestion.benchmark_target',
    ],
  },

  // =========================================================================
  // 11. rejections_count
  //    Decision: DIAGNOSTIC_TIEBREAKER
  //    Not a quality score — it is a count of soft warnings, which for VALID
  //    candidates is 0 or very low. Retains informational value as a tiebreaker.
  // =========================================================================
  {
    key: 'rejections_count',
    name: 'Soft Warning Count',
    description:
      'Count of soft warnings (non-disqualifying issues) in the candidate. ' +
      'Used as a last-resort tiebreaker only. Not a primary quality dimension.',
    classification: 'DIAGNOSTIC_TIEBREAKER',
    classificationRationale:
      'For VALID candidates that have passed all HARD constraints, this value is 0 or ' +
      'very low. It cannot meaningfully differentiate layout quality — a wider aisle with ' +
      '2 soft warnings is better than a narrower aisle with 0. Should only act as a final ' +
      'tiebreaker with minimal weight (≤ 5) when all other metrics are equal.',
    canDifferentiateEqualBayCount: false,
    isDeterministic: true,
    userExplanation:
      'A count of minor design notes for this layout. Lower is slightly better, but this ' +
      'should not determine overall layout quality on its own.',
    rawMetric: {
      formula: 'COUNT(candidate.rejections WHERE severity != "HARD")',
      unit: 'warnings',
      isImplementableNow: true,
      geometryDataRequired: [
        {
          label: 'Non-disqualifying rejections',
          source: 'candidate.rejections',
          accessPath: 'candidate.rejections.filter(r => r.severity !== "HARD").length',
          availability: 'AVAILABLE',
        },
      ],
      standardParametersRequired: [],
    },
    normalization: {
      direction: 'LOWER_IS_BETTER',
      benchmarkWorstParamKey: 'scoring.rejections_count.benchmark_worst',
      benchmarkTargetParamKey: 'scoring.rejections_count.benchmark_target',
      unit: 'warnings',
      curveType: 'linear',
    },
  },
]);

// ---------------------------------------------------------------------------
// Catalog Access Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ScoringMetricContract for a given criterion key.
 * Returns undefined if the key is not in the catalog.
 */
export function getMetricContract(key: string): ScoringMetricContract | undefined {
  return SCORING_METRIC_CATALOG.find((m) => m.key === key);
}

/**
 * Returns all metrics with the given classification.
 */
export function getMetricsByClassification(
  classification: MetricClassification
): readonly ScoringMetricContract[] {
  return SCORING_METRIC_CATALOG.filter((m) => m.classification === classification);
}

/**
 * Returns only metrics that are immediately implementable and classified
 * as SCORING_METRIC — safe to activate in the ConcreteStrategyEvaluator.
 */
export function getActivatableScoringMetrics(): readonly ScoringMetricContract[] {
  return SCORING_METRIC_CATALOG.filter(
    (m) =>
      m.classification === 'SCORING_METRIC' &&
      m.rawMetric.isImplementableNow
  );
}

/**
 * Returns all geometry and standard parameter gaps across all metrics.
 */
export function getAllScoringGaps(): {
  readonly metricKey: string;
  readonly geometryGaps: readonly GeometryDataDescriptor[];
  readonly standardParameterGaps: readonly string[];
} [] {
  return SCORING_METRIC_CATALOG.filter(
    (m) => m.classification === 'SCORING_GAP'
  ).map((m) => ({
    metricKey: m.key,
    geometryGaps: m.rawMetric.geometryDataRequired.filter(
      (d) => d.availability !== 'AVAILABLE'
    ),
    standardParameterGaps: m.standardParameterGaps ?? [],
  }));
}
