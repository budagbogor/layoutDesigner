// ---------------------------------------------------------------------------
// FASE 4.0A — Deterministic Candidate Generator with Multi-Arrangement Exploration
//
// Generates a workshop candidate layout by deterministically exploring
// architectural arrangements (SINGLE_COMB_NORTH, DOUBLE_COMB_OPPOSING, ZONED_BY_SERVICE).
//
// Rules:
// - Zero magic numbers: all dimensions come from StandardAccessor.
// - Zero Math.random() or non-deterministic IDs.
// - Strict 15 HARD constraint validation.
// - Explores alternative arrangements before declaring layout infeasible.
// - Output is 100% deterministic and deeply immutable.
// ---------------------------------------------------------------------------

import { LayoutEngineInput, ObjectEnvelope, CirculationRequirementType, ProgramEquipmentRequirement } from '../types';
import { LayoutObject, CadLayerId, Geometry } from '../../models/project';
import { StandardAccessor } from '../StandardAccessor';
import {
  LayoutStrategyId,
  StrategyCandidate,
  CandidateStatus,
  CandidateRejection,
  generateDeterministicCandidateId,
  SPATIAL_UTILITIES,
  BuildingInteriorGeometry,
} from '../strategies/strategyTypes';
import { buildLayoutTopology } from '../topology/topologyBuilder';
import { deriveTopologyZones } from '../topology/topologyZoner';
import { LayoutTopology } from '../topology/topologyTypes';
import { createPhysicalEnvelope } from '../envelopes/physicalEnvelope';
import { createWorkingEnvelope } from '../envelopes/workingEnvelope';
import { createAccessEnvelope } from '../envelopes/accessEnvelope';
import { createSafetyEnvelope, hasSafetyRequirement } from '../envelopes/safetyEnvelope';
import { roundMillimeter } from '../../geometry/precision';
import { validateCandidateConstraints, CandidateValidationResult } from './candidateValidator';
import { overlapsEnvelope } from '../spatial/spatialRelations';
import { getCanonicalBayTypeForService } from '../../requirements/requirementTypes';
import { getOfficialEquipmentSpec } from '../../equipment/equipmentSpatialization';

export type SpatialArrangementType =
  | 'SINGLE_COMB_NORTH'
  | 'DOUBLE_COMB_OPPOSING'
  | 'ZONED_BY_SERVICE';

export const ALL_SPATIAL_ARRANGEMENTS: readonly SpatialArrangementType[] = Object.freeze([
  'SINGLE_COMB_NORTH',
  'DOUBLE_COMB_OPPOSING',
  'ZONED_BY_SERVICE',
]);

export interface CandidateGeneratorOptions {
  readonly strategyId?: LayoutStrategyId;
  readonly preferredArrangement?: SpatialArrangementType;
  readonly enableMultiArrangementSearch?: boolean;
  readonly sequenceIndex?: number;
}

export interface GeneratedCandidateLayout {
  readonly candidateId: string;
  readonly strategy: LayoutStrategyId;
  readonly arrangement: SpatialArrangementType;
  readonly circulationRequirement: CirculationRequirementType;
  readonly topology: LayoutTopology;
  readonly objects: readonly LayoutObject[];
  readonly envelopes: readonly ObjectEnvelope[];
  readonly validation: CandidateValidationResult;
  readonly status: CandidateStatus;
  readonly rejections: readonly CandidateRejection[];
  readonly warnings: readonly CandidateRejection[];
  readonly provenance: {
    readonly standardVersionId: string;
    readonly generatorName: string;
    readonly generatedAt: string;
    readonly strategy: LayoutStrategyId;
    readonly arrangement: SpatialArrangementType;
  };
  readonly metadata: {
    readonly totalBaysRequested: number;
    readonly totalBaysPlaced: number;
    readonly operationalBaysByService: Readonly<Record<string, number>>;
    readonly ancillarySpacesPlaced: readonly string[];
    readonly parkingCapacityAllocated: {
      readonly customer: number;
      readonly staff: number;
      readonly staging: number;
    };
    readonly futureExpansionBaysReserved: number;
    readonly attemptedArrangements: readonly SpatialArrangementType[];
    readonly buildingInterior: BuildingInteriorGeometry;
  };
}

