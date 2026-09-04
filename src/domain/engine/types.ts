import { WorkshopProject, Geometry } from '../models/project';
import { ValidationReport, ValidationIssue } from '../validation/types';

// ---------------------------------------------------------------------------
// Engine Input Contracts
// ---------------------------------------------------------------------------

export type AccessPointType = 'entrance' | 'exit' | 'bidirectional' | 'pedestrian';
export type WallOrientation = 'north' | 'south' | 'east' | 'west';

export interface AccessPoint {
  id: string;
  type: AccessPointType;
  wall: WallOrientation;
  offsetMeters: number;     // Distance in meters along wall from wall start
  widthMeters: number;      // Clear opening width in meters
}

export interface ProgramBayRequirement {
  serviceType: string;      // e.g., "general_service", "tire", "quick_lube"
  quantity: number;
  requiredEquipment?: string[];
}

export interface ProgramEquipmentRequirement {
  equipmentType: string;    // e.g., "2_post_lift", "tire_changer", "compressor"
  quantity: number;
}

export type CirculationRequirementType = 'drive_through' | 'back_out_turnaround' | 'one_way_loop';

export interface ProgramAncillarySpacesRequirement {
  customerLounge?: boolean;
  cashierOffice?: boolean;
  partsWarehouse?: boolean;
  restroom?: boolean;
  compressorRoom?: boolean;
  oilWasteStorage?: boolean;
  staffRoom?: boolean;
  loungeWithBayView?: boolean;
}

export interface SiteParkingRequirement {
  customerParkingSpaces?: number;
  staffParkingSpaces?: number;
  vehicleStagingSpaces?: number;
}

export interface WorkshopProgram {
  bays: ProgramBayRequirement[];
  equipment: ProgramEquipmentRequirement[];
  vehicleClassKey: string;  // e.g., "vehicle.mpv", "vehicle.suv"
  circulationRequirement: CirculationRequirementType;
  customerZoneRequired: boolean;
  ancillarySpaces?: ProgramAncillarySpacesRequirement;
  futureExpansionBays: number;
}

export type CandidateStrategyType = 'CAPACITY' | 'BALANCED' | 'PREMIUM_FLOW';

export interface LayoutEngineInput {
  site: {
    width: number;           // meters, > 0
    length: number;          // meters, > 0
    roadSide?: WallOrientation;
    roadWidth?: number;      // meters
    parking?: SiteParkingRequirement;
  };
  building: {
    width: number;           // meters, > 0
    length: number;          // meters, > 0
    frontSetbackMeters?: number; // meters from front road boundary, >= 0
  };
  accessPoints?: AccessPoint[];
  program: WorkshopProgram;
  strategies?: CandidateStrategyType[];
}

// ---------------------------------------------------------------------------
// Multi-Envelope Contracts
// ---------------------------------------------------------------------------

export type EnvelopeType = 'PHYSICAL' | 'WORKING' | 'ACCESS' | 'SAFETY';

export interface EnvelopeProvenance {
  parameterKey: string;
  appliedValue: number;
  unit: string;
}

export interface EnvelopeViolationSemantics {
  forbiddenOverlapTypes: EnvelopeType[];
  severityOnOverlap: 'HARD' | 'WARNING' | 'INFO';
  allowOverlapWithParent: boolean;
}

export interface ObjectEnvelope {
  id: string;
  type: EnvelopeType;
  sourceObjectId: string;
  derivedFromStandard: EnvelopeProvenance;
  geometry: Geometry;
  purpose: string;
  violationSemantics: EnvelopeViolationSemantics;
}

// ---------------------------------------------------------------------------
// Generic Data-Driven Scoring Contracts
// ---------------------------------------------------------------------------

export type ScoringDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';

export interface ScoringCriterionConfig {
  criterionKey: string;
  weight: number;
  direction: ScoringDirection;
  benchmarkMin: number;
  benchmarkTarget: number;
  curveType?: 'linear' | 'step';
}

export interface CriterionScore {
  criterionKey: string;
  rawMetricValue: number;
  normalizedScore: number;  // 0..100
  weight: number;
  weightedScore: number;
  direction: ScoringDirection;
}

export interface ScoreBreakdown {
  criteria: Record<string, CriterionScore>;
  totalWeightedScore: number;
  totalWeight: number;
  finalScore: number;       // 0..100
}

// ---------------------------------------------------------------------------
// Feasibility & Topology Contracts
// ---------------------------------------------------------------------------

export interface FeasibilityReport {
  isFeasible: boolean;
  maxTheoreticallyPossibleBays: number;
  requestedBays: number;
  criticalDeficits: string[];
  accessPointValidation: {
    hasDedicatedEntrance: boolean;
    hasDedicatedExit: boolean;
    hasBidirectionalAccess: boolean;
    meetsDriveThroughRequirements: boolean;
    deficits: string[];
  };
}

export interface TopologyDescription {
  strategy: CandidateStrategyType;
  circulationSpine: {
    orientation: 'horizontal' | 'vertical';
    widthMeters: number;
    aislePolygon: Geometry;
  };
  zones: {
    id: string;
    type: 'service' | 'technical' | 'customer' | 'expansion' | 'circulation';
    geometry: Geometry;
  }[];
}

export interface LayoutMetrics {
  totalBaysAchieved: number;
  targetBaysRequested: number;
  capacityAchievementRate: number; // percentage
  totalBuildingAreaSqM: number;
  usableServiceAreaSqM: number;
  spaceEfficiencyRate: number;     // percentage
  driveAisleWidthMeters: number;
  averageInterBayClearanceMeters: number;
  flowType: CirculationRequirementType;
}

export interface CandidateComparison {
  candidateId: string;
  strategy: CandidateStrategyType;
  strengths: string[];
  weaknesses: string[];
  tradeoffs: string;
}

export interface DisqualificationAudit {
  candidateId: string;
  strategy: CandidateStrategyType;
  primaryDisqualifier: string;
  hardViolations: ValidationIssue[];
}

export interface EngineExplainability {
  recommendationRationale: string;
  candidateComparisons: CandidateComparison[];
  disqualificationAudits: DisqualificationAudit[];
}

export interface LayoutCandidate {
  id: string;
  strategy: CandidateStrategyType;
  name: string;
  topology: TopologyDescription;
  project: WorkshopProject;
  envelopes: ObjectEnvelope[];
  metrics: LayoutMetrics;
  validationReport: ValidationReport;
  status: 'VALID' | 'DISQUALIFIED';
  scoreBreakdown: ScoreBreakdown;
  totalScore: number; // 0..100 (0 if DISQUALIFIED)
}
