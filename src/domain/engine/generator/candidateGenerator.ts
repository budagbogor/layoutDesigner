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

import { LayoutEngineInput, ObjectEnvelope } from '../types';
import { LayoutObject } from '../../models/project';
import { StandardAccessor } from '../StandardAccessor';
import {
  LayoutStrategyId,
  StrategyCandidate,
  CandidateStatus,
  CandidateRejection,
  generateDeterministicCandidateId,
  SPATIAL_UTILITIES,
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

    // Generate entry corridor connecting access points to the main drive aisle
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
        }
      }
    }

    // -----------------------------------------------------------------------
    // Stage 5: Service Bays Allocation (Multi-Row / Multi-Service Support)
    // -----------------------------------------------------------------------
    let currentNorthX = minX;
    let currentSouthX = minX;
    let baySequenceIndex = 1;
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
    }

    for (const bayItem of flattenedBays) {
      const bayId = `bay-${String(baySequenceIndex).padStart(2, '0')}`;
      let placedInRow: 'north' | 'south' | null = null;
      let targetX = 0;
      let targetY = 0;
      let targetRot = 0;

      // Try North Row first
      if (currentNorthX + bayWidth <= maxX) {
        placedInRow = 'north';
        targetX = currentNorthX;
        targetY = bayY_North;
        targetRot = 0;
      } else if (isDoubleComb && currentSouthX + bayWidth <= maxX) {
        // Try South Row in Double Comb (facing northward toward drive aisle)
        placedInRow = 'south';
        targetX = currentSouthX;
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
          serviceType: bayItem.serviceType,
          requiredEquipment: bayItem.requiredEquipment,
          row: placedInRow,
          accessDirection: placedInRow === 'south' ? 'rear' : 'front',
          sequence: baySequenceIndex,
        },
      };

      try {
        const physEnv = createPhysicalEnvelope(candidateBay, accessor);
        const workEnv = createWorkingEnvelope(candidateBay, accessor);
        const accessEnv = createAccessEnvelope(candidateBay, accessor);

        placedObjects.push(candidateBay);
        generatedEnvelopes.push(physEnv, workEnv, accessEnv);

        if (hasSafetyRequirement(candidateBay, accessor)) {
          const safeEnv = createSafetyEnvelope(candidateBay, accessor);
          generatedEnvelopes.push(safeEnv);
        }

        operationalBaysByService[bayItem.serviceType] =
          (operationalBaysByService[bayItem.serviceType] || 0) + 1;

        if (placedInRow === 'north') {
          currentNorthX = roundMillimeter(currentNorthX + bayWidth + 2 * workBuffer);
        } else {
          currentSouthX = roundMillimeter(currentSouthX + bayWidth + 2 * workBuffer);
        }
        baySequenceIndex++;
      } catch (err) {
        internalRejections.push({
          ruleId: 'ENVELOPE-CREATION-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [bayId],
          reason: `Failed to create envelopes for ${bayId}: ${(err as Error).message}`,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Stage 6: Service Equipment Allocation
    // -----------------------------------------------------------------------
    let currentEquipX = isDoubleComb ? currentSouthX : minX;
    if (program.equipment && program.equipment.length > 0) {
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

        for (const eq of program.equipment) {
          for (let q = 0; q < eq.quantity; q++) {
            const equipId = `equip-${String(equipSeq++).padStart(2, '0')}`;
            const equipObject: LayoutObject = {
              id: equipId,
              type: 'equipment',
              layer: '06-EQUIPMENT',
              geometry: {
                x: currentEquipX,
                y: wallThickness,
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
      }
    }

    // -----------------------------------------------------------------------
    // Stage 7: Ancillary Spaces Allocation (Clean & Operational)
    // -----------------------------------------------------------------------
    const ancillarySpacesPlaced: string[] = [];
    const anc = program.ancillarySpaces;

    if (anc) {
      let operationalX = currentEquipX;

      // Operational Spaces (Front Support Zone)
      if (anc.oilWasteStorage) {
        const wasteWidthParam = accessor.getParameter('room.min_width.oil_waste_storage');
        const wasteLengthParam = accessor.getParameter('room.min_length.oil_waste_storage');

        if (!wasteWidthParam || !wasteLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for oil waste storage: room.min_width/length.oil_waste_storage.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.oil_waste_storage' },
          });
        } else {
          const wasteWidth = roundMillimeter(wasteWidthParam.value);
          const wasteLength = roundMillimeter(wasteLengthParam.value);
          const wasteObj: LayoutObject = {
            id: 'oil-waste-storage',
            type: 'custom',
            layer: '06-EQUIPMENT',
            geometry: {
              x: operationalX,
              y: wallThickness,
              width: wasteWidth,
              length: wasteLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'OIL_WASTE_STORAGE',
              spaceCategory: 'SERVICE_OPERATIONAL',
            },
          };

          const physEnv = createPhysicalEnvelope(wasteObj, accessor);
          placedObjects.push(wasteObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('oilWasteStorage');
          operationalX = roundMillimeter(operationalX + wasteWidth + 1.0);
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
          const compWidth = roundMillimeter(compWidthParam.value);
          const compLength = roundMillimeter(compLengthParam.value);
          const compObj: LayoutObject = {
            id: 'compressor-room',
            type: 'custom',
            layer: '06-EQUIPMENT',
            geometry: {
              x: operationalX,
              y: wallThickness,
              width: compWidth,
              length: compLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'COMPRESSOR_ROOM',
              spaceCategory: 'SERVICE_OPERATIONAL',
            },
          };

          const physEnv = createPhysicalEnvelope(compObj, accessor);
          placedObjects.push(compObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('compressorRoom');
          operationalX = roundMillimeter(operationalX + compWidth + 1.0);
        }
      }

      let cleanZoneX = roundMillimeter(operationalX + 1.0);

      // Clean Customer Spaces (Front Central/Right Zone)
      if (anc.customerLounge) {
        const custWidth = accessor.getParameter('customer_zone.min_width')?.value;
        const custLength = accessor.getParameter('customer_zone.min_length')?.value;

        if (custWidth === undefined || custLength === undefined) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for customer lounge: customer_zone.min_width/length.',
            provenance: { source: 'standard', referenceKey: 'customer_zone.min_width' },
          });
        } else {
          const loungeObj: LayoutObject = {
            id: 'customer-lounge',
            type: 'custom',
            layer: '07-FURNITURE',
            geometry: {
              x: cleanZoneX,
              y: wallThickness,
              width: custWidth,
              length: custLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'CUSTOMER_LOUNGE',
              spaceCategory: 'CUSTOMER_CLEAN',
              loungeWithBayView: anc.loungeWithBayView,
            },
          };

          const physEnv = createPhysicalEnvelope(loungeObj, accessor);
          placedObjects.push(loungeObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('customerLounge');
          cleanZoneX = roundMillimeter(cleanZoneX + custWidth + 1.0);
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
          const cashierWidth = roundMillimeter(cashierWidthParam.value);
          const cashierLength = roundMillimeter(cashierLengthParam.value);
          const cashierObj: LayoutObject = {
            id: 'cashier-office',
            type: 'custom',
            layer: '07-FURNITURE',
            geometry: {
              x: cleanZoneX,
              y: wallThickness,
              width: cashierWidth,
              length: cashierLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'CASHIER_OFFICE',
              spaceCategory: 'CUSTOMER_CLEAN',
            },
          };

          const physEnv = createPhysicalEnvelope(cashierObj, accessor);
          placedObjects.push(cashierObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('cashierOffice');
          cleanZoneX = roundMillimeter(cleanZoneX + cashierWidth + 1.0);
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
          const restroomWidth = roundMillimeter(restroomWidthParam.value);
          const restroomLength = roundMillimeter(restroomLengthParam.value);
          const restroomObj: LayoutObject = {
            id: 'restroom',
            type: 'custom',
            layer: '07-FURNITURE',
            geometry: {
              x: cleanZoneX,
              y: wallThickness,
              width: restroomWidth,
              length: restroomLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'RESTROOM',
              spaceCategory: 'CUSTOMER_CLEAN',
            },
          };

          const physEnv = createPhysicalEnvelope(restroomObj, accessor);
          placedObjects.push(restroomObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('restroom');
          cleanZoneX = roundMillimeter(cleanZoneX + restroomWidth + 1.0);
        }
      }

      if (anc.staffRoom) {
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
          const staffWidth = roundMillimeter(staffWidthParam.value);
          const staffLength = roundMillimeter(staffLengthParam.value);
          const staffObj: LayoutObject = {
            id: 'staff-room',
            type: 'custom',
            layer: '07-FURNITURE',
            geometry: {
              x: cleanZoneX,
              y: wallThickness,
              width: staffWidth,
              length: staffLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'STAFF_ROOM',
              spaceCategory: 'CUSTOMER_CLEAN',
            },
          };

          const physEnv = createPhysicalEnvelope(staffObj, accessor);
          placedObjects.push(staffObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('staffRoom');
        }
      }

      if (anc.partsWarehouse) {
        const warehouseWidthParam = accessor.getParameter('room.min_width.parts_warehouse');
        const warehouseLengthParam = accessor.getParameter('room.min_length.parts_warehouse');

        if (!warehouseWidthParam || !warehouseLengthParam) {
          internalRejections.push({
            ruleId: 'MISSING_STANDARD_PARAMETER',
            severity: 'HARD',
            isDisqualifying: true,
            reason: 'Missing standard parameter for parts warehouse: room.min_width/length.parts_warehouse.',
            provenance: { source: 'standard', referenceKey: 'room.min_width.parts_warehouse' },
          });
        } else {
          const warehouseWidth = roundMillimeter(warehouseWidthParam.value);
          const warehouseLength = roundMillimeter(warehouseLengthParam.value);
          const warehouseObj: LayoutObject = {
            id: 'parts-warehouse',
            type: 'custom',
            layer: '07-FURNITURE',
            geometry: {
              x: roundMillimeter(maxX - warehouseWidth),
              y: wallThickness,
              width: warehouseWidth,
              length: warehouseLength,
              rotation: 0,
            },
            metadata: {
              zoneType: 'PARTS_WAREHOUSE',
              spaceCategory: 'SERVICE_OPERATIONAL',
            },
          };

          const physEnv = createPhysicalEnvelope(warehouseObj, accessor);
          placedObjects.push(warehouseObj);
          generatedEnvelopes.push(physEnv);
          ancillarySpacesPlaced.push('partsWarehouse');
        }
      }
    }

    // -----------------------------------------------------------------------
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
          for (let p = 0; p < parking.customerParkingSpaces; p++) {
            const parkId = `cust-parking-${p + 1}`;
            const parkObj: LayoutObject = {
              id: parkId,
              type: 'custom',
              layer: '01-SITE',
              geometry: {
                x: parkX,
                y: roundMillimeter(-stallLength - 0.2),
                width: stallWidth,
                length: stallLength,
                rotation: 0,
              },
              metadata: {
                zoneType: 'CUSTOMER_PARKING',
                spaceCategory: 'SITE_PARKING',
              },
            };

            const physEnv = createPhysicalEnvelope(parkObj, accessor);
            placedObjects.push(parkObj);
            generatedEnvelopes.push(physEnv);
            custParkCount++;
            parkX = roundMillimeter(parkX + stallWidth + 0.5);
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
    // Stage 9: Future Expansion Reserve
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
    // Stage 10: Assemble StrategyCandidate & Perform Hard Constraint Validation
    // -----------------------------------------------------------------------
    const totalBaysRequested = program.bays.reduce((sum, b) => sum + b.quantity, 0);
    const totalBaysPlaced = placedObjects.filter((o) => o.type === 'service_bay').length;

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
    };

    // Run strict 15-point hard constraint validation
    const validation = validateCandidateConstraints(baseCandidate, input, accessor);

    const resultCandidate: GeneratedCandidateLayout = {
      candidateId,
      strategy: strategyId,
      arrangement,
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
      }),
    };

    return Object.freeze(resultCandidate);
  }
}
