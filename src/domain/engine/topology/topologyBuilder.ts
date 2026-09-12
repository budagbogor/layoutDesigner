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
 * - Every node and edge carries clear provenance, severity ('HARD' vs 'SOFT'), and ruleId.
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
      frontSetbackMeters: input.building.frontSetbackMeters,
    },
  };
  nodes.push(buildingNode);

  // Edge: SITE -> BUILDING
  edges.push({
    id: 'edge-site-building',
    fromNodeId: siteNode.id,
    toNodeId: buildingNode.id,
    relation: 'CONNECTED',
    severity: 'HARD',
    ruleId: 'STRUCT-001',
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
    severity: 'HARD',
    ruleId: 'STRUCT-002',
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
        severity: 'HARD',
        ruleId: 'ACCESS-001',
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
        severity: 'HARD',
        ruleId: 'FLOW-001',
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
      severity: 'HARD',
      ruleId: 'FLOW-BAY-001',
      provenance: {
        source: 'standard',
        referenceKey: 'circulation.bay_approach_depth',
        description: 'Service bays are directly accessible from the central circulation spine',
      },
    });

    // 5. Equipment Zone Node (Only if equipment is requested)
    const totalEquipment = input.program.equipment?.reduce((sum, e) => sum + e.quantity, 0) ?? 0;
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
          equipmentTypes: input.program.equipment?.map((e) => e.equipmentType) ?? [],
        },
      };
      nodes.push(equipmentNode);

      // Edge: EQUIPMENT_ZONE -> SERVICE_ZONE (Equipment serves service bays)
      edges.push({
        id: 'edge-equipment-serves-service',
        fromNodeId: equipmentNode.id,
        toNodeId: serviceNode.id,
        relation: 'SERVES',
        severity: 'SOFT',
        ruleId: 'PREF-EQUIP-001',
        provenance: {
          source: 'derived',
          description: 'Equipment zone provides dedicated machinery support to the service bays',
        },
      });
    }
  }

  // 6. Generic Customer Zone Node (ONLY if customerZoneRequired is true and no fine-grained lounge is requested)
  if (input.program.customerZoneRequired && !input.program.ancillarySpaces?.customerLounge) {
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
      severity: 'HARD',
      ruleId: 'STRUCT-CUST-001',
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
      severity: 'SOFT',
      ruleId: 'PREF-CUST-002',
      provenance: {
        source: 'derived',
        description: 'Customer zone is adjacent to circulation for visitor pedestrian access',
      },
    });
  }

  // 7. Fine-Grained Ancillary Spaces (Clean / Customer Areas)
  const anc = input.program.ancillarySpaces;

  let loungeNode: TopologyNode | undefined;
  if (anc?.customerLounge) {
    loungeNode = {
      id: 'node-customer-lounge',
      type: 'CUSTOMER_LOUNGE',
      name: 'Customer Waiting Lounge',
      intent: 'Comfortable waiting area for customers with reception/seating',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.customerLounge',
        description: 'Customer lounge explicitly requested in ancillary spaces program',
      },
    };
    nodes.push(loungeNode);

    edges.push({
      id: 'edge-building-customer-lounge',
      fromNodeId: buildingNode.id,
      toNodeId: loungeNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-LOUNGE-001',
      provenance: { source: 'derived', description: 'Customer lounge is inside building shell' },
    });

    edges.push({
      id: 'edge-circulation-customer-lounge',
      fromNodeId: circulationNode.id,
      toNodeId: loungeNode.id,
      relation: 'ACCESSIBLE',
      severity: 'HARD',
      ruleId: 'FLOW-LOUNGE-001',
      provenance: { source: 'derived', description: 'Accessible from circulation route' },
    });

    // Visibility requirement: Lounge with bay view to service bays (Active ONLY if requested!)
    if (anc.loungeWithBayView && totalBays > 0) {
      edges.push({
        id: 'edge-lounge-visibility-service',
        fromNodeId: loungeNode.id,
        toNodeId: 'node-service-zone',
        relation: 'VISIBILITY',
        severity: 'SOFT',
        ruleId: 'USER-VIS-001',
        description: 'Customer lounge has direct line-of-sight visual connection into service bays',
        provenance: {
          source: 'input',
          referenceKey: 'program.ancillarySpaces.loungeWithBayView',
          description: 'Lounge with bay view requested in program',
        },
      });
    }
  }

  let cashierNode: TopologyNode | undefined;
  if (anc?.cashierOffice) {
    cashierNode = {
      id: 'node-cashier-office',
      type: 'CASHIER_OFFICE',
      name: 'Cashier & Administration Office',
      intent: 'Payment counter and workshop administrative work area',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.cashierOffice',
        description: 'Cashier/admin office requested in program',
      },
    };
    nodes.push(cashierNode);

    edges.push({
      id: 'edge-building-cashier-office',
      fromNodeId: buildingNode.id,
      toNodeId: cashierNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-CASHIER-001',
      provenance: { source: 'derived', description: 'Cashier office is inside building shell' },
    });

    if (loungeNode) {
      edges.push({
        id: 'edge-lounge-cashier-adjacent',
        fromNodeId: loungeNode.id,
        toNodeId: cashierNode.id,
        relation: 'ADJACENT',
        severity: 'SOFT',
        ruleId: 'PREF-CUST-001',
        provenance: { source: 'derived', description: 'Cashier is adjacent to customer lounge for payment' },
      });
    }
  }

  if (anc?.restroom) {
    const restroomNode: TopologyNode = {
      id: 'node-restroom',
      type: 'RESTROOM',
      name: 'Customer & Staff Restroom',
      intent: 'Sanitary toilet and handwashing facility',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.restroom',
        description: 'Restroom facility requested in program',
      },
    };
    nodes.push(restroomNode);

    edges.push({
      id: 'edge-building-restroom',
      fromNodeId: buildingNode.id,
      toNodeId: restroomNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-RESTROOM-001',
      provenance: { source: 'derived', description: 'Restroom is inside building shell' },
    });

    if (loungeNode) {
      edges.push({
        id: 'edge-lounge-restroom-accessible',
        fromNodeId: loungeNode.id,
        toNodeId: restroomNode.id,
        relation: 'ACCESSIBLE',
        severity: 'HARD',
        ruleId: 'FLOW-RESTROOM-001',
        provenance: { source: 'derived', description: 'Restroom is directly accessible from customer lounge' },
      });
    }
  }

  if (anc?.customerRestroom) {
    const custRestroomNode: TopologyNode = {
      id: 'node-customer-restroom',
      type: 'CUSTOMER_RESTROOM',
      name: 'Customer Restroom',
      intent: 'Dedicated sanitary toilet facility for customers',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.customerRestroom',
        description: 'Customer restroom requested in program',
      },
    };
    nodes.push(custRestroomNode);

    edges.push({
      id: 'edge-building-customer-restroom',
      fromNodeId: buildingNode.id,
      toNodeId: custRestroomNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-RESTROOM-001',
      provenance: { source: 'derived', description: 'Customer restroom is inside building shell' },
    });

    if (loungeNode) {
      edges.push({
        id: 'edge-lounge-customer-restroom-accessible',
        fromNodeId: loungeNode.id,
        toNodeId: custRestroomNode.id,
        relation: 'ACCESSIBLE',
        severity: 'HARD',
        ruleId: 'FLOW-RESTROOM-001',
        provenance: { source: 'derived', description: 'Customer restroom is directly accessible from customer lounge' },
      });
    }
  }

  let musholaNode: TopologyNode | undefined;
  if (anc?.mushola) {
    musholaNode = {
      id: 'node-mushola',
      type: 'MUSHOLA',
      name: 'Mini Mushola Prayer Room',
      intent: 'Dedicated prayer space for customers and staff',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.mushola',
        description: 'Mini mushola requested in program',
      },
    };
    nodes.push(musholaNode);

    edges.push({
      id: 'edge-building-mushola',
      fromNodeId: buildingNode.id,
      toNodeId: musholaNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-MUSHOLA-001',
      provenance: { source: 'derived', description: 'Mushola is inside building shell' },
    });
  }

  if (anc?.wudhu) {
    const wudhuNode: TopologyNode = {
      id: 'node-wudhu',
      type: 'WUDHU',
      name: 'Wudhu Ablution Facility',
      intent: 'Ablution facility with min 1 faucet attached to Mushola',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.wudhu',
        description: 'Wudhu facility requested in program',
      },
    };
    nodes.push(wudhuNode);

    edges.push({
      id: 'edge-building-wudhu',
      fromNodeId: buildingNode.id,
      toNodeId: wudhuNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-WUDHU-001',
      provenance: { source: 'derived', description: 'Wudhu is inside building shell' },
    });

    if (musholaNode) {
      edges.push({
        id: 'edge-mushola-wudhu-mandatory-adjacency',
        fromNodeId: musholaNode.id,
        toNodeId: wudhuNode.id,
        relation: 'ADJACENT',
        severity: 'HARD',
        ruleId: 'ADJACENCY-MUSHOLA-WUDHU-001',
        description: 'Mushola and Wudhu mandatory adjacency',
        provenance: {
          source: 'standard',
          referenceKey: 'room.min_width.wudhu',
          description: 'Wudhu must be adjacent to Mushola',
        },
      });
    }
  }

  let messNode: TopologyNode | undefined;
  if (anc?.employeeMess) {
    messNode = {
      id: 'node-employee-mess',
      type: 'EMPLOYEE_MESS',
      name: 'Employee Mess & Rest Quarters',
      intent: 'Dedicated resting and sleeping quarters for employees (Back-of-House)',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.employeeMess',
        description: 'Employee mess requested in program',
      },
    };
    nodes.push(messNode);

    edges.push({
      id: 'edge-building-employee-mess',
      fromNodeId: buildingNode.id,
      toNodeId: messNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-MESS-001',
      provenance: { source: 'derived', description: 'Employee mess is inside building shell' },
    });
  }

  if (anc?.employeeRestroom) {
    const empRestroomNode: TopologyNode = {
      id: 'node-employee-restroom',
      type: 'EMPLOYEE_RESTROOM',
      name: 'Employee Restroom',
      intent: 'Dedicated sanitary restroom facility for staff (Back-of-House)',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.employeeRestroom',
        description: 'Employee restroom requested in program',
      },
    };
    nodes.push(empRestroomNode);

    edges.push({
      id: 'edge-building-employee-restroom',
      fromNodeId: buildingNode.id,
      toNodeId: empRestroomNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-EMP-RESTROOM-001',
      provenance: { source: 'derived', description: 'Employee restroom is inside building shell' },
    });

    if (messNode) {
      edges.push({
        id: 'edge-mess-employee-restroom-adjacent',
        fromNodeId: messNode.id,
        toNodeId: empRestroomNode.id,
        relation: 'ADJACENT',
        severity: 'SOFT',
        ruleId: 'PREF-STAFF-001',
        provenance: {
          source: 'derived',
          description: 'Employee restroom is associated with Employee Mess',
        },
      });
    }
  }

  if (anc?.staffRoom) {
    const staffRoomNode: TopologyNode = {
      id: 'node-staff-room',
      type: 'STAFF_ROOM',
      name: 'Technician & Staff Break Room',
      intent: 'Rest area and lockers for workshop technicians and staff',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.staffRoom',
        description: 'Staff break room requested in program',
      },
    };
    nodes.push(staffRoomNode);

    edges.push({
      id: 'edge-building-staff-room',
      fromNodeId: buildingNode.id,
      toNodeId: staffRoomNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-STAFF-001',
      provenance: { source: 'derived', description: 'Staff room is inside building shell' },
    });
  }

  // 8. Fine-Grained Ancillary Spaces (Operational / Service Areas)
  let warehouseNode: TopologyNode | undefined;
  if (anc?.partsWarehouse) {
    warehouseNode = {
      id: 'node-parts-warehouse',
      type: 'PARTS_WAREHOUSE',
      name: 'Spare Parts Warehouse & Storage',
      intent: 'Secure storage racks for automotive replacement parts and fluids',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.partsWarehouse',
        description: 'Parts warehouse storage requested in program',
      },
    };
    nodes.push(warehouseNode);

    edges.push({
      id: 'edge-building-parts-warehouse',
      fromNodeId: buildingNode.id,
      toNodeId: warehouseNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-PARTS-001',
      provenance: { source: 'derived', description: 'Parts warehouse is inside building shell' },
    });

    if (totalBays > 0) {
      edges.push({
        id: 'edge-warehouse-serves-service',
        fromNodeId: warehouseNode.id,
        toNodeId: 'node-service-zone',
        relation: 'SERVES',
        severity: 'HARD',
        ruleId: 'FLOW-PARTS-001',
        provenance: { source: 'derived', description: 'Parts warehouse supplies parts to service bays' },
      });
      edges.push({
        id: 'edge-warehouse-service-adjacent',
        fromNodeId: warehouseNode.id,
        toNodeId: 'node-service-zone',
        relation: 'ADJACENT',
        severity: 'SOFT',
        ruleId: 'PREF-PARTS-001',
        provenance: { source: 'derived', description: 'Parts warehouse is adjacent to service area for technician access' },
      });
    }

    if (cashierNode) {
      edges.push({
        id: 'edge-warehouse-cashier-adjacent',
        fromNodeId: warehouseNode.id,
        toNodeId: cashierNode.id,
        relation: 'ADJACENT',
        severity: 'SOFT',
        ruleId: 'PREF-ADMIN-001',
        provenance: { source: 'derived', description: 'Parts warehouse is coordinated with cashier office' },
      });
    }
  }

  if (anc?.compressorRoom) {
    const compressorNode: TopologyNode = {
      id: 'node-compressor-room',
      type: 'COMPRESSOR_ROOM',
      name: 'Air Compressor Acoustic Enclosure',
      intent: 'Dedicated sound-isolated room for air compressor and pneumatic lines',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.compressorRoom',
        description: 'Compressor room requested in program',
      },
    };
    nodes.push(compressorNode);

    edges.push({
      id: 'edge-building-compressor-room',
      fromNodeId: buildingNode.id,
      toNodeId: compressorNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-COMP-001',
      provenance: { source: 'derived', description: 'Compressor room is inside building shell' },
    });

    if (totalBays > 0) {
      edges.push({
        id: 'edge-compressor-serves-service',
        fromNodeId: compressorNode.id,
        toNodeId: 'node-service-zone',
        relation: 'SERVES',
        severity: 'SOFT',
        ruleId: 'PREF-COMP-001',
        provenance: { source: 'derived', description: 'Compressor supplies pneumatic pressure to service bays' },
      });
    }
  }

  if (anc?.oilWasteStorage) {
    const oilWasteNode: TopologyNode = {
      id: 'node-oil-waste-storage',
      type: 'OIL_WASTE_STORAGE',
      name: 'Hazardous Waste (B3) & Oil Storage',
      intent: 'Segregated containment area for used oil drums and hazardous waste',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.oilWasteStorage',
        description: 'Oil and waste storage requested in program',
      },
    };
    nodes.push(oilWasteNode);

    edges.push({
      id: 'edge-building-oil-waste-storage',
      fromNodeId: buildingNode.id,
      toNodeId: oilWasteNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-WASTE-001',
      provenance: { source: 'derived', description: 'Oil waste storage is inside building shell' },
    });

    if (totalBays > 0) {
      edges.push({
        id: 'edge-oil-waste-serves-service',
        fromNodeId: oilWasteNode.id,
        toNodeId: 'node-service-zone',
        relation: 'SERVES',
        severity: 'SOFT',
        ruleId: 'PREF-WASTE-001',
        provenance: { source: 'derived', description: 'Oil waste storage collects waste fluid from service bays' },
      });
    }
  }

  if (anc?.wasteStreams) {
    const wasteNode: TopologyNode = {
      id: 'node-waste-area',
      type: 'WASTE_AREA',
      name: '4-Stream Waste Area (BOH)',
      intent: 'Dedicated rear area for 4-stream waste management (oil, tire, parts, cardboard)',
      provenance: {
        source: 'input',
        referenceKey: 'program.ancillarySpaces.wasteStreams',
        description: '4-stream waste area requested in program',
      },
      attributes: {
        streams: anc.wasteStreams,
      },
    };
    nodes.push(wasteNode);

    edges.push({
      id: 'edge-building-waste-area',
      fromNodeId: buildingNode.id,
      toNodeId: wasteNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'STRUCT-WASTE-001',
      provenance: { source: 'derived', description: 'Waste area is inside building shell' },
    });

    if (totalBays > 0) {
      edges.push({
        id: 'edge-waste-serves-service',
        fromNodeId: wasteNode.id,
        toNodeId: 'node-service-zone',
        relation: 'SERVES',
        severity: 'SOFT',
        ruleId: 'PREF-WASTE-001',
        provenance: { source: 'derived', description: 'Waste area collects operational waste from service bays' },
      });
    }
  }

  // 9. Site Parking Spaces (Outside Building, on Site Property)
  const parking = input.site.parking;
  if (parking?.customerParkingSpaces && parking.customerParkingSpaces > 0) {
    const custParkingNode: TopologyNode = {
      id: 'node-customer-parking',
      type: 'CUSTOMER_PARKING',
      name: 'Customer Vehicle Parking',
      intent: 'Designated parking stalls on site for customer vehicles',
      provenance: {
        source: 'input',
        referenceKey: 'site.parking.customerParkingSpaces',
        description: `${parking.customerParkingSpaces} customer parking stall(s) requested`,
      },
      attributes: {
        parkingSpaces: parking.customerParkingSpaces,
      },
    };
    nodes.push(custParkingNode);

    edges.push({
      id: 'edge-site-customer-parking',
      fromNodeId: siteNode.id,
      toNodeId: custParkingNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'PROG-PARK-001',
      provenance: { source: 'derived', description: 'Customer parking is situated on the site' },
    });
  }

  if (parking?.staffParkingSpaces && parking.staffParkingSpaces > 0) {
    const staffParkingNode: TopologyNode = {
      id: 'node-staff-parking',
      type: 'STAFF_PARKING',
      name: 'Staff Vehicle Parking',
      intent: 'Dedicated parking stalls on site for workshop technicians and personnel',
      provenance: {
        source: 'input',
        referenceKey: 'site.parking.staffParkingSpaces',
        description: `${parking.staffParkingSpaces} staff parking stall(s) requested`,
      },
      attributes: {
        parkingSpaces: parking.staffParkingSpaces,
      },
    };
    nodes.push(staffParkingNode);

    edges.push({
      id: 'edge-site-staff-parking',
      fromNodeId: siteNode.id,
      toNodeId: staffParkingNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'PROG-PARK-002',
      provenance: { source: 'derived', description: 'Staff parking is situated on the site' },
    });
  }

  if (parking?.vehicleStagingSpaces && parking.vehicleStagingSpaces > 0) {
    const stagingNode: TopologyNode = {
      id: 'node-vehicle-staging',
      type: 'VEHICLE_STAGING',
      name: 'Vehicle Staging & Queuing Area',
      intent: 'Holding area on site for vehicles awaiting service bay allocation',
      provenance: {
        source: 'input',
        referenceKey: 'site.parking.vehicleStagingSpaces',
        description: `${parking.vehicleStagingSpaces} vehicle staging stall(s) requested`,
      },
      attributes: {
        stagingSpaces: parking.vehicleStagingSpaces,
      },
    };
    nodes.push(stagingNode);

    edges.push({
      id: 'edge-site-vehicle-staging',
      fromNodeId: siteNode.id,
      toNodeId: stagingNode.id,
      relation: 'CONNECTED',
      severity: 'HARD',
      ruleId: 'PROG-STAGE-001',
      provenance: { source: 'derived', description: 'Vehicle staging area is situated on the site' },
    });
  }

  // 10. Expansion Reserve Node (ONLY if futureExpansionBays > 0)
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
      severity: 'SOFT',
      ruleId: 'PROG-EXP-001',
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
