import { describe, it, expect } from 'vitest';
import {
  createLayoutTopology,
  validateLayoutTopology,
  TopologyNode,
  TopologyEdge,
  LayoutTopology,
} from '@/domain/engine/topology/topologyTypes';

describe('Milestone 2.4 — Layout Topology Foundation', () => {
  const sampleNodes: TopologyNode[] = [
    {
      id: 'node-site',
      type: 'SITE',
      name: 'Workshop Site Boundary',
      intent: 'Enclosing land boundary with road access',
      provenance: { source: 'input', referenceKey: 'site' },
    },
    {
      id: 'node-bldg',
      type: 'BUILDING',
      name: 'Main Workshop Building',
      intent: 'Enclosing physical structure shell',
      provenance: { source: 'input', referenceKey: 'building' },
    },
    {
      id: 'node-entry',
      type: 'ENTRY',
      name: 'Main Vehicle Ingress',
      intent: 'Vehicular access door from south road',
      provenance: { source: 'input', referenceKey: 'door-south-in' },
    },
    {
      id: 'node-circ',
      type: 'CIRCULATION',
      name: 'Central Circulation Spine',
      intent: 'Primary internal drive aisle for vehicle movement',
      provenance: { source: 'standard', referenceKey: 'circulation.drive_aisle.min_width' },
    },
    {
      id: 'node-service',
      type: 'SERVICE_ZONE',
      name: 'Primary Service Bay Zone',
      intent: 'Floor zone for vehicle maintenance bays and lifts',
      provenance: { source: 'standard', referenceKey: 'bay.min_width' },
    },
    {
      id: 'node-customer',
      type: 'CUSTOMER_ZONE',
      name: 'Customer Reception & Lounge',
      intent: 'Segregated visitor waiting lounge and service desk',
      provenance: { source: 'derived', description: 'Customer lounge requirement' },
    },
    {
      id: 'node-equip',
      type: 'EQUIPMENT_ZONE',
      name: 'Shared Equipment & Compressor Station',
      intent: 'Stationary machinery support zone',
      provenance: { source: 'standard', referenceKey: 'safety.buffer.compressor' },
    },
    {
      id: 'node-expansion',
      type: 'EXPANSION_RESERVE',
      name: 'Future Expansion Reserve',
      intent: 'Contiguous reserved area for future bay installation',
      provenance: { source: 'input', referenceKey: 'program.futureExpansionBays' },
    },
  ];

  const sampleEdges: TopologyEdge[] = [
    {
      id: 'edge-site-bldg',
      fromNodeId: 'node-site',
      toNodeId: 'node-bldg',
      relation: 'CONNECTED',
      provenance: { source: 'input' },
    },
    {
      id: 'edge-bldg-entry',
      fromNodeId: 'node-bldg',
      toNodeId: 'node-entry',
      relation: 'ADJACENT',
      provenance: { source: 'input' },
    },
    {
      id: 'edge-entry-circ',
      fromNodeId: 'node-entry',
      toNodeId: 'node-circ',
      relation: 'CONNECTED',
      provenance: { source: 'derived' },
    },
    {
      id: 'edge-circ-service',
      fromNodeId: 'node-circ',
      toNodeId: 'node-service',
      relation: 'ACCESSIBLE',
      provenance: { source: 'standard' },
    },
    {
      id: 'edge-service-equip',
      fromNodeId: 'node-equip',
      toNodeId: 'node-service',
      relation: 'SERVES',
      provenance: { source: 'standard' },
    },
    {
      id: 'edge-circ-customer',
      fromNodeId: 'node-circ',
      toNodeId: 'node-customer',
      relation: 'ADJACENT',
      provenance: { source: 'derived' },
    },
  ];

  describe('1. Valid Topology & Node/Edge Relationships', () => {
    it('creates and validates a complete layout topology graph across all 8 node types and 4 edge relations', () => {
      const topology = createLayoutTopology({
        id: 'topo-01',
        name: 'Standard Capacity Topology',
        nodes: sampleNodes,
        edges: sampleEdges,
        standardVersionId: 'v1.0',
      });

      const validation = validateLayoutTopology(topology);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(topology.nodes).toHaveLength(8);
      expect(topology.edges).toHaveLength(6);

      // Verify all node types exist
      const nodeTypes = topology.nodes.map((n) => n.type);
      expect(nodeTypes).toContain('SITE');
      expect(nodeTypes).toContain('BUILDING');
      expect(nodeTypes).toContain('ENTRY');
      expect(nodeTypes).toContain('CIRCULATION');
      expect(nodeTypes).toContain('SERVICE_ZONE');
      expect(nodeTypes).toContain('CUSTOMER_ZONE');
      expect(nodeTypes).toContain('EQUIPMENT_ZONE');
      expect(nodeTypes).toContain('EXPANSION_RESERVE');

      // Verify edge relations
      const edgeRelations = topology.edges.map((e) => e.relation);
      expect(edgeRelations).toContain('CONNECTED');
      expect(edgeRelations).toContain('ADJACENT');
      expect(edgeRelations).toContain('ACCESSIBLE');
      expect(edgeRelations).toContain('SERVES');
    });
  });

  describe('2. Structural Integrity Validation', () => {
    it('detects duplicate node IDs', () => {
      const duplicateNodes: TopologyNode[] = [
        ...sampleNodes,
        {
          id: 'node-circ', // duplicate!
          type: 'CIRCULATION',
          name: 'Duplicate circulation',
          intent: 'Duplicate',
          provenance: { source: 'derived' },
        },
      ];

      const topology = createLayoutTopology({
        id: 'topo-dup-node',
        name: 'Duplicate Node Topology',
        nodes: duplicateNodes,
        edges: sampleEdges,
      });

      const validation = validateLayoutTopology(topology);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Duplicate node ID detected: 'node-circ'"))).toBe(true);
    });

    it('detects duplicate edge IDs', () => {
      const duplicateEdges: TopologyEdge[] = [
        ...sampleEdges,
        {
          id: 'edge-entry-circ', // duplicate!
          fromNodeId: 'node-entry',
          toNodeId: 'node-circ',
          relation: 'CONNECTED',
          provenance: { source: 'derived' },
        },
      ];

      const topology = createLayoutTopology({
        id: 'topo-dup-edge',
        name: 'Duplicate Edge Topology',
        nodes: sampleNodes,
        edges: duplicateEdges,
      });

      const validation = validateLayoutTopology(topology);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Duplicate edge ID detected: 'edge-entry-circ'"))).toBe(true);
    });

    it('detects invalid edge reference pointing to non-existent node', () => {
      const brokenEdges: TopologyEdge[] = [
        ...sampleEdges,
        {
          id: 'edge-broken',
          fromNodeId: 'node-circ',
          toNodeId: 'non-existent-node-id', // broken target!
          relation: 'ACCESSIBLE',
          provenance: { source: 'derived' },
        },
      ];

      const topology = createLayoutTopology({
        id: 'topo-broken-edge',
        name: 'Broken Edge Topology',
        nodes: sampleNodes,
        edges: brokenEdges,
      });

      const validation = validateLayoutTopology(topology);

      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some(
          (e) => e.includes("invalid toNodeId 'non-existent-node-id'")
        )
      ).toBe(true);
    });

    it('detects missing mandatory BUILDING node', () => {
      // Filter out node-bldg
      const nodesWithoutBuilding = sampleNodes.filter((n) => n.type !== 'BUILDING');
      const edgesWithoutBuilding = sampleEdges.filter(
        (e) => e.fromNodeId !== 'node-bldg' && e.toNodeId !== 'node-bldg'
      );

      const topology = createLayoutTopology({
        id: 'topo-no-bldg',
        name: 'No Building Topology',
        nodes: nodesWithoutBuilding,
        edges: edgesWithoutBuilding,
      });

      const validation = validateLayoutTopology(topology);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing required node of type 'BUILDING'"))).toBe(true);
    });
  });

  describe('3. Determinism & Immutability', () => {
    it('produces 100% deterministic graph representations across multiple runs', () => {
      const run1 = createLayoutTopology({
        id: 'topo-det',
        name: 'Deterministic Topology',
        nodes: sampleNodes,
        edges: sampleEdges,
        standardVersionId: 'v1.0',
      });

      const run2 = createLayoutTopology({
        id: 'topo-det',
        name: 'Deterministic Topology',
        nodes: sampleNodes,
        edges: sampleEdges,
        standardVersionId: 'v1.0',
      });

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability: attempts to modify nodes or edges throw in strict mode', () => {
      const topology = createLayoutTopology({
        id: 'topo-immutable',
        name: 'Immutable Topology',
        nodes: sampleNodes,
        edges: sampleEdges,
      });

      // Verify array freezing
      expect(Object.isFrozen(topology.nodes)).toBe(true);
      expect(Object.isFrozen(topology.edges)).toBe(true);
      expect(Object.isFrozen(topology.metadata)).toBe(true);

      // Verify object element freezing
      expect(Object.isFrozen(topology.nodes[0])).toBe(true);
      expect(Object.isFrozen(topology.nodes[0].provenance)).toBe(true);
      expect(Object.isFrozen(topology.edges[0])).toBe(true);

      // Attempts to mutate throw Error
      expect(() => {
        (topology.nodes as any).push({ id: 'illegal-node' });
      }).toThrow();

      expect(() => {
        (topology.nodes[0] as any).name = 'Mutated Name';
      }).toThrow();
    });
  });
});
