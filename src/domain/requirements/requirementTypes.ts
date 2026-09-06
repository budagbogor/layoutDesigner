// ---------------------------------------------------------------------------
// FASE 3.2 — Workshop Layout Requirement Semantic Boundary Model
//
// This contract is the bridge between AI natural language understanding and
// the deterministic Layout Engine. It captures the user's INTENT and BUSINESS
// NEEDS in semantic terms — never CAD coordinates, engineering clearances,
// envelope geometry, or internal standard parameter keys.
//
// The flow is:
//   User Prompt → AI Parser → WorkshopLayoutRequirement → RequirementMapper → LayoutEngineInput
//
// Rules:
//   - No X/Y coordinates, rotation degrees, or polygon vertices.
//   - No offsetMeters, wallThickness, clearanceBuffer, or envelope types.
//   - No vehicleClassKey internal keys (use human-readable VehicleCategory).
//   - No circulationRequirement enum (derived by mapper from access config).
//   - No StandardSnapshot parameters or engineering defaults.
//   - Optional fields represent genuinely unknown user input, not fallback values.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Workshop Identity & Business Intent
// ---------------------------------------------------------------------------

/** The type of workshop determines which standard snapshot to load. */
export type WorkshopType =
  | 'car_service'
  | 'motorcycle_service'
  | 'quick_lube'
  | 'tire_center'
  | 'body_paint'
  | 'fleet_maintenance';

/** Human-readable vehicle size category. Mapped to vehicleClassKey by RequirementMapper. */
export type VehicleCategory =
  | 'motorcycle'
  | 'city_car'
  | 'sedan'
  | 'mpv'
  | 'suv'
  | 'pickup_truck'
  | 'van'
  | 'light_truck';

/** Business priority that drives strategy selection. */
export type BusinessPriority =
  | 'MAXIMIZE_CAPACITY'
  | 'BALANCED_EFFICIENCY'
  | 'PREMIUM_EXPERIENCE';

// ---------------------------------------------------------------------------
// 2. Site & Building Dimensions (Semantic — No Coordinates)
// ---------------------------------------------------------------------------

/** Cardinal direction for road orientation and access semantics. */
export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export interface SiteRequirement {
  readonly widthMeters: number;
  readonly lengthMeters: number;
  readonly roadOrientation?: CardinalDirection;
}

export interface BuildingRequirement {
  readonly widthMeters: number;
  readonly lengthMeters: number;
  /** Distance from road-facing wall to site boundary — space for parking/maneuvering. */
  readonly frontSetbackMeters?: number;
}

// ---------------------------------------------------------------------------
// 3. Access Point Semantics (No offsetMeters or engineering widths)
// ---------------------------------------------------------------------------

/**
 * Semantic position along a wall. The RequirementMapper will compute exact
 * offset meters using building dimensions and standard door widths.
 */
export type SemanticWallPosition =
  | 'front_left'
  | 'front_center'
  | 'front_right'
  | 'rear_left'
  | 'rear_center'
  | 'rear_right'
  | 'left_side'
  | 'right_side';

export interface AccessRequirement {
  /** Where the main vehicle entrance is located. */
  readonly entryPosition: SemanticWallPosition;
  /** Optional separate exit. If provided, mapper may infer drive-through circulation. */
  readonly exitPosition?: SemanticWallPosition;
  /** Separate pedestrian entrance for customers (distinct from vehicle doors). */
  readonly pedestrianEntryPosition?: SemanticWallPosition;
  /** User's stated preference for drive-through flow. */
  readonly preferDriveThrough?: boolean;
}

// ---------------------------------------------------------------------------
// 4. Service Program (What the workshop offers)
// ---------------------------------------------------------------------------

/** Service types offered — human-readable, not internal keys. */
export type ServiceType =
  | 'general_service'
  | 'quick_lube'
  | 'service_rasa_mesin_baru'
  | 'general_repair'
  | 'tire_service'
  | 'wheel_alignment'
  | 'brake_suspension'
  | 'engine_overhaul'
  | 'ac_service'
  | 'body_repair'
  | 'paint'
  | 'inspection'
  | 'detailing'
  | 'electrical';

