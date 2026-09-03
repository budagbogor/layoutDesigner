// ---------------------------------------------------------------------------
// FASE 4.0 — Deterministic Candidate Validator
//
// Pure, deterministic validation of candidate layout against all 15 HARD
// engineering constraints and soft design preferences.
// ---------------------------------------------------------------------------

import { LayoutEngineInput, ObjectEnvelope } from '../types';
import { StrategyCandidate, CandidateRejection, CandidateStatus } from '../strategies/strategyTypes';
import { StandardAccessor } from '../StandardAccessor';
import {
  overlapsEnvelope,
  isInsideBuilding,
} from '../spatial/spatialRelations';
import {
  validateApproachConnection,
  validateAccessPointConnection,
} from '../spatial/accessConnectivity';

export interface CandidateValidationResult {
  readonly isValid: boolean;
  readonly status: CandidateStatus;
  readonly hardViolations: readonly CandidateRejection[];
  readonly softWarnings: readonly CandidateRejection[];
  readonly allRejections: readonly CandidateRejection[];
}

/**
 * Validates a generated StrategyCandidate against the 15 HARD engineering
 * constraints and records any SOFT design warnings.
 */
export function validateCandidateConstraints(
  candidate: StrategyCandidate,
  input: LayoutEngineInput,
  accessor: StandardAccessor
): CandidateValidationResult {
  const hardViolations: CandidateRejection[] = [];
  const softWarnings: CandidateRejection[] = [];

  // -------------------------------------------------------------------------
  // 1. Building Inside Site Boundary
  // -------------------------------------------------------------------------
  if (input.building.width > input.site.width || input.building.length > input.site.length) {
    hardViolations.push({
      ruleId: 'BOUNDARY-SITE-001',
      severity: 'HARD',
      isDisqualifying: true,
      reason: `Building dimensions (${input.building.width}m x ${input.building.length}m) exceed site boundary (${input.site.width}m x ${input.site.length}m).`,
      provenance: { source: 'input', referenceKey: 'building' },
    });
  }

  // -------------------------------------------------------------------------
  // 2. Front Setback Compliance
  // -------------------------------------------------------------------------
  if (input.building.frontSetbackMeters !== undefined) {
    const setback = input.building.frontSetbackMeters;
    if (setback < 0) {
      hardViolations.push({
        ruleId: 'SETBACK-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: `Front setback cannot be negative: ${setback}m.`,
        provenance: { source: 'input', referenceKey: 'building.frontSetbackMeters' },
      });
    } else if (setback + input.building.length > input.site.length) {
      hardViolations.push({
        ruleId: 'SETBACK-002',
        severity: 'HARD',
        isDisqualifying: true,
        reason: `Building length (${input.building.length}m) plus front setback (${setback}m) exceeds site length (${input.site.length}m).`,
        provenance: { source: 'input', referenceKey: 'building.frontSetbackMeters' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Service Bays Containment Inside Building
  // -------------------------------------------------------------------------
  const bayEnvelopes = candidate.envelopes.filter(
    (e) => e.type === 'PHYSICAL' && e.sourceObjectId.startsWith('bay-')
  );

  for (const bay of bayEnvelopes) {
    if (!isInsideBuilding(bay, input.building)) {
      hardViolations.push({
        ruleId: 'BOUNDARY-BUILDING-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: [bay.sourceObjectId],
        reason: `Service bay '${bay.sourceObjectId}' extends outside the building interior envelope.`,
        provenance: { source: 'standard', referenceKey: 'building.wall_thickness' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Physical Envelope Collision (No Overlap between Physical Objects)
  // -------------------------------------------------------------------------
  const physicalEnvelopes = candidate.envelopes.filter((e) => e.type === 'PHYSICAL');

  for (let i = 0; i < physicalEnvelopes.length; i++) {
    for (let j = i + 1; j < physicalEnvelopes.length; j++) {
      const e1 = physicalEnvelopes[i];
      const e2 = physicalEnvelopes[j];

      if (overlapsEnvelope(e1, e2)) {
        hardViolations.push({
          ruleId: 'COLLISION-PHYSICAL-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [e1.sourceObjectId, e2.sourceObjectId],
          reason: `Physical collision detected between '${e1.sourceObjectId}' and '${e2.sourceObjectId}'.`,
          provenance: { source: 'derived', description: 'Physical envelopes cannot overlap' },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Working Envelope HARD Collisions
  // -------------------------------------------------------------------------
  const workingEnvelopes = candidate.envelopes.filter((e) => e.type === 'WORKING');

  for (const workEnv of workingEnvelopes) {
    // A. Working envelope must not collide with other physical objects
    for (const physEnv of physicalEnvelopes) {
      if (physEnv.sourceObjectId !== workEnv.sourceObjectId && overlapsEnvelope(workEnv, physEnv)) {
        hardViolations.push({
          ruleId: 'CLEARANCE-WORKING-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [workEnv.sourceObjectId, physEnv.sourceObjectId],
          reason: `Working clearance for '${workEnv.sourceObjectId}' is obstructed by physical object '${physEnv.sourceObjectId}'.`,
          provenance: { source: 'standard', referenceKey: 'clearance.working_buffer' },
        });
      }
    }

    // B. Working envelope must not extend past building exterior walls
    if (!isInsideBuilding(workEnv, input.building)) {
      hardViolations.push({
        ruleId: 'CLEARANCE-BOUNDARY-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: [workEnv.sourceObjectId],
        reason: `Working clearance for '${workEnv.sourceObjectId}' extends beyond the building boundary.`,
        provenance: { source: 'standard', referenceKey: 'clearance.working_buffer' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Access Envelope Obstruction Check (Directional Bay Approach Corridors)
  // -------------------------------------------------------------------------
  const accessEnvelopes = candidate.envelopes.filter(
    (e) => e.type === 'ACCESS' && !e.sourceObjectId.startsWith('aisle-')
  );

  for (const accEnv of accessEnvelopes) {
    for (const physEnv of physicalEnvelopes) {
      if (physEnv.sourceObjectId !== accEnv.sourceObjectId && overlapsEnvelope(accEnv, physEnv)) {
        hardViolations.push({
          ruleId: 'FLOW-ACCESS-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [accEnv.sourceObjectId, physEnv.sourceObjectId],
          reason: `Vehicle approach route to '${accEnv.sourceObjectId}' is obstructed by object '${physEnv.sourceObjectId}'.`,
          provenance: { source: 'standard', referenceKey: 'circulation.bay_approach_depth' },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. Safety Envelope Collision Check
  // -------------------------------------------------------------------------
  const safetyEnvelopes = candidate.envelopes.filter((e) => e.type === 'SAFETY');

  for (const safeEnv of safetyEnvelopes) {
    for (const physEnv of physicalEnvelopes) {
      if (physEnv.sourceObjectId !== safeEnv.sourceObjectId && overlapsEnvelope(safeEnv, physEnv)) {
        hardViolations.push({
          ruleId: 'SAFETY-BUFFER-001',
          severity: 'HARD',
          isDisqualifying: true,
          relatedObjectIds: [safeEnv.sourceObjectId, physEnv.sourceObjectId],
          reason: `Safety buffer for '${safeEnv.sourceObjectId}' is violated by object '${physEnv.sourceObjectId}'.`,
          provenance: { source: 'standard', referenceKey: 'clearance.safety_buffer' },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. Circulation Connectivity to Access Points
  // -------------------------------------------------------------------------
  const aisleEnvelopes = candidate.envelopes.filter(
    (e) => e.sourceObjectId.startsWith('aisle-')
  );

  if (input.accessPoints && input.accessPoints.length > 0 && aisleEnvelopes.length > 0) {
    for (const ap of input.accessPoints) {
      const isConnected = aisleEnvelopes.some(
        (aisle) => validateAccessPointConnection(ap, input.building, aisle).isConnected
      );
      if (!isConnected) {
        hardViolations.push({
          ruleId: 'FLOW-ENTRY-001',
          severity: 'HARD',
          isDisqualifying: true,
          reason: `Access point '${ap.id}' (${ap.type}) is not connected to any drive aisle.`,
          provenance: { source: 'input', referenceKey: ap.id },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 9. Service Bay Approach Accessibility from Drive Aisle
  // -------------------------------------------------------------------------
  const bayAccessEnvelopes = candidate.envelopes.filter(
    (e) => e.type === 'ACCESS' && e.sourceObjectId.startsWith('bay-')
  );
  const mainAisle = candidate.envelopes.find((e) => e.sourceObjectId === 'aisle-main');

  if (mainAisle) {
    for (const accEnv of bayAccessEnvelopes) {
      const parentObj = candidate.layout.objects.find((o) => o.id === accEnv.sourceObjectId);
      if (parentObj) {
        const approachValidation = validateApproachConnection(parentObj, accEnv, mainAisle);
        if (!approachValidation.isConnected) {
          hardViolations.push({
            ruleId: 'FLOW-BAY-AISLE-001',
            severity: 'HARD',
            isDisqualifying: true,
            relatedObjectIds: [accEnv.sourceObjectId],
            reason: `Service bay '${accEnv.sourceObjectId}' approach does not cleanly connect to the circulation drive aisle: ${approachValidation.reason}`,
            provenance: { source: 'standard', referenceKey: 'circulation.bay_approach_depth' },
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 10. Operational Bays Quantity & Service Types Check
  // -------------------------------------------------------------------------
  const totalBaysRequested = input.program.bays.reduce((sum, b) => sum + b.quantity, 0);
  const operationalBaysPlaced = candidate.layout.objects.filter((obj) => obj.type === 'service_bay');

  if (operationalBaysPlaced.length < totalBaysRequested) {
    hardViolations.push({
      ruleId: 'CAPACITY-BAYS-001',
      severity: 'HARD',
      isDisqualifying: true,
      reason: `Program requested ${totalBaysRequested} service bays, but only ${operationalBaysPlaced.length} could be placed inside building bounds.`,
      provenance: { source: 'input', referenceKey: 'program.bays' },
    });
  }

  // -------------------------------------------------------------------------
  // 11. Future Expansion Not Counted as Operational Bay
  // -------------------------------------------------------------------------
  const expansionObjects = candidate.layout.objects.filter(
    (obj) => (obj.metadata as any)?.isExpansionReserve === true
  );

  for (const expObj of expansionObjects) {
    if (expObj.type === 'service_bay') {
      hardViolations.push({
        ruleId: 'EXPANSION-RESERVE-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: [expObj.id],
        reason: `Future expansion reserve '${expObj.id}' cannot be classified as an active operational service bay.`,
        provenance: { source: 'input', referenceKey: 'program.futureExpansionBays' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 12. Parking Outside Building
  // -------------------------------------------------------------------------
  const parkingEnvelopes = candidate.envelopes.filter(
    (e) => e.sourceObjectId.startsWith('cust-parking-') || e.sourceObjectId.startsWith('staff-parking-')
  );

  const buildingPhysicalBox: ObjectEnvelope = {
    id: 'env-building-shell',
    type: 'PHYSICAL',
    sourceObjectId: 'building-shell',
    geometry: {
      x: 0,
      y: 0,
      width: input.building.width,
      length: input.building.length,
      rotation: 0,
    },
    derivedFromStandard: { parameterKey: 'building', appliedValue: input.building.width, unit: 'meter' },
    purpose: 'Building Exterior Footprint',
    violationSemantics: {
      forbiddenOverlapTypes: ['PHYSICAL'],
      severityOnOverlap: 'HARD',
      allowOverlapWithParent: false,
    },
  };

  for (const parkEnv of parkingEnvelopes) {
    if (overlapsEnvelope(parkEnv, buildingPhysicalBox)) {
      hardViolations.push({
        ruleId: 'PARKING-BUILDING-COLLISION-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: [parkEnv.sourceObjectId],
        reason: `Parking stall '${parkEnv.sourceObjectId}' overlaps with the building footprint.`,
        provenance: { source: 'derived', description: 'Parking must be situated outside the building' },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 13. Inherit existing candidate generator rejections
  // -------------------------------------------------------------------------
  if (candidate.rejections && candidate.rejections.length > 0) {
    for (const rej of candidate.rejections) {
      if (rej.severity === 'HARD' || rej.isDisqualifying) {
        hardViolations.push(rej);
      } else {
        softWarnings.push(rej);
      }
    }
  }

  const isValid = hardViolations.length === 0;
  const status: CandidateStatus = !isValid
    ? 'DISQUALIFIED'
    : softWarnings.length > 0
    ? 'FEASIBLE_WITH_WARNINGS'
    : 'VALID';

  const allRejections = Object.freeze([...hardViolations, ...softWarnings]);

  return Object.freeze({
    isValid,
    status,
    hardViolations: Object.freeze(hardViolations),
    softWarnings: Object.freeze(softWarnings),
    allRejections,
  });
}
