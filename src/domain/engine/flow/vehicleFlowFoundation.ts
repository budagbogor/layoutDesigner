/**
 * ============================================================================
 * MOBENG Workshop CAD Designer
 * Milestone M2B.5 — Vehicle-to-Bay Flow Foundation
 * ============================================================================
 *
 * Source of Truth:
 * - docs/PRODUCT_REQUIREMENT_BASELINE.md
 * - Milestone M2B.5 Specification
 *
 * Objective:
 * Establish deterministic vehicle flow connectivity between:
 * ROAD / ENTRY -> CUSTOMER / WORKSHOP ACCESS -> SERVICE BAY -> EXIT
 *
 * CRITICAL DOMAIN RULES:
 * 1. Zero swept paths, turning radius, or fake vehicle envelope calculation.
 * 2. Zero magic numbers or engineering fallbacks.
 * 3. Flow states: FLOW_VALID, FLOW_WARNING, FLOW_DISCONNECTED.
 * 4. Disconnection disqualifies candidates; unknown maneuverability issues FLOW_WARNING without disqualifying.
 */

import { LayoutEngineInput, ObjectEnvelope, AccessPoint } from '../types';
import { LayoutObject, Geometry } from '../../models/project';
import { StrategyCandidate } from '../strategies/strategyTypes';
import { StandardAccessor } from '../StandardAccessor';
import { validateAccessPointConnection, validateApproachConnection } from '../spatial/accessConnectivity';
import { overlapsEnvelope } from '../spatial/spatialRelations';
import { LayoutTopology } from '../topology/topologyTypes';
import { GeneratedCandidateLayout } from '../generator/candidateGenerator';

export type FlowCandidateInput =
  | StrategyCandidate
  | GeneratedCandidateLayout
  | {
      readonly layout?: { readonly objects: readonly LayoutObject[] };
      readonly objects?: readonly LayoutObject[];
      readonly envelopes?: readonly ObjectEnvelope[];
      readonly topology?: LayoutTopology;
    };

export type VehicleFlowState = 'FLOW_VALID' | 'FLOW_WARNING' | 'FLOW_DISCONNECTED';

export interface VehicleFlowDiagnostic {
  readonly ruleId: string;
  readonly severity: 'HARD' | 'SOFT';
  readonly isDisqualifying: boolean;
  readonly affectedObjectIds?: readonly string[];
  readonly reason: string;
  readonly flowState: VehicleFlowState;
  readonly provenance: {
    readonly source: 'input' | 'standard' | 'topology' | 'geometry';
    readonly referenceKey?: string;
  };
}

export interface BayFlowConnectivityResult {
  readonly bayId: string;
  readonly bayType: string;
  readonly hasApproachConnection: boolean;
  readonly hasCirculationConnection: boolean;
  readonly hasEgressPath: boolean;
  readonly isFullyConnected: boolean;
  readonly diagnostics: readonly VehicleFlowDiagnostic[];
}

export interface VehicleFlowAnalysisResult {
  readonly overallState: VehicleFlowState;
  readonly structuralState: VehicleFlowState; // FLOW_VALID if topologically & geometrically connected
  readonly isConnected: boolean;
  readonly isManeuverabilityVerified: boolean; // strictly false (swept path unknown)
  readonly entryConnectivity: {
    readonly isConnected: boolean;
    readonly connectedAccessPointIds: readonly string[];
    readonly disconnectedAccessPointIds: readonly string[];
  };
  readonly circulationConnectivity: {
    readonly hasDriveAisle: boolean;
    readonly aisleIds: readonly string[];
  };
  readonly bayConnectivity: readonly BayFlowConnectivityResult[];
  readonly exitConnectivity: {
    readonly hasExplicitExit: boolean;
    readonly isConnected: boolean;
    readonly exitAccessPointIds: readonly string[];
  };
  readonly diagnostics: readonly VehicleFlowDiagnostic[];
  readonly topologyGeometryAgreement: {
    readonly isConsistent: boolean;
    readonly discrepancies: readonly string[];
  };
}

/**
 * Pure deterministic analyzer for vehicle flow connectivity.
 */
