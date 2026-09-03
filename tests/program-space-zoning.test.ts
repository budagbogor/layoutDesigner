import { describe, it, expect } from 'vitest';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { deriveTopologyZones, ZoneIntentMetadata } from '@/domain/engine/topology/topologyZoner';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 3.9 — Program Space & Zoning Allocation Foundation', () => {
  const standard: WorkshopStandard = {
    id: 'mobeng-std-zoning-foundation',
    name: 'Zoning Foundation Standard',
    version: '1.0',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_capacity', value: 1, unit: 'count', constraint_level: 'HARD' },
      { key: 'zoning.priority.service_zone', value: 1, unit: 'priority', constraint_level: 'HARD' },
      { key: 'zoning.priority.customer_zone', value: 2, unit: 'priority', constraint_level: 'HARD' },
      { key: 'zoning.priority.equipment_zone', value: 3, unit: 'priority', constraint_level: 'HARD' },
      { key: 'zoning.priority.expansion_reserve', value: 4, unit: 'priority', constraint_level: 'HARD' },
    ],
    rules: [],
    scoring: [],
  };

  const accessor = new StandardAccessor(standard);

  const fullProgramInput: LayoutEngineInput = {
    site: {
      width: 30,
      length: 40,
      roadSide: 'south',
      parking: {
        customerParkingSpaces: 5,
        staffParkingSpaces: 3,
        vehicleStagingSpaces: 2,
      },
    },
    building: {
      width: 20,
      length: 30,
      frontSetbackMeters: 5,
    },
    accessPoints: [
      { id: 'ap-01', type: 'entrance', wall: 'south', offsetMeters: 10, widthMeters: 3.5 },
      { id: 'ap-02', type: 'exit', wall: 'north', offsetMeters: 10, widthMeters: 3.5 },
    ],
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 4 },
        { serviceType: 'tire_service', quantity: 1 },
      ],
      equipment: [
        { equipmentType: '2_post_lift', quantity: 4 },
        { equipmentType: 'tire_changer', quantity: 1 },
      ],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
        compressorRoom: true,
        oilWasteStorage: true,
        staffRoom: true,
        loungeWithBayView: true,
      },
      futureExpansionBays: 2,
    },
  };

  // -------------------------------------------------------------------------
  // 1-7. Fine-Grained Ancillary Spaces as Program Spaces
  // -------------------------------------------------------------------------

  it('1. maps customer lounge to a distinct program space node (CUSTOMER_LOUNGE, CUSTOMER_CLEAN)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const lounge = enriched.nodes.find((n) => n.type === 'CUSTOMER_LOUNGE');
    expect(lounge).toBeDefined();
    expect(lounge?.id).toBe('node-customer-lounge');

    const intent = (lounge?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('CUSTOMER_CLEAN');
    expect(intent.capacity?.unit).toBe('customer_reception_lounge');
  });

  it('2. maps cashier office to a distinct program space node (CASHIER_OFFICE, CUSTOMER_CLEAN)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const cashier = enriched.nodes.find((n) => n.type === 'CASHIER_OFFICE');
    expect(cashier).toBeDefined();
    expect(cashier?.id).toBe('node-cashier-office');

    const intent = (cashier?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('CUSTOMER_CLEAN');
    expect(intent.adjacencyRequirements).toContain('node-customer-lounge');
  });

  it('3. maps spare parts warehouse to a distinct program space node (PARTS_WAREHOUSE, SERVICE_OPERATIONAL)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const warehouse = enriched.nodes.find((n) => n.type === 'PARTS_WAREHOUSE');
    expect(warehouse).toBeDefined();
    expect(warehouse?.id).toBe('node-parts-warehouse');

    const intent = (warehouse?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('SERVICE_OPERATIONAL');
    expect(intent.adjacencyRequirements).toContain('node-service-zone');
  });

  it('4. maps restroom to a distinct program space node (RESTROOM, CUSTOMER_CLEAN)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const restroom = enriched.nodes.find((n) => n.type === 'RESTROOM');
    expect(restroom).toBeDefined();
    expect(restroom?.id).toBe('node-restroom');

    const intent = (restroom?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('CUSTOMER_CLEAN');
    expect(intent.accessibilityRequirements).toContain('node-customer-lounge');
  });

  it('5. maps compressor room to a distinct program space node (COMPRESSOR_ROOM, SERVICE_OPERATIONAL)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const compressor = enriched.nodes.find((n) => n.type === 'COMPRESSOR_ROOM');
    expect(compressor).toBeDefined();
    expect(compressor?.id).toBe('node-compressor-room');

    const intent = (compressor?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('SERVICE_OPERATIONAL');
  });

  it('6. maps oil waste storage to a distinct program space node (OIL_WASTE_STORAGE, SERVICE_OPERATIONAL)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const oilWaste = enriched.nodes.find((n) => n.type === 'OIL_WASTE_STORAGE');
    expect(oilWaste).toBeDefined();
    expect(oilWaste?.id).toBe('node-oil-waste-storage');

    const intent = (oilWaste?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('SERVICE_OPERATIONAL');
  });

  it('7. maps staff room to a distinct program space node (STAFF_ROOM, CUSTOMER_CLEAN)', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const staffRoom = enriched.nodes.find((n) => n.type === 'STAFF_ROOM');
    expect(staffRoom).toBeDefined();
    expect(staffRoom?.id).toBe('node-staff-room');

    const intent = (staffRoom?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.spaceCategory).toBe('CUSTOMER_CLEAN');
  });

  // -------------------------------------------------------------------------
  // 8. Lounge With Bay View → Visibility Edge & Intent
  // -------------------------------------------------------------------------

  it('8. creates a VISIBILITY edge from customer lounge to service zone when loungeWithBayView is true', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const visEdge = enriched.edges.find((e) => e.relation === 'VISIBILITY');
    expect(visEdge).toBeDefined();
    expect(visEdge?.fromNodeId).toBe('node-customer-lounge');
    expect(visEdge?.toNodeId).toBe('node-service-zone');

    const lounge = enriched.nodes.find((n) => n.type === 'CUSTOMER_LOUNGE');
    const intent = (lounge?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.visibilityRequirements).toBeDefined();
    expect(intent.visibilityRequirements?.[0].targetNodeId).toBe('node-service-zone');
  });

  // -------------------------------------------------------------------------
  // 9. Parking Requirements → Site Program Spaces
  // -------------------------------------------------------------------------

  it('9. maps customer, staff, and staging parking slots into SITE_PARKING program spaces', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const custParking = enriched.nodes.find((n) => n.type === 'CUSTOMER_PARKING');
    const staffParking = enriched.nodes.find((n) => n.type === 'STAFF_PARKING');
    const staging = enriched.nodes.find((n) => n.type === 'VEHICLE_STAGING');

    expect(custParking).toBeDefined();
    expect(staffParking).toBeDefined();
    expect(staging).toBeDefined();

    const custIntent = (custParking?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(custIntent.spaceCategory).toBe('SITE_PARKING');
    expect(custIntent.capacity?.targetQuantity).toBe(5);

    const staffIntent = (staffParking?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(staffIntent.spaceCategory).toBe('SITE_PARKING');
    expect(staffIntent.capacity?.targetQuantity).toBe(3);

    const stagingIntent = (staging?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(stagingIntent.spaceCategory).toBe('SITE_PARKING');
    expect(stagingIntent.capacity?.targetQuantity).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 10. Future Expansion → Retained as Reserve
  // -------------------------------------------------------------------------

  it('10. retains futureExpansionBays as EXPANSION_RESERVE with planned units', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    const expansion = enriched.nodes.find((n) => n.type === 'EXPANSION_RESERVE');
    expect(expansion).toBeDefined();

    const intent = (expansion?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
    expect(intent.expansion?.plannedExpansionUnits).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 11. Unrequested Spaces Are Not Created
  // -------------------------------------------------------------------------

  it('11. does not create nodes for spaces that are false or omitted', () => {
    const minimalInput: LayoutEngineInput = {
      site: { width: 20, length: 30 },
      building: { width: 15, length: 20 },
      program: {
        bays: [{ serviceType: 'general_service', quantity: 2 }],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'back_out_turnaround',
        customerZoneRequired: false,
        ancillarySpaces: {
          customerLounge: false,
          cashierOffice: false,
          partsWarehouse: false,
          restroom: false,
          compressorRoom: false,
          oilWasteStorage: false,
          staffRoom: false,
          loungeWithBayView: false,
        },
        futureExpansionBays: 0,
      },
    };

    const topology = buildLayoutTopology(minimalInput, accessor);

    expect(topology.nodes.find((n) => n.type === 'CUSTOMER_LOUNGE')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'CASHIER_OFFICE')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'PARTS_WAREHOUSE')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'RESTROOM')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'COMPRESSOR_ROOM')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'OIL_WASTE_STORAGE')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'STAFF_ROOM')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'CUSTOMER_PARKING')).toBeUndefined();
    expect(topology.nodes.find((n) => n.type === 'EXPANSION_RESERVE')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 12. No Hardcoded Room Dimensions
  // -------------------------------------------------------------------------

  it('12. does not leak CAD coordinates or hardcoded geometry dimensions into zone intents', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    for (const node of enriched.nodes) {
      const intent = (node.attributes as any)?.zoneIntent;
      if (intent) {
        expect(intent.x).toBeUndefined();
        expect(intent.y).toBeUndefined();
        expect(intent.width).toBeUndefined();
        expect(intent.length).toBeUndefined();
        expect(intent.coordinates).toBeUndefined();
      }
    }
  });

  // -------------------------------------------------------------------------
  // 13. Missing Standard Parameter Does Not Fallback to Magic Numbers
  // -------------------------------------------------------------------------

  it('13. throws MissingStandardParameterError if requireStandardPriority is enabled and standard lacks priority parameter', () => {
    const incompleteStandard: WorkshopStandard = {
      id: 'incomplete-std',
      name: 'Incomplete Standard',
      version: '1.0',
      status: 'published',
      parameters: [
        { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      ],
      rules: [],
      scoring: [],
    };
    const incompleteAccessor = new StandardAccessor(incompleteStandard);

    const topology = buildLayoutTopology(fullProgramInput, incompleteAccessor);
    expect(() =>
      deriveTopologyZones(topology, fullProgramInput, incompleteAccessor, {
        requireStandardPriority: true,
      })
    ).toThrow(MissingStandardParameterError);
  });

  // -------------------------------------------------------------------------
  // 14. Deterministic Output
  // -------------------------------------------------------------------------

  it('14. produces identical, deterministic topology graphs and zone intents across multiple executions', () => {
    const topo1 = deriveTopologyZones(buildLayoutTopology(fullProgramInput, accessor), fullProgramInput, accessor);
    const topo2 = deriveTopologyZones(buildLayoutTopology(fullProgramInput, accessor), fullProgramInput, accessor);

    expect(JSON.stringify(topo1)).toBe(JSON.stringify(topo2));
  });

  // -------------------------------------------------------------------------
  // 15. Immutable Output
  // -------------------------------------------------------------------------

  it('15. produces deeply frozen, immutable topology structures and metadata', () => {
    const topology = buildLayoutTopology(fullProgramInput, accessor);
    const enriched = deriveTopologyZones(topology, fullProgramInput, accessor);

    expect(Object.isFrozen(enriched)).toBe(true);
    expect(Object.isFrozen(enriched.nodes)).toBe(true);
    expect(Object.isFrozen(enriched.edges)).toBe(true);

    for (const node of enriched.nodes) {
      expect(Object.isFrozen(node)).toBe(true);
      expect(Object.isFrozen(node.attributes)).toBe(true);
    }
  });
});
