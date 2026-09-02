import { LayoutEngineInput } from '../types';
import { StandardAccessor } from '../StandardAccessor';
import {
  TopologyNode,
  TopologyEdge,
  LayoutTopology,
  createLayoutTopology,
  validateLayoutTopology,
} from './topologyTypes';

/**
 * Builds an immutable, deterministic LayoutTopology graph from workshop input and standard snapshot.
 *
 * Rules:
 * - Topology describes spatial intent and relationships only; NO geometry/coordinates are assigned.
 * - Only nodes and edges backed by actual input or standard requirements are created.
 * - If access points, customer zones, or expansion reserves are omitted in input, their nodes are omitted.
 * - Node and edge IDs are strictly deterministic.
 * - Every node and edge carries clear provenance.
 */
export function buildLayoutTopology(
  input: LayoutEngineInput,
  accessor: StandardAccessor
): LayoutTopology {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  const stdVersion = accessor.getStandardVersion();

  // 1. Mandatory Structural Nodes: SITE and BUILDING
  const siteNode: TopologyNode = {
    id: 'node-site',
    type: 'SITE',
    name: 'Workshop Site Boundary',
    intent: 'Outer property boundary and site perimeter',
    provenance: {
      source: 'input',
      referenceKey: 'site',
      description: 'Defined by site dimensions in LayoutEngineInput',
    },
    attributes: {
      width: input.site.width,
      length: input.site.length,
      roadSide: input.site.roadSide,
    },
  };
  nodes.push(siteNode);

  const buildingNode: TopologyNode = {
    id: 'node-building',
    type: 'BUILDING',
    name: 'Main Workshop Building Shell',
    intent: 'Primary structural building shell enclosing workshop operations',
    provenance: {
      source: 'input',
      referenceKey: 'building',
      description: 'Defined by building dimensions in LayoutEngineInput',
    },
    attributes: {
      width: input.building.width,
      length: input.building.length,
    },
  };
  nodes.push(buildingNode);

  // Edge: SITE -> BUILDING
  edges.push({
    id: 'edge-site-building',
    fromNodeId: siteNode.id,
    toNodeId: buildingNode.id,
    relation: 'CONNECTED',
    provenance: {
      source: 'input',
      referenceKey: 'building',
      description: 'Building is situated within the site boundary',
    },
  });

  // 2. Circulation Spine Node (Always required for workshop vehicle flow)
  const circulationNode: TopologyNode = {
    id: 'node-circulation',
    type: 'CIRCULATION',
    name: 'Circulation Spine',
    intent: 'Internal vehicle circulation route connecting access points to service bays',
    provenance: {
      source: 'standard',
      referenceKey: 'circulation.drive_aisle.min_width',
      description: 'Derived from program circulation requirement and standard drive aisle width',
    },
    attributes: {
      circulationRequirement: input.program.circulationRequirement,
    },
  };
  nodes.push(circulationNode);

  // Edge: BUILDING -> CIRCULATION
  edges.push({
    id: 'edge-building-circulation',
    fromNodeId: buildingNode.id,
    toNodeId: circulationNode.id,
    relation: 'CONNECTED',
    provenance: {
      source: 'derived',
      description: 'Circulation spine is situated inside the building shell',
    },
  });

  // 3. Entry Nodes (ONLY from provided input.accessPoints — zero invented doors!)
  if (input.accessPoints && input.accessPoints.length > 0) {
    const sortedAccessPoints = [...input.accessPoints].sort((a, b) => a.id.localeCompare(b.id));

    for (const ap of sortedAccessPoints) {
      const entryNode: TopologyNode = {
        id: `node-entry-${ap.id}`,
        type: 'ENTRY',
        name: `Access Point (${ap.type.toUpperCase()})`,
        intent: `${ap.type} gateway on the ${ap.wall} perimeter wall`,
        provenance: {
          source: 'input',
          referenceKey: ap.id,
          description: `Access point '${ap.id}' explicitly provided in input`,
        },
        attributes: {
          accessPointId: ap.id,
          type: ap.type,
          wall: ap.wall,
          offsetMeters: ap.offsetMeters,
          widthMeters: ap.widthMeters,
        },
      };
      nodes.push(entryNode);

      // Edge: BUILDING -> ENTRY (Door is mounted on building wall)
      edges.push({
        id: `edge-building-entry-${ap.id}`,
        fromNodeId: buildingNode.id,
        toNodeId: entryNode.id,
        relation: 'ADJACENT',
        provenance: {
          source: 'input',
          referenceKey: ap.id,
          description: `Access point '${ap.id}' is integrated into the ${ap.wall} wall`,
        },
      });

      // Edge: ENTRY -> CIRCULATION (Entry connects to internal circulation route)
      edges.push({
        id: `edge-entry-${ap.id}-circulation`,
        fromNodeId: entryNode.id,
        toNodeId: circulationNode.id,
        relation: 'CONNECTED',
        provenance: {
          source: 'input',
          referenceKey: ap.id,
          description: `Vehicles enter from access point '${ap.id}' into the circulation spine`,
        },
      });
    }
  }

  // 4. Service Bay Zone Node (Only if bays are requested)
  const totalBays = input.program.bays.reduce((sum, b) => sum + b.quantity, 0);
  if (totalBays > 0) {
    const serviceNode: TopologyNode = {
      id: 'node-service-zone',
      type: 'SERVICE_ZONE',
      name: 'Service Bay Zone',
      intent: 'Primary operational zone housing vehicle service bays and lifts',
      provenance: {
        source: 'input',
        referenceKey: 'program.bays',
        description: `${totalBays} service bay(s) requested across program`,
      },
      attributes: {
        totalBays,
        bayTypes: input.program.bays.map((b) => b.serviceType),
      },
    };
    nodes.push(serviceNode);

    // Edge: CIRCULATION -> SERVICE_ZONE (Service bays must be accessible from circulation aisle)
    edges.push({
      id: 'edge-circulation-service-zone',
      fromNodeId: circulationNode.id,
      toNodeId: serviceNode.id,
      relation: 'ACCESSIBLE',
      provenance: {
        source: 'standard',
        referenceKey: 'circulation.bay_approach_depth',
        description: 'Service bays are directly accessible from the central circulation spine',
      },
    });

    // 5. Equipment Zone Node (Only if equipment is requested)
    const totalEquipment = input.program.equipment.reduce((sum, e) => sum + e.quantity, 0);
    if (totalEquipment > 0) {
      const equipmentNode: TopologyNode = {
        id: 'node-equipment-zone',
        type: 'EQUIPMENT_ZONE',
        name: 'Equipment Zone',
        intent: 'Support zone housing stationary machinery and service equipment',
        provenance: {
          source: 'input',
          referenceKey: 'program.equipment',
          description: `${totalEquipment} machine item(s) requested in program`,
        },
        attributes: {
          equipmentTypes: input.program.equipment.map((e) => e.equipmentType),
        },
      };
      nodes.push(equipmentNode);

      // Edge: EQUIPMENT_ZONE -> SERVICE_ZONE (Equipment serves service bays)
      edges.push({
        id: 'edge-equipment-serves-service',
        fromNodeId: equipmentNode.id,
        toNodeId: serviceNode.id,
        relation: 'SERVES',
        provenance: {
          source: 'derived',
          description: 'Equipment zone provides dedicated machinery support to the service bays',
        },
      });
    }
  }

  // 6. Customer Zone Node (ONLY if customerZoneRequired is true)
  if (input.program.customerZoneRequired) {
    const customerNode: TopologyNode = {
      id: 'node-customer-zone',
      type: 'CUSTOMER_ZONE',
      name: 'Customer Reception & Lounge',
      intent: 'Segregated visitor waiting lounge, counter, and administrative desk',
      provenance: {
        source: 'input',
        referenceKey: 'program.customerZoneRequired',
        description: 'Customer zone explicitly requested in program',
      },
    };
    nodes.push(customerNode);

    // Edge: BUILDING -> CUSTOMER_ZONE
    edges.push({
      id: 'edge-building-customer-zone',
      fromNodeId: buildingNode.id,
      toNodeId: customerNode.id,
      relation: 'ADJACENT',
      provenance: {
        source: 'input',
        referenceKey: 'program.customerZoneRequired',
      },
    });

    // Edge: CIRCULATION -> CUSTOMER_ZONE
    edges.push({
      id: 'edge-circulation-customer-zone',
      fromNodeId: circulationNode.id,
      toNodeId: customerNode.id,
      relation: 'ADJACENT',
      provenance: {
        source: 'derived',
        description: 'Customer zone is adjacent to circulation for visitor pedestrian access',
      },
    });
  }

  // 7. Expansion Reserve Node (ONLY if futureExpansionBays > 0)
  if (input.program.futureExpansionBays > 0) {
    const expansionNode: TopologyNode = {
      id: 'node-expansion-reserve',
      type: 'EXPANSION_RESERVE',
      name: 'Future Expansion Reserve',
      intent: 'Contiguous reserved building floor space for future service bay additions',
      provenance: {
        source: 'input',
        referenceKey: 'program.futureExpansionBays',
        description: `${input.program.futureExpansionBays} expansion bay(s) requested`,
      },
      attributes: {
        futureExpansionBays: input.program.futureExpansionBays,
      },
    };
    nodes.push(expansionNode);

    // Edge: BUILDING -> EXPANSION_RESERVE
    edges.push({
      id: 'edge-building-expansion-reserve',
      fromNodeId: buildingNode.id,
      toNodeId: expansionNode.id,
      relation: 'ADJACENT',
      provenance: {
        source: 'input',
        referenceKey: 'program.futureExpansionBays',
      },
    });
  }

  // Build the immutable topology graph
  const topology = createLayoutTopology({
    id: `topology-${input.program.circulationRequirement}`,
    name: `Workshop Topology (${input.program.circulationRequirement})`,
    nodes,
    edges,
    standardVersionId: stdVersion,
  });

  // Verify graph integrity
  const validation = validateLayoutTopology(topology);
  if (!validation.isValid) {
    throw new Error(`Topology graph validation failed: ${validation.errors.join('; ')}`);
  }

  return topology;
}