export function analyzeVehicleFlow(
  input: LayoutEngineInput,
  candidate: FlowCandidateInput,
  accessor?: StandardAccessor
): VehicleFlowAnalysisResult {
  const diagnostics: VehicleFlowDiagnostic[] = [];
  const discrepancies: string[] = [];

  const buildingBoundary = {
    width: input.building.width,
    length: input.building.length,
  };

  // -------------------------------------------------------------------------
  // 1. Circulation / Drive Aisle Discovery
  // -------------------------------------------------------------------------
  const objects: readonly LayoutObject[] =
    'objects' in candidate && Array.isArray(candidate.objects)
      ? candidate.objects
      : 'layout' in candidate && candidate.layout && Array.isArray(candidate.layout.objects)
      ? candidate.layout.objects
      : [];

  const envelopes: readonly ObjectEnvelope[] = candidate.envelopes ?? [];
  const topology: LayoutTopology | undefined =
    'topology' in candidate ? candidate.topology : undefined;

  const aisleObjects = objects.filter(
    (o) => o.type === 'circulation_path' || o.id.startsWith('aisle-')
  );
  const aisleEnvelopes = envelopes.filter(
    (e) => e.sourceObjectId.startsWith('aisle-')
  );
  const mainAisleEnv = envelopes.find((e) => e.sourceObjectId === 'aisle-main');

  const hasDriveAisle = aisleObjects.length > 0 || aisleEnvelopes.length > 0;
  const aisleIds = Array.from(new Set([...aisleObjects.map((a) => a.id), ...aisleEnvelopes.map((e) => e.sourceObjectId)]));

  if (!hasDriveAisle) {
    diagnostics.push({
      ruleId: 'FLOW-DISCONNECTED-001',
      severity: 'HARD',
      isDisqualifying: true,
      reason: 'No central workshop circulation or drive aisle found in candidate layout.',
      flowState: 'FLOW_DISCONNECTED',
      provenance: { source: 'geometry', referenceKey: 'aisle-main' },
    });
  }

  // -------------------------------------------------------------------------
  // 2. Entry Connectivity (ROAD -> WORKSHOP ACCESS)
  // -------------------------------------------------------------------------
  const connectedAccessPointIds: string[] = [];
  const disconnectedAccessPointIds: string[] = [];

  const accessPoints = input.accessPoints ?? [];
  const entryAccessPoints = accessPoints.filter((ap) => ap.type === 'entrance' || ap.type === 'bidirectional');

  if (entryAccessPoints.length === 0) {
    // If no access points provided in input
    diagnostics.push({
      ruleId: 'FLOW-ENTRY-001',
      severity: 'HARD',
      isDisqualifying: true,
      reason: 'No vehicle access point (entrance/bidirectional) provided on building perimeter.',
      flowState: 'FLOW_DISCONNECTED',
      provenance: { source: 'input', referenceKey: 'accessPoints' },
    });
  } else {
    for (const ap of entryAccessPoints) {
      let isConnected = false;
      for (const aisle of aisleEnvelopes) {
        const connResult = validateAccessPointConnection(ap, buildingBoundary, aisle);
        if (connResult.isConnected) {
          isConnected = true;
          break;
        }
      }

      if (isConnected) {
        connectedAccessPointIds.push(ap.id);
      } else {
        disconnectedAccessPointIds.push(ap.id);
        diagnostics.push({
          ruleId: 'FLOW-ENTRY-001',
          severity: 'HARD',
          isDisqualifying: true,
          affectedObjectIds: [ap.id],
          reason: `Vehicle entry point '${ap.id}' on ${ap.wall} wall is structurally disconnected from workshop drive aisle circulation.`,
          flowState: 'FLOW_DISCONNECTED',
          provenance: { source: 'geometry', referenceKey: ap.id },
        });
      }
    }
  }

  const isEntryConnected = entryAccessPoints.length > 0 && disconnectedAccessPointIds.length === 0;

  // -------------------------------------------------------------------------
  // 3. Service Bay Flow & Connectivity (WORKSHOP -> SERVICE BAY)
  // -------------------------------------------------------------------------
  const bayConnectivityResults: BayFlowConnectivityResult[] = [];
  const serviceBays = objects.filter((o) => o.type === 'service_bay');
  const physicalEnvelopes = envelopes.filter((e) => e.type === 'PHYSICAL');

  for (const bay of serviceBays) {
    const bayDiagnostics: VehicleFlowDiagnostic[] = [];
    const bayAccessEnv = envelopes.find(
      (e) => e.type === 'ACCESS' && e.sourceObjectId === bay.id
    );

    let hasApproachConnection = false;
    let hasCirculationConnection = false;

    if (!bayAccessEnv) {
      const diag: VehicleFlowDiagnostic = {
        ruleId: 'FLOW-BAY-001',
        severity: 'HARD',
        isDisqualifying: true,
        affectedObjectIds: [bay.id],
        reason: `Service bay '${bay.id}' lacks a defined ACCESS envelope for vehicle ingress.`,
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'geometry', referenceKey: bay.id },
      };
      bayDiagnostics.push(diag);
      diagnostics.push(diag);
    } else if (!mainAisleEnv) {
      const diag: VehicleFlowDiagnostic = {
        ruleId: 'FLOW-BAY-001',
        severity: 'HARD',
        isDisqualifying: true,
        affectedObjectIds: [bay.id],
        reason: `Service bay '${bay.id}' cannot connect to circulation because main drive aisle is missing.`,
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'geometry', referenceKey: bay.id },
      };
      bayDiagnostics.push(diag);
      diagnostics.push(diag);
    } else {
      // Check approach connection to aisle
      const approachConn = validateApproachConnection(bay, bayAccessEnv, mainAisleEnv);
      hasApproachConnection = approachConn.isConnected;

      if (!hasApproachConnection) {
        const diag: VehicleFlowDiagnostic = {
          ruleId: 'FLOW-BAY-001',
          severity: 'HARD',
          isDisqualifying: true,
          affectedObjectIds: [bay.id],
          reason: `Service bay '${bay.id}' approach corridor does not reach the circulation drive aisle: ${approachConn.reason}`,
          flowState: 'FLOW_DISCONNECTED',
          provenance: { source: 'geometry', referenceKey: bay.id },
        };
        bayDiagnostics.push(diag);
        diagnostics.push(diag);
      } else {
        // Check if approach is obstructed by other physical objects
        let isObstructed = false;
        for (const physEnv of physicalEnvelopes) {
          if (physEnv.sourceObjectId !== bay.id && overlapsEnvelope(bayAccessEnv, physEnv)) {
            isObstructed = true;
            const diag: VehicleFlowDiagnostic = {
              ruleId: 'FLOW-BAY-001',
              severity: 'HARD',
              isDisqualifying: true,
              affectedObjectIds: [bay.id, physEnv.sourceObjectId],
              reason: `Vehicle approach route to bay '${bay.id}' is physically obstructed by object '${physEnv.sourceObjectId}'.`,
              flowState: 'FLOW_DISCONNECTED',
              provenance: { source: 'geometry', referenceKey: physEnv.sourceObjectId },
            };
            bayDiagnostics.push(diag);
            diagnostics.push(diag);
            break;
          }
        }
        hasCirculationConnection = !isObstructed;
      }
    }

    // Egress connectivity: shared circulation path reaches an exit or bidirectional door
    const hasEgressPath = hasCirculationConnection && isEntryConnected;
    const isFullyConnected = hasApproachConnection && hasCirculationConnection && hasEgressPath;

    bayConnectivityResults.push({
      bayId: bay.id,
      bayType: (bay.metadata?.serviceType as string) ?? 'general_service',
      hasApproachConnection,
      hasCirculationConnection,
      hasEgressPath,
      isFullyConnected,
      diagnostics: bayDiagnostics,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Exit / Egress Connectivity (SERVICE BAY -> EXIT)
  // -------------------------------------------------------------------------
  const exitAccessPoints = accessPoints.filter((ap) => ap.type === 'exit');
  const hasExplicitExit = exitAccessPoints.length > 0;
  const exitAccessPointIds: string[] = [];

  let isExitConnected = true;
  if (hasExplicitExit) {
    for (const ap of exitAccessPoints) {
      let apConnected = false;
      for (const aisle of aisleEnvelopes) {
        if (validateAccessPointConnection(ap, buildingBoundary, aisle).isConnected) {
          apConnected = true;
          break;
        }
      }
      if (apConnected) {
        exitAccessPointIds.push(ap.id);
      } else {
        isExitConnected = false;
        diagnostics.push({
          ruleId: 'FLOW-EXIT-001',
          severity: 'HARD',
          isDisqualifying: true,
          affectedObjectIds: [ap.id],
          reason: `Dedicated vehicle exit point '${ap.id}' on ${ap.wall} wall is not reached by the drive aisle.`,
          flowState: 'FLOW_DISCONNECTED',
          provenance: { source: 'geometry', referenceKey: ap.id },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Topology vs. Geometry Agreement
  // -------------------------------------------------------------------------
  if (topology) {
    const topo = topology;
    const topoEntryNodes = topo.nodes.filter((n) => n.type === 'ENTRY');
    const topoCircNodes = topo.nodes.filter((n) => n.type === 'CIRCULATION');
    const topoServiceNodes = topo.nodes.filter((n) => n.type === 'SERVICE_ZONE');

    // Check entry -> circulation edge
    const entryToCircEdge = topo.edges.find(
      (e) =>
        topoEntryNodes.some((en) => en.id === e.fromNodeId) &&
        topoCircNodes.some((cn) => cn.id === e.toNodeId)
    );

    if (entryToCircEdge && !isEntryConnected) {
      const msg = `Topology graph asserts CONNECTED relationship from ENTRY to CIRCULATION, but geometric analysis reveals a physical gap / disconnection.`;
      discrepancies.push(msg);
      diagnostics.push({
        ruleId: 'FLOW-DISCONNECTED-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: msg,
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'topology', referenceKey: entryToCircEdge.id },
      });
    }

    // Check circulation -> service bay edges
    const circToServiceEdge = topo.edges.find(
      (e) =>
        topoCircNodes.some((cn) => cn.id === e.fromNodeId) &&
        topoServiceNodes.some((sn) => sn.id === e.toNodeId)
    );

    const anyBayDisconnected = bayConnectivityResults.some((b) => !b.isFullyConnected);
    if (circToServiceEdge && anyBayDisconnected && serviceBays.length > 0) {
      const msg = `Topology graph asserts ACCESSIBLE relationship from CIRCULATION to SERVICE_ZONE, but one or more service bays are physically disconnected.`;
      discrepancies.push(msg);
      diagnostics.push({
        ruleId: 'FLOW-DISCONNECTED-001',
        severity: 'HARD',
        isDisqualifying: true,
        reason: msg,
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'topology', referenceKey: circToServiceEdge.id },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Maneuverability Feasibility Warning (FLOW_WARNING)
  // -------------------------------------------------------------------------
  // Swept-path and maneuverability are currently UNKNOWN.
  // Add SOFT FLOW_WARNING diagnostic without disqualifying the candidate.
  diagnostics.push({
    ruleId: 'FLOW-MANEUVER-WARNING-001',
    severity: 'SOFT',
    isDisqualifying: false,
    reason: 'Vehicle flow connectivity is structurally established, but complete vehicle maneuverability and swept-path feasibility remain unverified.',
    flowState: 'FLOW_WARNING',
    provenance: { source: 'standard', referenceKey: 'circulation.swept_path' },
  });

  // -------------------------------------------------------------------------
  // 7. Overall State Evaluation
  // -------------------------------------------------------------------------
  const hasDisconnection = diagnostics.some((d) => d.flowState === 'FLOW_DISCONNECTED');
  const isConnected =
    !hasDisconnection &&
    hasDriveAisle &&
    isEntryConnected &&
    isExitConnected &&
    serviceBays.length > 0 &&
    bayConnectivityResults.every((b) => b.isFullyConnected);

  const structuralState: VehicleFlowState = isConnected ? 'FLOW_VALID' : 'FLOW_DISCONNECTED';
  const overallState: VehicleFlowState = isConnected ? 'FLOW_WARNING' : 'FLOW_DISCONNECTED';

  return {
    overallState,
    structuralState,
    isConnected,
    isManeuverabilityVerified: false,
    entryConnectivity: {
      isConnected: isEntryConnected,
      connectedAccessPointIds,
      disconnectedAccessPointIds,
    },
    circulationConnectivity: {
      hasDriveAisle,
      aisleIds,
    },
    bayConnectivity: bayConnectivityResults,
    exitConnectivity: {
      hasExplicitExit,
      isConnected: isExitConnected,
      exitAccessPointIds,
    },
    diagnostics,
    topologyGeometryAgreement: {
      isConsistent: discrepancies.length === 0,
      discrepancies,
    },
  };
}
