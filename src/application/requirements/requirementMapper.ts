// ---------------------------------------------------------------------------
// FASE 3.4 — RequirementMapper: Deterministic Adapter
//
// Translates WorkshopLayoutRequirement (semantic, AI-facing) into
// LayoutEngineInput (technical, engine-facing) using StandardAccessor
// for all engineering parameters.
//
// Rules:
//   - No hardcoded engineering values (door width, wall thickness, etc.).
//   - All engineering parameters come from StandardAccessor.
//   - No geometry/coordinate generation.
//   - No AI SDK imports.
//   - Deterministic and pure.
// ---------------------------------------------------------------------------

import {
  WorkshopLayoutRequirement,
  SemanticWallPosition,
  VehicleCategory,
  BusinessPriority,
  ServiceProgramItem,
  getCanonicalBayTypeForService,
  MOBENG_BAY_DEFAULT_LIFTS,
} from '../../domain/requirements/requirementTypes';

import {
  LayoutEngineInput,
  AccessPoint,
  AccessPointType,
  WallOrientation,
  ProgramBayRequirement,
  ProgramEquipmentRequirement,
  WorkshopProgram,
  CirculationRequirementType,
  CandidateStrategyType,
} from '../../domain/engine/types';

import { StandardAccessor } from '../../domain/engine/StandardAccessor';

// ---------------------------------------------------------------------------
// 1. Mapping Result Contract
// ---------------------------------------------------------------------------

export interface RequirementMappingResult {
  readonly success: boolean;
  readonly engineInput: LayoutEngineInput | null;
  readonly engineInputGaps: readonly EngineInputGap[];
  readonly warnings: readonly string[];
}

export interface EngineInputGap {
  readonly field: string;
  readonly reason: string;
  readonly sourceRequirementField: string;
}

// ---------------------------------------------------------------------------
// 2. Vehicle Category → Internal Key Mapping
// ---------------------------------------------------------------------------

const VEHICLE_CATEGORY_KEY_MAP: Record<VehicleCategory, string> = {
  motorcycle: 'vehicle.motorcycle',
  city_car: 'vehicle.city_car',
  sedan: 'vehicle.sedan',
  mpv: 'vehicle.mpv',
  suv: 'vehicle.suv',
  pickup_truck: 'vehicle.pickup_truck',
  van: 'vehicle.van',
  light_truck: 'vehicle.light_truck',
};

// ---------------------------------------------------------------------------
// 3. Priority → Strategy Mapping
// ---------------------------------------------------------------------------

const PRIORITY_STRATEGY_MAP: Record<BusinessPriority, CandidateStrategyType[]> = {
  MAXIMIZE_CAPACITY: ['CAPACITY', 'BALANCED', 'PREMIUM_FLOW'],
  BALANCED_EFFICIENCY: ['BALANCED', 'CAPACITY', 'PREMIUM_FLOW'],
  PREMIUM_EXPERIENCE: ['PREMIUM_FLOW', 'BALANCED', 'CAPACITY'],
};

// ---------------------------------------------------------------------------
// 4. Semantic Position → Wall + Offset Resolution
// ---------------------------------------------------------------------------

interface ResolvedWallPosition {
  wall: WallOrientation;
  offsetFraction: number; // 0.0 = start of wall, 0.5 = center, 1.0 = end
}

function resolveSemanticPosition(
  position: SemanticWallPosition,
  roadOrientation?: WallOrientation
): ResolvedWallPosition {
  // "front" means the road-facing side; default to 'south' if not specified
  const frontWall: WallOrientation = roadOrientation ?? 'south';
  const rearWall: WallOrientation =
    frontWall === 'south' ? 'north' :
    frontWall === 'north' ? 'south' :
    frontWall === 'east' ? 'west' : 'east';

  switch (position) {
    case 'front_left':   return { wall: frontWall, offsetFraction: 0.2 };
    case 'front_center': return { wall: frontWall, offsetFraction: 0.5 };
    case 'front_right':  return { wall: frontWall, offsetFraction: 0.8 };
    case 'rear_left':    return { wall: rearWall,  offsetFraction: 0.2 };
    case 'rear_center':  return { wall: rearWall,  offsetFraction: 0.5 };
    case 'rear_right':   return { wall: rearWall,  offsetFraction: 0.8 };
    case 'left_side':    return { wall: 'west',    offsetFraction: 0.5 };
    case 'right_side':   return { wall: 'east',    offsetFraction: 0.5 };
  }
}

function getWallLength(
  wall: WallOrientation,
  buildingWidth: number,
  buildingLength: number
): number {
  return (wall === 'north' || wall === 'south') ? buildingWidth : buildingLength;
}

