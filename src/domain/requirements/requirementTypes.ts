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
  | 'passenger_4w'
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

/**
 * Consolidates semantic service/function items into canonical MOBENG physical bay requirements.
 * Rules:
 * 1. SERVICE_BAY (4x9m, 4-post lift):
 *    - Hosts functions: 'general_service', 'quick_lube', 'service_rasa_mesin_baru'.
 *    - Physical count = max(general_service, quick_lube, service_rasa_mesin_baru).
 *    - Quick Lube / Rasa Mesin Baru do not add extra physical bays if service bays are already allocated.
 * 2. SPOORING_BAY (4x9m, 4-post lift):
 *    - Hosts function: 'wheel_alignment'.
 *    - Physical count = wheel_alignment count.
 * 3. GENERAL_REPAIR_BAY (4x9m, 2-post lift):
 *    - Hosts functions: 'general_repair', 'brake_suspension'.
 *    - Physical count = max(general_repair, brake_suspension).
 * 4. Detailing / Function-only services:
 *    - Currently have no approved canonical physical bay in MOBENG.
 *    - Physical bay increment = 0.
 */
export function derivePhysicalBayRequirements(
  services: readonly ServiceProgramItem[]
): readonly BayProgramItem[] {
  let generalServiceCount = 0;
  let quickLubeCount = 0;
  let rasaMesinBaruCount = 0;
  let wheelAlignmentCount = 0;
  let generalRepairCount = 0;
  let brakeSuspensionCount = 0;

  for (const svc of services) {
    switch (svc.serviceType) {
      case 'general_service':
        generalServiceCount += svc.bayCount;
        break;
      case 'quick_lube':
        quickLubeCount += svc.bayCount;
        break;
      case 'service_rasa_mesin_baru':
        rasaMesinBaruCount += svc.bayCount;
        break;
      case 'wheel_alignment':
        wheelAlignmentCount += svc.bayCount;
        break;
      case 'general_repair':
        generalRepairCount += svc.bayCount;
        break;
      case 'brake_suspension':
        brakeSuspensionCount += svc.bayCount;
        break;
      case 'detailing':
      default:
        // Service/function only — no physical bay increment
        break;
    }
  }

  const physicalBays: BayProgramItem[] = [];

  // 1. SERVICE_BAY
  const serviceBayPhysicalCount = Math.max(
    generalServiceCount,
    quickLubeCount,
    rasaMesinBaruCount
  );
  if (serviceBayPhysicalCount > 0) {
    const supported: ServiceType[] = [];
    if (generalServiceCount > 0) supported.push('general_service');
    if (quickLubeCount > 0) supported.push('quick_lube');
    if (rasaMesinBaruCount > 0) supported.push('service_rasa_mesin_baru');

    physicalBays.push(Object.freeze({
      bayType: 'SERVICE_BAY' as const,
      bayCount: serviceBayPhysicalCount,
      supportedServices: Object.freeze(supported),
      requiredLifts: Object.freeze<LiftType[]>(['4_post_lift']),
    }));
  }

  // 2. SPOORING_BAY
  if (wheelAlignmentCount > 0) {
    physicalBays.push(Object.freeze({
      bayType: 'SPOORING_BAY' as const,
      bayCount: wheelAlignmentCount,
      supportedServices: Object.freeze<ServiceType[]>(['wheel_alignment']),
      requiredLifts: Object.freeze<LiftType[]>(['4_post_lift']),
    }));
  }

  // 3. GENERAL_REPAIR_BAY
  const generalRepairPhysicalCount = Math.max(
    generalRepairCount,
    brakeSuspensionCount
  );
  if (generalRepairPhysicalCount > 0) {
    const supported: ServiceType[] = [];
    if (generalRepairCount > 0) supported.push('general_repair');
    if (brakeSuspensionCount > 0) supported.push('brake_suspension');

    physicalBays.push(Object.freeze({
      bayType: 'GENERAL_REPAIR_BAY' as const,
      bayCount: generalRepairPhysicalCount,
      supportedServices: Object.freeze(supported),
      requiredLifts: Object.freeze<LiftType[]>(['2_post_lift']),
    }));
  }

  return Object.freeze(physicalBays);
}

