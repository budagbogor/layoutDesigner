// ---------------------------------------------------------------------------
// Milestone 2.4 — Layout Topology Foundation Contracts & Graph Representation
// ---------------------------------------------------------------------------

export type TopologyNodeType =
  | 'SITE'
  | 'BUILDING'
  | 'ENTRY'
  | 'CIRCULATION'
  | 'SERVICE_ZONE'
  | 'CUSTOMER_ZONE'
  | 'EXPANSION_RESERVE'
  | 'EQUIPMENT_ZONE'
  // Fine-Grained Ancillary Program Spaces (Clean / Customer)
  | 'CUSTOMER_LOUNGE'
  | 'CASHIER_OFFICE'
  | 'RESTROOM'
  | 'CUSTOMER_RESTROOM'
  | 'MUSHOLA'
  | 'WUDHU'
  | 'STAFF_ROOM'
  // Fine-Grained Ancillary Program Spaces (Operational / Service / Back-of-House)
  | 'PARTS_WAREHOUSE'
  | 'COMPRESSOR_ROOM'
  | 'OIL_WASTE_STORAGE'
  | 'WASTE_AREA'
  | 'EMPLOYEE_MESS'
  | 'EMPLOYEE_RESTROOM'
  // Site Parking Spaces
  | 'CUSTOMER_PARKING'
  | 'STAFF_PARKING'
  | 'VEHICLE_STAGING';

export type TopologyEdgeRelation =
  | 'CONNECTED'
  | 'ADJACENT'
  | 'ACCESSIBLE'
  | 'SERVES'
  | 'VISIBILITY';

export type TopologyRuleSeverity = 'HARD' | 'SOFT';

export interface TopologyProvenance {
  readonly source: 'input' | 'standard' | 'derived';
  readonly referenceKey?: string; // e.g. AccessPoint ID or standard parameter key
  readonly description?: string;
}

export interface TopologyNode {
  readonly id: string;
  readonly type: TopologyNodeType;
  readonly name: string;
  readonly intent: string; // Spatial purpose without coordinates
  readonly provenance: TopologyProvenance;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface TopologyEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relation: TopologyEdgeRelation;
  readonly severity?: TopologyRuleSeverity; // 'HARD' (structural/essential) vs 'SOFT' (preference/optimization)
  readonly ruleId?: string; // Rule identifier for tracing and audit
  readonly description?: string;
  readonly provenance: TopologyProvenance;
  readonly bidirectional?: boolean;
}

export interface LayoutTopology {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
  readonly metadata: {
    readonly createdAt: string;
    readonly version: string;
    readonly standardVersionId?: string;
  };
}

export interface TopologyValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates the structural integrity of a LayoutTopology graph.
 * Pure and deterministic function:
 * - Ensures all node and edge IDs are unique
 * - Validates all edge references (fromNodeId and toNodeId) map to existing nodes
 * - Asserts presence of mandatory structural nodes (e.g. 'BUILDING')
 */
export function validateLayoutTopology(topology: LayoutTopology): TopologyValidationResult {
  const errors: string[] = [];

  // 1. Check duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of topology.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID detected: '${node.id}'. All topology nodes must have unique IDs.`);
    }
    nodeIds.add(node.id);
  }

  // 2. Check duplicate edge IDs
  const edgeIds = new Set<string>();
  for (const edge of topology.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge ID detected: '${edge.id}'. All topology edges must have unique IDs.`);
    }
    edgeIds.add(edge.id);
  }

  // 3. Check invalid edge references
  for (const edge of topology.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      errors.push(
        `Edge '${edge.id}' has invalid fromNodeId '${edge.fromNodeId}'. Node does not exist in topology.`
      );
    }
    if (!nodeIds.has(edge.toNodeId)) {
      errors.push(
        `Edge '${edge.id}' has invalid toNodeId '${edge.toNodeId}'. Node does not exist in topology.`
      );
    }
  }

  // 4. Check mandatory structural nodes
  const hasBuilding = topology.nodes.some((n) => n.type === 'BUILDING');
  if (!hasBuilding) {
    errors.push(`Missing required node of type 'BUILDING'. Every layout topology must contain a BUILDING node.`);
  }

  return {
    isValid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}

/**
 * Factory to create a deep-frozen, immutable LayoutTopology graph.
 */
export function createLayoutTopology(params: {
  id: string;
  name: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  standardVersionId?: string;
}): LayoutTopology {
  const topology: LayoutTopology = {
    id: params.id,
    name: params.name,
    nodes: Object.freeze(
      params.nodes.map((n) =>
        Object.freeze({
          ...n,
          provenance: Object.freeze({ ...n.provenance }),
          attributes: n.attributes ? Object.freeze({ ...n.attributes }) : undefined,
        })
      )
    ),
    edges: Object.freeze(
      params.edges.map((e) =>
        Object.freeze({
          ...e,
          provenance: Object.freeze({ ...e.provenance }),
        })
      )
    ),
    metadata: Object.freeze({
      createdAt: '2026-09-02T00:00:00.000Z',
      version: '1.0',
      standardVersionId: params.standardVersionId,
    }),
  };

  return Object.freeze(topology);
}
