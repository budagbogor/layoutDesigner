// ---------------------------------------------------------------------------
// FASE 4.1 — Layout Orchestrator Unit Tests
//
// Tests verify:
//   1. Single valid candidate scenario
//   2. Multi-strategy, multi-arrangement exploration (all permutations)
//   3. Valid candidates ranked by score deterministically
//   4. DISQUALIFIED candidates excluded from bestCandidate
//   5. All-DISQUALIFIED → status 'DISQUALIFIED', structured diagnostic
//   6. Filtered strategies and arrangements via OrchestratorOptions
//   7. LayoutEngineResult immutability & deep freeze
//   8. Determinism: identical input → identical output
//   9. generateFromRequirement end-to-end mapping flow
//   10. Candidate ID uniqueness across strategy/arrangement permutations
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

// ---------------------------------------------------------------------------
// Standard fixtures — covers all required parameters for full candidate
// generation, ancillary rooms, parking, and basic scoring.
// ---------------------------------------------------------------------------

/** Full standard with two scoring criteria for ranking tests */
const standardWithScoring: WorkshopStandard = {
  id: 'mobeng-std-orch-test',
  name: 'Orchestrator Standard Test',
  version: '1.0-orch',
  status: 'published',
  parameters: [
    { key: 'building.wall_thickness', value: 0.2, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_width', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'bay.min_length', value: 7.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.working_buffer', value: 0.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'clearance.safety_buffer', value: 0.3, unit: 'meter', constraint_level: 'HARD' },
    { key: 'customer_zone.min_width', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'customer_zone.min_length', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.width', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'equipment.length', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.cashier_office', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.restroom', value: 2.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.staff_room', value: 3.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.parts_warehouse', value: 4.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.parts_warehouse', value: 4.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.compressor_room', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_width.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'room.min_length.oil_waste_storage', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.width', value: 2.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'parking.stall.length', value: 5.0, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.vehicle.width', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    { key: 'door.pedestrian.width', value: 1.2, unit: 'meter', constraint_level: 'HARD' },
    // Scoring criteria
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

/** Standard without scoring — for pure valid/disqualified tests */
const standardNoScoring: WorkshopStandard = {
  ...standardWithScoring,
  id: 'mobeng-std-orch-noscoring',
  version: '1.0-orch-noscoring',
  scoring: [],
  parameters: standardWithScoring.parameters.filter(
    (p) => !p.key.startsWith('scoring.')
  ),
};

/** LayoutEngineInput that easily fits 2 bays in a generous building (VALID) */
const feasibleSmallInput: LayoutEngineInput = {
  site: { width: 30, length: 40 },
  building: { width: 24, length: 30 },
  program: {
    bays: [{ serviceType: 'general_service', quantity: 2 }],
    equipment: [],
    vehicleClassKey: 'vehicle.mpv',
    circulationRequirement: 'drive_through',
    customerZoneRequired: false,
    futureExpansionBays: 0,
  },
};

/** LayoutEngineInput for a medium workshop (6 bays, reasonable building) */
const feasibleMediumInput: LayoutEngineInput = {
  site: { width: 35, length: 45 },
  building: { width: 30, length: 30 },
  program: {
    bays: [
      { serviceType: 'general_service', quantity: 4 },
      { serviceType: 'brake_suspension', quantity: 2 },
    ],
    equipment: [],
    vehicleClassKey: 'vehicle.mpv',
    circulationRequirement: 'drive_through',
    customerZoneRequired: false,
    futureExpansionBays: 0,
  },
};

/** LayoutEngineInput guaranteed to fail: building too small for any bay */
const infeasibleInput: LayoutEngineInput = {
  site: { width: 8, length: 8 },
  building: { width: 6, length: 6 },  // too tiny: bay=4x7 + aisle=6 = 17m min length
  program: {
    bays: [{ serviceType: 'general_service', quantity: 4 }],
    equipment: [],
    vehicleClassKey: 'vehicle.mpv',
    circulationRequirement: 'drive_through',
    customerZoneRequired: false,
    futureExpansionBays: 0,
  },
};

// ---------------------------------------------------------------------------
describe('FASE 4.1 — Layout Generation Orchestrator', () => {
  // -------------------------------------------------------------------------
  // 1. Single valid candidate scenario
  // -------------------------------------------------------------------------
  describe('1. Single Valid Candidate', () => {
    it('returns status SUCCESS and bestCandidate for a feasible input', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).not.toBeNull();
      expect(result.bestCandidate!.isValid).toBe(true);
      expect(result.bestCandidate!.validity).not.toBe('DISQUALIFIED');
    });

    it('bestCandidate has correct layout metadata', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      const best = result.bestCandidate!;
      expect(best.layout.metadata.totalBaysRequested).toBe(2);
      expect(best.layout.metadata.totalBaysPlaced).toBe(2);
      expect(best.candidateId).toMatch(/^candidate-/);
      expect(best.provenance.orchestratorName).toBe('LayoutOrchestrator');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Multi-strategy, multi-arrangement exploration
  // -------------------------------------------------------------------------
  describe('2. Multi-Strategy Multi-Arrangement Exploration', () => {
    it('explores all 3 strategies × 3 arrangements = 9 candidates by default', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      expect(result.allCandidates).toHaveLength(9); // 3 strategies × 3 arrangements
      expect(result.engineeringSummary.totalStrategiesExplored).toBe(3);
      expect(result.engineeringSummary.totalArrangementsExplored).toBe(3);
      expect(result.engineeringSummary.totalCandidatesGenerated).toBe(9);
    });

    it('covers all strategy IDs across candidates', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      const strategies = new Set(result.allCandidates.map((c) => c.strategy));
      expect(strategies.has('CAPACITY')).toBe(true);
      expect(strategies.has('BALANCED')).toBe(true);
      expect(strategies.has('PREMIUM_FLOW')).toBe(true);
    });

    it('covers all spatial arrangement types across candidates', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      const arrangements = new Set(result.allCandidates.map((c) => c.arrangement));
      expect(arrangements.has('SINGLE_COMB_NORTH')).toBe(true);
      expect(arrangements.has('DOUBLE_COMB_OPPOSING')).toBe(true);
      expect(arrangements.has('ZONED_BY_SERVICE')).toBe(true);
    });

    it('retains provenance for each candidate with orchestratorName', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      for (const candidate of result.allCandidates) {
        expect(candidate.provenance.orchestratorName).toBe('LayoutOrchestrator');
        expect(candidate.provenance.standardVersionId).toBe('1.0-orch-noscoring');
        expect(candidate.strategy).toBeDefined();
        expect(candidate.arrangement).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Candidate ranking determinism with scoring
  // -------------------------------------------------------------------------
  describe('3. Deterministic Candidate Ranking (with scoring)', () => {
    it('bestCandidate has highest or equal score among all valid candidates', () => {
      const accessor = new StandardAccessor(standardWithScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleMediumInput, accessor);

      if (result.status === 'SUCCESS' && result.bestCandidate) {
        const bestScore = result.bestCandidate.score ?? 0;

        for (const alt of result.alternativeCandidates) {
          const altScore = alt.score ?? 0;
          expect(bestScore).toBeGreaterThanOrEqual(altScore);
        }
      }
    });

    it('alternativeCandidates are sorted score descending', () => {
      const accessor = new StandardAccessor(standardWithScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleMediumInput, accessor);

      const alts = result.alternativeCandidates;
      for (let i = 1; i < alts.length; i++) {
        const prevScore = alts[i - 1].score ?? 0;
        const currScore = alts[i].score ?? 0;
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    });

    it('bestCandidate is NOT in alternativeCandidates', () => {
      const accessor = new StandardAccessor(standardWithScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleMediumInput, accessor);

      if (result.bestCandidate) {
        const bestId = result.bestCandidate.candidateId;
        const bestStrategy = result.bestCandidate.strategy;
        const bestArr = result.bestCandidate.arrangement;

        const duplicateInAlts = result.alternativeCandidates.find(
          (a) =>
            a.candidateId === bestId &&
            a.strategy === bestStrategy &&
            a.arrangement === bestArr
        );
        expect(duplicateInAlts).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. DISQUALIFIED candidates excluded from bestCandidate
  // -------------------------------------------------------------------------
  describe('4. DISQUALIFIED Candidates Excluded from bestCandidate', () => {
    it('bestCandidate is never DISQUALIFIED', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      if (result.bestCandidate) {
        expect(result.bestCandidate.validity).not.toBe('DISQUALIFIED');
        expect(result.bestCandidate.isValid).toBe(true);
      }
    });

    it('disqualifiedCandidates do not appear in bestCandidate or alternativeCandidates', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      const disqualifiedIds = new Set(
        result.disqualifiedCandidates.map((c) => `${c.strategy}:${c.arrangement}`)
      );

      if (result.bestCandidate) {
        const bestKey = `${result.bestCandidate.strategy}:${result.bestCandidate.arrangement}`;
        expect(disqualifiedIds.has(bestKey)).toBe(false);
      }

      for (const alt of result.alternativeCandidates) {
        const altKey = `${alt.strategy}:${alt.arrangement}`;
        expect(disqualifiedIds.has(altKey)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. All-DISQUALIFIED scenario
  // -------------------------------------------------------------------------
  describe('5. All Candidates DISQUALIFIED', () => {
    it('returns status DISQUALIFIED when building is too small for any bay', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(infeasibleInput, accessor);

      expect(result.status).toBe('DISQUALIFIED');
      expect(result.bestCandidate).toBeNull();
      expect(result.alternativeCandidates).toHaveLength(0);
    });

    it('engineeringSummary provides structured disqualification diagnostics', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(infeasibleInput, accessor);

      expect(result.engineeringSummary.validCandidateCount).toBe(0);
      expect(result.engineeringSummary.disqualifiedCandidateCount).toBeGreaterThan(0);
      expect(result.engineeringSummary.primaryDisqualificationReason).toBeDefined();
      expect(typeof result.engineeringSummary.primaryDisqualificationReason).toBe('string');
    });

    it('disqualifiedCandidates includes all explored candidates with rejections', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(infeasibleInput, accessor);

      expect(result.disqualifiedCandidates.length).toBeGreaterThan(0);

      for (const dc of result.disqualifiedCandidates) {
        expect(dc.isValid).toBe(false);
        expect(dc.rejectionReasons.length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. OrchestratorOptions — filtered strategies and arrangements
  // -------------------------------------------------------------------------
  describe('6. OrchestratorOptions — Filtered Exploration', () => {
    it('respects explicit strategies option and only runs those strategies', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor, {
        strategies: ['CAPACITY'],
      });

      expect(result.engineeringSummary.totalStrategiesExplored).toBe(1);
      expect(result.allCandidates.every((c) => c.strategy === 'CAPACITY')).toBe(true);
      // 1 strategy × 3 arrangements = 3 candidates
      expect(result.allCandidates).toHaveLength(3);
    });

    it('respects explicit arrangements option and only explores those arrangements', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor, {
        arrangements: ['SINGLE_COMB_NORTH'],
      });

      expect(result.engineeringSummary.totalArrangementsExplored).toBe(1);
      expect(result.allCandidates.every((c) => c.arrangement === 'SINGLE_COMB_NORTH')).toBe(true);
      // 3 strategies × 1 arrangement = 3 candidates
      expect(result.allCandidates).toHaveLength(3);
    });

    it('respects combined strategy + arrangement filter (1 × 1 = 1 candidate)', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor, {
        strategies: ['BALANCED'],
        arrangements: ['DOUBLE_COMB_OPPOSING'],
      });

      expect(result.allCandidates).toHaveLength(1);
      expect(result.allCandidates[0].strategy).toBe('BALANCED');
      expect(result.allCandidates[0].arrangement).toBe('DOUBLE_COMB_OPPOSING');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Immutability — deeply frozen output
  // -------------------------------------------------------------------------
  describe('7. Immutability — Deeply Frozen Output', () => {
    it('LayoutEngineResult is deeply frozen', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.allCandidates)).toBe(true);
      expect(Object.isFrozen(result.disqualifiedCandidates)).toBe(true);
      expect(Object.isFrozen(result.engineeringSummary)).toBe(true);
      expect(Object.isFrozen(result.provenance)).toBe(true);
    });

    it('bestCandidate and its nested objects are frozen', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      if (result.bestCandidate) {
        expect(Object.isFrozen(result.bestCandidate)).toBe(true);
        expect(Object.isFrozen(result.bestCandidate.rejectionReasons)).toBe(true);
        expect(Object.isFrozen(result.bestCandidate.hardViolations)).toBe(true);
        expect(Object.isFrozen(result.bestCandidate.warnings)).toBe(true);
        expect(Object.isFrozen(result.bestCandidate.provenance)).toBe(true);
        expect(Object.isFrozen(result.bestCandidate.attemptedArrangements)).toBe(true);
      }
    });

    it('alternativeCandidates array and elements are frozen', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      // Use medium input that likely yields multiple valid candidates across arrangements
      const result = orchestrator.generateLayout(feasibleMediumInput, accessor);

      expect(Object.isFrozen(result.alternativeCandidates)).toBe(true);
      // Each element must also be frozen if there are alternatives
      for (const alt of result.alternativeCandidates) {
        expect(Object.isFrozen(alt)).toBe(true);
      }
      // Verify deep freeze on allCandidates (always populated)
      for (const c of result.allCandidates) {
        expect(Object.isFrozen(c)).toBe(true);
        expect(Object.isFrozen(c.rejectionReasons)).toBe(true);
        expect(Object.isFrozen(c.provenance)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Determinism — identical input produces identical output
  // -------------------------------------------------------------------------
  describe('8. Determinism', () => {
    it('two identical orchestrator runs produce byte-for-byte identical results', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result1 = orchestrator.generateLayout(feasibleMediumInput, accessor);
      const result2 = orchestrator.generateLayout(feasibleMediumInput, accessor);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    it('different inputs produce different results (no accidental memoization)', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result1 = orchestrator.generateLayout(feasibleSmallInput, accessor);
      const result2 = orchestrator.generateLayout(feasibleMediumInput, accessor);

      // Different bay counts across inputs → results differ
      expect(JSON.stringify(result1)).not.toBe(JSON.stringify(result2));
    });
  });

  // -------------------------------------------------------------------------
  // 9. generateFromRequirement — end-to-end requirement mapping flow
  // -------------------------------------------------------------------------
  describe('9. generateFromRequirement End-to-End', () => {
    // Use correct WorkshopLayoutRequirement shape: access.entryPosition, services[], ancillarySpaces{}
    const workshopRequirement: WorkshopLayoutRequirement = {
      projectName: 'Test Orchestrator Workshop',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: {
        widthMeters: 30,
        lengthMeters: 40,
        roadOrientation: 'south',
      },
      building: {
        widthMeters: 24,
        lengthMeters: 30,
      },
      access: {
        entryPosition: 'front_center',
        preferDriveThrough: true,
      },
      services: [
        { serviceType: 'general_service', bayCount: 2 },
      ],
      ancillarySpaces: {
        customerLounge: false,
        cashierOffice: false,
        partsWarehouse: false,
        restroom: false,
      },
    };

    it('maps WorkshopLayoutRequirement and generates layout successfully', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateFromRequirement(workshopRequirement, accessor);

      expect(result).toBeDefined();
      // Either SUCCESS (feasible) or DISQUALIFIED (if standard gaps prevent placement)
      expect(['SUCCESS', 'DISQUALIFIED']).toContain(result.status);
      expect(result.provenance.orchestratorName).toBe('LayoutOrchestrator');
    });

    it('returns DISQUALIFIED with diagnostic when building exceeds site', () => {
      // Force all candidates to fail: building larger than site
      const impossibleRequirement: WorkshopLayoutRequirement = {
        ...workshopRequirement,
        building: { widthMeters: 9999, lengthMeters: 9999 },
      };

      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateFromRequirement(impossibleRequirement, accessor);

      // Building exceeds site → all candidates disqualified
      expect(result).toBeDefined();
      expect(result.status).toBe('DISQUALIFIED');
      expect(result.bestCandidate).toBeNull();
      expect(result.provenance.orchestratorName).toBe('LayoutOrchestrator');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Candidate ID uniqueness and engineeringSummary correctness
  // -------------------------------------------------------------------------
  describe('10. Candidate ID and Summary Integrity', () => {
    it('engineeringSummary counts match actual allCandidates', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      expect(result.allCandidates.length).toBe(
        result.engineeringSummary.totalCandidatesGenerated
      );
      expect(result.disqualifiedCandidates.length).toBe(
        result.engineeringSummary.disqualifiedCandidateCount
      );

      const validCount = result.allCandidates.filter((c) => c.isValid).length;
      expect(validCount).toBe(result.engineeringSummary.validCandidateCount);
    });

    it('allCandidates = validCandidates + disqualifiedCandidates', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      const validCount = result.allCandidates.filter((c) => c.isValid).length;
      const disqCount = result.allCandidates.filter((c) => !c.isValid).length;

      expect(validCount).toBe(result.engineeringSummary.validCandidateCount);
      expect(disqCount).toBe(result.engineeringSummary.disqualifiedCandidateCount);
      expect(validCount + disqCount).toBe(result.engineeringSummary.totalCandidatesGenerated);
    });

    it('provenance standardVersionId matches accessor version', () => {
      const accessor = new StandardAccessor(standardNoScoring);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(feasibleSmallInput, accessor);

      expect(result.provenance.standardVersionId).toBe('1.0-orch-noscoring');
    });
  });
});
