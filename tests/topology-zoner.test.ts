import { describe, it, expect } from 'vitest';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import {
  deriveTopologyZones,
  ZoneIntentMetadata,
} from '@/domain/engine/topology/topologyZoner';
import {
  StandardAccessor,
  MissingStandardParameterError,
} from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.4 — Layout Topology Zoning & Intent Enrichment', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-zoner',
    name: 'Standard Zoner Test',
    version: '1.0-zoner',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'bay.min_capacity', value: 2, unit: 'bays', constraint_level: 'HARD' },
      { key: 'zoning.priority.service_zone', value: 1, unit: 'priority', constraint_level: 'OPTIMIZATION' },
      { key: 'zoning.priority.customer_zone', value: 2, unit: 'priority', constraint_level: 'OPTIMIZATION' },
    ],
    rules: [],
  };

  const sampleInput: LayoutEngineInput = {
    site: { width: 30, length: 40 },
    building: { width: 18, length: 25 },
    accessPoints: [
      { id: 'door-in', type: 'entrance', wall: 'south', offsetMeters: 2.0, widthMeters: 4.5 },
    ],
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 4 },
        { serviceType: 'tire', quantity: 2 },
      ],
      equipment: [
        { equipmentType: '2_post_lift', quantity: 6 },
      ],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      futureExpansionBays: 2,
    },
  };

  describe('1. Basic Zone Intent Enrichment (No Coordinates)', () => {
    it('enriches existing topology nodes with zone intent without assigning coordinates or geometry', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);

      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      expect(enrichedTopology.nodes).toHaveLength(baseTopology.nodes.length);
      expect(enrichedTopology.edges).toHaveLength(baseTopology.edges.length);

      // Verify that no geometry fields (x, y, width, length, rotation) are added
      for (const node of enrichedTopology.nodes) {
        expect((node as any).geometry).toBeUndefined();
        expect((node as any).x).toBeUndefined();
        expect((node as any).y).toBeUndefined();

        const intent = (node.attributes as any)?.zoneIntent as ZoneIntentMetadata;
        expect(intent).toBeDefined();
      }
    });
  });

  describe('2. Capacity Requirement Extraction', () => {
    it('correctly maps capacity requirements for service zone and equipment zone from input and standard', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      const serviceNode = enrichedTopology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const intent = (serviceNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      expect(intent.capacity).toBeDefined();
      expect(intent.capacity?.targetQuantity).toBe(6); // 4 + 2 bays
      expect(intent.capacity?.unit).toBe('service_bays');
      expect(intent.capacity?.minStandardCapacity).toBe(2);
      expect(intent.capacity?.standardReferenceKey).toBe('bay.min_capacity');

      const equipNode = enrichedTopology.nodes.find((n) => n.type === 'EQUIPMENT_ZONE');
      const equipIntent = (equipNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;
      expect(equipIntent.capacity?.targetQuantity).toBe(6);
      expect(equipIntent.capacity?.unit).toBe('equipment_units');
    });
  });

  describe('3. Adjacency & Accessibility Requirements', () => {
    it('extracts adjacency and accessibility requirements directly from graph edges', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      // SERVICE_ZONE has ACCESSIBLE edge to CIRCULATION
      const serviceNode = enrichedTopology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const serviceIntent = (serviceNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      expect(serviceIntent.accessibilityRequirements).toBeDefined();
      expect(serviceIntent.accessibilityRequirements).toContain('node-circulation');

      // CUSTOMER_ZONE has ADJACENT edge to BUILDING and CIRCULATION
      const customerNode = enrichedTopology.nodes.find((n) => n.type === 'CUSTOMER_ZONE');
      const customerIntent = (customerNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      expect(customerIntent.adjacencyRequirements).toBeDefined();
      expect(customerIntent.adjacencyRequirements).toContain('node-building');
      expect(customerIntent.adjacencyRequirements).toContain('node-circulation');
    });
  });

  describe('4. Expansion Requirement & Priority Intent', () => {
    it('extracts expansion requirements for EXPANSION_RESERVE', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      const expansionNode = enrichedTopology.nodes.find((n) => n.type === 'EXPANSION_RESERVE');
      const expansionIntent = (expansionNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      expect(expansionIntent.expansion).toBeDefined();
      expect(expansionIntent.expansion?.plannedExpansionUnits).toBe(2);
      expect(expansionIntent.expansion?.standardReferenceKey).toBe('program.futureExpansionBays');
    });

    it('captures priority intent from standard when available', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      const serviceNode = enrichedTopology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const serviceIntent = (serviceNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      expect(serviceIntent.priority).toBeDefined();
      expect(serviceIntent.priority?.level).toBe(1);
      expect(serviceIntent.priority?.standardReferenceKey).toBe('zoning.priority.service_zone');
    });
  });

  describe('5. Missing Standard Parameter Behavior (Zero Fallback)', () => {
    it('strictly throws MissingStandardParameterError without inventing default priority when required by options', () => {
      const incompleteStandard: WorkshopStandard = {
        id: 'no-priority-std',
        name: 'Incomplete Standard',
        version: '0.1',
        status: 'published',
        parameters: [], // no zoning.priority.* parameters!
        rules: [],
      };

      const accessor = new StandardAccessor(incompleteStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);

      // With requireStandardPriority: true, must throw MissingStandardParameterError
      expect(() => {
        deriveTopologyZones(baseTopology, sampleInput, accessor, { requireStandardPriority: true });
      }).toThrow(MissingStandardParameterError);

      try {
        deriveTopologyZones(baseTopology, sampleInput, accessor, { requireStandardPriority: true });
      } catch (err) {
        expect(err).toBeInstanceOf(MissingStandardParameterError);
        const missingErr = err as MissingStandardParameterError;
        expect(missingErr.parameterKey).toContain('zoning.priority');
      }
    });

    it('gracefully leaves priority undefined when standard does not specify it and it is not mandatory', () => {
      const standardNoPriority: WorkshopStandard = {
        id: 'std-no-prio',
        name: 'Standard without Priority',
        version: '0.1',
        status: 'published',
        parameters: [],
        rules: [],
      };

      const accessor = new StandardAccessor(standardNoPriority);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      const serviceNode = enrichedTopology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const serviceIntent = (serviceNode?.attributes as any)?.zoneIntent as ZoneIntentMetadata;

      // Must be undefined, NEVER invented as 1 or 0!
      expect(serviceIntent.priority).toBeUndefined();
    });
  });

  describe('6. Determinism & Immutability', () => {
    it('produces 100% deterministic enriched graph across repeated runs', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);

      const run1 = deriveTopologyZones(baseTopology, sampleInput, accessor);
      const run2 = deriveTopologyZones(baseTopology, sampleInput, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('enforces deep immutability on enriched topology and zone intent metadata', () => {
      const accessor = new StandardAccessor(completeStandard);
      const baseTopology = buildLayoutTopology(sampleInput, accessor);
      const enrichedTopology = deriveTopologyZones(baseTopology, sampleInput, accessor);

      expect(Object.isFrozen(enrichedTopology)).toBe(true);
      expect(Object.isFrozen(enrichedTopology.nodes)).toBe(true);
      expect(Object.isFrozen(enrichedTopology.nodes[0])).toBe(true);
      expect(Object.isFrozen(enrichedTopology.nodes[0].attributes)).toBe(true);

      const serviceNode = enrichedTopology.nodes.find((n) => n.type === 'SERVICE_ZONE');
      const intent = (serviceNode?.attributes as any)?.zoneIntent;
      expect(Object.isFrozen(intent)).toBe(true);
      expect(Object.isFrozen(intent.capacity)).toBe(true);

      expect(() => {
        intent.capacity.targetQuantity = 999;
      }).toThrow();
    });
  });
});