// ---------------------------------------------------------------------------
// 5. Ancillary Spaces & Extended MOBENG Space Program (M2A)
// ---------------------------------------------------------------------------

/** Stable semantic identifiers for MOBENG spaces */
export type MobengSpaceType =
  | 'customer_lounge'
  | 'reception_cashier'
  | 'customer_restroom'
  | 'mushola'
  | 'wudhu'
  | 'spooring_bay'
  | 'service_bay'
  | 'general_repair_bay'
  | 'operational_equipment'
  | 'parts_warehouse'
  | 'employee_mess'
  | 'employee_restroom'
  | 'employee_motorcycle_parking'
  | 'waste_oil'
  | 'waste_tire'
  | 'waste_parts'
  | 'waste_cardboard'
  | 'compressor_room';

/** Waste stream categories for MOBENG 4-stream hazardous and operational waste */
export type MobengWasteCategory =
  | 'waste_oil'
  | 'waste_tire'
  | 'waste_parts'
  | 'waste_cardboard';

/** Structured content & functional requirements for Customer Waiting Area / Lounge */
export interface WaitingAreaContentRequirement {
  readonly targetCapacityMin?: number; // e.g. 10 persons
  readonly targetCapacityMax?: number; // e.g. 20 persons
  readonly seatingRequired?: boolean;
  readonly tvRequired?: boolean;
  readonly credenzaRequired?: boolean;
  readonly showcaseRequired?: boolean;
  readonly combinedReceptionCashier?: boolean;
}

/** Structured requirement for Mini Mushola (Design Reference ~2m x 2m) */
export interface MusholaRequirement {
  readonly enabled: boolean;
  readonly minCapacityAdults?: number; // minimum 1 adult
  readonly targetCapacityMax?: number; // target 1-4 persons
  readonly isCompact?: boolean;
  /** Design reference provenance only (~2.0m x 2.0m); NOT a building code or engineering standard */
  readonly designReferenceWidthMeters?: number;
  readonly designReferenceLengthMeters?: number;
}

/** Structured requirement for Wudhu Ablution Area (Compact, min 1 pax & 1 faucet, dimensions UNKNOWN) */
export interface WudhuRequirement {
  readonly enabled: boolean;
  readonly minCapacity?: number; // minimum 1 person
  readonly minFaucetCount?: number; // minimum 1 faucet
  readonly isCompact?: boolean;
  // Physical dimensions remain explicitly UNKNOWN
}

/** Structured requirement for Employee Mess (Sleeping/rest for min 4 staff, dimensions UNKNOWN) */
export interface EmployeeMessRequirement {
  readonly enabled: boolean;
  readonly minSleepingCapacity?: number; // minimum 4 persons
  readonly functionType?: 'sleeping_rest' | 'casual_lounge'; // default 'sleeping_rest'
  // Physical dimensions remain explicitly UNKNOWN
}

/** Structured requirement for 4-Stream Waste Program (Compact, dimensions UNKNOWN) */
export interface WasteStreamRequirement {
  readonly oil: boolean;
  readonly tire: boolean;
  readonly parts: boolean;
  readonly cardboard: boolean;
}

export interface AncillarySpacesRequirement {
  // Legacy / Baseline fields (Preserved 100% for backward compatibility)
  readonly customerLounge: boolean;
  readonly cashierOffice: boolean;
  readonly partsWarehouse: boolean;
  readonly restroom: boolean;
  readonly compressorRoom?: boolean;
  readonly oilWasteStorage?: boolean;
  readonly staffRoom?: boolean;
  /** Customer lounge has glass wall with direct view into service bays. */
  readonly loungeWithBayView?: boolean;

