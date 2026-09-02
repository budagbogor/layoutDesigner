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

export class CapacityStrategyGenerator implements StrategyGenerator {
  public readonly strategyId: LayoutStrategyId = 'CAPACITY';
  public readonly name = 'Capacity Strategy Generator';
  public readonly description =
    'Maximizes service bay throughput using deterministic parallel comb layout along building boundaries.';

  public generate(context: StrategyContext): CandidateGenerationResult {
    const { input, topology, accessor, utilities } = context;
    const { building, program } = input;

    const candidateId = generateDeterministicCandidateId(this.strategyId, 1);
    const standardVersionId = accessor.getStandardVersion();
    const generatedAt = new Date().toISOString();

    // 1. Resolve mandatory parameters from standard snapshot (strict zero fallback)
    const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
    const bayWidth = accessor.getRequiredNumericValue('bay.min_width');
    const bayLength = accessor.getRequiredNumericValue('bay.min_length');
    const aisleWidth = accessor.getRequiredNumericValue('circulation.drive_aisle.min_width');

    const workBufferParam = accessor.getParameter('clearance.working_buffer');
    const workBuffer = workBufferParam ? roundMillimeter(workBufferParam.value) : 0;

    const totalBaysRequested = program.bays.reduce((sum, b) => sum + b.quantity, 0);

    const placedObjects: LayoutObject[] = [];
    const generatedEnvelopes: ObjectEnvelope[] = [];
    const rejections: CandidateRejection[] = [];

    // Interior usable bounds
    const minX = roundMillimeter(wallThickness + workBuffer);
    const maxX = roundMillimeter(building.width - wallThickness - workBuffer);

    // 2. Establish Bay Row along North/Top Wall (Facing south toward Drive Aisle)
    // Bay origin Y positioned such that working buffer is inside wall
    const bayY = roundMillimeter(building.length - wallThickness - workBuffer - bayLength);

    // Aisle positioned immediately in front of bay entry threshold (Y = bayY)
    const aisleOriginY = roundMillimeter(bayY - aisleWidth);
    const aisleLength = roundMillimeter(building.width);

    // Verify aisle fits inside building length
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

    // 3. Deterministic Sequential Placement along Primary Service Row
    let currentX = minX;
    let placedCount = 0;
    let sequenceIndex = 1;

    // Only attempt placement if aisle fits inside building
    if (rejections.length === 0) {
      while (placedCount < totalBaysRequested) {
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
            strategy: 'CAPACITY',
            serviceType: program.bays[0]?.serviceType ?? 'general_service',
          },
        };

        // Generate candidate envelopes
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

        // Evaluation Checks:
        // A. Building Boundary check
        const insideBuilding =
          utilities.isInsideBuilding(physEnv, building) &&
          utilities.isInsideBuilding(workEnv, building);

        if (!insideBuilding) {
          const rejection: CandidateRejection = {
            ruleId: 'BOUNDARY-001',
            severity: 'HARD',
            isDisqualifying: placedCount === 0, // Disqualifying if not even 1 bay fits
            relatedObjectIds: [bayId],
            relatedNodeIds: ['node-service-zone'],
            reason: `Service bay '${bayId}' at X=${currentX.toFixed(2)}m extends beyond building wall boundary (maxX=${maxX}m).`,
            provenance: { source: 'standard', referenceKey: 'BOUNDARY-001' },
          };
          rejections.push(rejection);
          // Stop placement along this row since we hit the wall boundary
          break;
        }

        // B. Physical & Working Collision with already placed objects
        let hasCollision = false;
        for (const existingEnv of generatedEnvelopes) {
          // Hard physical collision between solid bodies
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

          // Clearance violation: physical body of candidate bay intrudes into working buffer of an existing bay
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

        // C. Access connection check (approach corridor connects to drive aisle)
        const approachValidation = utilities.validateApproachConnection(candidateBay, accessEnv, aisleEnvelope);
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

        // Successfully Placed!
        placedObjects.push(candidateBay);
        generatedEnvelopes.push(physEnv, workEnv, accessEnv);
        placedCount++;
        sequenceIndex++;

        // Advance along X for next bay: width + 2 * working buffer spacing
        currentX = roundMillimeter(currentX + bayWidth + 2 * workBuffer);
      }
    }

    // 4. Status and Explanation
    const hasDisqualifyingHardViolation = rejections.some((r) => r.isDisqualifying && r.severity === 'HARD');
    const isFeasible = placedCount > 0 && !hasDisqualifyingHardViolation;
    const status = isFeasible ? 'VALID' : 'DISQUALIFIED';

    const unplacedCount = totalBaysRequested - placedCount;
    const layoutSummary =
      unplacedCount === 0
        ? `Successfully placed all ${placedCount} requested service bays in parallel capacity comb layout.`
        : `Placed ${placedCount} of ${totalBaysRequested} service bays. ${unplacedCount} bay(s) could not fit due to building boundary limits.`;

    const candidate: StrategyCandidate = {
      id: candidateId,
      strategyId: this.strategyId,
      name: 'Capacity Layout Candidate',
      description: 'Maximum density layout prioritizing service bay count along primary service wall.',
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
          'Packs service bays sequentially starting from the primary boundary with minimal standard clearances to maximize production throughput.',
        layoutSummary,
        tradeOffs:
          unplacedCount > 0
            ? `Building width (${building.width}m) limits physical capacity to ${placedCount} bays.`
            : 'Capacity prioritized; inter-bay spacing strictly respects minimum working clearance buffers.',
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
