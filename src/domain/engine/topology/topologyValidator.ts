import { LayoutEngineInput } from '../types';
import { StandardAccessor } from '../StandardAccessor';
import {
  LayoutTopology,
  TopologyProvenance,
} from './topologyTypes';

export interface TopologyIssue {
  readonly ruleId: string;
  readonly severity: 'HARD' | 'WARNING' | 'INFO';
  readonly relatedNodeIds: readonly string[];
  readonly relatedEdgeIds: readonly string[];
  readonly reason: string;
  readonly provenance?: TopologyProvenance;
}

export interface DetailedTopologyValidationResult {
  readonly isValid: boolean;
  readonly violations: readonly TopologyIssue[];
  readonly warnings: readonly TopologyIssue[];
  readonly errors: readonly string[];
}

/**
 * Validates the spatial intent and relationship graph of a LayoutTopology.
 * Evaluates graph relationships only; does NOT evaluate geometry or placement.
 *
 * Rules verified:
 * - BUILDING node is mandatory
 * - CIRCULATION node is mandatory
 * - Every SERVICE_ZONE must have ACCESSIBLE relation to a CIRCULATION node
 * - Every EQUIPMENT_ZONE must have a SERVES relation to a SERVICE_ZONE
 * - CUSTOMER_ZONE (if present) must have ADJACENT relation to BUILDING or CIRCULATION
 * - EXPANSION_RESERVE (if present) must have ADJACENT relation to BUILDING
 * - Every ENTRY must have CONNECTED relation to CIRCULATION (ENTRY is optional if input has no access points)
 * - Zero automatic fixing or invented nodes/edges.
 */