  // Extended MOBENG Space Program (M2A Semantic Foundation)
  /** Dedicated Customer Restroom (separate from employee restroom) */
  readonly customerRestroom?: boolean;
  /** Dedicated Employee Restroom (separate from customer restroom) */
  readonly employeeRestroom?: boolean;
  /** Mini Mushola prayer space */
  readonly mushola?: boolean | MusholaRequirement;
  /** Wudhu ablution facility */
  readonly wudhu?: boolean | WudhuRequirement;
  /** Employee Mess (sleeping/rest facility for staff) */
  readonly employeeMess?: boolean | EmployeeMessRequirement;
  /** Detailed Waiting Area interior content specification */
  readonly waitingAreaDetails?: WaitingAreaContentRequirement;
  /** 4-stream waste management program (oil, tire, parts, cardboard) */
  readonly wasteStreams?: WasteStreamRequirement;
  /** Dedicated employee motorcycle parking presence */
  readonly employeeMotorcycleParking?: boolean;
}

// ---------------------------------------------------------------------------
// 6. Parking & Future Expansion
// ---------------------------------------------------------------------------

export interface ParkingRequirement {
  readonly customerParkingSpaces?: number;
  readonly staffParkingSpaces?: number;
  readonly vehicleStagingSpaces?: number;
  readonly employeeMotorcycleSpaces?: number;
}

// ---------------------------------------------------------------------------
// 7. The Complete Workshop Layout Requirement Contract
// ---------------------------------------------------------------------------

