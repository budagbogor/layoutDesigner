import { describe, it, expect } from 'vitest';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { deriveTopologyZones } from '@/domain/engine/topology/topologyZoner';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('FASE 3.9A — Standards & Spatial Rule Audit', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-audit',
    name: 'Spatial Rule Audit Standard',
    version: '1.0-audit',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_capacity', value: 1, unit: 'count', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'STRUCT-001', name: 'Building within Site', severity: 'HARD', active: true },
      { id: 'FLOW-001', name: 'Entry to Circulation Continuity', severity: 'HARD', active: true },
    ],
    scoring: [],
  };

  const accessor = new StandardAccessor(completeStandard);

  const testInput: LayoutEngineInput = {
    site: {
      width: 30,
      length: 40,
      roadSide: 'south',
      parking: {
        customerParkingSpaces: 6,
        staffParkingSpaces: 2,
        vehicleStagingSpaces: 3,
      },
    },
    building: {
      width: 20,
      length: 28,
      frontSetbackMeters: 5,
    },
    accessPoints: [
      { id: 'ap-01', type: 'entrance', wall: 'south', offsetMeters: 10, widthMeters: 3.5 },
    ],
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 4 },
      ],
      equipment: [
        { equipmentType: '2_post_lift', quantity: 4 },
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
  // 1. HARD Rules vs SOFT Preferences Classification
  // -------------------------------------------------------------------------

  it('1. correctly distinguishes HARD constraints (structural & flow) from SOFT preferences (convenience adjacencies)', () => {
    const topology = buildLayoutTopology(testInput, accessor);

    // Structural containment & core flows must be HARD
    const siteBuilding = topology.edges.find((e) => e.id === 'edge-site-building');
    const entryCirc = topology.edges.find((e) => e.id === 'edge-entry-ap-01-circulation');
    const circBay = topology.edges.find((e) => e.id === 'edge-circulation-service-zone');

    expect(siteBuilding?.severity).toBe('HARD');
    expect(siteBuilding?.ruleId).toBe('STRUCT-001');

    expect(entryCirc?.severity).toBe('HARD');
    expect(entryCirc?.ruleId).toBe('FLOW-001');

    expect(circBay?.severity).toBe('HARD');
    expect(circBay?.ruleId).toBe('FLOW-BAY-001');

    // Adjacency preferences must be SOFT (do not cause hard invalidation)
    const loungeCashier = topology.edges.find((e) => e.id === 'edge-lounge-cashier-adjacent');
    const warehouseCashier = topology.edges.find((e) => e.id === 'edge-warehouse-cashier-adjacent');
    const warehouseServiceAdj = topology.edges.find((e) => e.id === 'edge-warehouse-service-adjacent');
    const compressorService = topology.edges.find((e) => e.id === 'edge-compressor-serves-service');
    const oilWasteService = topology.edges.find((e) => e.id === 'edge-oil-waste-serves-service');

    expect(loungeCashier?.severity).toBe('SOFT');
    expect(loungeCashier?.ruleId).toBe('PREF-CUST-001');

    expect(warehouseCashier?.severity).toBe('SOFT');
    expect(warehouseCashier?.ruleId).toBe('PREF-ADMIN-001');

    expect(warehouseServiceAdj?.severity).toBe('SOFT');
    expect(warehouseServiceAdj?.ruleId).toBe('PREF-PARTS-001');

    expect(compressorService?.severity).toBe('SOFT');
    expect(compressorService?.ruleId).toBe('PREF-COMP-001');

    expect(oilWasteService?.severity).toBe('SOFT');
    expect(oilWasteService?.ruleId).toBe('PREF-WASTE-001');
  });

  // -------------------------------------------------------------------------
  // 2. Visibility Constraint Audit (Active ONLY when requested)
  // -------------------------------------------------------------------------

  it('2. includes VISIBILITY edge only when loungeWithBayView is true, and omits it when false/undefined', () => {
    // A. When true -> edge exists with severity SOFT (user design preference)
    const topoTrue = buildLayoutTopology(testInput, accessor);
    const visEdgeTrue = topoTrue.edges.find((e) => e.relation === 'VISIBILITY');
    expect(visEdgeTrue).toBeDefined();
    expect(visEdgeTrue?.severity).toBe('SOFT');
    expect(visEdgeTrue?.ruleId).toBe('USER-VIS-001');

    // B. When false -> edge MUST NOT exist
    const inputWithoutView: LayoutEngineInput = {
      ...testInput,
      program: {
        ...testInput.program,
        ancillarySpaces: {
          ...testInput.program.ancillarySpaces,
          loungeWithBayView: false,
        },
      },
    };
    const topoFalse = buildLayoutTopology(inputWithoutView, accessor);
    const visEdgeFalse = topoFalse.edges.find((e) => e.relation === 'VISIBILITY');
    expect(visEdgeFalse).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Future Expansion Audit (Reserve Only, Not Operational Bays)
  // -------------------------------------------------------------------------

  it('3. treats future expansion strictly as a reserve capacity without creating operational bay nodes', () => {
    const topology = buildLayoutTopology(testInput, accessor);
    const expansionNode = topology.nodes.find((n) => n.type === 'EXPANSION_RESERVE');

    expect(expansionNode).toBeDefined();
    expect((expansionNode?.attributes as any)?.futureExpansionBays).toBe(2);

    // Ensure total operational bays count in SERVICE_ZONE remains exactly 4 (user requested), not 6!
    const serviceNode = topology.nodes.find((n) => n.type === 'SERVICE_ZONE');
    expect((serviceNode?.attributes as any)?.totalBays).toBe(4);
  });

  // -------------------------------------------------------------------------
  // 4. Parking Audit (Site Program Level, Zero Early Coordinates)
  // -------------------------------------------------------------------------

  it('4. maintains parking as site program capacity without generating hardcoded stall geometries', () => {
    const topology = buildLayoutTopology(testInput, accessor);
    const custParking = topology.nodes.find((n) => n.type === 'CUSTOMER_PARKING');

    expect(custParking).toBeDefined();
    expect((custParking?.attributes as any)?.parkingSpaces).toBe(6);

    // Verify it connects to SITE, not BUILDING
    const edge = topology.edges.find((e) => e.toNodeId === custParking?.id);
    expect(edge?.fromNodeId).toBe('node-site');
    expect(edge?.severity).toBe('HARD');
    expect(edge?.ruleId).toBe('PROG-PARK-001');
  });

  // -------------------------------------------------------------------------
  // 5. Standard Sizing Audit (No Magic Fallbacks)
  // -------------------------------------------------------------------------

  it('5. preserves standard parameter governance without magic numbers or hardcoded fallbacks', () => {
    const standardWithoutDriveAisle: WorkshopStandard = {
      id: 'no-aisle-std',
      name: 'No Aisle Standard',
      version: '1.0',
      status: 'published',
      parameters: [], // Missing 'circulation.drive_aisle.min_width'!
      rules: [],
      scoring: [],
    };
    const brokenAccessor = new StandardAccessor(standardWithoutDriveAisle);

    // StandardAccessor must cleanly report absent parameters without silent fallback numbers
    expect(brokenAccessor.getParameter('circulation.drive_aisle.min_width')).toBeUndefined();
    expect(() => brokenAccessor.getRequiredParameter('circulation.drive_aisle.min_width')).toThrow(
      MissingStandardParameterError
    );
  });

  // -------------------------------------------------------------------------
  // 6. Provenance & Audit Traceability
  // -------------------------------------------------------------------------

  it('6. verifies that every topology node and edge has non-empty provenance metadata', () => {
    const topology = buildLayoutTopology(testInput, accessor);

    for (const node of topology.nodes) {
      expect(node.provenance).toBeDefined();
      expect(['input', 'standard', 'derived']).toContain(node.provenance.source);
    }

    for (const edge of topology.edges) {
      expect(edge.provenance).toBeDefined();
      expect(['input', 'standard', 'derived']).toContain(edge.provenance.source);
      expect(edge.ruleId).toBeDefined();
      expect(['HARD', 'SOFT']).toContain(edge.severity);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Determinism & Immutability
  // -------------------------------------------------------------------------

  it('7. ensures deterministic topology creation and complete immutability', () => {
    const t1 = buildLayoutTopology(testInput, accessor);
    const t2 = buildLayoutTopology(testInput, accessor);

    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
    expect(Object.isFrozen(t1)).toBe(true);
    expect(Object.isFrozen(t1.nodes)).toBe(true);
    expect(Object.isFrozen(t1.edges)).toBe(true);
  });
});