export function validateTopologyConstraints(
  topology: LayoutTopology,
  input: LayoutEngineInput,
  accessor: StandardAccessor
): DetailedTopologyValidationResult {
  const issues: TopologyIssue[] = [];
  const nodes = topology.nodes;
  const edges = topology.edges;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Resolve rule severity data-driven from standard when available
  const flowRule = accessor.getRule('FLOW-001');
  const circulationSeverity = flowRule ? flowRule.severity : 'HARD';

  // 1. Mandatory BUILDING check
  const buildingNode = nodes.find((n) => n.type === 'BUILDING');
  if (!buildingNode) {
    issues.push({
      ruleId: 'TOPO-BUILDING-001',
      severity: 'HARD',
      relatedNodeIds: [],
      relatedEdgeIds: [],
      reason: 'Missing mandatory BUILDING node. Every layout topology must contain a BUILDING shell.',
      provenance: { source: 'standard', description: 'Mandatory structural container' },
    });
  }

  // 2. Mandatory CIRCULATION check
  const circulationNodes = nodes.filter((n) => n.type === 'CIRCULATION');
  if (circulationNodes.length === 0) {
    issues.push({
      ruleId: 'TOPO-CIRCULATION-001',
      severity: 'HARD',
      relatedNodeIds: [],
      relatedEdgeIds: [],
      reason: 'Missing mandatory CIRCULATION node. Every workshop topology must contain a circulation spine.',
      provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
    });
  }

  const circulationNodeIds = new Set(circulationNodes.map((n) => n.id));

  // 3. SERVICE_ZONE accessibility check
  const serviceZones = nodes.filter((n) => n.type === 'SERVICE_ZONE');
  for (const serviceZone of serviceZones) {
    const accessibleToCirculation = edges.some(
      (e) =>
        e.relation === 'ACCESSIBLE' &&
        ((e.fromNodeId === serviceZone.id && circulationNodeIds.has(e.toNodeId)) ||
          (e.toNodeId === serviceZone.id && circulationNodeIds.has(e.fromNodeId)))
    );

    if (!accessibleToCirculation) {
      issues.push({
        ruleId: 'TOPO-SERVICE-ACCESSIBLE-001',
        severity: circulationSeverity,
        relatedNodeIds: [serviceZone.id],
        relatedEdgeIds: [],
        reason: `Service Zone '${serviceZone.id}' is disconnected from the circulation spine. All service zones must be directly accessible from a CIRCULATION node.`,
        provenance: {
          source: 'standard',
          referenceKey: 'circulation.bay_approach_depth',
          description: 'Bay approach requirement from standard',
        },
      });
    }
  }

  // 4. EQUIPMENT_ZONE SERVES relationship check
  const equipmentZones = nodes.filter((n) => n.type === 'EQUIPMENT_ZONE');
  for (const equipZone of equipmentZones) {
    const servesServiceZone = edges.some(
      (e) =>
        e.relation === 'SERVES' &&
        (e.fromNodeId === equipZone.id || e.toNodeId === equipZone.id) &&
        (nodeMap.get(e.fromNodeId)?.type === 'SERVICE_ZONE' ||
          nodeMap.get(e.toNodeId)?.type === 'SERVICE_ZONE')
    );

    if (!servesServiceZone) {
      issues.push({
        ruleId: 'TOPO-EQUIPMENT-SERVES-001',
        severity: 'HARD',
        relatedNodeIds: [equipZone.id],
        relatedEdgeIds: [],
        reason: `Equipment Zone '${equipZone.id}' has no SERVES relationship to a SERVICE_ZONE. All equipment zones must serve operational service bays.`,
        provenance: {
          source: 'derived',
          description: 'Stationary equipment must serve active service bays',
        },
      });
    }
  }

  // 5. ENTRY connection to CIRCULATION check
  // Note: ENTRY is only checked if ENTRY nodes exist. If input has no access points, ENTRY is not required.
  const entryNodes = nodes.filter((n) => n.type === 'ENTRY');
  for (const entryNode of entryNodes) {
    const connectsToCirculation = edges.some(
      (e) =>
        e.relation === 'CONNECTED' &&
        ((e.fromNodeId === entryNode.id && circulationNodeIds.has(e.toNodeId)) ||
          (e.toNodeId === entryNode.id && circulationNodeIds.has(e.fromNodeId)))
    );

    if (!connectsToCirculation) {
      issues.push({
        ruleId: 'TOPO-ENTRY-CIRCULATION-001',
        severity: 'HARD',
        relatedNodeIds: [entryNode.id],
        relatedEdgeIds: [],
        reason: `Access Point '${entryNode.id}' does not connect to the CIRCULATION spine. Vehicles entering through this gate cannot reach internal traffic lanes.`,
        provenance: {
          source: 'input',
          referenceKey: entryNode.provenance.referenceKey,
          description: 'Input access door must connect to internal circulation',
        },
      });
    }
  }

  // 6. CUSTOMER_ZONE relationship check (optional, only checked if present)
  const customerZones = nodes.filter((n) => n.type === 'CUSTOMER_ZONE');
  for (const custZone of customerZones) {
    const hasValidAdjacency = edges.some(
      (e) =>
        e.relation === 'ADJACENT' &&
        (e.fromNodeId === custZone.id || e.toNodeId === custZone.id) &&
        (nodeMap.get(e.fromNodeId)?.type === 'BUILDING' ||
          nodeMap.get(e.toNodeId)?.type === 'BUILDING' ||
          nodeMap.get(e.fromNodeId)?.type === 'CIRCULATION' ||
          nodeMap.get(e.toNodeId)?.type === 'CIRCULATION')
    );

    if (!hasValidAdjacency) {
      issues.push({
        ruleId: 'TOPO-CUSTOMER-ADJACENCY-001',
        severity: 'WARNING',
        relatedNodeIds: [custZone.id],
        relatedEdgeIds: [],
        reason: `Customer Zone '${custZone.id}' is missing required adjacency relationship to BUILDING or CIRCULATION.`,
        provenance: {
          source: 'derived',
          description: 'Visitor area must be adjacent to building boundary or circulation pathway',
        },
      });
    }
  }

  // 7. EXPANSION_RESERVE relationship check (optional, only checked if present)
  const expansionNodes = nodes.filter((n) => n.type === 'EXPANSION_RESERVE');
  for (const expNode of expansionNodes) {
    const adjacentToBuilding = edges.some(
      (e) =>
        e.relation === 'ADJACENT' &&
        (e.fromNodeId === expNode.id || e.toNodeId === expNode.id) &&
        (nodeMap.get(e.fromNodeId)?.type === 'BUILDING' ||
          nodeMap.get(e.toNodeId)?.type === 'BUILDING')
    );

    if (!adjacentToBuilding) {
      issues.push({
        ruleId: 'TOPO-EXPANSION-BUILDING-001',
        severity: 'WARNING',
        relatedNodeIds: [expNode.id],
        relatedEdgeIds: [],
        reason: `Expansion Reserve '${expNode.id}' is missing required adjacency relationship to BUILDING.`,
        provenance: {
          source: 'derived',
          description: 'Future expansion reserve must be located within the building perimeter',
        },
      });
    }
  }

  // Separate violations (HARD) from warnings (WARNING / INFO)
  const violations = Object.freeze(
    issues
      .filter((i) => i.severity === 'HARD')
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
      .map((i) => Object.freeze(i))
  );

  const warnings = Object.freeze(
    issues
      .filter((i) => i.severity !== 'HARD')
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
      .map((i) => Object.freeze(i))
  );

  const errors = Object.freeze(violations.map((v) => `[${v.ruleId}] ${v.reason}`));

  return Object.freeze({
    isValid: violations.length === 0,
    violations,
    warnings,
    errors,
  });
}