export interface WorkshopLayoutRequirement {
  // -- Identity & Business Intent --
  readonly projectName: string;
  readonly workshopType: WorkshopType;
  readonly vehicleCategory: VehicleCategory;
  /** Explicit multiple vehicle categories if user specified more than one (e.g. ['mpv', 'suv']) */
  readonly vehicleCategories?: readonly VehicleCategory[];
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
 * This does NOT fill in defaults. It only reports what is missing or invalid.
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
  } else {
    const anc = req.ancillarySpaces;

    // Semantic validation: Waiting area capacity
    if (anc.waitingAreaDetails) {
      const { targetCapacityMin, targetCapacityMax } = anc.waitingAreaDetails;
      if (targetCapacityMin !== undefined && targetCapacityMin <= 0) {
        missingFields.push('ancillarySpaces.waitingAreaDetails.targetCapacityMin must be > 0');
      }
      if (targetCapacityMax !== undefined && targetCapacityMax <= 0) {
        missingFields.push('ancillarySpaces.waitingAreaDetails.targetCapacityMax must be > 0');
      }
      if (
        targetCapacityMin !== undefined &&
        targetCapacityMax !== undefined &&
        targetCapacityMax < targetCapacityMin
      ) {
        warnings.push('waitingAreaDetails.targetCapacityMax is less than targetCapacityMin');
      }
    }

    // Semantic validation: Mushola capacity & design reference
    if (typeof anc.mushola === 'object' && anc.mushola.enabled) {
      if (anc.mushola.minCapacityAdults !== undefined && anc.mushola.minCapacityAdults <= 0) {
        missingFields.push('ancillarySpaces.mushola.minCapacityAdults must be > 0');
      }
      if (anc.mushola.targetCapacityMax !== undefined && anc.mushola.targetCapacityMax <= 0) {
        missingFields.push('ancillarySpaces.mushola.targetCapacityMax must be > 0');
      }
    }

    // Semantic validation: Wudhu capacity & fixture
    if (typeof anc.wudhu === 'object' && anc.wudhu.enabled) {
      if (anc.wudhu.minCapacity !== undefined && anc.wudhu.minCapacity <= 0) {
        missingFields.push('ancillarySpaces.wudhu.minCapacity must be > 0');
      }
      if (anc.wudhu.minFaucetCount !== undefined && anc.wudhu.minFaucetCount <= 0) {
        missingFields.push('ancillarySpaces.wudhu.minFaucetCount must be > 0');
      }
    }

    // Semantic validation: Employee Mess capacity
    if (typeof anc.employeeMess === 'object' && anc.employeeMess.enabled) {
      if (anc.employeeMess.minSleepingCapacity !== undefined && anc.employeeMess.minSleepingCapacity <= 0) {
        missingFields.push('ancillarySpaces.employeeMess.minSleepingCapacity must be > 0');
      }
    }

    // Sanitary separation notice
    if (anc.restroom && (anc.customerRestroom || anc.employeeRestroom)) {
      warnings.push('Both general restroom and specific (customer/employee) restroom are marked; specific configuration takes precedence');
    }
  }

  // Parking validation
  if (req.parking) {
    if (req.parking.customerParkingSpaces !== undefined && req.parking.customerParkingSpaces < 0) {
      missingFields.push('parking.customerParkingSpaces cannot be negative');
    }
    if (req.parking.staffParkingSpaces !== undefined && req.parking.staffParkingSpaces < 0) {
      missingFields.push('parking.staffParkingSpaces cannot be negative');
    }
    if (req.parking.vehicleStagingSpaces !== undefined && req.parking.vehicleStagingSpaces < 0) {
      missingFields.push('parking.vehicleStagingSpaces cannot be negative');
    }
    if (req.parking.employeeMotorcycleSpaces !== undefined && req.parking.employeeMotorcycleSpaces < 0) {
      missingFields.push('parking.employeeMotorcycleSpaces cannot be negative');
    }
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

// ---------------------------------------------------------------------------
// 9. MOBENG Space Standard V1 (PO-Approved Constants & Specifications)
// ---------------------------------------------------------------------------

export type MobengProvenance =
  | 'PO_APPROVED'
  | 'DESIGN_REFERENCE'
  | 'EXISTING_REPOSITORY_VALUE_PENDING_APPROVAL'
  | 'UNKNOWN';

/**
 * Official MOBENG 8 Operational Equipment Items.
 */
export const MOBENG_OPERATIONAL_EQUIPMENT_LIST: readonly string[] = Object.freeze([
  'Mesin spooring',
  'Mesin balancing',
  'Tire changer',
  'ATF flushing machine',
  'Nitrogen tire inflator',
  'Oil drain & suction',
  'Air compressor',
  'Genset 10 kVA',
]);

/**
 * PO-Approved Equipment Electrical Phase Requirements.
 * Nitrogen electrical requirement remains explicitly UNKNOWN.
 */
export interface EquipmentElectricalSpec {
  readonly phaseCount?: number; // 1 or 3, undefined if UNKNOWN
  readonly provenance: MobengProvenance;
}

export const MOBENG_EQUIPMENT_ELECTRICAL_PHASES: Readonly<Record<string, EquipmentElectricalSpec>> = Object.freeze({
  'Mesin spooring': Object.freeze({ phaseCount: 1, provenance: 'PO_APPROVED' as MobengProvenance }),
  'Mesin balancing': Object.freeze({ phaseCount: 3, provenance: 'PO_APPROVED' as MobengProvenance }),
  'Tire changer': Object.freeze({ phaseCount: 3, provenance: 'PO_APPROVED' as MobengProvenance }),
  'Vehicle lift': Object.freeze({ phaseCount: 3, provenance: 'PO_APPROVED' as MobengProvenance }),
  'Nitrogen tire inflator': Object.freeze({ phaseCount: undefined, provenance: 'UNKNOWN' as MobengProvenance }),
});

/**
 * Equipment Brand / Vendor References.
 * Text preferences only; NOT physical equipment specifications.
 * Note: Exact spelling "JPHN Bean" is strictly preserved as supplied by PO.
 */
export const MOBENG_EQUIPMENT_VENDOR_REFERENCES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'Mesin spooring': Object.freeze(['Blue Point / Snap-on', 'John Bean', 'JPHN Bean']),
  'Mesin balancing': Object.freeze(['John Bean']),
  'Tire changer': Object.freeze(['Smart']),
  'Nitrogen tire inflator': Object.freeze(['brand unrestricted / free choice']),
});

/**
 * Canonical MOBENG Space Standard V1 Data Specifications.
 */