/** Lift / pit types — user-facing names. */
export type LiftType =
  | '2_post_lift'
  | '4_post_lift'
  | 'scissor_lift'
  | 'pit'
  | 'motorcycle_lift';

/**
 * Official MOBENG Canonical Bay Types (Exactly 3 canonical bay types).
 * Quick Lube, Rasa Mesin Baru, and Kaki-kaki are services/functions, NOT bay types.
 */
export type MobengBayType = 'SPOORING_BAY' | 'SERVICE_BAY' | 'GENERAL_REPAIR_BAY';

/**
 * Supported functions / services per MOBENG canonical bay type.
 */
export const MOBENG_BAY_SERVICES: Record<MobengBayType, readonly ServiceType[]> = Object.freeze({
  SPOORING_BAY: Object.freeze(['wheel_alignment' as ServiceType]),
  SERVICE_BAY: Object.freeze(['general_service' as ServiceType, 'quick_lube' as ServiceType, 'service_rasa_mesin_baru' as ServiceType]),
  GENERAL_REPAIR_BAY: Object.freeze(['general_repair' as ServiceType, 'brake_suspension' as ServiceType]),
});

/**
 * Standard lift equipment per MOBENG canonical bay type.
 */
export const MOBENG_BAY_DEFAULT_LIFTS: Record<MobengBayType, LiftType> = Object.freeze({
  SPOORING_BAY: '4_post_lift',
  SERVICE_BAY: '4_post_lift',
  GENERAL_REPAIR_BAY: '2_post_lift',
});

/**
 * Maps a service/function to its canonical MOBENG bay type.
 * Quick Lube & Service Rasa Mesin Baru map to SERVICE_BAY.
 * Kaki-kaki & General Repair map to GENERAL_REPAIR_BAY.
 * Spooring / Wheel Alignment maps to SPOORING_BAY.
 */
export function getCanonicalBayTypeForService(serviceType: ServiceType | string): MobengBayType {
  switch (serviceType) {
    case 'wheel_alignment':
    case 'SPOORING_BAY':
      return 'SPOORING_BAY';
    case 'general_repair':
    case 'brake_suspension':
    case 'GENERAL_REPAIR_BAY':
      return 'GENERAL_REPAIR_BAY';
    case 'general_service':
    case 'quick_lube':
    case 'service_rasa_mesin_baru':
    case 'SERVICE_BAY':
    default:
      return 'SERVICE_BAY';
  }
}

export interface ServiceProgramItem {
  readonly serviceType: ServiceType;
  readonly bayCount: number;
  readonly requiredLifts?: readonly LiftType[];
}

export interface BayProgramItem {
  readonly bayType: MobengBayType;
  readonly bayCount: number;
  readonly supportedServices?: readonly ServiceType[];
  readonly requiredLifts?: readonly LiftType[];
}

// ---------------------------------------------------------------------------
// 5. Ancillary Spaces (Non-Service Functional Areas)
// ---------------------------------------------------------------------------

export interface AncillarySpacesRequirement {
  readonly customerLounge: boolean;
  readonly cashierOffice: boolean;
  readonly partsWarehouse: boolean;
  readonly restroom: boolean;
  readonly compressorRoom?: boolean;
  readonly oilWasteStorage?: boolean;
  readonly staffRoom?: boolean;
  /** Customer lounge has glass wall with direct view into service bays. */
  readonly loungeWithBayView?: boolean;
}

// ---------------------------------------------------------------------------
// 6. Parking & Future Expansion
// ---------------------------------------------------------------------------

export interface ParkingRequirement {
  readonly customerParkingSpaces?: number;
  readonly staffParkingSpaces?: number;
  readonly vehicleStagingSpaces?: number;
}

// ---------------------------------------------------------------------------
// 7. The Complete Workshop Layout Requirement Contract
// ---------------------------------------------------------------------------

export interface WorkshopLayoutRequirement {
  // -- Identity & Business Intent --
  readonly projectName: string;
  readonly workshopType: WorkshopType;
  readonly vehicleCategory: VehicleCategory;
  readonly priority: BusinessPriority;

