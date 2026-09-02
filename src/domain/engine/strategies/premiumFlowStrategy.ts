import { LayoutObject } from '../../models/project';
import { ObjectEnvelope, AccessPoint } from '../types';
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

export class PremiumFlowStrategyGenerator implements StrategyGenerator {
  public readonly strategyId: LayoutStrategyId = 'PREMIUM_FLOW';
  public readonly name = 'Premium Flow Strategy Generator';
  public readonly description =
    'Prioritizes continuous vehicle throughput, strict zone segregation, and uncompromised circulation flow based on actual input access points.';

  public generate(context: StrategyContext): CandidateGenerationResult {
    const { input, topology, accessor, utilities } = context;
    const { building, program, accessPoints } = input;

    const candidateId = generateDeterministicCandidateId(this.strategyId, 1);
    const standardVersionId = accessor.getStandardVersion();
    const generatedAt = new Date().toISOString();

    const rejections: CandidateRejection[] = [];
    const placedObjects: LayoutObject[] = [];
    const generatedEnvelopes: ObjectEnvelope[] = [];

    // -------------------------------------------------------------------------
    // 1. Strict Access Point Verification (ZERO Invented Doors)
    // -------------------------------------------------------------------------
    if (!accessPoints || accessPoints.length === 0) {
      const noDoorsRejection: CandidateRejection = {
        ruleId: 'FLOW-DOOR-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedNodeIds: ['node-circulation'],
        reason:
          'Premium Flow requires at least one explicit access point from input. Engine strictly cannot invent or assume access doors.',
        provenance: { source: 'standard', referenceKey: 'FLOW-001' },
      };
      rejections.push(noDoorsRejection);

      return {
        strategyId: this.strategyId,
        candidate: this.buildCandidate({
          candidateId,
          topologyId: topology.id,
          standardVersionId,
          generatedAt,
          placedObjects,
          generatedEnvelopes,
          rejections,
          status: 'DISQUALIFIED',
          accessPointsUsed: 'NONE',
          flowTopologyDescription: 'No feasible flow; access points absent',
          placedBaysCount: 0,
          totalBaysRequested: program.bays.reduce((s, b) => s + b.quantity, 0),
          tradeOffs: 'Disqualified due to absence of input access doors.',
        }),
        success: true,
        errors: [],
      };
    }

    // Check if program requires drive_through circulation but lacks 2 distinct doors
    const isDriveThroughRequired = program.circulationRequirement === 'drive_through';
    if (isDriveThroughRequired && accessPoints.length < 2) {
      rejections.push({
        ruleId: 'FLOW-DOOR-INSUFFICIENT',
        severity: 'HARD',
        isDisqualifying: true,
        relatedNodeIds: ['node-circulation'],
        reason: `Drive-through flow requirement requires both an entrance and an exit access point, but only ${accessPoints.length} access point was provided.`,
        provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
      });
    }

    // -------------------------------------------------------------------------
    // 2. Resolve Parameters via StandardAccessor (Strict Zero Fallback)
    // -------------------------------------------------------------------------
    const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
    const bayWidth = accessor.getRequiredNumericValue('bay.min_width');
    const bayLength = accessor.getRequiredNumericValue('bay.min_length');
    const aisleWidth = accessor.getRequiredNumericValue('circulation.drive_aisle.min_width');

    const workBufferParam = accessor.getParameter('clearance.working_buffer');
    const workBuffer = workBufferParam ? roundMillimeter(workBufferParam.value) : 0;

    // -------------------------------------------------------------------------
    // 3. Circulation Flow Network based on Actual Access Points
    // -------------------------------------------------------------------------
    const entryDoor = accessPoints.find((ap) => ap.type === 'entrance') ?? accessPoints[0];
    const exitDoor = accessPoints.find((ap) => ap.type === 'exit' && ap.id !== entryDoor.id);

    const bayY = roundMillimeter(building.length - wallThickness - workBuffer - bayLength);

    // Primary Ingress Corridor originating at entry door
    let ingressAisleSpec: { id: string; origin: { x: number; y: number }; length: number; rotation: number };
    let flowTopologyDescription: string;

    if (entryDoor.wall === 'south') {
      const aisleX = roundMillimeter(entryDoor.offsetMeters);
      ingressAisleSpec = {
        id: exitDoor ? 'aisle-through' : 'aisle-ingress',
        origin: { x: aisleX, y: 0 },
        length: building.length,
        rotation: 0,
      };
      flowTopologyDescription = exitDoor
        ? `Linear One-Way Drive-Through from South entrance ('${entryDoor.id}') to North exit ('${exitDoor.id}')`
        : `Direct Ingress Circulation from South entrance ('${entryDoor.id}')`;
    } else {
      ingressAisleSpec = {
        id: 'aisle-ingress',
        origin: { x: 0, y: roundMillimeter(entryDoor.offsetMeters) },
        length: building.width,
        rotation: 270,
      };
      flowTopologyDescription = `Circulation Spine from ${entryDoor.wall} entrance ('${entryDoor.id}')`;
    }

    let ingressAisleEnv: ObjectEnvelope;
    try {
      ingressAisleEnv = utilities.calculateAisleEnvelope(ingressAisleSpec, accessor);
      generatedEnvelopes.push(ingressAisleEnv);
    } catch (err) {
      return {
        strategyId: this.strategyId,
        candidate: null,
        success: false,
        errors: [`Failed to calculate ingress aisle: ${(err as Error).message}`],
      };
    }

    // Cross Approach Aisle directly in front of the service bays
    const crossAisleSpec = {
      id: 'aisle-cross',
      origin: { x: 0, y: bayY },
      length: building.width,
      rotation: 270,
    };

    let crossAisleEnv: ObjectEnvelope;
    try {
      crossAisleEnv = utilities.calculateAisleEnvelope(crossAisleSpec, accessor);
      generatedEnvelopes.push(crossAisleEnv);
    } catch (err) {
      return {
        strategyId: this.strategyId,
        candidate: null,
        success: false,
        errors: [`Failed to calculate cross aisle: ${(err as Error).message}`],
      };
    }

    // Validate entryDoor connection to ingress aisle
    const entryConnection = utilities.validateAccessPointConnection(entryDoor, building, ingressAisleEnv);
    if (!entryConnection.isConnected) {
      rejections.push({
        ruleId: 'FLOW-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: [entryDoor.id],
        relatedNodeIds: [`node-entry-${entryDoor.id}`, 'node-circulation'],
        reason: `Access point '${entryDoor.id}' does not connect to the circulation spine (gap: ${entryConnection.gapMeters?.toFixed(2) ?? 'N/A'}m).`,
        provenance: { source: 'standard', referenceKey: 'FLOW-001' },
      });
    }

    // Validate exit door connection if present
    if (exitDoor) {
      const exitTargetAisle = exitDoor.wall === 'north' || exitDoor.wall === 'south' ? ingressAisleEnv : crossAisleEnv;
      const exitConnection = utilities.validateAccessPointConnection(exitDoor, building, exitTargetAisle);
      if (!exitConnection.isConnected) {
        rejections.push({
          ruleId: 'FLOW-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [exitDoor.id],
          relatedNodeIds: [`node-entry-${exitDoor.id}`, 'node-circulation'],
          reason: `Exit access point '${exitDoor.id}' does not connect to the circulation spine (gap: ${exitConnection.gapMeters?.toFixed(2) ?? 'N/A'}m).`,
          provenance: { source: 'standard', referenceKey: 'FLOW-001' },
        });
      }
    }

    // -------------------------------------------------------------------------
    // 4. Functional Segregation: Customer Zone & Service Bays Placement
    // -------------------------------------------------------------------------
    let currentX = roundMillimeter(wallThickness + workBuffer);
    const maxX = roundMillimeter(building.width - wallThickness - workBuffer);

    // Place segregated customer zone if required
    if (program.customerZoneRequired && rejections.length === 0) {
      const custWidth = accessor.getRequiredNumericValue('customer_zone.min_width');
      const custLength = accessor.getRequiredNumericValue('customer_zone.min_length');

      const customerObj: LayoutObject = {
        id: 'customer-reception',
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
          strategy: 'PREMIUM_FLOW',
          zone: 'CUSTOMER_ZONE',
          description: 'Segregated customer waiting lounge and front counter',
        },
      };

      const custPhys = createPhysicalEnvelope(customerObj, accessor);
      if (utilities.isInsideBuilding(custPhys, building)) {
        placedObjects.push(customerObj);
        generatedEnvelopes.push(custPhys);
        currentX = roundMillimeter(currentX + custWidth + 2 * workBuffer);
      } else {
        rejections.push({
          ruleId: 'BOUNDARY-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: ['customer-reception'],
          relatedNodeIds: ['node-customer-zone'],
          reason: 'Customer reception area exceeds building boundary.',
          provenance: { source: 'standard', referenceKey: 'customer_zone.min_width' },
        });
      }
    }