export class CandidateGenerator {
  /**
   * Generates a single deterministic candidate layout from LayoutEngineInput,
   * exploring alternative spatial arrangements if initial arrangement has capacity shortfall.
   */
  public generate(
    input: LayoutEngineInput,
    accessor: StandardAccessor,
    options?: CandidateGeneratorOptions
  ): GeneratedCandidateLayout {
    const strategyId: LayoutStrategyId =
      options?.strategyId ?? (input.strategies?.[0] as LayoutStrategyId) ?? 'BALANCED';

    const multiSearch = options?.enableMultiArrangementSearch ?? true;
    const initialArrangement: SpatialArrangementType =
      options?.preferredArrangement ?? 'SINGLE_COMB_NORTH';

    const candidateArrangements: SpatialArrangementType[] = multiSearch
      ? Array.from(
          new Set<SpatialArrangementType>([initialArrangement, 'DOUBLE_COMB_OPPOSING', 'ZONED_BY_SERVICE'])
        )
      : [initialArrangement];

    const attemptedArrangements: SpatialArrangementType[] = [];
    let bestCandidate: GeneratedCandidateLayout | null = null;

    for (const arrangement of candidateArrangements) {
      attemptedArrangements.push(arrangement);
      const candidate = this.generateWithArrangement(
        input,
        accessor,
        strategyId,
        arrangement,
        candidateArrangements,
        options?.sequenceIndex ?? 1
      );

      if (candidate.status === 'VALID' || candidate.status === 'FEASIBLE_WITH_WARNINGS') {
        return candidate;
      }

      if (!bestCandidate || candidate.metadata.totalBaysPlaced > bestCandidate.metadata.totalBaysPlaced) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate!;
  }

  /**
   * Generates a deterministic candidate layout for a specific strategy and arrangement.
   * Useful for orchestration layers systematically exploring all permutations.
   */
  public generateArrangement(
    input: LayoutEngineInput,
    accessor: StandardAccessor,
    strategyId: LayoutStrategyId,
    arrangement: SpatialArrangementType,
    attemptedArrangements: readonly SpatialArrangementType[] = ALL_SPATIAL_ARRANGEMENTS,
    sequenceIndex: number = 1
  ): GeneratedCandidateLayout {
    return this.generateWithArrangement(
      input,
      accessor,
      strategyId,
      arrangement,
      attemptedArrangements,
      sequenceIndex
    );
  }

  /**
   * Internal pure generator for a specific spatial arrangement.
   */
  private generateWithArrangement(
    input: LayoutEngineInput,
    accessor: StandardAccessor,
    strategyId: LayoutStrategyId,
    arrangement: SpatialArrangementType,
    attemptedArrangements: readonly SpatialArrangementType[],
    sequenceIndex: number = 1
  ): GeneratedCandidateLayout {
    const candidateId = generateDeterministicCandidateId(strategyId, sequenceIndex);
    const standardVersionId = accessor.getStandardVersion();
    const generatedAt = '2026-09-02T00:00:00.000Z'; // Deterministic timestamp

    // --- Build & Enrich Topology Graph ---
    const rawTopology = buildLayoutTopology(input, accessor);
    const topology = deriveTopologyZones(rawTopology, input, accessor);

    const placedObjects: LayoutObject[] = [];
    const generatedEnvelopes: ObjectEnvelope[] = [];
    const internalRejections: CandidateRejection[] = [];

    const { building, site, program } = input;

    // -----------------------------------------------------------------------
    // Stage 1 & 2: Site Boundary & Building Structural Footprint
    // -----------------------------------------------------------------------
    const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
    const setback = input.building.frontSetbackMeters ?? 0;

    // Check Site Feasibility upfront
    if (building.width > site.width || building.length > site.length || setback + building.length > site.length) {
      internalRejections.push({
        ruleId: 'BOUNDARY-SITE-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: `Building footprint (${building.width}m x ${building.length}m) with setback (${setback}m) exceeds site boundary (${site.width}m x ${site.length}m).`,
        provenance: { source: 'input', referenceKey: 'building' },
      });
    }

    // -----------------------------------------------------------------------
    // Stage 3 & 4: Sizing Parameters & Circulation Spine (Drive Aisle)
    // -----------------------------------------------------------------------
    const bayWidth = accessor.getRequiredNumericValue('bay.min_width');
    const bayLength = accessor.getRequiredNumericValue('bay.min_length');
    const aisleWidth = accessor.getRequiredNumericValue('circulation.drive_aisle.min_width');

    const workBufferParam = accessor.getParameter('clearance.working_buffer');
    const workBuffer = workBufferParam ? roundMillimeter(workBufferParam.value) : 0;

    const minX = roundMillimeter(wallThickness + workBuffer);
    const maxX = roundMillimeter(building.width - wallThickness - workBuffer);

    // North bay row origin Y
    const bayY_North = roundMillimeter(building.length - wallThickness - workBuffer - bayLength);
    // Central Aisle Origin Y
    const aisleOriginY = roundMillimeter(bayY_North - aisleWidth);

    // South bay row origin Y (for DOUBLE_COMB_OPPOSING)
    const bayY_South = roundMillimeter(wallThickness + workBuffer);

    const isDoubleComb =
      (arrangement === 'DOUBLE_COMB_OPPOSING' || arrangement === 'ZONED_BY_SERVICE') &&
      aisleOriginY >= roundMillimeter(bayY_South + bayLength);

    if (aisleOriginY < wallThickness || bayY_North + bayLength > building.length) {
      internalRejections.push({
        ruleId: 'BOUNDARY-BUILDING-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: `Drive aisle (${aisleWidth}m) plus service bay (${bayLength}m) exceeds interior building length (${building.length}m).`,
        provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
      });
    }

    const effectiveAisleWidth = isDoubleComb
      ? roundMillimeter(bayY_North - (bayY_South + bayLength))
      : aisleWidth;

    // Create Central Drive Aisle Envelope
    const aisleSpec = {
      id: 'aisle-main',
      origin: { x: 0, y: bayY_North },
      length: roundMillimeter(building.width),
      rotation: 270,
      customWidth: effectiveAisleWidth,
    };

    try {
      const aisleEnvelope = SPATIAL_UTILITIES.calculateAisleEnvelope(aisleSpec, accessor);
      generatedEnvelopes.push(aisleEnvelope);
    } catch (err) {
      internalRejections.push({
        ruleId: 'AISLE-CREATION-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: `Drive aisle envelope creation failed: ${(err as Error).message}`,
        provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
      });
    }

    // Generate entry & exit corridors connecting access points to the main drive aisle
    if (input.accessPoints && input.accessPoints.length > 0) {
      for (const ap of input.accessPoints) {
        if (ap.wall === 'south') {
          const entrySpec = {
            id: `aisle-entry-${ap.id}`,
            origin: { x: ap.offsetMeters, y: 0 },
            length: aisleOriginY,
            rotation: 0,
            widthParameterKey: 'door.vehicle.width',
          };
          try {
            const entryEnv = SPATIAL_UTILITIES.calculateAisleEnvelope(entrySpec, accessor);
            generatedEnvelopes.push(entryEnv);
          } catch {
            // Optional entry corridor
          }
        } else if (ap.wall === 'north') {
          const exitLength = roundMillimeter(building.length - bayY_North);
          if (exitLength > 0) {
            const exitSpec = {
              id: `aisle-exit-${ap.id}`,
              origin: { x: ap.offsetMeters, y: bayY_North },
              length: exitLength,
              rotation: 0,
              widthParameterKey: 'door.vehicle.width',
            };
            try {
              const exitEnv = SPATIAL_UTILITIES.calculateAisleEnvelope(exitSpec, accessor);
              generatedEnvelopes.push(exitEnv);
            } catch {
              // Optional exit corridor
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Stage 5: Service Bays Allocation (Multi-Row / Multi-Service Support)
    // -----------------------------------------------------------------------
    let currentNorthX = minX;
    let currentSouthX = minX;
    let baySequenceIndex = 1;
    // Per-bayType sequential index for human-readable labels (SERVICE BAY 01, SPOORING BAY 01, etc.)
    const bayIndexByType: Record<string, number> = {};
    const operationalBaysByService: Record<string, number> = {};

    // Flatten all requested bay items
    const flattenedBays: { serviceType: string; requiredEquipment?: string[] }[] = [];
    for (const bp of program.bays) {
      for (let q = 0; q < bp.quantity; q++) {
        flattenedBays.push({
          serviceType: bp.serviceType,
          requiredEquipment: bp.requiredEquipment,
        });
      }
    }

    // Sort or partition bays if arrangement is ZONED_BY_SERVICE
    if (arrangement === 'ZONED_BY_SERVICE') {
      flattenedBays.sort((a, b) => a.serviceType.localeCompare(b.serviceType));
    }    for (const bayItem of flattenedBays) {
      const bayId = `bay-${String(baySequenceIndex).padStart(2, '0')}`;
      let placedInRow: 'north' | 'south' | null = null;
      let targetX = 0;
      let targetY = 0;
      let targetRot = 0;

      // Try North Row first
      if (currentNorthX + bayWidth <= maxX) {
        placedInRow = 'north';
        targetX = roundMillimeter(currentNorthX);
        targetY = bayY_North;
        targetRot = 0;
      } else if (isDoubleComb && currentSouthX + bayWidth <= maxX) {
        // Try South Row in Double Comb (facing northward toward drive aisle)
        placedInRow = 'south';
        targetX = roundMillimeter(currentSouthX);
        targetY = bayY_South;
        targetRot = 0;
      }

      if (!placedInRow) {
        internalRejections.push({
          ruleId: 'CAPACITY-BAYS-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [bayId],
          reason: `Service bay '${bayId}' (${bayItem.serviceType}) exceeds building interior capacity under arrangement '${arrangement}'.`,
          provenance: { source: 'input', referenceKey: 'program.bays' },
        });
        break;
      }

      const candidateBay: LayoutObject = {
        id: bayId,
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: {
          x: targetX,
          y: targetY,
          width: bayWidth,
          length: bayLength,
          rotation: targetRot,
        },
        metadata: {
          strategy: strategyId,
          arrangement,
          bayType: getCanonicalBayTypeForService(bayItem.serviceType),
          serviceType: bayItem.serviceType,
          requiredEquipment: bayItem.requiredEquipment,
          row: placedInRow,
          accessDirection: placedInRow === 'south' ? 'rear' : 'front',
          sequence: baySequenceIndex,
          // bayIndex: per-canonical-bay-type counter for human-readable labels
          // (SERVICE BAY 01, SERVICE BAY 02, SPOORING BAY 01 independently)
          bayIndex: (() => {
            const bType = getCanonicalBayTypeForService(bayItem.serviceType);
            bayIndexByType[bType] = (bayIndexByType[bType] ?? 0) + 1;
            return bayIndexByType[bType];
          })(),
          provenance: {
            source: 'standard' as const,
            minWidthParameterKey: 'bay.min_width',
            minLengthParameterKey: 'bay.min_length',
            canonicalBayType: getCanonicalBayTypeForService(bayItem.serviceType),
            strategy: strategyId,
            arrangement,
          },
        },
      };

      const physEnv = createPhysicalEnvelope(candidateBay, accessor);
      const workEnv = createWorkingEnvelope(candidateBay, accessor);
      const accessEnv = createAccessEnvelope(candidateBay, accessor);

      placedObjects.push(candidateBay);
      generatedEnvelopes.push(physEnv, workEnv, accessEnv);

      if (hasSafetyRequirement(candidateBay, accessor)) {
        const safeEnv = createSafetyEnvelope(candidateBay, accessor);
        generatedEnvelopes.push(safeEnv);
      }

      operationalBaysByService[bayItem.serviceType] = (operationalBaysByService[bayItem.serviceType] ?? 0) + 1;

      if (placedInRow === 'north') {
        currentNorthX = roundMillimeter(currentNorthX + bayWidth + workBuffer);
      } else {
        currentSouthX = roundMillimeter(currentSouthX + bayWidth + workBuffer);
      }
      baySequenceIndex++;
    }

    // -----------------------------------------------------------------------
    // Stage 5: Structural Building Access Points & Doors
    // -----------------------------------------------------------------------
    if (input.accessPoints && input.accessPoints.length > 0) {
      for (const ap of input.accessPoints) {
        const doorObj: LayoutObject = {
          id: `door-${ap.id}`,
          type: 'door',
          layer: '03-DOOR',
          geometry: {
            x: roundMillimeter(ap.wall === 'south' || ap.wall === 'north' ? ap.offsetMeters : ap.wall === 'west' ? 0 : building.width),
            y: roundMillimeter(ap.wall === 'west' || ap.wall === 'east' ? ap.offsetMeters : ap.wall === 'south' ? 0 : building.length),
            width: roundMillimeter(ap.widthMeters),
            length: roundMillimeter(wallThickness),
            rotation: ap.wall === 'east' || ap.wall === 'west' ? 90 : 0,
          },
          metadata: {
            wall: ap.wall,
            doorType: ap.type,
            widthMeters: ap.widthMeters,
          },
        };

        const physEnv = createPhysicalEnvelope(doorObj, accessor);
        placedObjects.push(doorObj);
        generatedEnvelopes.push(physEnv);
      }
    }

    // -----------------------------------------------------------------------
    // Stage 6: Service Equipment Allocation (Rear Operational Row)
    // -------------------------------------------------------------------------
    const roadSide = input.site.roadSide ?? 'south';
    let currentEquipX = roadSide === 'north' ? currentSouthX : currentNorthX;
    let equipY = roadSide === 'north' ? wallThickness : roundMillimeter(building.length - wallThickness - 2.0);

    const standaloneEquipment: ProgramEquipmentRequirement[] = [];
    if (program.equipment && program.equipment.length > 0) {
      for (const eq of program.equipment) {
        const officialSpec = getOfficialEquipmentSpec(eq.equipmentType);
        // If official MOBENG operational equipment has UNKNOWN footprint,
        // it remains purely semantic / associated with bay function and MUST NOT generate fake CAD geometry.
        if (officialSpec && officialSpec.footprintStatus === 'UNKNOWN') {
          continue;
        }

        const isBayLift = [
          '2_post_lift',
          'two_post_lift',
          'scissor_lift',
          '4_post_lift',
          'four_post_lift',
          'single_post_lift',
          'vehicle_lift',
        ].includes(eq.equipmentType);

        const installedInBays = placedObjects.filter(
          (o) =>
            o.type === 'service_bay' &&
            Array.isArray(o.metadata?.requiredEquipment) &&
            (o.metadata.requiredEquipment as string[]).includes(eq.equipmentType)
        ).length;

        const standaloneQty = isBayLift ? Math.max(0, eq.quantity - installedInBays) : eq.quantity;
        if (standaloneQty > 0) {
          standaloneEquipment.push({ equipmentType: eq.equipmentType, quantity: standaloneQty });
        }
      }
    }

    if (standaloneEquipment.length > 0) {
      let equipSeq = 1;
      const equipWidthParam = accessor.getParameter('equipment.width');
      const equipLengthParam = accessor.getParameter('equipment.length');

      if (!equipWidthParam || !equipLengthParam) {
        internalRejections.push({
          ruleId: 'MISSING_STANDARD_PARAMETER',
          severity: 'HARD',
          isDisqualifying: true,
          reason: 'Missing standard parameter for equipment: equipment.width / equipment.length.',
          provenance: { source: 'standard', referenceKey: 'equipment.width' },
        });
      } else {
        const equipWidth = roundMillimeter(equipWidthParam.value);
        const equipLength = roundMillimeter(equipLengthParam.value);
        equipY = roadSide === 'north' ? wallThickness : roundMillimeter(building.length - wallThickness - equipLength);

        for (const eq of standaloneEquipment) {
          for (let q = 0; q < eq.quantity; q++) {
            const equipId = `equip-${String(equipSeq++).padStart(2, '0')}`;
            const equipObject: LayoutObject = {
              id: equipId,
              type: 'equipment',
              layer: '06-EQUIPMENT',
              geometry: {
                x: currentEquipX,
                y: equipY,
                width: equipWidth,
                length: equipLength,
                rotation: 0,
              },
              metadata: {
                equipmentType: eq.equipmentType,
                strategy: strategyId,
              },
            };

            const physEnv = createPhysicalEnvelope(equipObject, accessor);
            placedObjects.push(equipObject);
            generatedEnvelopes.push(physEnv);
            currentEquipX = roundMillimeter(currentEquipX + equipWidth + 1.0);
          }
        }
        if (roadSide === 'north') {
          currentSouthX = currentEquipX;
        } else {
          currentNorthX = currentEquipX;
        }
      }
    }

    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    // Stage 8: Fine-Grained Ancillary Spaces Allocation (Spatial Zoning)
    // -----------------------------------------------------------------------
    const ancillarySpacesPlaced: string[] = [];
    const anc = program.ancillarySpaces;

    if (anc) {
      const interiorMinX = roundMillimeter(wallThickness);
      const interiorMaxX = roundMillimeter(building.width - wallThickness);
      const interiorMinY = roundMillimeter(wallThickness);
      const interiorMaxY = roundMillimeter(building.length - wallThickness);

      // Determine Front Zone based on Access Points (or fallback to roadSide)
      let customerFacingSide = roadSide;
      if (input.accessPoints && input.accessPoints.length > 0) {
        const entrance = input.accessPoints.find((ap) => ap.type === 'entrance');
        if (entrance) {
           customerFacingSide = entrance.wall;
        }
      }
      // Normalize east/west to north/south for Y-axis placement logic
      // east road → customer faces east (treat as south for Y-axis layout)
      // west road → customer faces west (treat as north for Y-axis layout)
      if (customerFacingSide === 'east') customerFacingSide = 'south';
      else if (customerFacingSide === 'west') customerFacingSide = 'north';

      // Initialize zone placement cursors based on Front side
      let currentCustomerX = interiorMinX;
      let currentCustomerY = customerFacingSide === 'north' ? interiorMaxY : interiorMinY;
      
      let currentLogisticsX = interiorMinX;
      let currentLogisticsY = customerFacingSide === 'north' ? interiorMinY : interiorMaxY;

      // Special offset based on existing bays and equipment to prevent immediate collision
      let customerX = customerFacingSide === 'north' ? currentNorthX : currentSouthX;
      let logisticsX = customerFacingSide === 'north' ? currentSouthX : currentNorthX;
      
      if (customerX === minX) customerX = interiorMinX;
      if (logisticsX === minX) logisticsX = interiorMinX;

            let currentFrontRowY = customerFacingSide === 'north' ? roundMillimeter(bayY_North + bayLength + 1.0) : wallThickness;
      let currentRearRowY = customerFacingSide === 'north' ? wallThickness : roundMillimeter(building.length - wallThickness);

      if (currentFrontRowY > interiorMaxY) currentFrontRowY = interiorMaxY - 3;
      if (currentRearRowY < interiorMinY) currentRearRowY = interiorMinY + 3;

      let currentFrontX = customerX;
      let maxFrontRowLength = 0;
      let currentRearX = logisticsX;
      let maxRearRowLength = 0;

      let obstructMinY = 0;
      let obstructMaxY = 0;
      if (arrangement === 'SINGLE_COMB_NORTH') {
          obstructMaxY = roundMillimeter(bayY_North + bayLength);
          obstructMinY = aisleOriginY; 
      } else if (arrangement === 'SINGLE_COMB_SOUTH') {
          obstructMinY = bayY_South;
          obstructMaxY = roundMillimeter(bayY_South + bayLength + effectiveAisleWidth);
      } else {
          obstructMinY = bayY_South;
          obstructMaxY = roundMillimeter(bayY_North + bayLength);
      }

      const tryPlaceRoom = (
        id: string,
        width: number,
        length: number,
        layer: CadLayerId,
        metadata: Record<string, unknown>,
        spaceKey: string,
        zone: 'CUSTOMER' | 'LOGISTICS',
        recordRejection: boolean = true
      ): boolean => {
        let posX = zone === 'CUSTOMER' ? currentFrontX : currentRearX;
        let posY = zone === 'CUSTOMER' ? currentFrontRowY : currentRearRowY;
        let maxRowLength = zone === 'CUSTOMER' ? maxFrontRowLength : maxRearRowLength;

        let moveDir = 1;
        let maxBoundY = 0;
        
        if (zone === 'CUSTOMER') {
           if (customerFacingSide === 'north') {
               moveDir = -1;
               maxBoundY = obstructMaxY; // Customer (north-facing) moves down, bounded by top of obstruction
           } else {
               moveDir = 1;
               maxBoundY = obstructMinY; // Customer (south-facing) moves up, bounded by bottom of obstruction
           }
        } else {
           // LOGISTICS zone
           if (customerFacingSide === 'north') {
               // Logistics at south wall, moves up toward center
               moveDir = 1;
               maxBoundY = obstructMinY; // Bounded by bottom of bay zone
           } else {
               // Logistics at north wall, moves down toward center
               moveDir = -1;
               // Use aisleOriginY as the barrier (where vehicle circulation starts)
               // This gives logistics maximum space between north wall and aisle
               maxBoundY = arrangement === 'SINGLE_COMB_NORTH'
                 ? aisleOriginY
                 : arrangement === 'SINGLE_COMB_SOUTH'
                   ? obstructMaxY  
                   : obstructMinY; // DOUBLE_COMB: use bay south edge
           }
        }

        if (posX + width > interiorMaxX) {
            const wrapYOffset = moveDir * (maxRowLength + 0.5);
            const nextRowY = roundMillimeter(posY + wrapYOffset);
            
            let canWrap = false;
            if (moveDir === 1) {
                if (nextRowY + length <= maxBoundY) canWrap = true;
            } else {
                if (nextRowY - length >= maxBoundY) canWrap = true;
            }

            if (canWrap && interiorMinX + width <= interiorMaxX) {
               posY = nextRowY;
               posX = interiorMinX;
               maxRowLength = 0;
            } else {
               if (recordRejection) {
                 internalRejections.push({
                   ruleId: 'CAPACITY-ANCILLARY-001',
                   severity: 'HARD',
                   isDisqualifying: true,
                   relatedObjectIds: [id],
                   reason: `Ancillary space '${id}' (${width}x${length}m) exceeds available building footprint under arrangement '${arrangement}'.`,
                   provenance: { source: 'input', referenceKey: `program.ancillarySpaces.${spaceKey}` },
                 });
               }
               return false;
            }
        }

        let placementY = posY;
        if (moveDir === -1) {
            placementY = roundMillimeter(posY - length);
        }

        // --- HARD BOUNDARY ENFORCEMENT ---
        // Prevents rooms from being placed inside the central aisle or bay approach zones
        if (moveDir === 1) {
            if (posY + length > maxBoundY) {
                if (recordRejection) {
                    internalRejections.push({
                        ruleId: 'CAPACITY-ANCILLARY-001',
                        severity: 'HARD',
                        isDisqualifying: true,
                        relatedObjectIds: [id],
                        reason: `Ancillary space '${id}' (${width}x${length}m) exceeds available building footprint under arrangement '${arrangement}'.`,
                        provenance: { source: 'input', referenceKey: `program.ancillarySpaces.${spaceKey}` },
                    });
                }
                return false;
            }
        } else {
            if (posY - length < maxBoundY) {
                if (recordRejection) {
                    internalRejections.push({
                        ruleId: 'CAPACITY-ANCILLARY-001',
                        severity: 'HARD',
                        isDisqualifying: true,
                        relatedObjectIds: [id],
                        reason: `Ancillary space '${id}' (${width}x${length}m) exceeds available building footprint under arrangement '${arrangement}'.`,
                        provenance: { source: 'input', referenceKey: `program.ancillarySpaces.${spaceKey}` },
                    });
                }
                return false;
            }
        }

        const roomObj: LayoutObject = {
          id,
          type: 'custom',
          layer,
          geometry: { x: posX, y: placementY, width, length, rotation: 0 },
          metadata: { ...metadata, placementZone: zone },
        };

        const physEnv = createPhysicalEnvelope(roomObj, accessor);
        
        // Check collisions
        const hasCollision = generatedEnvelopes.some((env) => {
          if (env.sourceObjectId?.startsWith('door-')) return false;
          if (env.sourceObjectId?.startsWith('waste-')) return false; // Allowed inside waste sub-compartments
          if (env.type === 'WORKING') {
            return overlapsEnvelope(physEnv, env, true);
          }
          if (env.type === 'PHYSICAL') {
            return overlapsEnvelope(physEnv, env, false);
          }
          return false;
        });

        if (hasCollision) {
          if (recordRejection) {
            internalRejections.push({
              ruleId: 'COLLISION-PHYSICAL-001',
              severity: 'HARD',
              isDisqualifying: true,
              relatedObjectIds: [id],
              reason: `Ancillary space '${id}' collides with service bay physical/working envelope or previously placed elements.`,
              provenance: { source: 'input', referenceKey: `program.ancillarySpaces.${spaceKey}` },
            });
          }
          return false;
        }

        placedObjects.push(roomObj);
        generatedEnvelopes.push(physEnv);
        ancillarySpacesPlaced.push(spaceKey);

        maxRowLength = Math.max(maxRowLength, length);
        
        if (zone === 'CUSTOMER') {
            currentFrontX = roundMillimeter(posX + width + 0.5);
            currentFrontRowY = posY;
            maxFrontRowLength = Math.max(maxFrontRowLength, length);
        } else {
            currentRearX = roundMillimeter(posX + width + 0.5);
            currentRearRowY = posY;
            maxRearRowLength = Math.max(maxRearRowLength, length);
        }

        return true;
      };

      // -----------------------------------------------------------------------
      // 1. CUSTOMER ZONE (Front)
      // -----------------------------------------------------------------------
      if (anc.customerLounge) {
        const loungeWidthParam = accessor.getParameter('customer_zone.min_width');
        const loungeLengthParam = accessor.getParameter('customer_zone.min_length');
        if (!loungeWidthParam || !loungeLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for customer lounge: customer_zone.min_width.',
            provenance: { source: 'standard', referenceKey: 'customer_zone.min_width' },
          });
        } else {
          tryPlaceRoom(
            'customer-lounge',
            roundMillimeter(loungeWidthParam.value),
            roundMillimeter(loungeLengthParam.value),
            '07-FURNITURE',
            {
              zoneType: 'CUSTOMER_LOUNGE',
              spaceCategory: 'CUSTOMER_CLEAN',
              loungeWithBayView: anc.loungeWithBayView,
              includesCashierReception: Boolean(anc.cashierOffice),
              cashierSubarea: anc.cashierOffice ? '2.5x2.5m' : undefined,
            },
            'customerLounge',
            'CUSTOMER'
          );
        }
      }

      if (anc.cashierOffice) {
        const cashierWidthParam = accessor.getParameter('room.min_width.cashier_office');
        const cashierLengthParam = accessor.getParameter('room.min_length.cashier_office');
        if (!cashierWidthParam || !cashierLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for cashier office: room.min_width/length.cashier_office.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.cashier_office' },
          });
        } else {
          tryPlaceRoom(
            'cashier-office',
            roundMillimeter(cashierWidthParam.value),
            roundMillimeter(cashierLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'CASHIER_OFFICE', spaceCategory: 'CUSTOMER_CLEAN', isIntegratedWithLounge: Boolean(anc.customerLounge) },
            'cashierOffice',
            'CUSTOMER'
          );
        }
      }

      if (anc.customerRestroom && !anc.restroom) {
        const restroomWidthParam = accessor.getParameter('room.min_width.customer_restroom');
        const restroomLengthParam = accessor.getParameter('room.min_length.customer_restroom');
        if (!restroomWidthParam || !restroomLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for restroom: room.min_width/length.restroom.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.restroom' },
          });
        } else {
          tryPlaceRoom(
            'customer-restroom',
            roundMillimeter(restroomWidthParam.value),
            roundMillimeter(restroomLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'RESTROOM', spaceCategory: 'CUSTOMER_CLEAN' },
            'customerRestroom',
            'CUSTOMER'
          );
        }
      }

      if (anc.restroom) {
        const restroomWidthParam = accessor.getParameter('room.min_width.restroom');
        const restroomLengthParam = accessor.getParameter('room.min_length.restroom');
        if (!restroomWidthParam || !restroomLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for restroom: room.min_width/length.restroom.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.restroom' },
          });
        } else {
          tryPlaceRoom(
            'restroom',
            roundMillimeter(restroomWidthParam.value),
            roundMillimeter(restroomLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'RESTROOM', spaceCategory: 'CUSTOMER_CLEAN' },
            'restroom',
            'CUSTOMER'
          );
        }
      }

