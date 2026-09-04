import { LayoutObject } from '../../models/project';
import { ObjectEnvelope } from '../types';
import {
  StrategyGenerator,
  StrategyContext,
  StrategyCandidate,
  CandidateGenerationResult,
  CandidateRejection,
  generateDeterministicCandidateId,
  LayoutStrategyId,
} from './strategyTypes';
import { createPhysicalEnvelope } from '../envelopes/physicalEnvelope';
import { createWorkingEnvelope } from '../envelopes/workingEnvelope';
import { createAccessEnvelope } from '../envelopes/accessEnvelope';
import { roundMillimeter } from '../../geometry/precision';

export class BalancedStrategyGenerator implements StrategyGenerator {
  public readonly strategyId: LayoutStrategyId = 'BALANCED';
  public readonly name = 'Balanced Strategy Generator';
  public readonly description =
    'Balances service capacity, circulation, equipment ergonomics, customer reception, and future expansion.';

  public generate(context: StrategyContext): CandidateGenerationResult {
    const { input, topology, accessor, utilities } = context;
    const { building, program } = input;

    const candidateId = generateDeterministicCandidateId(this.strategyId, 1);
    const standardVersionId = accessor.getStandardVersion();
    const generatedAt = new Date().toISOString();

    // 1. Mandatory standard parameters lookup (strict zero fallback)
    const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
    const bayWidth = accessor.getRequiredNumericValue('bay.min_width');
    const bayLength = accessor.getRequiredNumericValue('bay.min_length');
    const aisleWidth = accessor.getRequiredNumericValue('circulation.drive_aisle.min_width');

    const workBufferParam = accessor.getParameter('clearance.working_buffer');
    const workBuffer = workBufferParam ? roundMillimeter(workBufferParam.value) : 0;

    // Optional comfort buffer for balanced ergonomics if specified in standard
    const comfortBufferParam = accessor.getParameter('clearance.comfort_buffer');
    const extraSpacing = comfortBufferParam ? roundMillimeter(comfortBufferParam.value) : 0;

    const placedObjects: LayoutObject[] = [];
    const generatedEnvelopes: ObjectEnvelope[] = [];
    const rejections: CandidateRejection[] = [];

    // Interior usable bounds
    const minX = roundMillimeter(wallThickness + workBuffer);
    const maxX = roundMillimeter(building.width - wallThickness - workBuffer);

    // 2. Establish Central Drive Aisle
    const bayY = roundMillimeter(building.length - wallThickness - workBuffer - bayLength);
    const aisleOriginY = roundMillimeter(bayY - aisleWidth);
    const aisleLength = roundMillimeter(building.width);

    if (aisleOriginY < wallThickness || bayY + bayLength > building.length) {
      const aisleRejection: CandidateRejection = {
        ruleId: 'BOUNDARY-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedNodeIds: ['node-circulation'],
        reason: `Drive aisle (${aisleWidth}m) plus service bay (${bayLength}m) cannot physically fit inside building length (${building.length}m).`,
        provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
      };
      rejections.push(aisleRejection);
    }

    const aisleSpec = {
      id: 'aisle-main',
      origin: { x: 0, y: bayY },
      length: aisleLength,
      rotation: 270,
    };

    let aisleEnvelope: ObjectEnvelope;
    try {
      aisleEnvelope = utilities.calculateAisleEnvelope(aisleSpec, accessor);
      generatedEnvelopes.push(aisleEnvelope);
    } catch (err) {
      return {
        strategyId: this.strategyId,
        candidate: null,
        success: false,
        errors: [`Failed to create drive aisle: ${(err as Error).message}`],
      };
    }

    let currentX = minX;

    // 3. Balanced Zone Allocation
    // A. Customer Zone: If required, apportion dedicated reception area at the front/entrance side
    let customerAreaPlaced = false;
    if (program.customerZoneRequired && rejections.length === 0) {
      const custWidth = accessor.getRequiredNumericValue('customer_zone.min_width');
      const custLength = accessor.getRequiredNumericValue('customer_zone.min_length');

      const customerObject: LayoutObject = {
        id: 'customer-lounge',
        type: 'custom',
        layer: '07-FURNITURE',
        geometry: {
          x: currentX,
          y: bayY,
          width: custWidth,
          length: custLength,
          rotation: 0,
        },
        metadata: {
          strategy: 'BALANCED',
          zone: 'CUSTOMER_ZONE',
          description: 'Segregated customer reception and lounge',
        },
      };

      const custPhys = createPhysicalEnvelope(customerObject, accessor);
      if (utilities.isInsideBuilding(custPhys, building)) {
        placedObjects.push(customerObject);
        generatedEnvelopes.push(custPhys);
        customerAreaPlaced = true;
        // Advance currentX past customer zone plus working clearance
        currentX = roundMillimeter(currentX + custWidth + 2 * workBuffer);
      } else {
        rejections.push({
          ruleId: 'BOUNDARY-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: ['customer-lounge'],
          relatedNodeIds: ['node-customer-zone'],
          reason: 'Customer zone exceeds building boundary.',
          provenance: { source: 'standard', referenceKey: 'customer_zone.min_width' },
        });
      }
    }

    // B. Service Bays Placement
    const totalBaysRequested = program.bays.reduce((sum, b) => sum + b.quantity, 0);
    let placedBaysCount = 0;
    let sequenceIndex = 1;

    if (rejections.length === 0) {
      while (placedBaysCount < totalBaysRequested) {
        const bayId = `bay-${String(sequenceIndex).padStart(2, '0')}`;
        const candidateBay: LayoutObject = {
          id: bayId,
          type: 'service_bay',
          layer: '08-SERVICE-BAY',
          geometry: {
            x: currentX,
            y: bayY,
            width: bayWidth,
            length: bayLength,
            rotation: 0,
          },
          metadata: {
            strategy: 'BALANCED',
            serviceType: program.bays[0]?.serviceType ?? 'general_service',
          },
        };

        let physEnv: ObjectEnvelope;
        let workEnv: ObjectEnvelope;
        let accessEnv: ObjectEnvelope;

        try {
          physEnv = createPhysicalEnvelope(candidateBay, accessor);
          workEnv = createWorkingEnvelope(candidateBay, accessor);
          accessEnv = createAccessEnvelope(candidateBay, accessor);
        } catch (err) {
          return {
            strategyId: this.strategyId,
            candidate: null,
            success: false,
            errors: [`Envelope generation failed for ${bayId}: ${(err as Error).message}`],
          };
        }

        // Boundary Check
        if (
          !utilities.isInsideBuilding(physEnv, building) ||
          !utilities.isInsideBuilding(workEnv, building)
        ) {
          rejections.push({
            ruleId: 'BOUNDARY-001',
            severity: 'HARD',
            isDisqualifying: placedBaysCount === 0,
            relatedObjectIds: [bayId],
            relatedNodeIds: ['node-service-zone'],
            reason: `Service bay '${bayId}' at X=${currentX.toFixed(2)}m extends beyond building boundary.`,
            provenance: { source: 'standard', referenceKey: 'BOUNDARY-001' },
          });
          break;
        }

        // Collision Check
        let hasCollision = false;
        for (const existingEnv of generatedEnvelopes) {
          if (existingEnv.type === 'PHYSICAL' && utilities.overlapsEnvelope(physEnv, existingEnv)) {
            hasCollision = true;
            rejections.push({
              ruleId: 'COLLISION-001',
              severity: 'HARD',
              isDisqualifying: true,
              relatedObjectIds: [bayId, existingEnv.sourceObjectId],
              reason: `Physical collision between '${bayId}' and '${existingEnv.sourceObjectId}'.`,
              provenance: { source: 'standard', referenceKey: 'COLLISION-001' },
            });
            break;
          }

          if (existingEnv.type === 'WORKING' && utilities.overlapsEnvelope(physEnv, existingEnv)) {
            hasCollision = true;
            rejections.push({
              ruleId: 'CLEARANCE-001',
              severity: 'HARD',
              isDisqualifying: true,
              relatedObjectIds: [bayId, existingEnv.sourceObjectId],
              reason: `Service bay '${bayId}' intrudes into working buffer of '${existingEnv.sourceObjectId}'.`,
              provenance: { source: 'standard', referenceKey: 'clearance.working_buffer' },
            });
            break;
          }
        }

        if (hasCollision) {
          break;
        }

        // Access Connection Check
        const approachValidation = utilities.validateApproachConnection(
          candidateBay,
          accessEnv,
          aisleEnvelope
        );
        if (!approachValidation.isConnected) {
          rejections.push({
            ruleId: 'FLOW-001',
            severity: 'HARD',
            isDisqualifying: true,
            relatedObjectIds: [bayId],
            relatedNodeIds: ['node-circulation'],
            reason: approachValidation.reason,
            provenance: { source: 'standard', referenceKey: 'FLOW-001' },
          });
          break;
        }

        placedObjects.push(candidateBay);
        generatedEnvelopes.push(physEnv, workEnv, accessEnv);
        placedBaysCount++;
        sequenceIndex++;

        // In BALANCED, spacing includes working buffer + extra comfort spacing if configured in standard
        currentX = roundMillimeter(currentX + bayWidth + 2 * workBuffer + extraSpacing);
      }
    }

    // C. Equipment Zone: If equipment is requested in program, place stationary equipment adjacent to service bays
    let equipmentPlacedCount = 0;
    const totalEquipmentRequested = program.equipment.reduce((sum, e) => sum + e.quantity, 0);
    if (totalEquipmentRequested > 0 && placedBaysCount > 0 && rejections.length === 0) {
      const equipWidth = accessor.getRequiredNumericValue('equipment.width');
      const equipLength = accessor.getRequiredNumericValue('equipment.length');

      for (let eqIdx = 0; eqIdx < totalEquipmentRequested; eqIdx++) {
        const equipId = `equip-${String(eqIdx + 1).padStart(2, '0')}`;
        const candidateEquip: LayoutObject = {
          id: equipId,
          type: 'equipment',
          layer: '08-SERVICE-BAY',
          geometry: {
            x: currentX,
            y: bayY,
            width: equipWidth,
            length: equipLength,
            rotation: 0,
          },
          metadata: {
            strategy: 'BALANCED',
            zone: 'EQUIPMENT_ZONE',
            servesBayId: placedObjects.find((o) => o.type === 'service_bay')?.id,
          },
        };

        const eqPhys = createPhysicalEnvelope(candidateEquip, accessor);
        if (utilities.isInsideBuilding(eqPhys, building)) {
          placedObjects.push(candidateEquip);
          generatedEnvelopes.push(eqPhys);
          equipmentPlacedCount++;
          currentX = roundMillimeter(currentX + equipWidth + workBuffer);
        } else {
          rejections.push({
            ruleId: 'BOUNDARY-001',
            severity: 'WARNING',
            isDisqualifying: false,
            relatedObjectIds: [equipId],
            relatedNodeIds: ['node-equipment-zone'],
            reason: `Equipment unit '${equipId}' exceeds building boundary at X=${currentX}m.`,
            provenance: { source: 'standard', referenceKey: 'equipment.width' },
          });
          break;
        }
      }
    }

    // D. Expansion Reserve: If requested in program, verify remaining contiguous floor space is preserved
    let expansionReservePreserved = false;
    if (program.futureExpansionBays > 0) {
      const expansionNeededWidth = roundMillimeter(
        program.futureExpansionBays * (bayWidth + 2 * workBuffer)
      );
      const remainingWidth = roundMillimeter(maxX - currentX);

      if (remainingWidth >= expansionNeededWidth) {
        expansionReservePreserved = true;
      } else {
        rejections.push({
          ruleId: 'TOPO-EXPANSION-BUILDING-001',
          severity: 'WARNING',
          isDisqualifying: false,
          relatedNodeIds: ['node-expansion-reserve'],
          reason: `Insufficient remaining width (${remainingWidth.toFixed(2)}m) for ${program.futureExpansionBays} future expansion bays (requires ${expansionNeededWidth.toFixed(2)}m).`,
          provenance: { source: 'input', referenceKey: 'program.futureExpansionBays' },
        });
      }
    }

    // 4. Status and Explanation
    const hasDisqualifyingHardViolation = rejections.some(
      (r) => r.isDisqualifying && r.severity === 'HARD'
    );
    const isFeasible = placedBaysCount > 0 && !hasDisqualifyingHardViolation;
    const status = isFeasible ? 'VALID' : 'DISQUALIFIED';

    const unplacedBays = totalBaysRequested - placedBaysCount;
    const layoutSummary = `Placed ${placedBaysCount} service bays, ${equipmentPlacedCount} equipment units, customer area: ${customerAreaPlaced ? 'YES' : 'N/A'}, expansion reserve: ${expansionReservePreserved ? 'PRESERVED' : 'PARTIAL/NONE'}.`;

    const candidate: StrategyCandidate = {
      id: candidateId,
      strategyId: this.strategyId,
      name: 'Balanced Layout Candidate',
      description:
        'Harmonizes service bay capacity, technician circulation, equipment ergonomics, and customer zone segregation.',
      topologyId: topology.id,
      layout: {
        objects: Object.freeze([...placedObjects]),
      },
      envelopes: Object.freeze([...generatedEnvelopes]),
      status,
      rejections: Object.freeze([...rejections]),
      provenance: {
        standardVersionId,
        generatorName: this.name,
        generatedAt,
      },
      explanation: {
        strategyRationale:
          'Apportions space into dedicated functional zones (Customer, Service, Equipment) to maximize operational ergonomics and customer flow rather than raw bay density.',
        layoutSummary,
        tradeOffs:
          unplacedBays > 0
            ? `Balanced zone allocation reserved space for customer/equipment, resulting in ${placedBaysCount} of ${totalBaysRequested} bays placed.`
            : 'Balanced layout successfully satisfied all program requirements with ergonomic clearances.',
      },
      spatialContext: {
        arrangement: 'ZONED_BY_SERVICE',
        circulationRequirement: program.circulationRequirement,
        buildingInterior: {
          grossWidth: building.width,
          grossLength: building.length,
          grossArea: roundMillimeter(building.width * building.length),
          wallThickness,
          interiorWidth: roundMillimeter(building.width - 2 * wallThickness),
          interiorLength: roundMillimeter(building.length - 2 * wallThickness),
          interiorArea: roundMillimeter((building.width - 2 * wallThickness) * (building.length - 2 * wallThickness)),
          provenance: {
            source: 'building_envelope',
            wallThicknessParameterKey: 'building.wall_thickness',
            formula: '(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)',
          },
        },
        provenance: {
          source: 'generator' as const,
          generatorName: this.name,
          inputProgramField: 'circulationRequirement' as const,
        },
      },
    };

    return {
      strategyId: this.strategyId,
      candidate: Object.freeze(candidate),
      success: true,
      errors: [],
    };
  }
}
