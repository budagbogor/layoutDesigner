import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';
import {
  candidateToCadProject,
  layoutEngineResultToCadProject,
  exportCandidateToSvg,
  exportLayoutEngineResultToSvg,
} from '@/domain/export/cadRepresentation';
import { exportLayoutToSvg } from '@/domain/export/svgExporter';
import { getOrientedCorners } from '@/domain/geometry/primitives';

const testStandard: WorkshopStandard = {
  id: 'mobeng-std-cad-val',
  name: 'Mobeng CAD Validation Standard',
  version: '2026.09',
  status: 'published',
  parameters: [
    { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.safety_buffer', value: 0.3, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },
    { key: 'vehicle.mpv.width', value: 1.85, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.sedan.width', value: 1.8, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.suv.width', value: 1.95, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.parts_warehouse', value: 4.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.parts_warehouse', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.width', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.length', value: 5.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.width', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'scoring.capacity_throughput.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity_throughput.benchmark_min', value: 20.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity_throughput.benchmark_target', value: 100.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
  ],
  rules: [
    { id: 'BOUNDARY-SITE-001', name: 'Building in Site', severity: 'HARD', active: true },
    { id: 'COLLISION-PHYSICAL-001', name: 'Physical Collision', severity: 'HARD', active: true },
    { id: 'FLOW-BAY-AISLE-001', name: 'Bay Approach Accessibility', severity: 'HARD', active: true },
  ],
};

describe('FASE 4.4 — CAD Output Validation & Integration', () => {
  const orchestrator = new LayoutOrchestrator();
  const accessor = new StandardAccessor(testStandard);

  // Fixture 1: Single-Comb 3-Bay Workshop (Proven VALID)
  const singleCombInput: LayoutEngineInput = {
    site: { width: 30, length: 25, roadSide: 'south', roadWidth: 8 },
    building: { width: 25, length: 20 },
    program: {
      vehicleClassKey: 'vehicle.mpv',
      customerZoneRequired: true,
      futureExpansionBays: 0,
      bays: [{ serviceType: 'general_service', quantity: 3 }],
      circulationRequirement: 'drive_through',
      equipment: [{ equipmentType: 'two_post_lift', quantity: 2 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        restroom: true,
      },
    },
    accessPoints: [
      { id: 'entry-main', type: 'entrance', wall: 'south', offsetMeters: 21, widthMeters: 4.0 },
      { id: 'exit-north', type: 'exit', wall: 'north', offsetMeters: 21, widthMeters: 4.0 },
    ],
  };

  // Fixture 2: Double-Comb 6-Bay Workshop (Proven VALID)
  const doubleCombInput: LayoutEngineInput = {
    site: { width: 35, length: 30, roadSide: 'south', roadWidth: 10 },
    building: { width: 30, length: 24 },
    program: {
      vehicleClassKey: 'vehicle.mpv',
      customerZoneRequired: true,
      futureExpansionBays: 0,
      equipment: [],
      bays: [
        { serviceType: 'general_service', quantity: 4 },
        { serviceType: 'tire_service', quantity: 2 },
      ],
      circulationRequirement: 'back_out_turnaround',
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        restroom: true,
        staffRoom: true,
      },
    },
    accessPoints: [
      { id: 'main-entry', type: 'entrance', wall: 'south', offsetMeters: 26, widthMeters: 4.5 },
    ],
  };

  // Fixture 3: Infeasible Workshop (Proven DISQUALIFIED)
  const disqualifiedInput: LayoutEngineInput = {
    site: { width: 15, length: 25, roadSide: 'south' },
    building: { width: 12, length: 20 },
    program: {
      vehicleClassKey: 'vehicle.mpv',
      customerZoneRequired: false,
      futureExpansionBays: 0,
      equipment: [],
      bays: [{ serviceType: 'general_service', quantity: 8 }], // 8 bays cannot fit in 12x20
      circulationRequirement: 'drive_through',
    },
  };

  // Fixture 4: Comprehensive Features (Parking, Expansion, Heavy Equipment, Warehouse)
  const comprehensiveInput: LayoutEngineInput = {
    site: {
      width: 45,
      length: 35,
      roadSide: 'south',
      parking: { customerParkingSpaces: 3 },
    },
    building: { width: 40, length: 25, frontSetbackMeters: 5 },
    program: {
      vehicleClassKey: 'vehicle.mpv',
      customerZoneRequired: true,
      bays: [{ serviceType: 'general_service', quantity: 4 }],
      circulationRequirement: 'back_out_turnaround',
      futureExpansionBays: 2,
      equipment: [{ equipmentType: 'wheel_balancer', quantity: 1 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        restroom: true,
        partsWarehouse: true,
        compressorRoom: true,
        oilWasteStorage: true,
      },
    },
    accessPoints: [
      { id: 'main-door', type: 'bidirectional', wall: 'south', offsetMeters: 36, widthMeters: 4.0 },
    ],
  };

  describe('1. Pipeline Validation: Single-Comb 3-Bay Layout', () => {
    it('generates a valid CAD representation preserving exact geometry', () => {
      const result = orchestrator.generateLayout(singleCombInput, accessor, {
        arrangements: ['SINGLE_COMB_NORTH'],
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).toBeDefined();
      expect(result.bestCandidate!.isValid).toBe(true);

      const cadProject = layoutEngineResultToCadProject(result, singleCombInput);
      expect(cadProject).not.toBeNull();
      expect(cadProject!.layout.status).toBe('generated');
      expect(cadProject!.building.width).toBe(25);
      expect(cadProject!.building.length).toBe(20);

      // Verify all expected objects exist in CAD layout
      const objects = cadProject!.layout.objects;
      const bayObjects = objects.filter((o) => o.type === 'service_bay');
      const equipObjects = objects.filter((o) => o.type === 'equipment');
      const circulationObjects = objects.filter((o) => o.type === 'circulation_path');
      const doorObjects = objects.filter((o) => o.type === 'door');
      const loungeObj = objects.find((o) => o.id === 'customer-lounge');
      const cashierObj = objects.find((o) => o.id === 'cashier-office');
      const restroomObj = objects.find((o) => o.id === 'restroom');

      expect(bayObjects.length).toBe(3);
      expect(equipObjects.length).toBe(2);
      expect(circulationObjects.length).toBeGreaterThanOrEqual(1); // main aisle (+ exit corridor)
      expect(doorObjects.length).toBe(2); // entry-main and exit-north
      expect(loungeObj).toBeDefined();
      expect(cashierObj).toBeDefined();
      expect(restroomObj).toBeDefined();

      // Verify geometric precision and non-displacement
      for (const bay of bayObjects) {
        expect(bay.geometry.width).toBe(4.0); // bay.min_width
        expect(bay.geometry.length).toBe(7.0); // bay.min_length
        expect(bay.geometry.y).toBe(20 - 0.25 - 0.5 - 7.0); // 12.25m
      }
    });

    it('renders deterministic, valid standalone SVG for Single-Comb', () => {
      const result = orchestrator.generateLayout(singleCombInput, accessor, {
        arrangements: ['SINGLE_COMB_NORTH'],
      });

      const svg1 = exportLayoutEngineResultToSvg(result, singleCombInput);
      const svg2 = exportLayoutEngineResultToSvg(result, singleCombInput);

      expect(svg1).not.toBeNull();
      expect(svg1).toBe(svg2); // 100% deterministic

      // Verify SVG XML structure
      expect(svg1).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg1).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg1).toContain('id="building-boundary"');
      expect(svg1).toContain('id="layer-08-SERVICE-BAY"');
      expect(svg1).toContain('id="layer-11-CIRCULATION"');
      expect(svg1).toContain('id="layer-03-DOOR"');
      expect(svg1).toContain('id="obj-bay-01"');
      expect(svg1).toContain('id="obj-customer-lounge"');
      expect(svg1).toContain('id="obj-aisle-main"');
      expect(svg1).toContain('25.00 m'); // Dimension label
      expect(svg1).toContain('20.00 m'); // Dimension label
    });
  });

  describe('2. Pipeline Validation: Double-Comb 6-Bay Layout', () => {
    it('generates a valid CAD representation for Double-Comb with north & south bays', () => {
      const result = orchestrator.generateLayout(doubleCombInput, accessor, {
        arrangements: ['DOUBLE_COMB_OPPOSING'],
      });

      expect(result.status).toBe('SUCCESS');
      const cadProject = layoutEngineResultToCadProject(result, doubleCombInput);
      expect(cadProject).not.toBeNull();

      const objects = cadProject!.layout.objects;
      const bayObjects = objects.filter((o) => o.type === 'service_bay');
      expect(bayObjects.length).toBe(6);

      // Verify north and south bay rows
      const northBays = bayObjects.filter((b) => b.metadata?.row === 'north');
      const southBays = bayObjects.filter((b) => b.metadata?.row === 'south');
      expect(northBays.length).toBe(5);
      expect(southBays.length).toBe(1);

      // Verify ancillary rooms (lounge, cashier, restroom, staff-room)
      expect(objects.find((o) => o.id === 'customer-lounge')).toBeDefined();
      expect(objects.find((o) => o.id === 'cashier-office')).toBeDefined();
      expect(objects.find((o) => o.id === 'restroom')).toBeDefined();
      expect(objects.find((o) => o.id === 'staff-room')).toBeDefined();

      // Verify no overlap between ancillary rooms and south bays
      const southBayEnvs = southBays.map((b) => ({
        minX: b.geometry.x,
        maxX: b.geometry.x + b.geometry.width,
        minY: b.geometry.y,
        maxY: b.geometry.y + b.geometry.length,
      }));

      const ancillaryObjs = objects.filter(
        (o) => ['customer-lounge', 'cashier-office', 'restroom', 'staff-room'].includes(o.id)
      );

      for (const anc of ancillaryObjs) {
        const ancMinX = anc.geometry.x;
        const ancMaxX = anc.geometry.x + anc.geometry.width;
        const ancMinY = anc.geometry.y;
        const ancMaxY = anc.geometry.y + anc.geometry.length;

        for (const sb of southBayEnvs) {
          const overlapX = ancMinX < sb.maxX && ancMaxX > sb.minX;
          const overlapY = ancMinY < sb.maxY && ancMaxY > sb.minY;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    });

    it('renders deterministic, valid SVG for Double-Comb', () => {
      const result = orchestrator.generateLayout(doubleCombInput, accessor, {
        arrangements: ['DOUBLE_COMB_OPPOSING'],
      });

      const svg = exportLayoutEngineResultToSvg(result, doubleCombInput);
      expect(svg).not.toBeNull();
      expect(svg).toContain('id="obj-bay-01"');
      expect(svg).toContain('id="obj-bay-06"'); // South row bay
      expect(svg).toContain('id="obj-staff-room"');
      expect(svg).toContain('id="obj-aisle-main"');
    });
  });

  describe('3. DISQUALIFIED Candidates Safety Contract', () => {
    it('strictly returns null and forbids export as final layout for DISQUALIFIED result', () => {
      const result = orchestrator.generateLayout(disqualifiedInput, accessor);

      expect(result.status).toBe('DISQUALIFIED');
      expect(result.bestCandidate).toBeNull();

      // layoutEngineResultToCadProject must return null
      const cadProject = layoutEngineResultToCadProject(result, disqualifiedInput);
      expect(cadProject).toBeNull();

      // exportLayoutEngineResultToSvg must return null
      const svg = exportLayoutEngineResultToSvg(result, disqualifiedInput);
      expect(svg).toBeNull();
    });

    it('allows exporting individual candidate for diagnostic inspection if explicitly requested', () => {
      const result = orchestrator.generateLayout(disqualifiedInput, accessor);

      const firstDisqualified = result.disqualifiedCandidates[0];
      expect(firstDisqualified).toBeDefined();

      const diagProject = candidateToCadProject(firstDisqualified, disqualifiedInput);
      expect(diagProject.layout.status).toBe('draft'); // Mark as draft/diagnostic

      const diagSvg = exportCandidateToSvg(firstDisqualified, disqualifiedInput);
      expect(diagSvg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });
  });

  describe('4. Complete Object Visualization Coverage', () => {
    it('correctly represents all required objects: building, bays, aisle, equip, lounge, cashier, restroom, warehouse, staff, parking, expansion, doors', () => {
      const result = orchestrator.generateLayout(comprehensiveInput, accessor, {
        arrangements: ['SINGLE_COMB_NORTH'],
      });

      expect(result.status).toBe('SUCCESS');
      const cadProject = layoutEngineResultToCadProject(result, comprehensiveInput);
      expect(cadProject).not.toBeNull();

      const objects = cadProject!.layout.objects;

      // 1. Building boundary
      expect(cadProject!.building.width).toBe(40);
      expect(cadProject!.building.length).toBe(25);

      // 2. Service bays
      expect(objects.filter((o) => o.type === 'service_bay').length).toBe(4);

      // 3. Circulation / aisle
      expect(objects.find((o) => o.id === 'aisle-main' && o.type === 'circulation_path')).toBeDefined();

      // 4. Equipment
      expect(objects.find((o) => o.type === 'equipment')).toBeDefined();

      // 5. Customer lounge
      expect(objects.find((o) => o.id === 'customer-lounge')).toBeDefined();

      // 6. Cashier
      expect(objects.find((o) => o.id === 'cashier-office')).toBeDefined();

      // 7. Restroom
      expect(objects.find((o) => o.id === 'restroom')).toBeDefined();

      // 8. Parts warehouse
      expect(objects.find((o) => o.id === 'parts-warehouse')).toBeDefined();

      // 9. Compressor room & Oil waste storage
      expect(objects.find((o) => o.id === 'compressor-room')).toBeDefined();
      expect(objects.find((o) => o.id === 'oil-waste-storage')).toBeDefined();

      // 10. Site parking
      const parkingObjs = objects.filter((o) => o.id.startsWith('cust-parking-'));
      expect(parkingObjs.length).toBe(3);
      for (const park of parkingObjs) {
        expect(park.layer).toBe('01-SITE');
        expect(park.geometry.y).toBeLessThan(0); // Located outside in front setback
      }

      // 11. Expansion reserve
      expect(objects.find((o) => o.id === 'expansion-reserve')).toBeDefined();

      // 12. Access / entry / exit
      expect(objects.find((o) => o.id === 'door-main-door' && o.type === 'door')).toBeDefined();

      // Export to SVG and verify all tags
      const svg = exportLayoutEngineResultToSvg(result, comprehensiveInput);
      expect(svg).not.toBeNull();
      expect(svg).toContain('id="obj-expansion-reserve"');
      expect(svg).toContain('id="obj-parts-warehouse"');
      expect(svg).toContain('id="obj-cust-parking-1"');
      expect(svg).toContain('id="obj-door-main-door"');
    });
  });

  describe('5. Visual Accuracy & Geometry Fidelity', () => {
    it('maintains oriented corners and dimensions without renderer distortion', () => {
      const result = orchestrator.generateLayout(singleCombInput, accessor, {
        arrangements: ['SINGLE_COMB_NORTH'],
      });

      const cadProject = layoutEngineResultToCadProject(result, singleCombInput)!;
      for (const obj of cadProject.layout.objects) {
        const corners = getOrientedCorners(obj.geometry);
        expect(corners.length).toBe(4);

        // Verify positive dimensions
        expect(obj.geometry.width).toBeGreaterThan(0);
        expect(obj.geometry.length).toBeGreaterThan(0);

        // Verify oriented edge lengths match parametric width & length
        const edgeWidth = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
        const edgeLength = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

        expect(edgeWidth).toBeCloseTo(obj.geometry.width, 3);
        expect(edgeLength).toBeCloseTo(obj.geometry.length, 3);
      }
    });
  });
});