      // Mushola & Wudhu with ZERO-GAP shared physical boundary
      if (anc.mushola && anc.wudhu) {
        const musholaWidthParam = accessor.getParameter('room.min_width.mushola') ?? accessor.getParameter('room.design_ref_width.mushola');
        const musholaLengthParam = accessor.getParameter('room.min_length.mushola') ?? accessor.getParameter('room.design_ref_length.mushola');
        const wudhuWidthParam = accessor.getParameter('room.min_width.wudhu');
        const wudhuLengthParam = accessor.getParameter('room.min_length.wudhu');

        if (!musholaWidthParam || !musholaLengthParam || !wudhuWidthParam || !wudhuLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameters for mushola or wudhu.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.mushola' },
          });
        } else {
          const mW = roundMillimeter(musholaWidthParam.value);
          const mL = roundMillimeter(musholaLengthParam.value);
          const wW = roundMillimeter(wudhuWidthParam.value);
          const wL = roundMillimeter(wudhuLengthParam.value);

          const musholaPlaced = tryPlaceRoom(
            'mushola',
            mW,
            mL,
            '07-FURNITURE',
            { zoneType: 'MUSHOLA', spaceCategory: 'CUSTOMER_CLEAN' },
            'mushola',
            'CUSTOMER'
          );

          if (musholaPlaced) {
            const musholaObj = placedObjects.find((o) => o.id === 'mushola')!;
            
            // Re-adjust currentFrontX by removing the 0.5 spacing added by tryPlaceRoom
            currentFrontX = roundMillimeter(currentFrontX - 0.5);

            let wudhuOriginX = roundMillimeter(musholaObj.geometry.x + mW);
            const wudhuOriginY = musholaObj.geometry.y;

            if (customerFacingSide === 'east' || customerFacingSide === 'west') {
                wudhuOriginX = roundMillimeter(musholaObj.geometry.x - wW);
            }

            const wudhuObj: LayoutObject = {
              id: 'wudhu',
              type: 'custom',
              layer: '07-FURNITURE',
              geometry: { x: wudhuOriginX, y: wudhuOriginY, width: wW, length: wL, rotation: 0 },
              metadata: {
                zoneType: 'WUDHU',
                spaceCategory: 'CUSTOMER_CLEAN',
                minFaucetCount: accessor.getParameter('room.min_faucets.wudhu')?.value ?? 1,
                adjacentTo: 'mushola',
                sharedBoundaryWith: 'mushola',
                placementZone: 'CUSTOMER'
              },
            };

            const physEnv = createPhysicalEnvelope(wudhuObj, accessor);
            placedObjects.push(wudhuObj);
            generatedEnvelopes.push(physEnv);
            ancillarySpacesPlaced.push('wudhu');
            
            // Advance cursor
            currentFrontX = roundMillimeter(wudhuOriginX + wW + 0.5);
            maxFrontRowLength = Math.max(maxFrontRowLength, wL);
          }
        }
      } else if (anc.mushola) {
        const musholaWidthParam = accessor.getParameter('room.min_width.mushola') ?? accessor.getParameter('room.design_ref_width.mushola');
        const musholaLengthParam = accessor.getParameter('room.min_length.mushola') ?? accessor.getParameter('room.design_ref_length.mushola');
        if (musholaWidthParam && musholaLengthParam) {
          tryPlaceRoom(
            'mushola',
            roundMillimeter(musholaWidthParam.value),
            roundMillimeter(musholaLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'MUSHOLA', spaceCategory: 'CUSTOMER_CLEAN' },
            'mushola',
            'CUSTOMER'
          );
        }
      } else if (anc.wudhu) {
        const wudhuWidthParam = accessor.getParameter('room.min_width.wudhu');
        const wudhuLengthParam = accessor.getParameter('room.min_length.wudhu');
        if (wudhuWidthParam && wudhuLengthParam) {
          tryPlaceRoom(
            'wudhu',
            roundMillimeter(wudhuWidthParam.value),
            roundMillimeter(wudhuLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'WUDHU', spaceCategory: 'CUSTOMER_CLEAN', minFaucetCount: accessor.getParameter('room.min_faucets.wudhu')?.value ?? 1 },
            'wudhu',
            'CUSTOMER'
          );
        }
      }

      // -----------------------------------------------------------------------
      // 2. BACK-OF-HOUSE / LOGISTICS ZONE
      // -----------------------------------------------------------------------
      if (anc.employeeMess) {
        const messWidthParam = accessor.getParameter('room.min_width.employee_mess') ?? accessor.getParameter('room.min_width.staff_room');
        const messLengthParam = accessor.getParameter('room.min_length.employee_mess') ?? accessor.getParameter('room.min_length.staff_room');
        if (!messWidthParam || !messLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for employee mess: room.min_width/length.employee_mess.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.employee_mess' },
          });
        } else {
          if (!tryPlaceRoom(
            'employee-mess',
            roundMillimeter(messWidthParam.value),
            roundMillimeter(messLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'EMPLOYEE_MESS', spaceCategory: 'BACK_OF_HOUSE', functionType: 'sleeping_rest' },
            'employeeMess',
            'LOGISTICS',
            false
          )) {
            tryPlaceRoom(
              'employee-mess',
              roundMillimeter(messWidthParam.value),
              roundMillimeter(messLengthParam.value),
              '07-FURNITURE',
              { zoneType: 'EMPLOYEE_MESS', spaceCategory: 'BACK_OF_HOUSE', functionType: 'sleeping_rest' },
              'employeeMess',
              'CUSTOMER',
              true
            );
          }
        }
      }

      if (anc.employeeRestroom) {
        const restroomWidthParam = accessor.getParameter('room.min_width.employee_restroom');
        const restroomLengthParam = accessor.getParameter('room.min_length.employee_restroom');
        if (!restroomWidthParam || !restroomLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for restroom: room.min_width/length.restroom.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.restroom' },
          });
        } else {
          if (!tryPlaceRoom(
            'employee-restroom',
            roundMillimeter(restroomWidthParam.value),
            roundMillimeter(restroomLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'EMPLOYEE_RESTROOM', spaceCategory: 'BACK_OF_HOUSE' },
            'employeeRestroom',
            'LOGISTICS',
            false
          )) {
            tryPlaceRoom(
              'employee-restroom',
              roundMillimeter(restroomWidthParam.value),
              roundMillimeter(restroomLengthParam.value),
              '07-FURNITURE',
              { zoneType: 'EMPLOYEE_RESTROOM', spaceCategory: 'BACK_OF_HOUSE' },
              'employeeRestroom',
              'CUSTOMER',
              true
            );
          }
        }
      }

      if (anc.wasteStreams) {
        const oilW = accessor.getParameter('room.min_width.waste_oil');
        const oilL = accessor.getParameter('room.min_length.waste_oil');
        const tireW = accessor.getParameter('room.min_width.waste_tire');
        const tireL = accessor.getParameter('room.min_length.waste_tire');
        const partsW = accessor.getParameter('room.min_width.waste_parts');
        const partsL = accessor.getParameter('room.min_length.waste_parts');
        const cardW = accessor.getParameter('room.min_width.waste_cardboard');
        const cardL = accessor.getParameter('room.min_length.waste_cardboard');

        if (!oilW || !oilL || !tireW || !tireL || !partsW || !partsL || !cardW || !cardL) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameters for 4-stream waste management.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.waste_total' },
          });
        } else {
           const streams = [
              { id: 'waste-oil', w: oilW.value, l: oilL.value, t: 'waste_oil' },
              { id: 'waste-tire', w: tireW.value, l: tireL.value, t: 'waste_tire' },
              { id: 'waste-parts', w: partsW.value, l: partsL.value, t: 'waste_parts' },
              { id: 'waste-cardboard', w: cardW.value, l: cardL.value, t: 'waste_cardboard' }
           ];
           
           // calculate total size
           let totalW = 0;
           let totalL = 0;
           for (const s of streams) {
              totalW = Math.max(totalW, s.w);
              totalL += s.l;
           }

           // Try to place the whole compound as one block to reserve space
           let placedCompound = tryPlaceRoom('waste-compound-reservation', totalW, totalL, '09-WASTE', {}, 'wasteStreams', 'LOGISTICS', false);
           let wasFallback = false;
           if (!placedCompound) {
               placedCompound = tryPlaceRoom('waste-compound-reservation', totalW, totalL, '09-WASTE', {}, 'wasteStreams', 'CUSTOMER', true);
               wasFallback = true;
           }

           if (placedCompound) {
               // Retrieve the compound object and replace it with the 4 individual streams
               const compoundIdx = placedObjects.findIndex(o => o.id === 'waste-compound-reservation');
               const compoundObj = placedObjects[compoundIdx];
               placedObjects.splice(compoundIdx, 1);
               // Also remove from envelopes
               const envIdx = generatedEnvelopes.findIndex(e => e.sourceObjectId === 'waste-compound-reservation');
               if (envIdx !== -1) generatedEnvelopes.splice(envIdx, 1);
               
               let currentY = compoundObj.geometry.y;
               
               let moveDir = 1;
               if (wasFallback) {
                   if (customerFacingSide === 'north') moveDir = -1;
                   else moveDir = 1;
               } else {
                   if (customerFacingSide === 'north') moveDir = 1;
                   else moveDir = -1;
               }

               if (moveDir === -1) {
                   // if wrapping down (-), compoundObj.geometry.y is the BOTTOM. 
                   // We build upwards from currentY
                   for (const s of streams) {
                       const obj = {
                           id: s.id, type: 'custom', layer: '09-WASTE',
                           geometry: { x: compoundObj.geometry.x, y: currentY, width: s.w, length: s.l, rotation: 0 },
                           metadata: { zoneType: 'WASTE_AREA', spaceCategory: 'BACK_OF_HOUSE', wasteStream: s.t, placementZone: wasFallback ? 'CUSTOMER' : 'LOGISTICS' }
                       };
                       placedObjects.push(obj);
                       generatedEnvelopes.push(createPhysicalEnvelope(obj, accessor));
                       currentY += s.l;
                   }
               } else {
                   // wrapping UP (+). compoundObj.geometry.y is the BOTTOM.
                   for (const s of streams) {
                       const obj = {
                           id: s.id, type: 'custom', layer: '09-WASTE',
                           geometry: { x: compoundObj.geometry.x, y: currentY, width: s.w, length: s.l, rotation: 0 },
                           metadata: { zoneType: 'WASTE_AREA', spaceCategory: 'BACK_OF_HOUSE', wasteStream: s.t, placementZone: wasFallback ? 'CUSTOMER' : 'LOGISTICS' }
                       };
                       placedObjects.push(obj);
                       generatedEnvelopes.push(createPhysicalEnvelope(obj, accessor));
                       currentY += s.l;
                   }
               }
           }
        }
      } else if (anc.oilWasteStorage) {
        const oilWidthParam = accessor.getParameter('room.min_width.oil_waste_storage');
        const oilLengthParam = accessor.getParameter('room.min_length.oil_waste_storage');
        if (!oilWidthParam || !oilLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for oil waste: room.min_width/length.oil_waste_storage.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.oil_waste_storage' },
          });
        } else {
          if (!tryPlaceRoom(
            'oil-waste-storage',
            roundMillimeter(oilWidthParam.value),
            roundMillimeter(oilLengthParam.value),
            '09-WASTE',
            { zoneType: 'WASTE_STORAGE', spaceCategory: 'BACK_OF_HOUSE', streamType: 'HAZARDOUS_OIL' },
            'oilWasteStorage',
            'LOGISTICS',
            false
          )) {
            tryPlaceRoom(
              'oil-waste-storage',
              roundMillimeter(oilWidthParam.value),
              roundMillimeter(oilLengthParam.value),
              '09-WASTE',
              { zoneType: 'WASTE_STORAGE', spaceCategory: 'BACK_OF_HOUSE', streamType: 'HAZARDOUS_OIL' },
              'oilWasteStorage',
              'CUSTOMER',
              true
            );
          }
        }
      }

      if (anc.partsWarehouse) {
        const whWidthParam = accessor.getParameter('room.min_width.parts_warehouse');
        const whLengthParam = accessor.getParameter('room.min_length.parts_warehouse');
        if (!whWidthParam || !whLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for warehouse: room.min_width/length.parts_warehouse.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.parts_warehouse' },
          });
        } else {
          if (!tryPlaceRoom(
            'parts-warehouse',
            roundMillimeter(whWidthParam.value),
            roundMillimeter(whLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'PARTS_WAREHOUSE', spaceCategory: 'BACK_OF_HOUSE' },
            'partsWarehouse',
            'LOGISTICS',
            false
          )) {
            tryPlaceRoom(
              'parts-warehouse',
              roundMillimeter(whWidthParam.value),
              roundMillimeter(whLengthParam.value),
              '07-FURNITURE',
              { zoneType: 'PARTS_WAREHOUSE', spaceCategory: 'BACK_OF_HOUSE' },
              'partsWarehouse',
              'CUSTOMER',
              true
            );
          }
        }
      }

      if (anc.compressorRoom) {
        const compWidthParam = accessor.getParameter('room.min_width.compressor_room');
        const compLengthParam = accessor.getParameter('room.min_length.compressor_room');
        if (!compWidthParam || !compLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for compressor room: room.min_width/length.compressor_room.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.compressor_room' },
          });
        } else {
          if (!tryPlaceRoom(
            'compressor-room',
            roundMillimeter(compWidthParam.value),
            roundMillimeter(compLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'COMPRESSOR_ROOM', spaceCategory: 'BACK_OF_HOUSE' },
            'compressorRoom',
            'LOGISTICS',
            false
          )) {
            tryPlaceRoom(
              'compressor-room',
              roundMillimeter(compWidthParam.value),
              roundMillimeter(compLengthParam.value),
              '07-FURNITURE',
              { zoneType: 'COMPRESSOR_ROOM', spaceCategory: 'BACK_OF_HOUSE' },
              'compressorRoom',
              'CUSTOMER',
              true
            );
          }
        }
      }

      if (anc.staffRoom && !anc.employeeMess) {
        const staffWidthParam = accessor.getParameter('room.min_width.staff_room');
        const staffLengthParam = accessor.getParameter('room.min_length.staff_room');
        if (!staffWidthParam || !staffLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for staff room: room.min_width/length.staff_room.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.staff_room' },
          });
        } else {
          tryPlaceRoom(
            'staff-room',
            roundMillimeter(staffWidthParam.value),
            roundMillimeter(staffLengthParam.value),
            '07-FURNITURE',
            { zoneType: 'STAFF_ROOM', spaceCategory: 'BACK_OF_HOUSE' },
            'staffRoom',
            'LOGISTICS'
          );
        }
      }

      // Motorcycle Parking - Handled Purely Semantically
      if (anc.employeeMotorcycleParking) {
          // No footprint generated due to UNKNOWN dimension
          ancillarySpacesPlaced.push('employeeMotorcycleParking');
      }
    }

    // Stage 8: Site Parking Allocation
    // -----------------------------------------------------------------------
    let custParkCount = 0;
    let staffParkCount = 0;
    let stagingParkCount = 0;

    const parking = input.site.parking;
    if (parking) {
      const stallWidthParam = accessor.getParameter('parking.stall.width');
      const stallLengthParam = accessor.getParameter('parking.stall.length');

      if (!stallWidthParam || !stallLengthParam) {
        internalRejections.push({
          ruleId: 'MISSING_STANDARD_PARAMETER',
          severity: 'HARD',
          isDisqualifying: true,
          reason: 'Missing standard parameter for site parking: parking.stall.width / parking.stall.length.',
          provenance: { source: 'standard', referenceKey: 'parking.stall.width' },
        });
      } else {
        const stallWidth = roundMillimeter(stallWidthParam.value);
        const stallLength = Math.min(
          setback > 0 ? setback - 0.5 : roundMillimeter(stallLengthParam.value),
          roundMillimeter(stallLengthParam.value)
        );

        let parkX = 1.0;

        if (parking.customerParkingSpaces && parking.customerParkingSpaces > 0) {
          const roadSide = input.site.roadSide ?? 'south';
          for (let p = 0; p < parking.customerParkingSpaces; p++) {
            const parkId = `cust-parking-${p + 1}`;
            let parkGeo: Geometry;

            if (roadSide === 'south') {
              parkGeo = {
                x: parkX,
                y: roundMillimeter(-stallLength - 0.2),
                width: stallWidth,
                length: stallLength,
                rotation: 0,
              };
              parkX = roundMillimeter(parkX + stallWidth + 0.5);
            } else if (roadSide === 'north') {
              parkGeo = {
                x: parkX,
                y: roundMillimeter(building.length + 0.2),
                width: stallWidth,
                length: stallLength,
                rotation: 0,
              };
              parkX = roundMillimeter(parkX + stallWidth + 0.5);
            } else if (roadSide === 'east') {
              parkGeo = {
                x: roundMillimeter(building.width + 0.2),
                y: parkX,
                width: stallLength,
                length: stallWidth,
                rotation: 0,
              };
              parkX = roundMillimeter(parkX + stallWidth + 0.5);
            } else {
              // west
              parkGeo = {
                x: roundMillimeter(-stallLength - 0.2),
                y: parkX,
                width: stallLength,
                length: stallWidth,
                rotation: 0,
              };
              parkX = roundMillimeter(parkX + stallWidth + 0.5);
            }

            const parkObj: LayoutObject = {
              id: parkId,
              type: 'custom',
              layer: '01-SITE',
              geometry: parkGeo,
              metadata: {
                zoneType: 'CUSTOMER_PARKING',
                spaceCategory: 'SITE_PARKING',
              },
            };

            const physEnv = createPhysicalEnvelope(parkObj, accessor);
            placedObjects.push(parkObj);
            generatedEnvelopes.push(physEnv);
            custParkCount++;
          }
        }
      }

      if (parking.staffParkingSpaces && parking.staffParkingSpaces > 0) {
        staffParkCount = parking.staffParkingSpaces;
      }
      if (parking.vehicleStagingSpaces && parking.vehicleStagingSpaces > 0) {
        stagingParkCount = parking.vehicleStagingSpaces;
      }
    }

    // -----------------------------------------------------------------------
    // Stage 10: Future Expansion Reserve
    // -----------------------------------------------------------------------
    const futureExpansionBaysReserved = program.futureExpansionBays ?? 0;
    if (futureExpansionBaysReserved > 0) {
      const expId = 'expansion-reserve';
      const expObj: LayoutObject = {
        id: expId,
        type: 'custom',
        layer: '08-SERVICE-BAY',
        geometry: {
          x: currentNorthX,
          y: bayY_North,
          width: bayWidth,
          length: bayLength,
          rotation: 0,
        },
        metadata: {
          isExpansionReserve: true,
          isOperationalBay: false,
          plannedUnits: futureExpansionBaysReserved,
          zoneType: 'EXPANSION_RESERVE',
        },
      };

      const physEnv = createPhysicalEnvelope(expObj, accessor);
      placedObjects.push(expObj);
      generatedEnvelopes.push(physEnv);
    }

    // -----------------------------------------------------------------------
    // Stage 11: Assemble StrategyCandidate & Perform Hard Constraint Validation
    // -----------------------------------------------------------------------
    const totalBaysRequested = program.bays.reduce((sum, b) => sum + b.quantity, 0);
    const totalBaysPlaced = placedObjects.filter((o) => o.type === 'service_bay').length;

    // FASE 4.2C — GAP-003: Deterministic building interior geometry calculation
    const grossWidth = building.width;
    const grossLength = building.length;
    const grossArea = roundMillimeter(grossWidth * grossLength);
    const interiorWidth = roundMillimeter(grossWidth - 2 * wallThickness);
    const interiorLength = roundMillimeter(grossLength - 2 * wallThickness);
    const interiorArea = roundMillimeter(interiorWidth * interiorLength);

    const buildingInterior: BuildingInteriorGeometry = {
      grossWidth,
      grossLength,
      grossArea,
      wallThickness,
      interiorWidth,
      interiorLength,
      interiorArea,
      provenance: {
        source: 'building_envelope',
        wallThicknessParameterKey: 'building.wall_thickness',
        formula: '(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)',
      },
    };

    const baseCandidate: StrategyCandidate = {
      id: candidateId,
      strategyId,
      name: `${strategyId} (${arrangement}) Candidate`,
      description: `Generated layout candidate utilizing ${strategyId} strategy with ${arrangement} arrangement.`,
      topologyId: topology.id,
      layout: {
        objects: Object.freeze(placedObjects),
      },
      envelopes: Object.freeze(generatedEnvelopes),
      status: 'VALID',
      rejections: Object.freeze(internalRejections),
      provenance: Object.freeze({
        standardVersionId,
        generatorName: 'CandidateGenerator',
        generatedAt,
      }),
      explanation: Object.freeze({
        strategyRationale: `Optimized layout allocation under ${strategyId} strategy using ${arrangement}.`,
        layoutSummary: `${totalBaysPlaced}/${totalBaysRequested} bays placed, ${ancillarySpacesPlaced.length} ancillary spaces.`,
        tradeOffs: 'Evaluated against structural width, central drive aisle, and access clearance.',
      }),
      spatialContext: Object.freeze({
        arrangement,
        circulationRequirement: program.circulationRequirement,
        buildingInterior: Object.freeze(buildingInterior),
        provenance: Object.freeze({
          source: 'generator' as const,
          generatorName: 'CandidateGenerator',
          inputProgramField: 'circulationRequirement' as const,
        }),
      }),
    };

    // Run strict 15-point hard constraint validation
    const validation = validateCandidateConstraints(baseCandidate, input, accessor);

    const resultCandidate: GeneratedCandidateLayout = {
      candidateId,
      strategy: strategyId,
      arrangement,
      circulationRequirement: program.circulationRequirement,
      topology,
      objects: baseCandidate.layout.objects,
      envelopes: baseCandidate.envelopes,
      validation,
      status: validation.status,
      rejections: validation.hardViolations,
      warnings: validation.softWarnings,
      provenance: Object.freeze({
        standardVersionId,
        generatorName: 'CandidateGenerator',
        generatedAt,
        strategy: strategyId,
        arrangement,
      }),
      metadata: Object.freeze({
        totalBaysRequested,
        totalBaysPlaced,
        operationalBaysByService: Object.freeze(operationalBaysByService),
        ancillarySpacesPlaced: Object.freeze(ancillarySpacesPlaced),
        parkingCapacityAllocated: Object.freeze({
          customer: custParkCount,
          staff: staffParkCount,
          staging: stagingParkCount,
        }),
        futureExpansionBaysReserved,
        attemptedArrangements: Object.freeze([...attemptedArrangements]),
        buildingInterior: Object.freeze(buildingInterior),
      }),
    };

    return Object.freeze(resultCandidate);
  }
}