  // -- Physical Dimensions (Semantic) --
  readonly site: SiteRequirement;
  readonly building: BuildingRequirement;

  // -- Access Configuration (Semantic Positions) --
  readonly access: AccessRequirement;

  // -- Service Program --
  readonly services: readonly ServiceProgramItem[];
  readonly equipmentPreferences?: readonly string[];

  // -- Ancillary / Support Spaces --
  readonly ancillarySpaces: AncillarySpacesRequirement;

  // -- Parking --
  readonly parking?: ParkingRequirement;

  // -- Future Expansion --
  readonly futureExpansionBays?: number;

  // -- User's Original Input & Special Instructions --
  /** The raw natural language prompt from the user (preserved for auditability). */
  readonly rawUserPrompt?: string;
  /** Parsed special instructions (e.g., "toilet must not face customer entrance"). */
  readonly specialInstructions?: readonly string[];
}

// ---------------------------------------------------------------------------
// 8. Validation Helpers (Pure Functions — No Engineering Defaults)
// ---------------------------------------------------------------------------

export interface RequirementValidationResult {
  readonly isValid: boolean;
  readonly missingFields: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Validates that a WorkshopLayoutRequirement has the minimum fields needed
 * for the RequirementMapper to produce a valid LayoutEngineInput.
 *
 * This does NOT fill in defaults. It only reports what is missing.
 */
export function validateRequirement(req: WorkshopLayoutRequirement): RequirementValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  // Mandatory fields
  if (!req.projectName || req.projectName.trim().length === 0) {
    missingFields.push('projectName');
  }
  if (!req.workshopType) {
    missingFields.push('workshopType');
  }
  if (!req.vehicleCategory) {
    missingFields.push('vehicleCategory');
  }
  if (!req.priority) {
    missingFields.push('priority');
  }

  // Site dimensions
  if (!req.site || req.site.widthMeters <= 0) {
    missingFields.push('site.widthMeters');
  }
  if (!req.site || req.site.lengthMeters <= 0) {
    missingFields.push('site.lengthMeters');
  }

  // Building dimensions
  if (!req.building || req.building.widthMeters <= 0) {
    missingFields.push('building.widthMeters');
  }
  if (!req.building || req.building.lengthMeters <= 0) {
    missingFields.push('building.lengthMeters');
  }

  // Building must fit within site
  if (
    req.site && req.building &&
    req.site.widthMeters > 0 && req.building.widthMeters > 0 &&
    req.building.widthMeters > req.site.widthMeters
  ) {
    warnings.push('building.widthMeters exceeds site.widthMeters');
  }
  if (
    req.site && req.building &&
    req.site.lengthMeters > 0 && req.building.lengthMeters > 0 &&
    req.building.lengthMeters > req.site.lengthMeters
  ) {
    warnings.push('building.lengthMeters exceeds site.lengthMeters');
  }

  // Access
  if (!req.access || !req.access.entryPosition) {
    missingFields.push('access.entryPosition');
  }

  // Services
  if (!req.services || req.services.length === 0) {
    missingFields.push('services (at least one service program item required)');
  } else {
    for (let i = 0; i < req.services.length; i++) {
      const svc = req.services[i];
      if (svc.bayCount <= 0) {
        missingFields.push(`services[${i}].bayCount must be > 0`);
      }
    }
  }

  // Ancillary spaces
  if (!req.ancillarySpaces) {
    missingFields.push('ancillarySpaces');
  }

  // Warnings for semantically questionable but not strictly invalid input
  if (req.access?.preferDriveThrough && !req.access.exitPosition) {
    warnings.push('preferDriveThrough is true but no exitPosition specified; mapper may not be able to create drive-through flow');
  }

  if (req.ancillarySpaces?.loungeWithBayView && !req.ancillarySpaces.customerLounge) {
    warnings.push('loungeWithBayView is true but customerLounge is false');
  }

  return Object.freeze({
    isValid: missingFields.length === 0,
    missingFields: Object.freeze(missingFields),
    warnings: Object.freeze(warnings),
  });
}
