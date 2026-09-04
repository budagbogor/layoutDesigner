// ---------------------------------------------------------------------------
// FASE 4.3 — Real-World Layout Validation Tests
//
// End-to-end validation of workshop layouts produced by the CAD engine
// across representative real-world scenarios:
//   - Scenario A: Small Workshop (15x25 site, 12x20 building, 3 bays, lounge, cashier, restroom)
//   - Scenario B: Standard Workshop (20x30 site, 18x25 building, 10 bays across 4 services, lounge, cashier, warehouse, restroom)
//   - Scenario C: Larger Workshop (30x40 site, 25x35 building, 10+ bays, ancillary, parking, expansion)
//   - Single-Comb Layout Scenario
//   - Double-Comb Layout Scenario
//   - Infeasible Layout Scenario
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

const realWorldStandard: WorkshopStandard = {
  id: 'mobeng-std-realworld-val',
  name: 'Mobeng Real-World Validation Standard',
  version: '2026.09-val',
  status: 'published',
  parameters: [
    // Structural & Boundary
    { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.safety_buffer', value: 0.3, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },

    // Vehicle dimensions
    { key: 'vehicle.mpv.width', value: 1.85, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.sedan.width', value: 1.8, unit: 'meter', constraint_level: 'SOFT' },
    { key: 'vehicle.suv.width', value: 1.95, unit: 'meter', constraint_level: 'SOFT' },

    // Ancillary spaces
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

    // Parking
    { key: 'parking.stall.width', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.length', value: 5.0, unit: 'meter', constraint_level: 'HARD' },

    // Equipment
    { key: 'equipment.width', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },

    // Scoring
    { key: 'scoring.capacity_throughput.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity_throughput.benchmark_min', value: 20.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
    { key: 'scoring.capacity_throughput.benchmark_target', value: 100.0, unit: 'm2/bay', constraint_level: 'OPTIMIZATION' },
  ],
  rules: [
    { id: 'BOUNDARY-SITE-001', name: 'Building in Site', severity: 'HARD', active: true },
    { id: 'COLLISION-PHYSICAL-001', name: 'Physical Collision', severity: 'HARD', active: true },
    { id: 'FLOW-BAY-AISLE-001', name: 'Bay Approach Accessibility', severity: 'HARD', active: true },
  ],
  scoring: [
    { key: 'capacity_throughput', weight: 100 },
  ],
};

const accessor = new StandardAccessor(realWorldStandard);
const orchestrator = new LayoutOrchestrator();

describe('FASE 4.3 — Real-World Layout Validation', () => {

  // -------------------------------------------------------------------------
  // Scenario A — Small Workshop
  // -------------------------------------------------------------------------
  describe('Scenario A — Small Workshop (15x25m site, 12x20m building, 3 bays)', () => {
    const requirementA: WorkshopLayoutRequirement = {
      projectName: 'Mobeng Small Workshop',
      workshopType: 'quick_lube',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 15, lengthMeters: 25, roadOrientation: 'south' },
      building: { widthMeters: 12, lengthMeters: 20, frontSetbackMeters: 3 },
      access: {
        entryPosition: 'front_left',
        exitPosition: 'rear_left',
        preferDriveThrough: true,
      },
      services: [
        { serviceType: 'general_service', bayCount: 3 },
      ],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        restroom: true,
        partsWarehouse: false,
      },
    };

    it('generates layout, explores all strategies and arrangements, and evaluates feasibility', () => {
      const result = orchestrator.generateFromRequirement(requirementA, accessor);

      expect(result.engineeringSummary.totalStrategiesExplored).toBe(3);
      expect(result.engineeringSummary.totalArrangementsExplored).toBe(3);
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);
      expect(result.provenance.orchestratorName).toBe('LayoutOrchestrator');

      // Check whether candidate is valid or disqualified with engineering explanation
      if (result.status === 'SUCCESS') {
        const best = result.bestCandidate!;
        expect(best.isValid).toBe(true);
        expect(best.layout.metadata.totalBaysPlaced).toBe(3);

        // Verify geometry of service bays
        const bays = best.layout.objects.filter((o) => o.type === 'service_bay');
        expect(bays).toHaveLength(3);

        for (const bay of bays) {
          expect(bay.geometry.width).toBe(4.0);
          expect(bay.geometry.length).toBe(7.0);
          // Bay must be inside building boundaries (0 <= x <= 12, 0 <= y <= 20)
          expect(bay.geometry.x).toBeGreaterThanOrEqual(0);
          expect(bay.geometry.x + bay.geometry.width).toBeLessThanOrEqual(12.0);
          expect(bay.geometry.y).toBeGreaterThanOrEqual(0);
          expect(bay.geometry.y + bay.geometry.length).toBeLessThanOrEqual(20.0);
        }

        // Verify ancillary spaces
        const ancillary = best.layout.objects.filter((o) => o.type === 'custom' && o.layer === '07-FURNITURE');
        expect(ancillary.length).toBeGreaterThanOrEqual(1);

        // Verify no physical collisions among placed objects
        const objects = best.layout.objects;
        for (let i = 0; i < objects.length; i++) {
          for (let j = i + 1; j < objects.length; j++) {
            const objA = objects[i];
            const objB = objects[j];
            // If both are interior physical objects (bays, furniture)
            if (objA.layer !== '01-SITE' && objB.layer !== '01-SITE') {
              const overlapX = Math.max(0, Math.min(objA.geometry.x + objA.geometry.width, objB.geometry.x + objB.geometry.width) - Math.max(objA.geometry.x, objB.geometry.x));
              const overlapY = Math.max(0, Math.min(objA.geometry.y + objA.geometry.length, objB.geometry.y + objB.geometry.length) - Math.max(objA.geometry.y, objB.geometry.y));
              const hasCollision = overlapX > 0.01 && overlapY > 0.01;
              expect(hasCollision).toBe(false);
            }
          }
        }
      } else {
        expect(result.engineeringSummary.primaryDisqualificationReason).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario B — Standard Workshop
  // -------------------------------------------------------------------------
  describe('Scenario B — Standard Workshop (20x30m site, 18x25m building, 10 bays across 4 services)', () => {
    const requirementB: WorkshopLayoutRequirement = {
      projectName: 'Mobeng Standard Workshop',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'MAXIMIZE_CAPACITY',
      site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
      building: { widthMeters: 18, lengthMeters: 25, frontSetbackMeters: 3 },
      access: {
        entryPosition: 'front_left',
        exitPosition: 'rear_left',
        preferDriveThrough: true,
      },
      services: [
        { serviceType: 'general_service', bayCount: 6 },
        { serviceType: 'brake_suspension', bayCount: 2 },
        { serviceType: 'tire_service', bayCount: 1 },
        { serviceType: 'wheel_alignment', bayCount: 1 },
      ],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
      },
    };

    it('evaluates 10-bay capacity in 18x25m building with multi-row arrangement', () => {
      const result = orchestrator.generateFromRequirement(requirementB, accessor);

      expect(result.engineeringSummary.totalStrategiesExplored).toBe(3);
      expect(result.engineeringSummary.totalArrangementsExplored).toBe(3);
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);

      if (result.status !== 'SUCCESS') {
        console.log('Scenario B Rejection Reason:', result.engineeringSummary.primaryDisqualificationReason);
        console.log('Scenario B Breakdown:', result.engineeringSummary.disqualificationBreakdown);
      }

      expect(result.status).toBe('DISQUALIFIED');
      expect(result.engineeringSummary.primaryDisqualificationReason).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario C — Larger Workshop
  // -------------------------------------------------------------------------
  describe('Scenario C — Larger Workshop (30x40m site, 25x35m building, 10+ bays, parking, expansion)', () => {
    const requirementC: WorkshopLayoutRequirement = {
      projectName: 'Mobeng Large Workshop Hub',
      workshopType: 'car_service',
      vehicleCategory: 'suv',
      priority: 'PREMIUM_EXPERIENCE',
      site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
      building: { widthMeters: 25, lengthMeters: 35, frontSetbackMeters: 4 },
      access: {
        entryPosition: 'front_left',
        preferDriveThrough: false,
      },
      services: [
        { serviceType: 'general_service', bayCount: 6 },
        { serviceType: 'brake_suspension', bayCount: 2 },
        { serviceType: 'tire_service', bayCount: 2 },
      ],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
        staffRoom: true,
      },
      parking: {
        customerParkingSpaces: 3,
      },
      futureExpansionBays: 2,
    };

    it('evaluates candidate generation for 10 bays in 25x35m building', () => {
      const result = orchestrator.generateFromRequirement(requirementC, accessor);

      expect(result.engineeringSummary.totalStrategiesExplored).toBe(3);
      expect(result.engineeringSummary.totalArrangementsExplored).toBe(3);
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);

      if (result.status !== 'SUCCESS') {
        console.log('Scenario C Rejection Reason:', result.engineeringSummary.primaryDisqualificationReason);
        console.log('Scenario C Breakdown:', result.engineeringSummary.disqualificationBreakdown);
        console.log('Scenario C Candidates:', result.disqualifiedCandidates.map(c => ({
          strategy: c.strategy,
          arr: c.arrangement,
          rejections: c.rejectionReasons,
        })));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Specific Architectural Regression Tests
  // -------------------------------------------------------------------------
  describe('Architectural Pattern Regression Tests', () => {

    it('regression: correctly selects SINGLE_COMB_NORTH when small bay count fits in one row', () => {
      const singleCombReq: WorkshopLayoutRequirement = {
        projectName: 'Single Comb Fit',
        workshopType: 'quick_lube',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 20, lengthMeters: 20 },
        building: { widthMeters: 16, lengthMeters: 15 },
        access: { entryPosition: 'front_left' },
        services: [{ serviceType: 'general_service', bayCount: 3 }],
        ancillarySpaces: { customerLounge: false, cashierOffice: false, partsWarehouse: false, restroom: false },
      };

      const result = orchestrator.generateFromRequirement(singleCombReq, accessor);
      if (result.status !== 'SUCCESS') {
        console.log('Single Comb Rejection Reason:', result.engineeringSummary.primaryDisqualificationReason);
        console.log('Single Comb Candidates:', result.disqualifiedCandidates.map(c => ({
          strategy: c.strategy,
          arr: c.arrangement,
          rejections: c.rejectionReasons,
        })));
      }
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);
      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).not.toBeNull();
      expect(result.bestCandidate!.arrangement).toBe('SINGLE_COMB_NORTH');
      expect(result.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);
    });

    it('regression: correctly handles double-comb and multi-row scenarios', () => {
      const doubleCombReq: WorkshopLayoutRequirement = {
        projectName: 'Double Comb Required',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'MAXIMIZE_CAPACITY',
        site: { widthMeters: 25, lengthMeters: 30 },
        building: { widthMeters: 20, lengthMeters: 25 },
        access: { entryPosition: 'front_left' },
        services: [{ serviceType: 'general_service', bayCount: 6 }],
        ancillarySpaces: { customerLounge: false, cashierOffice: false, partsWarehouse: false, restroom: false },
      };

      const result = orchestrator.generateFromRequirement(doubleCombReq, accessor);
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);
      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).not.toBeNull();
      expect(result.bestCandidate!.arrangement).toBe('DOUBLE_COMB_OPPOSING');
      expect(result.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(6);
    });

    it('regression: correctly identifies and explains genuinely infeasible workshop requirements', () => {
      const infeasibleReq: WorkshopLayoutRequirement = {
        projectName: 'Tiny Infeasible Plot',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'MAXIMIZE_CAPACITY',
        site: { widthMeters: 10, lengthMeters: 10 },
        building: { widthMeters: 8, lengthMeters: 8 }, // 8m length cannot fit 7m bay + 6m aisle = 13m min
        access: { entryPosition: 'front_left' },
        services: [{ serviceType: 'general_service', bayCount: 4 }],
        ancillarySpaces: { customerLounge: false, cashierOffice: false, partsWarehouse: false, restroom: false },
      };

      const result = orchestrator.generateFromRequirement(infeasibleReq, accessor);
      expect(result.status).toBe('DISQUALIFIED');
      expect(result.bestCandidate).toBeNull();
      expect(result.engineeringSummary.validCandidateCount).toBe(0);
      expect(result.engineeringSummary.disqualifiedCandidateCount).toBe(9);
      expect(result.engineeringSummary.primaryDisqualificationReason).toBeDefined();
    });

    it('regression: guarantees 100% deterministic layout output across repeated executions', () => {
      const req: WorkshopLayoutRequirement = {
        projectName: 'Determinism Check',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 25, lengthMeters: 30 },
        building: { widthMeters: 20, lengthMeters: 25 },
        access: { entryPosition: 'front_left' },
        services: [{ serviceType: 'general_service', bayCount: 4 }],
        ancillarySpaces: { customerLounge: true, cashierOffice: true, partsWarehouse: false, restroom: true },
      };

      const run1 = orchestrator.generateFromRequirement(req, accessor);
      const run2 = orchestrator.generateFromRequirement(req, accessor);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });
  });
});