export const MOBENG_SPACE_STANDARD_V1 = Object.freeze({
  // Canonical Bays
  BAY_SPOORING: Object.freeze({
    widthMeters: 4.0,
    lengthMeters: 9.0,
    liftType: '4_post_lift' as LiftType,
    maxLifts: 1,
    services: Object.freeze(['wheel_alignment' as ServiceType]),
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),
  BAY_SERVICE: Object.freeze({
    widthMeters: 4.0,
    lengthMeters: 9.0,
    liftType: '4_post_lift' as LiftType,
    allowMultipleLifts: true,
    services: Object.freeze(['general_service' as ServiceType, 'quick_lube' as ServiceType, 'service_rasa_mesin_baru' as ServiceType]),
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),
  BAY_GENERAL_REPAIR: Object.freeze({
    widthMeters: 4.0,
    lengthMeters: 9.0,
    liftType: '2_post_lift' as LiftType,
    maxLifts: 1,
    services: Object.freeze(['general_repair' as ServiceType, 'brake_suspension' as ServiceType]),
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Customer Parking
  CUSTOMER_PARKING_STALL: Object.freeze({
    widthMeters: 2.5,
    lengthMeters: 5.0,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Integrated Waiting + Reception + Cashier
  WAITING_RECEPTION_CASHIER: Object.freeze({
    minWidthMeters: 5.0,
    minLengthMeters: 6.0,
    idealWidthMeters: 5.0,
    idealLengthMeters: 10.0,
    minCapacityPax: 10,
    maxCapacityPax: 20,
    cashierSubareaWidthMeters: 2.5,
    cashierSubareaLengthMeters: 2.5,
    isExpandable: true,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Sparepart Warehouse
  PARTS_WAREHOUSE: Object.freeze({
    minWidthMeters: 4.0,
    minLengthMeters: 6.0,
    isExpandable: true,
    supersededDimensions: '4.5m x 4.0m',
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // 4-Stream Waste Area
  WASTE_AREA: Object.freeze({
    totalWidthMeters: 3.0,
    totalLengthMeters: 6.0,
    streams: Object.freeze({
      oil: Object.freeze({ widthMeters: 3.0, lengthMeters: 2.0, category: 'waste_oil' as MobengWasteCategory, provenance: 'PO_APPROVED' as MobengProvenance }),
      tire: Object.freeze({ widthMeters: 3.0, lengthMeters: 2.0, category: 'waste_tire' as MobengWasteCategory, provenance: 'PO_APPROVED' as MobengProvenance }),
      parts: Object.freeze({ widthMeters: 3.0, lengthMeters: 1.0, category: 'waste_parts' as MobengWasteCategory, provenance: 'PO_APPROVED' as MobengProvenance }),
      cardboard: Object.freeze({ widthMeters: 3.0, lengthMeters: 1.0, category: 'waste_cardboard' as MobengWasteCategory, provenance: 'PO_APPROVED' as MobengProvenance }),
    }),
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Mini Mushola
  MUSHOLA: Object.freeze({
    minWidthMeters: 2.0,
    minLengthMeters: 2.0,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Wudhu
  WUDHU: Object.freeze({
    minWidthMeters: 1.0,
    minLengthMeters: 2.0,
    minFaucetCount: 1,
    mandatoryAdjacencyToMushola: true,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Customer Toilet & Employee Toilet
  CUSTOMER_TOILET: Object.freeze({
    minWidthMeters: 1.5,
    minLengthMeters: 1.5,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),
  EMPLOYEE_TOILET: Object.freeze({
    minWidthMeters: 1.5,
    minLengthMeters: 1.5,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Employee Mess
  EMPLOYEE_MESS: Object.freeze({
    minWidthMeters: 3.0,
    minLengthMeters: 6.0,
    functionType: 'sleeping_rest',
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Employee Motorcycle Parking
  EMPLOYEE_MOTORCYCLE_PARKING: Object.freeze({
    minCapacityUnits: 4,
    stallDimensions: undefined,
    aisleDimensions: undefined,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Genset
  GENSET: Object.freeze({
    capacityKva: 10.0,
    physicalDimensions: undefined,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // Site Guideline
  SITE_GUIDELINE: Object.freeze({
    preferredMinWidthMeters: 15.0,
    preferredMinDepthMeters: 20.0,
    isHardEngineeringConstraint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  // GSB
  GSB: Object.freeze({
    numericValue: undefined,
    isLocationProjectSpecific: true,
    provenance: 'UNKNOWN' as MobengProvenance,
  }),
});

