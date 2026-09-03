import { LayoutEngineInput } from '../types';
import { StandardAccessor, MissingStandardParameterError } from '../StandardAccessor';
import {
  LayoutTopology,
  TopologyNode,
  createLayoutTopology,
} from './topologyTypes';

export type ProgramSpaceCategory =
  | 'CUSTOMER_CLEAN'
  | 'SERVICE_OPERATIONAL'
  | 'SERVICE_BAY'
  | 'SITE_PARKING'
  | 'STRUCTURAL'
  | 'CIRCULATION';

export interface CapacityRequirementIntent {
  readonly targetQuantity: number;
  readonly unit: string;
  readonly minStandardCapacity?: number;
  readonly standardReferenceKey?: string;
}

export interface ExpansionRequirementIntent {
  readonly plannedExpansionUnits: number;
  readonly standardReferenceKey?: string;
}

export interface ZonePriorityIntent {
  readonly level: number;
  readonly standardReferenceKey: string;
}

export interface VisibilityRequirementIntent {
  readonly targetNodeId: string;
  readonly description?: string;
}

export interface ZoneIntentMetadata {
  readonly spaceCategory?: ProgramSpaceCategory;
  readonly capacity?: CapacityRequirementIntent;
  readonly adjacencyRequirements?: readonly string[];
  readonly accessibilityRequirements?: readonly string[];
  readonly visibilityRequirements?: readonly VisibilityRequirementIntent[];
  readonly expansion?: ExpansionRequirementIntent;
  readonly priority?: ZonePriorityIntent;
  readonly notes?: readonly string[];
}

export interface DeriveTopologyZonesOptions {
  readonly requireStandardPriority?: boolean;
}

/**
 * Enriches an existing LayoutTopology graph with detailed Zone Intent Metadata.
 *
 * Rules:
 * - Uses existing LayoutTopology; does NOT rebuild the graph from scratch.
 * - Does NOT determine X/Y, dimensions, rotation, or geometry.
 * - Only enriches zone intent metadata for nodes present in the topology.
 * - Resolves all standard-derived parameters via StandardAccessor.
 * - Zero engineering defaults or hardcoded priorities.
 * - Output is strictly immutable and 100% deterministic.
 */
