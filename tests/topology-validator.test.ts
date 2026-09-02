import { describe, it, expect } from 'vitest';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { validateTopologyConstraints } from '@/domain/engine/topology/topologyValidator';
import { createLayoutTopology } from '@/domain/engine/topology/topologyTypes';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.4 — Layout Topology Constraint Validator', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-validator',
    name: 'Standard Validator Test',
    version: '1.0-val',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'FLOW-001', name: 'Path Continuity', severity: 'HARD', active: true },
    ],
  };

  const sampleInput: LayoutEngineInput = {
    site: { width: 30, length: 40 },
    building: { width: 18, length: 25 },
    accessPoints: [
      { id: 'door-in', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 4.5 },
    ],
    program: {
      bays: [{ serviceType: 'general_service', quantity: 4 }],
      equipment: [{ equipmentType: '2_post_lift', quantity: 4 }],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      futureExpansionBays: 1,
    },
  };

  describe('1. Valid Topology Graph', () => {
    it('confirms validity of a fully compliant topology graph with zero violations', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);

      const result = validateTopologyConstraints(topology, sampleInput, accessor);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('2. Mandatory Structural Nodes (BUILDING & CIRCULATION)', () => {
    it('detects missing mandatory BUILDING node', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Remove BUILDING node
      const brokenTopology = createLayoutTopology({
        id: 'no-bldg',
        name: 'No Building Topology',
        nodes: validTopology.nodes.filter((n) => n.type !== 'BUILDING'),
        edges: validTopology.edges.filter(
          (e) => e.fromNodeId !== 'node-building' && e.toNodeId !== 'node-building'
        ),
      });

      const result = validateTopologyConstraints(brokenTopology, sampleInput, accessor);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-BUILDING-001')).toBe(true);
      const violation = result.violations.find((v) => v.ruleId === 'TOPO-BUILDING-001');
      expect(violation?.severity).toBe('HARD');
      expect(violation?.reason).toContain('Missing mandatory BUILDING node');
    });

    it('detects missing mandatory CIRCULATION node', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Remove CIRCULATION node
      const brokenTopology = createLayoutTopology({
        id: 'no-circ',
        name: 'No Circulation Topology',
        nodes: validTopology.nodes.filter((n) => n.type !== 'CIRCULATION'),
        edges: validTopology.edges.filter(
          (e) => e.fromNodeId !== 'node-circulation' && e.toNodeId !== 'node-circulation'
        ),
      });

      const result = validateTopologyConstraints(brokenTopology, sampleInput, accessor);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-CIRCULATION-001')).toBe(true);
    });
  });

  describe('3. Service Zone Accessibility & Equipment Zone SERVES Relations', () => {
    it('detects SERVICE_ZONE disconnected from CIRCULATION (missing ACCESSIBLE edge)', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Remove ACCESSIBLE edge between CIRCULATION and SERVICE_ZONE
      const disconnectedTopology = createLayoutTopology({
        id: 'disconnected-service',
        name: 'Disconnected Service Zone',
        nodes: [...validTopology.nodes],
        edges: validTopology.edges.filter((e) => e.relation !== 'ACCESSIBLE'),
      });

      const result = validateTopologyConstraints(disconnectedTopology, sampleInput, accessor);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-SERVICE-ACCESSIBLE-001')).toBe(true);
      const violation = result.violations.find((v) => v.ruleId === 'TOPO-SERVICE-ACCESSIBLE-001');
      expect(violation?.relatedNodeIds).toContain('node-service-zone');
      expect(violation?.provenance?.referenceKey).toBe('circulation.bay_approach_depth');
    });

    it('detects EQUIPMENT_ZONE lacking SERVES relationship to a SERVICE_ZONE', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Remove SERVES edge
      const brokenTopology = createLayoutTopology({
        id: 'orphaned-equipment',
        name: 'Orphaned Equipment Zone',
        nodes: [...validTopology.nodes],
        edges: validTopology.edges.filter((e) => e.relation !== 'SERVES'),
      });

      const result = validateTopologyConstraints(brokenTopology, sampleInput, accessor);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-EQUIPMENT-SERVES-001')).toBe(true);
      const violation = result.violations.find((v) => v.ruleId === 'TOPO-EQUIPMENT-SERVES-001');
      expect(violation?.relatedNodeIds).toContain('node-equipment-zone');
    });
  });

  describe('4. Entry Connection & Optional Zones', () => {
    it('detects ENTRY node lacking connection to CIRCULATION', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Remove CONNECTED edge from ENTRY to CIRCULATION
      const brokenTopology = createLayoutTopology({
        id: 'disconnected-entry',
        name: 'Disconnected Entry',
        nodes: [...validTopology.nodes],
        edges: validTopology.edges.filter(
          (e) => !(e.fromNodeId.startsWith('node-entry') && e.toNodeId === 'node-circulation')
        ),
      });

      const result = validateTopologyConstraints(brokenTopology, sampleInput, accessor);

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-ENTRY-CIRCULATION-001')).toBe(true);
    });

    it('confirms that ENTRY is NOT required when input has no access points', () => {
      const accessor = new StandardAccessor(completeStandard);
      const inputNoDoors: LayoutEngineInput = {
        ...sampleInput,
        accessPoints: [],
      };

      const topologyNoDoors = buildLayoutTopology(inputNoDoors, accessor);
      const result = validateTopologyConstraints(topologyNoDoors, inputNoDoors, accessor);

      // Should be valid (no ENTRY violations emitted because no access points were in input)
      expect(result.isValid).toBe(true);
      expect(result.violations.some((v) => v.ruleId === 'TOPO-ENTRY-CIRCULATION-001')).toBe(false);
    });

    it('validates optional CUSTOMER_ZONE and EXPANSION_RESERVE adjacencies', () => {
      const accessor = new StandardAccessor(completeStandard);
      const validTopology = buildLayoutTopology(sampleInput, accessor);

      // Break customer zone adjacency
      const brokenCustTopology = createLayoutTopology({
        id: 'isolated-customer',
        name: 'Isolated Customer Zone',
        nodes: [...validTopology.nodes],
        edges: validTopology.edges.filter((e) => e.toNodeId !== 'node-customer-zone'),
      });

      const resultCust = validateTopologyConstraints(brokenCustTopology, sampleInput, accessor);
      expect(resultCust.warnings.some((w) => w.ruleId === 'TOPO-CUSTOMER-ADJACENCY-001')).toBe(true);

      // Break expansion reserve adjacency
      const brokenExpTopology = createLayoutTopology({
        id: 'isolated-expansion',
        name: 'Isolated Expansion Reserve',
        nodes: [...validTopology.nodes],
        edges: validTopology.edges.filter((e) => e.toNodeId !== 'node-expansion-reserve'),
      });

      const resultExp = validateTopologyConstraints(brokenExpTopology, sampleInput, accessor);
      expect(resultExp.warnings.some((w) => w.ruleId === 'TOPO-EXPANSION-BUILDING-001')).toBe(true);
    });
  });

  describe('5. Determinism, Provenance & Immutability', () => {
    it('produces 100% deterministic validation reports across multiple runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);

      const run1 = validateTopologyConstraints(topology, sampleInput, accessor);
      const run2 = validateTopologyConstraints(topology, sampleInput, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability on validation result', () => {
      const accessor = new StandardAccessor(completeStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);

      const result = validateTopologyConstraints(topology, sampleInput, accessor);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.violations)).toBe(true);
      expect(Object.isFrozen(result.warnings)).toBe(true);
      expect(Object.isFrozen(result.errors)).toBe(true);

      expect(() => {
        (result.violations as any).push({ ruleId: 'illegal' });
      }).toThrow();
    });
  });
});