// ---------------------------------------------------------------------------
// 5. RequirementMapper Class
// ---------------------------------------------------------------------------

export class RequirementMapper {
  /**
   * Deterministically maps a WorkshopLayoutRequirement to a LayoutEngineInput.
   * All engineering parameters (door width, etc.) come from StandardAccessor.
   */
  public map(
    requirement: WorkshopLayoutRequirement,
    accessor: StandardAccessor
  ): RequirementMappingResult {
    const warnings: string[] = [];
    const gaps: EngineInputGap[] = [];

    // --- 1. Site ---
    const site: LayoutEngineInput['site'] = {
      width: requirement.site.widthMeters,
      length: requirement.site.lengthMeters,
      roadSide: requirement.site.roadOrientation,
      parking: requirement.parking
        ? Object.freeze({
            customerParkingSpaces: requirement.parking.customerParkingSpaces,
            staffParkingSpaces: requirement.parking.staffParkingSpaces,
            vehicleStagingSpaces: requirement.parking.vehicleStagingSpaces,
            employeeMotorcycleSpaces: requirement.parking.employeeMotorcycleSpaces,
          })
        : undefined,
    };

    // --- 2. Building ---
    const building: LayoutEngineInput['building'] = {
      width: requirement.building.widthMeters,
      length: requirement.building.lengthMeters,
      frontSetbackMeters: requirement.building.frontSetbackMeters,
    };

    // --- 3. Access Points ---
    const doorWidth = accessor.getRequiredNumericValue('door.vehicle.width');
    const accessPoints: AccessPoint[] = [];
    let accessPointSeq = 1;

    // Main entrance
    const entryResolved = resolveSemanticPosition(
      requirement.access.entryPosition,
      requirement.site.roadOrientation
    );
    const entryWallLen = getWallLength(entryResolved.wall, building.width, building.length);
    accessPoints.push({
      id: `ap-${String(accessPointSeq++).padStart(2, '0')}`,
      type: 'entrance' as AccessPointType,
      wall: entryResolved.wall,
      offsetMeters: Math.max(doorWidth, entryResolved.offsetFraction * entryWallLen - doorWidth / 2),
      widthMeters: doorWidth,
    });

    // Separate exit (if provided)
    if (requirement.access.exitPosition) {
      const exitResolved = resolveSemanticPosition(
        requirement.access.exitPosition,
        requirement.site.roadOrientation
      );
      const exitWallLen = getWallLength(exitResolved.wall, building.width, building.length);
      accessPoints.push({
        id: `ap-${String(accessPointSeq++).padStart(2, '0')}`,
        type: 'exit' as AccessPointType,
        wall: exitResolved.wall,
        offsetMeters: Math.max(doorWidth, exitResolved.offsetFraction * exitWallLen - doorWidth / 2),
        widthMeters: doorWidth,
      });
    }

    // Pedestrian entrance (if provided)
    if (requirement.access.pedestrianEntryPosition) {
      const pedResolved = resolveSemanticPosition(
        requirement.access.pedestrianEntryPosition,
        requirement.site.roadOrientation
      );
      const pedDoorWidth = accessor.getParameter('door.pedestrian.width');
      const pedWidth = pedDoorWidth ? pedDoorWidth.value : doorWidth;
      const pedWallLen = getWallLength(pedResolved.wall, building.width, building.length);
      accessPoints.push({
        id: `ap-${String(accessPointSeq++).padStart(2, '0')}`,
        type: 'pedestrian' as AccessPointType,
        wall: pedResolved.wall,
        offsetMeters: Math.max(pedWidth, pedResolved.offsetFraction * pedWallLen - pedWidth / 2),
        widthMeters: pedWidth,
      });
    }

    // --- 4. Circulation Requirement ---
    const circulationRequirement = this.deriveCirculationRequirement(requirement);

    // --- 5. Vehicle Class Key ---
    const vehicleClassKey = VEHICLE_CATEGORY_KEY_MAP[requirement.vehicleCategory];

    // --- 6. Service Program → Bays ---
    const bays: ProgramBayRequirement[] = requirement.services.map((svc) => ({
      serviceType: svc.serviceType,
      quantity: svc.bayCount,
      requiredEquipment: svc.requiredLifts ? [...svc.requiredLifts] : undefined,
    }));

    // --- 7. Equipment ---
    const equipmentMap = new Map<string, number>();

    // Collect lifts from service requirements
    for (const bay of bays) {
      if (bay.requiredEquipment) {
        for (const lift of bay.requiredEquipment) {
          equipmentMap.set(lift, (equipmentMap.get(lift) || 0) + bay.quantity);
        }
      }
    }

    // Add equipment preferences (1 unit each unless already counted)
    if (requirement.equipmentPreferences) {
      for (const eq of requirement.equipmentPreferences) {
        if (!equipmentMap.has(eq)) {
          equipmentMap.set(eq, 1);
        }
      }
    }

    const equipment: ProgramEquipmentRequirement[] = Array.from(equipmentMap.entries()).map(
      ([equipmentType, quantity]) => ({ equipmentType, quantity })
    );

    // --- 8. Customer Zone & Ancillary Spaces ---
    const customerZoneRequired = requirement.ancillarySpaces.customerLounge;

    const musholaActive = typeof requirement.ancillarySpaces.mushola === 'object'
      ? requirement.ancillarySpaces.mushola.enabled
      : Boolean(requirement.ancillarySpaces.mushola);

    const wudhuActive = typeof requirement.ancillarySpaces.wudhu === 'object'
      ? requirement.ancillarySpaces.wudhu.enabled
      : Boolean(requirement.ancillarySpaces.wudhu);

    const employeeMessActive = typeof requirement.ancillarySpaces.employeeMess === 'object'
      ? requirement.ancillarySpaces.employeeMess.enabled
      : Boolean(requirement.ancillarySpaces.employeeMess);

    const customerRestroomActive = Boolean(requirement.ancillarySpaces.customerRestroom);
    const employeeRestroomActive = Boolean(requirement.ancillarySpaces.employeeRestroom);
    const legacyRestroom =
      Boolean(requirement.ancillarySpaces.restroom) ||
      customerRestroomActive ||
      employeeRestroomActive;
    const legacyStaffRoom =
      Boolean(requirement.ancillarySpaces.staffRoom) ||
      employeeMessActive;
    const legacyOilWaste =
      Boolean(requirement.ancillarySpaces.oilWasteStorage) ||
      Boolean(requirement.ancillarySpaces.wasteStreams?.oil);

    const ancillarySpaces = Object.freeze({
      customerLounge: requirement.ancillarySpaces.customerLounge,
      cashierOffice: requirement.ancillarySpaces.cashierOffice,
      partsWarehouse: requirement.ancillarySpaces.partsWarehouse,
      restroom: legacyRestroom,
      compressorRoom: requirement.ancillarySpaces.compressorRoom,
      oilWasteStorage: legacyOilWaste,
      staffRoom: legacyStaffRoom,
      loungeWithBayView: requirement.ancillarySpaces.loungeWithBayView,

      // Extended MOBENG Space Program (M2A Semantic Presence)
      customerRestroom: customerRestroomActive,
      employeeRestroom: employeeRestroomActive,
      mushola: musholaActive,
      wudhu: wudhuActive,
      employeeMess: employeeMessActive,
      waitingAreaDetails: requirement.ancillarySpaces.waitingAreaDetails,
      wasteStreams: requirement.ancillarySpaces.wasteStreams,
      employeeMotorcycleParking: requirement.ancillarySpaces.employeeMotorcycleParking,
    });

    // --- 9. Future Expansion ---
    const futureExpansionBays = requirement.futureExpansionBays ?? 0;

    // --- 10. Strategies ---
    const strategies = PRIORITY_STRATEGY_MAP[requirement.priority];

    // --- 11. Assemble Program & Engine Input ---
    const program: WorkshopProgram = {
      bays,
      equipment,
      vehicleClassKey,
      circulationRequirement,
      customerZoneRequired,
      ancillarySpaces,
      futureExpansionBays,
    };

    const engineInput: LayoutEngineInput = {
      site,
      building,
      accessPoints,
      program,
      strategies,
    };

    return Object.freeze({
      success: true,
      engineInput: Object.freeze(engineInput),
      engineInputGaps: Object.freeze(gaps.map((g) => Object.freeze(g))),
      warnings: Object.freeze(warnings),
    });
  }

  /**
   * Derives circulationRequirement from semantic access configuration.
   * No hardcoded engineering values involved — pure semantic logic.
   */
  private deriveCirculationRequirement(
    requirement: WorkshopLayoutRequirement
  ): CirculationRequirementType {
    // Explicit user preference for drive-through with a separate exit
    if (requirement.access.preferDriveThrough && requirement.access.exitPosition) {
      return 'drive_through';
    }

    // If there's a separate exit on a different wall, infer drive-through
    if (requirement.access.exitPosition) {
      const entryWall = resolveSemanticPosition(
        requirement.access.entryPosition,
        requirement.site.roadOrientation
      ).wall;
      const exitWall = resolveSemanticPosition(
        requirement.access.exitPosition,
        requirement.site.roadOrientation
      ).wall;

      if (entryWall !== exitWall) {
        return 'drive_through';
      }
    }

    // Default: back out turnaround (single entry)
    return 'back_out_turnaround';
  }
}
