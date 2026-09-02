import { describe, it, expect } from 'vitest';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.4 — Layout Topology Builder', () => {
  const mockStandard: WorkshopStandard = {
    id: 'mobeng-std-topo',
    name: 'Standard Topology Test',
    version: '1.0-topo',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
      { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'FLOW-001', name: 'Path Continuity', severity: 'HARD', active: true },
    ],
  };

  const minimalInput: LayoutEngineInput = {
    site: { width: 30, length: 40 },
    building: { width: 18, length: 25 },
    program: {
      bays: [],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: false,
      futureExpansionBays: 0,
    },
  };

  describe('1. Base Structural Topology (SITE -> BUILDING -> CIRCULATION)', () => {
    it('builds minimal mandatory topology when no bays, equipment, access points, or extra zones are provided', () => {
      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology(minimalInput, accessor);

      // Exactly 3 nodes: SITE, BUILDING, CIRCULATION
      expect(topology.nodes).toHaveLength(3);
      expect(topology.nodes.map((n) => n.id)).toEqual(['node-site', 'node-building', 'node-circulation']);

      // Exactly 2 edges: site->building and building->circulation
      expect(topology.edges).toHaveLength(2);
      expect(topology.edges[0].id).toBe('edge-site-building');
      expect(topology.edges[0].relation).toBe('CONNECTED');
      expect(topology.edges[1].id).toBe('edge-building-circulation');
      expect(topology.edges[1].relation).toBe('CONNECTED');
    });
  });

  describe('2. Service Zone & Equipment Zone', () => {
    it('includes SERVICE_ZONE and EQUIPMENT_ZONE with SERVES relation when program specifies them', () => {
      const accessor = new StandardAccessor(mockStandard);
      const inputWithBaysAndEquipment: LayoutEngineInput = {
        ...minimalInput,
        program: {
          ...minimalInput.program,
          bays: [{ serviceType: 'general_service', quantity: 4 }],
          equipment: [{ equipmentType: '2_post_lift', quantity: 4 }],
        },
      };

      const topology = buildLayoutTopology(inputWithBaysAndEquipment, accessor);

      const serviceNode = topology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const equipNode = topology.nodes.find((n) => n.type === 'EQUIPMENT_ZONE');

      expect(serviceNode).toBeDefined();
      expect(equipNode).toBeDefined();

      // Verify CIRCULATION -> SERVICE_ZONE (ACCESSIBLE)
      const circToService = topology.edges.find(
        (e) => e.fromNodeId === 'node-circulation' && e.toNodeId === 'node-service-zone'
      );
      expect(circToService).toBeDefined();
      expect(circToService?.relation).toBe('ACCESSIBLE');

      // Verify EQUIPMENT_ZONE -> SERVICE_ZONE (SERVES)
      const equipServesService = topology.edges.find(
        (e) => e.fromNodeId === 'node-equipment-zone' && e.toNodeId === 'node-service-zone'
      );
      expect(equipServesService).toBeDefined();
      expect(equipServesService?.relation).toBe('SERVES');
    });

    it('omits EQUIPMENT_ZONE when program equipment array is empty', () => {
      const accessor = new StandardAccessor(mockStandard);
      const inputBaysOnly: LayoutEngineInput = {
        ...minimalInput,
        program: {
          ...minimalInput.program,
          bays: [{ serviceType: 'general_service', quantity: 2 }],
          equipment: [],
        },
      };

      const topology = buildLayoutTopology(inputBaysOnly, accessor);
      expect(topology.nodes.some((n) => n.type === 'EQUIPMENT_ZONE')).toBe(false);
      expect(topology.edges.some((e) => e.relation === 'SERVES')).toBe(false);
    });
  });

  describe('3. Conditional Customer Zone & Expansion Reserve', () => {
    it('creates CUSTOMER_ZONE and connecting edges only when customerZoneRequired is true', () => {
      const accessor = new StandardAccessor(mockStandard);

      // 1. Without customer zone
      const topoWithout = buildLayoutTopology(minimalInput, accessor);
      expect(topoWithout.nodes.some((n) => n.type === 'CUSTOMER_ZONE')).toBe(false);

      // 2. With customer zone
      const topoWith = buildLayoutTopology(
        {
          ...minimalInput,
          program: { ...minimalInput.program, customerZoneRequired: true },
        },
        accessor
      );

      const customerNode = topoWith.nodes.find((n) => n.type === 'CUSTOMER_ZONE');
      expect(customerNode).toBeDefined();
      expect(customerNode?.id).toBe('node-customer-zone');

      // Edge from building to customer zone (ADJACENT)
      const bldgCustomerEdge = topoWith.edges.find(
        (e) => e.fromNodeId === 'node-building' && e.toNodeId === 'node-customer-zone'
      );
      expect(bldgCustomerEdge?.relation).toBe('ADJACENT');
    });

    it('creates EXPANSION_RESERVE only when futureExpansionBays > 0', () => {
      const accessor = new StandardAccessor(mockStandard);

      // 1. Zero expansion
      const topoZero = buildLayoutTopology(minimalInput, accessor);
      expect(topoZero.nodes.some((n) => n.type === 'EXPANSION_RESERVE')).toBe(false);

      // 2. With 2 expansion bays
      const topoWith = buildLayoutTopology(
        {
          ...minimalInput,
          program: { ...minimalInput.program, futureExpansionBays: 2 },
        },
        accessor
      );

      const expansionNode = topoWith.nodes.find((n) => n.type === 'EXPANSION_RESERVE');
      expect(expansionNode).toBeDefined();
      expect(expansionNode?.id).toBe('node-expansion-reserve');
      expect(expansionNode?.attributes?.futureExpansionBays).toBe(2);

      const bldgExpansionEdge = topoWith.edges.find(
        (e) => e.fromNodeId === 'node-building' && e.toNodeId === 'node-expansion-reserve'
      );
      expect(bldgExpansionEdge?.relation).toBe('ADJACENT');
    });
  });

  describe('4. Entry Nodes & Zero Invented Geometry', () => {
    it('creates ENTRY nodes only for provided access points, connecting them to circulation', () => {
      const accessor = new StandardAccessor(mockStandard);
      const inputWithDoors: LayoutEngineInput = {
        ...minimalInput,
        accessPoints: [
          { id: 'door-in', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 4.5 },
          { id: 'door-out', type: 'exit', wall: 'north', offsetMeters: 5.0, widthMeters: 4.5 },
        ],
      };

      const topology = buildLayoutTopology(inputWithDoors, accessor);

      const entryNodes = topology.nodes.filter((n) => n.type === 'ENTRY');
      expect(entryNodes).toHaveLength(2);
      expect(entryNodes.map((n) => n.id)).toEqual(['node-entry-door-in', 'node-entry-door-out']);

      // Verify connection to circulation spine
      const entryInToCirc = topology.edges.find(
        (e) => e.fromNodeId === 'node-entry-door-in' && e.toNodeId === 'node-circulation'
      );
      expect(entryInToCirc).toBeDefined();
      expect(entryInToCirc?.relation).toBe('CONNECTED');
    });

    it('proves that zero ENTRY nodes or edges are invented if access points are omitted', () => {
      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology({ ...minimalInput, accessPoints: [] }, accessor);

      expect(topology.nodes.some((n) => n.type === 'ENTRY')).toBe(false);
      expect(topology.edges.some((e) => e.id.includes('entry'))).toBe(false);
    });
  });

  describe('5. Determinism, Provenance & Immutability', () => {
    it('produces 100% deterministic node/edge IDs and topology graph across multiple runs', () => {
      const accessor = new StandardAccessor(mockStandard);
      const fullInput: LayoutEngineInput = {
        ...minimalInput,
        accessPoints: [
          { id: 'door-south', type: 'entrance', wall: 'south', offsetMeters: 3.0, widthMeters: 4.0 },
        ],
        program: {
          bays: [{ serviceType: 'tire', quantity: 2 }],
          equipment: [{ equipmentType: 'tire_changer', quantity: 1 }],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          futureExpansionBays: 1,
        },
      };

      const run1 = buildLayoutTopology(fullInput, accessor);
      const run2 = buildLayoutTopology(fullInput, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('includes structured provenance for all nodes and edges', () => {
      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology(minimalInput, accessor);

      for (const node of topology.nodes) {
        expect(node.provenance).toBeDefined();
        expect(['input', 'standard', 'derived']).toContain(node.provenance.source);
      }

      for (const edge of topology.edges) {
        expect(edge.provenance).toBeDefined();
        expect(['input', 'standard', 'derived']).toContain(edge.provenance.source);
      }
    });

    it('enforces deep immutability on generated topology graph', () => {
      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology(minimalInput, accessor);

      expect(Object.isFrozen(topology)).toBe(true);
      expect(Object.isFrozen(topology.nodes)).toBe(true);
      expect(Object.isFrozen(topology.edges)).toBe(true);
      expect(Object.isFrozen(topology.nodes[0])).toBe(true);

      expect(() => {
        (topology.nodes as any).push({ id: 'illegal' });
      }).toThrow();
    });
  });
});