    // Place Service Bays sequentially with verified approach -> aisle connectivity
    const totalBaysRequested = program.bays.reduce((s, b) => s + b.quantity, 0);
    let placedBaysCount = 0;
    let seq = 1;

    if (rejections.length === 0) {
      while (placedBaysCount < totalBaysRequested) {
        const bayId = `bay-${String(seq).padStart(2, '0')}`;
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
            strategy: 'PREMIUM_FLOW',
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
            reason: `Service bay '${bayId}' exceeds building boundary at X=${currentX.toFixed(2)}m.`,
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
              reason: `Service bay '${bayId}' physical body intrudes into '${existingEnv.sourceObjectId}' working buffer.`,
              provenance: { source: 'standard', referenceKey: 'clearance.working_buffer' },
            });
            break;
          }
        }

        if (hasCollision) {
          break;
        }

        // Approach -> Cross Aisle Connectivity Check
        const approachValidation = utilities.validateApproachConnection(
          candidateBay,
          accessEnv,
          crossAisleEnv
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
        seq++;

        currentX = roundMillimeter(currentX + bayWidth + 2 * workBuffer);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Final Status & StrategyCandidate Synthesis
    // -------------------------------------------------------------------------
    const hasDisqualifyingViolation = rejections.some((r) => r.isDisqualifying && r.severity === 'HARD');
    const isFeasible = placedBaysCount > 0 && !hasDisqualifyingViolation;
    const status = isFeasible ? 'VALID' : 'DISQUALIFIED';

    const accessPointsUsed = accessPoints.map((ap) => `${ap.id} (${ap.type} @ ${ap.wall})`).join(', ');
    const tradeOffs =
      'Premium Flow prioritizes continuous vehicular throughput and strict segregation between visitor paths and technician service areas, trading off maximum bay count for fluid circulation.';

    const candidate = this.buildCandidate({
      candidateId,
      topologyId: topology.id,
      standardVersionId,
      generatedAt,
      placedObjects,
      generatedEnvelopes,
      rejections,
      status,
      accessPointsUsed,
      flowTopologyDescription,
      placedBaysCount,
      totalBaysRequested,
      tradeOffs,
    });

    return {
      strategyId: this.strategyId,
      candidate,
      success: true,
      errors: [],
    };
  }

  private buildCandidate(params: {
    candidateId: string;
    topologyId: string;
    standardVersionId: string;
    generatedAt: string;
    placedObjects: LayoutObject[];
    generatedEnvelopes: ObjectEnvelope[];
    rejections: CandidateRejection[];
    status: 'VALID' | 'DISQUALIFIED';
    accessPointsUsed: string;
    flowTopologyDescription: string;
    placedBaysCount: number;
    totalBaysRequested: number;
    tradeOffs: string;
  }): StrategyCandidate {
    const layoutSummary = `Placed ${params.placedBaysCount} of ${params.totalBaysRequested} service bays along ${params.flowTopologyDescription}. Access point(s) utilized: ${params.accessPointsUsed}.`;

    return Object.freeze({
      id: params.candidateId,
      strategyId: this.strategyId,
      name: 'Premium Flow Layout Candidate',
      description:
        'Optimizes vehicular access, uninterrupted one-way flow, and functional segregation based on actual access points.',
      topologyId: params.topologyId,
      layout: {
        objects: Object.freeze([...params.placedObjects]),
      },
      envelopes: Object.freeze([...params.generatedEnvelopes]),
      status: params.status,
      rejections: Object.freeze([...params.rejections]),
      provenance: {
        standardVersionId: params.standardVersionId,
        generatorName: this.name,
        generatedAt: params.generatedAt,
      },
      explanation: {
        strategyRationale: `Vehicle access anchored to actual access points [${params.accessPointsUsed}]. Structured as ${params.flowTopologyDescription}.`,
        layoutSummary,
        tradeOffs: params.tradeOffs,
      },
    });
  }
}
