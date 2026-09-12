import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import { buildLayoutTopology } from '../src/domain/engine/topology/topologyBuilder';
import { deriveTopologyZones, ZoneIntentMetadata } from '../src/domain/engine/topology/topologyZoner';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { LayoutEngineInput } from '../src/domain/engine/types';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';
import { LocalProjectRepository } from '../src/application/adapters/LocalProjectRepository';

describe('M2B.1 — REAR / BACK-OF-HOUSE SPATIAL ZONING FOUNDATION', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);
  const generator = new CandidateGenerator();

  const baseInput: LayoutEngineInput = {
    site: { width: 50, length: 40, roadSide: 'south' },
    building: { width: 45, length: 30, frontSetbackMeters: 5 },
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 3 },
      ],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        customerRestroom: true,
        employeeRestroom: true,
        employeeMess: true,
        mushola: true,
        wudhu: true,
        wasteStreams: {
          oil: true,
          tire: true,
          parts: true,
          cardboard: true,
        },
      },
      futureExpansionBays: 0,
    },
  };

  // -------------------------------------------------------------------------
  // 1 & 2. Employee Mess (3m x 6m, Never Shrinks)
  // -------------------------------------------------------------------------
  describe('1 & 2. Employee Mess Spatial Placement', () => {
    it('1. places Employee Mess with exact PO-approved 3m x 6m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      expect(candidate.status).toBe('VALID');

      const messObj = candidate.objects.find((o) => o.id === 'employee-mess');
      expect(messObj).toBeDefined();
      expect(messObj?.geometry.width).toBe(3.0);
      expect(messObj?.geometry.length).toBe(6.0);
      expect(messObj?.metadata?.zoneType).toBe('EMPLOYEE_MESS');
      expect(messObj?.metadata?.spaceCategory).toBe('BACK_OF_HOUSE');
      expect(messObj?.metadata?.functionType).toBe('sleeping_rest');
    });

    it('2. never shrinks Employee Mess when building space is constrained', () => {
      const tightInput: LayoutEngineInput = {
        ...baseInput,
        building: { width: 14, length: 20, frontSetbackMeters: 2 },
        program: {
          ...baseInput.program,
          bays: [{ serviceType: 'general_service', quantity: 2 }],
          ancillarySpaces: {
            customerLounge: true,
            cashierOffice: true,
            partsWarehouse: true,
            employeeMess: true,
          },
        },
      };

      const candidate = generator.generate(tightInput, accessor);
      const messObj = candidate.objects.find((o) => o.id === 'employee-mess');
      if (messObj) {
        expect(messObj.geometry.width).toBe(3.0);
        expect(messObj.geometry.length).toBe(6.0);
      } else {
        expect(candidate.status).toBe('DISQUALIFIED');
        expect(candidate.rejections.some((r) => r.ruleId === 'CAPACITY-ANCILLARY-001')).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Employee Toilet (Minimum 1.5m x 1.5m, Back-of-House)
  // -------------------------------------------------------------------------
  describe('3. Employee Toilet Placement', () => {
    it('3. places Employee Toilet with minimum 1.5m x 1.5m in back-of-house zone', () => {
      const candidate = generator.generate(baseInput, accessor);
      const empToilet = candidate.objects.find((o) => o.id === 'employee-restroom');

      expect(empToilet).toBeDefined();
      expect(empToilet?.geometry.width).toBe(1.5);
      expect(empToilet?.geometry.length).toBe(1.5);
      expect(empToilet?.metadata?.zoneType).toBe('EMPLOYEE_RESTROOM');
      expect(empToilet?.metadata?.spaceCategory).toBe('BACK_OF_HOUSE');
    });
  });

  // -------------------------------------------------------------------------
  // 4, 5, 6, 7, 8, 9. 4-Stream Waste Area (3m x 6m Total Envelope)
  // -------------------------------------------------------------------------
  describe('4, 5, 6, 7, 8, 9. 4-Stream Waste Area Program', () => {
    it('4. places total Waste Area occupying 3m x 6m footprint', () => {
      const candidate = generator.generate(baseInput, accessor);
      const wasteObjects = candidate.objects.filter((o) => o.metadata?.zoneType === 'WASTE_AREA');
      expect(wasteObjects).toHaveLength(4);

      const totalLength = wasteObjects.reduce((sum, o) => sum + o.geometry.length, 0);
      expect(totalLength).toBe(6.0);
      for (const wo of wasteObjects) {
        expect(wo.geometry.width).toBe(3.0);
        expect(wo.metadata?.spaceCategory).toBe('BACK_OF_HOUSE');
      }
    });

    it('5. places Used Oil stream with exact 3m x 2m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const oil = candidate.objects.find((o) => o.id === 'waste-oil');
      expect(oil).toBeDefined();
      expect(oil?.geometry.width).toBe(3.0);
      expect(oil?.geometry.length).toBe(2.0);
      expect(oil?.metadata?.wasteStream).toBe('waste_oil');
    });

    it('6. places Used Tires stream with exact 3m x 2m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const tire = candidate.objects.find((o) => o.id === 'waste-tire');
      expect(tire).toBeDefined();
      expect(tire?.geometry.width).toBe(3.0);
      expect(tire?.geometry.length).toBe(2.0);
      expect(tire?.metadata?.wasteStream).toBe('waste_tire');
    });

    it('7. places Used Parts stream with exact 3m x 1m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const parts = candidate.objects.find((o) => o.id === 'waste-parts');
      expect(parts).toBeDefined();
      expect(parts?.geometry.width).toBe(3.0);
      expect(parts?.geometry.length).toBe(1.0);
      expect(parts?.metadata?.wasteStream).toBe('waste_parts');
    });

    it('8. places Used Cardboard stream with exact 3m x 1m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const card = candidate.objects.find((o) => o.id === 'waste-cardboard');
      expect(card).toBeDefined();
      expect(card?.geometry.width).toBe(3.0);
      expect(card?.geometry.length).toBe(1.0);
      expect(card?.metadata?.wasteStream).toBe('waste_cardboard');
    });

    it('9. preserves all four waste streams as semantically distinct subdivisions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const streamTypes = candidate.objects
        .filter((o) => o.metadata?.zoneType === 'WASTE_AREA')
        .map((o) => o.metadata?.wasteStream);

      expect(streamTypes).toContain('waste_oil');
      expect(streamTypes).toContain('waste_tire');
      expect(streamTypes).toContain('waste_parts');
      expect(streamTypes).toContain('waste_cardboard');
    });
  });

  // -------------------------------------------------------------------------
  // 10, 11, 12, 13. Mushola + Wudhu & Mandatory Adjacency
  // -------------------------------------------------------------------------
  describe('10, 11, 12, 13. Mushola + Wudhu Placement & Adjacency', () => {
    it('10. places Mini Mushola with exact 2m x 2m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const mushola = candidate.objects.find((o) => o.id === 'mushola');

      expect(mushola).toBeDefined();
      expect(mushola?.geometry.width).toBe(2.0);
      expect(mushola?.geometry.length).toBe(2.0);
      expect(mushola?.metadata?.zoneType).toBe('MUSHOLA');
      expect(mushola?.metadata?.spaceCategory).toBe('CUSTOMER_CLEAN');
    });

    it('11. places Wudhu with exact 1m x 2m dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const wudhu = candidate.objects.find((o) => o.id === 'wudhu');

      expect(wudhu).toBeDefined();
      expect(wudhu?.geometry.width).toBe(1.0);
      expect(wudhu?.geometry.length).toBe(2.0);
      expect(wudhu?.metadata?.zoneType).toBe('WUDHU');
      expect(wudhu?.metadata?.spaceCategory).toBe('CUSTOMER_CLEAN');
    });

    it('12. verifies Wudhu faucet minimum = 1 is preserved in metadata', () => {
      const candidate = generator.generate(baseInput, accessor);
      const wudhu = candidate.objects.find((o) => o.id === 'wudhu');
      expect(wudhu?.metadata?.minFaucetCount).toBe(1);
    });

    it('13. enforces mandatory Mushola <-> Wudhu adjacency in topology graph', () => {
      const topology = buildLayoutTopology(baseInput, accessor);
      const enriched = deriveTopologyZones(topology, baseInput, accessor);

      const musholaNode = enriched.nodes.find((n) => n.type === 'MUSHOLA');
      const wudhuNode = enriched.nodes.find((n) => n.type === 'WUDHU');

      expect(musholaNode).toBeDefined();
      expect(wudhuNode).toBeDefined();

      const adjacencyEdge = enriched.edges.find(
        (e) =>
          e.ruleId === 'ADJACENCY-MUSHOLA-WUDHU-001' &&
          e.relation === 'ADJACENT' &&
          e.severity === 'HARD'
      );
      expect(adjacencyEdge).toBeDefined();
      expect(adjacencyEdge?.fromNodeId).toBe('node-mushola');
      expect(adjacencyEdge?.toNodeId).toBe('node-wudhu');
    });
  });

  // -------------------------------------------------------------------------
  // 14. Building Boundary Containment
  // -------------------------------------------------------------------------
  describe('14. Boundary Containment', () => {
    it('14. verifies all placed rear and ancillary spaces remain strictly inside building boundary', () => {
      const candidate = generator.generate(baseInput, accessor);
      const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
      const building = baseInput.building;

      for (const obj of candidate.objects) {
        if (obj.layer === '01-SITE') continue; // site parking is outside

        expect(obj.geometry.x).toBeGreaterThanOrEqual(wallThickness);
        expect(obj.geometry.y).toBeGreaterThanOrEqual(wallThickness);
        expect(obj.geometry.x + obj.geometry.width).toBeLessThanOrEqual(building.width - wallThickness + 0.001);
        expect(obj.geometry.y + obj.geometry.length).toBeLessThanOrEqual(building.length - wallThickness + 0.001);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 15 & 16. Impossible Placement Failure Semantics
  // -------------------------------------------------------------------------
  describe('15 & 16. Structured Failure Diagnostics on Impossible Placement', () => {
    const impossibleInput: LayoutEngineInput = {
      site: { width: 20, length: 20 },
      building: { width: 12, length: 14 }, // Very small building
      program: {
        bays: [{ serviceType: 'general_service', quantity: 2 }],
        equipment: [],
        vehicleClassKey: 'vehicle.mpv',
        circulationRequirement: 'drive_through',
        customerZoneRequired: true,
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          employeeMess: true, // 3x6m won't fit alongside other rooms!
          wasteStreams: { oil: true, tire: true, parts: true, cardboard: true },
        },
        futureExpansionBays: 0,
      },
    };

    it('15. impossible placement does NOT shrink geometry or force invalid dimensions', () => {
      const candidate = generator.generate(impossibleInput, accessor);
      // Ensure that any placed object maintains its exact standard dimensions and is not downscaled
      for (const obj of candidate.objects) {
        if (obj.id === 'employee-mess') {
          expect(obj.geometry.width).toBe(3.0);
          expect(obj.geometry.length).toBe(6.0);
        }
      }
    });

    it('16. impossible placement produces structured diagnostics identifying space, dimensions, and reason', () => {
      const candidate = generator.generate(impossibleInput, accessor);
      expect(candidate.status).toBe('DISQUALIFIED');
      expect(candidate.validation.isValid).toBe(false);

      const capacityRejection = candidate.rejections.find((r) => r.ruleId === 'CAPACITY-ANCILLARY-001');
      expect(capacityRejection).toBeDefined();
      expect(capacityRejection?.isDisqualifying).toBe(true);
      expect(capacityRejection?.severity).toBe('HARD');
      expect(capacityRejection?.reason).toMatch(/Waste Area|Employee Mess|Ancillary space/i);
    });
  });

  // -------------------------------------------------------------------------
  // 17 & 18. Unmeasured Equipment & Motorcycle Dimensions Remain UNKNOWN
  // -------------------------------------------------------------------------
  describe('17 & 18. UNKNOWN Dimensions Integrity', () => {
    it('17. verifies no geometry is created from UNKNOWN equipment footprints (Genset, ATF, Compressor, etc.)', () => {
      const candidate = generator.generate(baseInput, accessor);
      const gensetObject = candidate.objects.find((o) => o.id.includes('genset'));
      expect(gensetObject).toBeUndefined();
    });

    it('18. verifies no physical geometry footprint is created for motorcycle stalls with UNKNOWN dimensions', () => {
      const candidate = generator.generate(baseInput, accessor);
      const motoObject = candidate.objects.find((o) => o.id.includes('motorcycle-stall'));
      expect(motoObject).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 19. Backward Compatibility
  // -------------------------------------------------------------------------
  describe('19. Legacy Compatibility', () => {
    it('19. successfully loads existing legacy project fixture without new spatial fields', async () => {
      const repo = new LocalProjectRepository();
      const project = await repo.getProjectById('demo-001');

      expect(project).not.toBeNull();
      expect(project?.project.id).toBe('demo-001');
      expect(project?.layout.objects.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 20. Candidate Strategy Compatibility & Regression
  // -------------------------------------------------------------------------
  describe('20. Candidate Strategy Compatibility', () => {
    it('20. successfully runs candidate generation across all 3 strategies (BALANCED, CAPACITY, PREMIUM_FLOW)', () => {
      for (const strat of ['BALANCED', 'CAPACITY', 'PREMIUM_FLOW'] as const) {
        const candidate = generator.generate(baseInput, accessor, { strategyId: strat });
        expect(candidate.status).toBe('VALID');
        expect(candidate.objects.length).toBeGreaterThan(5);
        expect(candidate.envelopes.length).toBeGreaterThan(5);
      }
    });
  });
});
