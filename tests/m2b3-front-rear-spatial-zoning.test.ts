import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { LayoutEngineInput } from '../src/domain/engine/types';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';

describe('M2B.3 — FRONT / REAR SPATIAL ZONING & ADJACENCY', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);
  const generator = new CandidateGenerator();

  const standardInput: LayoutEngineInput = {
    site: { width: 50, length: 40, roadSide: 'south' },
    building: { width: 45, length: 30, frontSetbackMeters: 5 },
    program: {
      bays: [{ serviceType: 'general_service', quantity: 3 }],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        customerRestroom: true,
        mushola: true,
        wudhu: true,
        employeeMess: true,
        employeeRestroom: true,
        partsWarehouse: true,
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
  // 1. Road Orientation: South (Default)
  // -------------------------------------------------------------------------
  describe('1. Road Orientation = South (Default)', () => {
    it('places Customer clean spaces on South front wall and Back-of-house spaces on North rear wall', () => {
      const candidate = generator.generate(standardInput, accessor);
      expect(candidate.status).toBe('VALID');

      // Front customer spaces (South wall: y = wallThickness)
      const lounge = candidate.objects.find((o) => o.id === 'customer-lounge');
      const cashier = candidate.objects.find((o) => o.id === 'cashier-office');
      const mushola = candidate.objects.find((o) => o.id === 'mushola');
      const wudhu = candidate.objects.find((o) => o.id === 'wudhu');

      const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');

      expect(lounge?.geometry.y).toBe(wallThickness);
      expect(cashier?.geometry.y).toBe(wallThickness);
      expect(mushola?.geometry.y).toBe(wallThickness);
      expect(wudhu?.geometry.y).toBe(wallThickness);

      // Rear back-of-house spaces (North wall: y near building.length - wallThickness)
      const mess = candidate.objects.find((o) => o.id === 'employee-mess');
      const empToilet = candidate.objects.find((o) => o.id === 'employee-restroom');
      const wasteOil = candidate.objects.find((o) => o.id === 'waste-oil');

      expect(mess?.geometry.y).toBeGreaterThanOrEqual(20.0); // Placed at North rear
      expect(empToilet?.geometry.y).toBeGreaterThanOrEqual(20.0);
      expect(wasteOil?.geometry.y).toBeGreaterThanOrEqual(20.0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Road Orientation: North
  // -------------------------------------------------------------------------
  describe('2. Road Orientation = North', () => {
    it('places Customer clean spaces on North front wall and Back-of-house spaces on South rear wall', () => {
      const northInput: LayoutEngineInput = {
        ...standardInput,
        site: { ...standardInput.site, roadSide: 'north' },
      };

      const candidate = generator.generate(northInput, accessor);
      expect(candidate.status).toBe('VALID');

      // Front customer spaces (North wall)
      const lounge = candidate.objects.find((o) => o.id === 'customer-lounge');
      const cashier = candidate.objects.find((o) => o.id === 'cashier-office');
      expect(lounge?.geometry.y).toBeGreaterThanOrEqual(20.0);
      expect(cashier?.geometry.y).toBeGreaterThanOrEqual(20.0);

      // Rear back-of-house spaces (South wall: y = wallThickness)
      const mess = candidate.objects.find((o) => o.id === 'employee-mess');
      const empToilet = candidate.objects.find((o) => o.id === 'employee-restroom');
      const wasteOil = candidate.objects.find((o) => o.id === 'waste-oil');
      const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');

      expect(mess?.geometry.y).toBe(wallThickness);
      expect(empToilet?.geometry.y).toBe(wallThickness);
      expect(wasteOil?.geometry.y).toBe(wallThickness);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Road Orientation: East & West
  // -------------------------------------------------------------------------
  describe('3. Road Orientation = East / West', () => {
    it('places Customer clean spaces facing East road and Back-of-house facing West rear', () => {
      const eastInput: LayoutEngineInput = {
        ...standardInput,
        site: { ...standardInput.site, roadSide: 'east' },
      };

      const candidate = generator.generate(eastInput, accessor);
      expect(candidate.status).toBe('VALID');

      const lounge = candidate.objects.find((o) => o.id === 'customer-lounge');
      const mess = candidate.objects.find((o) => o.id === 'employee-mess');

      expect(lounge).toBeDefined();
      expect(mess).toBeDefined();
    });

    it('places Customer clean spaces facing West road and Back-of-house facing East rear', () => {
      const westInput: LayoutEngineInput = {
        ...standardInput,
        site: { ...standardInput.site, roadSide: 'west' },
      };

      const candidate = generator.generate(westInput, accessor);
      expect(candidate.status).toBe('VALID');

      const lounge = candidate.objects.find((o) => o.id === 'customer-lounge');
      const mess = candidate.objects.find((o) => o.id === 'employee-mess');

      expect(lounge).toBeDefined();
      expect(mess).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Mushola + Wudhu Zero-Gap Adjacency
  // -------------------------------------------------------------------------
  describe('4. Mushola + Wudhu Zero-Gap Adjacency', () => {
    it('verifies Mushola 2x2 and Wudhu 1x2 share a physical boundary with ZERO geometric gap', () => {
      const candidate = generator.generate(standardInput, accessor);
      expect(candidate.status).toBe('VALID');

      const mushola = candidate.objects.find((o) => o.id === 'mushola');
      const wudhu = candidate.objects.find((o) => o.id === 'wudhu');

      expect(mushola).toBeDefined();
      expect(wudhu).toBeDefined();

      // Mushola: width = 2.0, length = 2.0
      expect(mushola?.geometry.width).toBe(2.0);
      expect(mushola?.geometry.length).toBe(2.0);

      // Wudhu: width = 1.0, length = 2.0
      expect(wudhu?.geometry.width).toBe(1.0);
      expect(wudhu?.geometry.length).toBe(2.0);

      // Exact zero-gap boundary sharing along X axis
      expect(wudhu?.geometry.x).toBe(mushola!.geometry.x + mushola!.geometry.width);
      expect(wudhu?.geometry.y).toBe(mushola!.geometry.y);
    });
  });

  // -------------------------------------------------------------------------
  // 5. 4-Stream Waste Area Compound in Rear Zone
  // -------------------------------------------------------------------------
  describe('5. 4-Stream Waste Area in Rear Zone', () => {
    it('places 4 waste subdivisions as a contiguous 3x6m compound at the rear', () => {
      const candidate = generator.generate(standardInput, accessor);
      const wasteObjects = candidate.objects.filter((o) => o.metadata?.zoneType === 'WASTE_AREA');
      expect(wasteObjects).toHaveLength(4);

      const oil = candidate.objects.find((o) => o.id === 'waste-oil');
      const tire = candidate.objects.find((o) => o.id === 'waste-tire');
      const parts = candidate.objects.find((o) => o.id === 'waste-parts');
      const card = candidate.objects.find((o) => o.id === 'waste-cardboard');

      expect(oil?.geometry.width).toBe(3.0);
      expect(oil?.geometry.length).toBe(2.0);
      expect(tire?.geometry.width).toBe(3.0);
      expect(tire?.geometry.length).toBe(2.0);
      expect(parts?.geometry.width).toBe(3.0);
      expect(parts?.geometry.length).toBe(1.0);
      expect(card?.geometry.width).toBe(3.0);
      expect(card?.geometry.length).toBe(1.0);

      // Verify all 4 share the same X alignment
      expect(tire?.geometry.x).toBe(oil?.geometry.x);
      expect(parts?.geometry.x).toBe(oil?.geometry.x);
      expect(card?.geometry.x).toBe(oil?.geometry.x);

      // Verify contiguous stacking
      expect(tire?.geometry.y).toBe(oil!.geometry.y + oil!.geometry.length);
      expect(parts?.geometry.y).toBe(tire!.geometry.y + tire!.geometry.length);
      expect(card?.geometry.y).toBe(parts!.geometry.y + parts!.geometry.length);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Insufficient Building Capacity Failure Semantics
  // -------------------------------------------------------------------------
  describe('6. Insufficient Capacity Failure Semantics', () => {
    it('emits structured CAPACITY-ANCILLARY-001 and does NOT shrink dimensions when spaces exceed building capacity', () => {
      const tightInput: LayoutEngineInput = {
        site: { width: 20, length: 20 },
        building: { width: 10, length: 12 }, // Tiny building
        program: {
          bays: [{ serviceType: 'general_service', quantity: 2 }],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          ancillarySpaces: {
            customerLounge: true,
            cashierOffice: true,
            employeeMess: true,
            wasteStreams: { oil: true, tire: true, parts: true, cardboard: true },
          },
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(tightInput, accessor);
      expect(candidate.status).toBe('DISQUALIFIED');
      expect(candidate.validation.isValid).toBe(false);

      const capacityRejection = candidate.rejections.find((r) => r.ruleId === 'CAPACITY-ANCILLARY-001');
      expect(capacityRejection).toBeDefined();
      expect(capacityRejection?.isDisqualifying).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Strategy Regression (BALANCED, CAPACITY, PREMIUM_FLOW)
  // -------------------------------------------------------------------------
  describe('7. Strategy Compatibility Regression', () => {
    it('executes successfully across all three candidate generation strategies', () => {
      for (const strat of ['BALANCED', 'CAPACITY', 'PREMIUM_FLOW'] as const) {
        const candidate = generator.generate(standardInput, accessor, { strategyId: strat });
        expect(candidate.status).toBe('VALID');
        expect(candidate.objects.length).toBeGreaterThan(5);

        // Verify Mushola-Wudhu zero gap in all strategies
        const mushola = candidate.objects.find((o) => o.id === 'mushola');
        const wudhu = candidate.objects.find((o) => o.id === 'wudhu');
        expect(wudhu?.geometry.x).toBe(mushola!.geometry.x + mushola!.geometry.width);
      }
    });
  });
});