export function deriveTopologyZones(
  topology: LayoutTopology,
  input: LayoutEngineInput,
  accessor: StandardAccessor,
  options?: DeriveTopologyZonesOptions
): LayoutTopology {
  const edges = topology.edges;

  const enrichedNodes: TopologyNode[] = topology.nodes.map((node) => {
    // 1. Resolve adjacency requirements from graph edges
    const adjacentNodeIds = edges
      .filter(
        (e) =>
          e.relation === 'ADJACENT' &&
          (e.fromNodeId === node.id || e.toNodeId === node.id)
      )
      .map((e) => (e.fromNodeId === node.id ? e.toNodeId : e.fromNodeId))
      .sort((a, b) => a.localeCompare(b));

    // 2. Resolve accessibility requirements from graph edges
    const accessibleNodeIds = edges
      .filter(
        (e) =>
          e.relation === 'ACCESSIBLE' &&
          (e.fromNodeId === node.id || e.toNodeId === node.id)
      )
      .map((e) => (e.fromNodeId === node.id ? e.toNodeId : e.fromNodeId))
      .sort((a, b) => a.localeCompare(b));

    // 3. Resolve visibility requirements from graph edges
    const visibilityRequirements = edges
      .filter((e) => e.relation === 'VISIBILITY' && e.fromNodeId === node.id)
      .map((e) =>
        Object.freeze({
          targetNodeId: e.toNodeId,
          description: e.description,
        })
      );

    let spaceCategory: ProgramSpaceCategory | undefined;
    let capacity: CapacityRequirementIntent | undefined;
    let expansion: ExpansionRequirementIntent | undefined;
    let priority: ZonePriorityIntent | undefined;
    const notes: string[] = [];

    // 4. Resolve zone-specific intent based on node type
    switch (node.type) {
      case 'SITE':
      case 'BUILDING': {
        spaceCategory = 'STRUCTURAL';
        break;
      }

      case 'ENTRY':
      case 'CIRCULATION': {
        spaceCategory = 'CIRCULATION';
        if (node.type === 'CIRCULATION') {
          notes.push(`Circulation mode: ${input.program.circulationRequirement}`);
        }
        break;
      }

      case 'SERVICE_ZONE': {
        spaceCategory = 'SERVICE_BAY';
        const totalBays = input.program.bays.reduce((s, b) => s + b.quantity, 0);
        const minCapParam = accessor.getParameter('bay.min_capacity');

        capacity = {
          targetQuantity: totalBays,
          unit: 'service_bays',
          minStandardCapacity: minCapParam ? minCapParam.value : undefined,
          standardReferenceKey: minCapParam ? minCapParam.key : undefined,
        };

        const priorityKey = 'zoning.priority.service_zone';
        if (options?.requireStandardPriority) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        } else if (accessor.hasParameter(priorityKey)) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        }
        break;
      }

      case 'EQUIPMENT_ZONE': {
        spaceCategory = 'SERVICE_OPERATIONAL';
        const totalEquipment = input.program.equipment.reduce((s, e) => s + e.quantity, 0);
        capacity = {
          targetQuantity: totalEquipment,
          unit: 'equipment_units',
        };

        const priorityKey = 'zoning.priority.equipment_zone';
        if (options?.requireStandardPriority) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        } else if (accessor.hasParameter(priorityKey)) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        }
        break;
      }

      case 'CUSTOMER_ZONE':
      case 'CUSTOMER_LOUNGE': {
        spaceCategory = 'CUSTOMER_CLEAN';
        capacity = {
          targetQuantity: 1,
          unit: 'customer_reception_lounge',
        };

        const priorityKey = 'zoning.priority.customer_zone';
        if (options?.requireStandardPriority) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        } else if (accessor.hasParameter(priorityKey)) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        }
        break;
      }

      case 'CASHIER_OFFICE': {
        spaceCategory = 'CUSTOMER_CLEAN';
        capacity = {
          targetQuantity: 1,
          unit: 'cashier_admin_office',
        };
        break;
      }

      case 'RESTROOM': {
        spaceCategory = 'CUSTOMER_CLEAN';
        capacity = {
          targetQuantity: 1,
          unit: 'sanitary_restroom',
        };
        break;
      }

      case 'STAFF_ROOM': {
        spaceCategory = 'CUSTOMER_CLEAN';
        capacity = {
          targetQuantity: 1,
          unit: 'staff_break_room',
        };
        break;
      }

      case 'PARTS_WAREHOUSE': {
        spaceCategory = 'SERVICE_OPERATIONAL';
        capacity = {
          targetQuantity: 1,
          unit: 'spare_parts_warehouse',
        };
        break;
      }

      case 'COMPRESSOR_ROOM': {
        spaceCategory = 'SERVICE_OPERATIONAL';
        capacity = {
          targetQuantity: 1,
          unit: 'air_compressor_enclosure',
        };
        break;
      }

      case 'OIL_WASTE_STORAGE': {
        spaceCategory = 'SERVICE_OPERATIONAL';
        capacity = {
          targetQuantity: 1,
          unit: 'hazardous_waste_storage',
        };
        break;
      }

      case 'CUSTOMER_PARKING': {
        spaceCategory = 'SITE_PARKING';
        const count = input.site.parking?.customerParkingSpaces ?? 0;
        capacity = {
          targetQuantity: count,
          unit: 'customer_parking_stalls',
        };
        break;
      }

      case 'STAFF_PARKING': {
        spaceCategory = 'SITE_PARKING';
        const count = input.site.parking?.staffParkingSpaces ?? 0;
        capacity = {
          targetQuantity: count,
          unit: 'staff_parking_stalls',
        };
        break;
      }

      case 'VEHICLE_STAGING': {
        spaceCategory = 'SITE_PARKING';
        const count = input.site.parking?.vehicleStagingSpaces ?? 0;
        capacity = {
          targetQuantity: count,
          unit: 'vehicle_staging_stalls',
        };
        break;
      }

      case 'EXPANSION_RESERVE': {
        spaceCategory = 'SERVICE_BAY';
        if (input.program.futureExpansionBays > 0) {
          expansion = {
            plannedExpansionUnits: input.program.futureExpansionBays,
            standardReferenceKey: 'program.futureExpansionBays',
          };
        }

        const priorityKey = 'zoning.priority.expansion_reserve';
        if (options?.requireStandardPriority) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        } else if (accessor.hasParameter(priorityKey)) {
          const param = accessor.getRequiredParameter(priorityKey);
          priority = { level: param.value, standardReferenceKey: param.key };
        }
        break;
      }
    }

    // Build zone intent object (only include defined properties)
    const zoneIntent: ZoneIntentMetadata = Object.freeze({
      spaceCategory,
      capacity: capacity ? Object.freeze(capacity) : undefined,
      adjacencyRequirements:
        adjacentNodeIds.length > 0 ? Object.freeze(adjacentNodeIds) : undefined,
      accessibilityRequirements:
        accessibleNodeIds.length > 0 ? Object.freeze(accessibleNodeIds) : undefined,
      visibilityRequirements:
        visibilityRequirements.length > 0 ? Object.freeze(visibilityRequirements) : undefined,
      expansion: expansion ? Object.freeze(expansion) : undefined,
      priority: priority ? Object.freeze(priority) : undefined,
      notes: notes.length > 0 ? Object.freeze(notes) : undefined,
    });

    const updatedAttributes = {
      ...(node.attributes ?? {}),
      zoneIntent,
    };

    return Object.freeze({
      ...node,
      attributes: Object.freeze(updatedAttributes),
    });
  });

  return createLayoutTopology({
    id: topology.id,
    name: topology.name,
    nodes: enrichedNodes,
    edges: [...topology.edges],
    standardVersionId: topology.metadata.standardVersionId,
  });
}
