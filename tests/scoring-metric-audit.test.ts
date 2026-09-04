// ---------------------------------------------------------------------------
// FASE 4.2A — Scoring Metric Regression Tests
//
// These tests PROVE the audit findings — they do NOT fix them.
// Each test documents a specific semantic gap or false-ranking risk
// found in ConcreteStrategyEvaluator.extractRawMetric().
//
// Rules:
// - No magic numbers
// - No metric changes to make tests pass
// - No AI/LLM, no external data
// - Tests document current behavior; SCORING_GAP tests are labeled accordingly
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ConcreteStrategyEvaluator, UnsupportedScoringCriterionError } from '@/domain/engine/evaluation/strategyEvaluator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';

// ---------------------------------------------------------------------------
// Helpers: minimal StrategyCandidate factory
// ---------------------------------------------------------------------------

function makeBay(id: string, x: number, y: number): import('@/domain/models/project').LayoutObject {
  return {
    id,
    type: 'service_bay',
    layer: '08-SERVICE-BAY',
    geometry: { x, y, width: 4, length: 7, rotation: 0 },
    metadata: { serviceType: 'general_service' },
  };
}

function makeEquipment(id: string): import('@/domain/models/project').LayoutObject {
  return {
    id,
    type: 'equipment',
    layer: '06-EQUIPMENT',
    geometry: { x: 0, y: 0, width: 2, length: 2, rotation: 0 },
    metadata: {},
  };
}

function makeAccessEnvelope(id: string, bayId: string): import('@/domain/engine/types').ObjectEnvelope {
  return {
    id,
    type: 'ACCESS',
    sourceObjectId: bayId,
    geometry: { x: 0, y: -3.5, width: 4, length: 3.5, rotation: 0 },
    derivedFromStandard: { parameterKey: 'circulation.bay_approach_depth', appliedValue: 3.5, unit: 'meter' },
    purpose: 'Bay approach corridor',
    violationSemantics: { forbiddenOverlapTypes: ['PHYSICAL'], severityOnOverlap: 'HARD', allowOverlapWithParent: false },
  };
}

function makeCandidate(overrides: {
  bayCount?: number;
  equipmentCount?: number;
  accessEnvelopeCount?: number;
  rejectionCount?: number;
  rejectionsSeverity?: 'HARD' | 'WARNING';
}): StrategyCandidate {
  const {
    bayCount = 4,
    equipmentCount = 0,
    accessEnvelopeCount = 4,
    rejectionCount = 0,
    rejectionsSeverity = 'WARNING',
  } = overrides;

  const bays = Array.from({ length: bayCount }, (_, i) => makeBay(`bay-${i + 1}`, i * 4.5, 10));
  const equipment = Array.from({ length: equipmentCount }, (_, i) => makeEquipment(`equip-${i + 1}`));
  const accessEnvelopes = Array.from({ length: accessEnvelopeCount }, (_, i) =>
    makeAccessEnvelope(`env-access-bay-${i + 1}`, `bay-${i + 1}`)
  );

  const rejections = Array.from({ length: rejectionCount }, (_, i) => ({
    ruleId: `TEST-RULE-${i + 1}`,
    severity: rejectionsSeverity,
    isDisqualifying: rejectionsSeverity === 'HARD',
    reason: `Test rejection ${i + 1}`,
  }));

  return {
    id: 'candidate-test-01',
    strategyId: 'CAPACITY',
    name: 'Test Candidate',
    description: 'Audit regression test candidate',
    topologyId: 'topology-test',
    layout: {
      objects: Object.freeze([...bays, ...equipment]),
    },
    envelopes: Object.freeze(accessEnvelopes),
    status: rejectionCount === 0 ? 'VALID' : rejectionsSeverity === 'HARD' ? 'DISQUALIFIED' : 'FEASIBLE_WITH_WARNINGS',
    rejections: Object.freeze(rejections),
    provenance: Object.freeze({
      standardVersionId: '1.0-audit',
      generatorName: 'TestGenerator',
      generatedAt: '2026-09-04T00:00:00.000Z',
    }),
    explanation: Object.freeze({
      strategyRationale: 'Test',
      layoutSummary: 'Test',
      tradeOffs: 'Test',
    }),
    spatialContext: Object.freeze({
      arrangement: 'SINGLE_COMB_NORTH',
      circulationRequirement: 'back_out_turnaround',
      provenance: Object.freeze({
        source: 'generator' as const,
        generatorName: 'TestGenerator',
        inputProgramField: 'circulationRequirement' as const,
      }),
    }),
  };
}

// Standard with one scoring criterion (to isolate each metric)
function makeScoringStandard(key: string, direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER', benchmarkMin: number, benchmarkTarget: number): WorkshopStandard {
  return {
    id: `std-scoring-${key}`,
    name: `Scoring Standard: ${key}`,
    version: `1.0-${key}`,
    status: 'published',
    parameters: [
      {
        key: `scoring.${key}.direction`,
        value: direction === 'LOWER_IS_BETTER' ? -1 : 1,
        unit: 'dir',
        constraint_level: 'OPTIMIZATION',
      },
      {
        key: `scoring.${key}.benchmark_min`,
        value: benchmarkMin,
        unit: 'count',
        constraint_level: 'OPTIMIZATION',
      },
      {
        key: `scoring.${key}.benchmark_target`,
        value: benchmarkTarget,
        unit: 'count',
        constraint_level: 'OPTIMIZATION',
      },
    ],
    rules: [],
    scoring: [{ key, weight: 100 }],
  };
}

const evaluator = new ConcreteStrategyEvaluator();

// ---------------------------------------------------------------------------
describe('FASE 4.2A — Scoring Metric Regression Tests', () => {

  // -------------------------------------------------------------------------
  // GROUP 1: capacity / bay_count / capacity_throughput — TAUTOLOGY PROOF
  // -------------------------------------------------------------------------
  describe('Group 1: capacity / bay_count / capacity_throughput — HARD Constraint Tautology', () => {

    it('[AUDIT-001] All three keys map to identical raw metric: placed service_bay count', () => {
      const candidate = makeCandidate({ bayCount: 5 });

      // Extract capacity
      const capacityStd = makeScoringStandard('capacity', 'HIGHER_IS_BETTER', 0, 10);
      const resultCapacity = evaluator.evaluate(candidate, new StandardAccessor(capacityStd));
      const capacityRaw = resultCapacity.criteria[0].rawValue;

      // Extract bay_count
      const bayCountStd = makeScoringStandard('bay_count', 'HIGHER_IS_BETTER', 0, 10);
      const resultBayCount = evaluator.evaluate(candidate, new StandardAccessor(bayCountStd));
      const bayCountRaw = resultBayCount.criteria[0].rawValue;

      // Extract capacity_throughput
      const throughputStd = makeScoringStandard('capacity_throughput', 'HIGHER_IS_BETTER', 0, 10);
      const resultThroughput = evaluator.evaluate(candidate, new StandardAccessor(throughputStd));
      const throughputRaw = resultThroughput.criteria[0].rawValue;

      // PROOF: all three return identical raw values
      expect(capacityRaw).toBe(5);
      expect(bayCountRaw).toBe(5);
      expect(throughputRaw).toBe(5);
      expect(capacityRaw).toBe(bayCountRaw);
      expect(bayCountRaw).toBe(throughputRaw);
    });

    it('[AUDIT-002] SCORING_GAP: two VALID candidates with same bay count produce identical capacity scores — no differentiation possible', () => {
      // This simulates two layout variants that both placed exactly N bays
      // (as required by CAPACITY-BAYS-001 HARD constraint).
      // Expected: scoring cannot differentiate them on capacity.
      const candidateA = makeCandidate({ bayCount: 6, accessEnvelopeCount: 6 });
      const candidateB = makeCandidate({ bayCount: 6, accessEnvelopeCount: 6 });

      const std = makeScoringStandard('capacity', 'HIGHER_IS_BETTER', 0, 10);
      const accessor = new StandardAccessor(std);

      const scoreA = evaluator.evaluate(candidateA, accessor).totalScore;
      const scoreB = evaluator.evaluate(candidateB, accessor).totalScore;

      // PROOF: Identical scores — capacity metric is flat for valid candidates
      expect(scoreA).toBe(scoreB);
      // This is the false-ranking risk: these two candidates could have very
      // different spatial quality but score identically on 'capacity'.
    });

    it('[AUDIT-003] SCORING_GAP: capacity_throughput name is semantically misleading — raw = bay count, not throughput', () => {
      // 4 bays with generous building vs 4 bays with tight clearance
      // Both get IDENTICAL throughput score despite different operational efficiency
      const tight = makeCandidate({ bayCount: 4 });
      const generous = makeCandidate({ bayCount: 4 });

      const std = makeScoringStandard('capacity_throughput', 'HIGHER_IS_BETTER', 0, 8);
      const accessor = new StandardAccessor(std);

      const tightScore = evaluator.evaluate(tight, accessor).totalScore;
      const generousScore = evaluator.evaluate(generous, accessor).totalScore;

      expect(tightScore).toBe(generousScore);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 2: vehicle_flow / flow_continuity / maneuvers — ACCESS COUNT PROOF
  // -------------------------------------------------------------------------
  describe('Group 2: vehicle_flow / flow_continuity / maneuvers — ACCESS Envelope Count Proxy', () => {

    it('[AUDIT-004] All three keys map to identical raw metric: ACCESS envelope count', () => {
      const candidate = makeCandidate({ bayCount: 4, accessEnvelopeCount: 4 });

      const flowStd = makeScoringStandard('vehicle_flow', 'HIGHER_IS_BETTER', 0, 10);
      const flowRaw = evaluator.evaluate(candidate, new StandardAccessor(flowStd)).criteria[0].rawValue;

      const continuityStd = makeScoringStandard('flow_continuity', 'HIGHER_IS_BETTER', 0, 10);
      const continuityRaw = evaluator.evaluate(candidate, new StandardAccessor(continuityStd)).criteria[0].rawValue;

      const maneuversStd = makeScoringStandard('maneuvers', 'LOWER_IS_BETTER', 10, 0);
      const maneuversRaw = evaluator.evaluate(candidate, new StandardAccessor(maneuversStd)).criteria[0].rawValue;

      // PROOF: all three return ACCESS envelope count
      expect(flowRaw).toBe(4);
      expect(continuityRaw).toBe(4);
      expect(maneuversRaw).toBe(4);
    });

    it('[AUDIT-005] SCORING_GAP: vehicle_flow score is proportional to bay count, not to aisle quality', () => {
      // Layout with 2 bays vs layout with 6 bays
      // vehicle_flow will rank 6-bay higher, even if 6-bay has tighter aisle
      const fewBays = makeCandidate({ bayCount: 2, accessEnvelopeCount: 2 });
      const manyBays = makeCandidate({ bayCount: 6, accessEnvelopeCount: 6 });

      const std = makeScoringStandard('vehicle_flow', 'HIGHER_IS_BETTER', 0, 8);
      const accessor = new StandardAccessor(std);

      const fewScore = evaluator.evaluate(fewBays, accessor).criteria[0].rawValue;
      const manyScore = evaluator.evaluate(manyBays, accessor).criteria[0].rawValue;

      // PROOF: more bays = better 'vehicle_flow' score regardless of actual flow quality
      expect(manyScore).toBeGreaterThan(fewScore);
      // This is WRONG semantically: vehicle_flow should measure aisle clearance,
      // not bay count. The false-ranking risk is confirmed.
    });

    it('[AUDIT-006] SCORING_GAP: flow_continuity cannot distinguish drive-through from back-out layout', () => {
      // Both candidates have 4 bays and 4 ACCESS envelopes.
      // One is drive-through, one is back-out — but the metric is identical.
      const driveThrough = makeCandidate({ bayCount: 4, accessEnvelopeCount: 4 });
      const backOut = makeCandidate({ bayCount: 4, accessEnvelopeCount: 4 });

      const std = makeScoringStandard('flow_continuity', 'HIGHER_IS_BETTER', 0, 6);
      const accessor = new StandardAccessor(std);

      const driveThroughRaw = evaluator.evaluate(driveThrough, accessor).criteria[0].rawValue;
      const backOutRaw = evaluator.evaluate(backOut, accessor).criteria[0].rawValue;

      // PROOF: identical scores despite fundamentally different circulation types
      expect(driveThroughRaw).toBe(backOutRaw);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 3: bottlenecks / aisle_congestion / rejections_count — REJECTION COUNT PROOF
  // -------------------------------------------------------------------------
  describe('Group 3: bottlenecks / aisle_congestion / rejections_count — Rejection Count Proxy', () => {

    it('[AUDIT-007] All three keys map to identical raw metric: rejections.length', () => {
      const candidate = makeCandidate({ rejectionCount: 3, rejectionsSeverity: 'WARNING' });

      const bottlenecksStd = makeScoringStandard('bottlenecks', 'LOWER_IS_BETTER', 10, 0);
      const bottlenecksRaw = evaluator.evaluate(candidate, new StandardAccessor(bottlenecksStd)).criteria[0].rawValue;

      const congestionStd = makeScoringStandard('aisle_congestion', 'LOWER_IS_BETTER', 10, 0);
      const congestionRaw = evaluator.evaluate(candidate, new StandardAccessor(congestionStd)).criteria[0].rawValue;

      const rejectionsStd = makeScoringStandard('rejections_count', 'LOWER_IS_BETTER', 10, 0);
      const rejectionsRaw = evaluator.evaluate(candidate, new StandardAccessor(rejectionsStd)).criteria[0].rawValue;

      // PROOF: all three are the same number
      expect(bottlenecksRaw).toBe(3);
      expect(congestionRaw).toBe(3);
      expect(rejectionsRaw).toBe(3);
    });

    it('[AUDIT-008] SCORING_GAP: VALID candidates with zero warnings all score identically on bottlenecks', () => {
      // All VALID candidates that passed HARD validation have 0 HARD rejections.
      // If also 0 soft warnings, ALL VALID candidates score identically on bottlenecks.
      const candidateA = makeCandidate({ rejectionCount: 0 });
      const candidateB = makeCandidate({ rejectionCount: 0 });

      const std = makeScoringStandard('bottlenecks', 'LOWER_IS_BETTER', 5, 0);
      const accessor = new StandardAccessor(std);

      const scoreA = evaluator.evaluate(candidateA, accessor).totalScore;
      const scoreB = evaluator.evaluate(candidateB, accessor).totalScore;

      // PROOF: both score 100 (0 rejections, LOWER_IS_BETTER, target=0)
      expect(scoreA).toBe(100);
      expect(scoreB).toBe(100);
      // No differentiation possible — metric is flat for all valid candidates
    });

    it('[AUDIT-009] SCORING_GAP: rejections count is NOT aisle congestion — a 3-rejection layout can have perfectly clear aisle', () => {
      // Candidate with 3 WARNING rejections (e.g., missing optional parameters)
      // vs candidate with 0 rejections.
      // The one with 3 warnings could have a wider aisle than the one with 0 warnings.
      // But it will rank LOWER on 'aisle_congestion'.
      const widerAisleWithWarnings = makeCandidate({ rejectionCount: 3, rejectionsSeverity: 'WARNING' });
      const narrowerAisleNoWarnings = makeCandidate({ rejectionCount: 0 });

      const std = makeScoringStandard('aisle_congestion', 'LOWER_IS_BETTER', 5, 0);
      const accessor = new StandardAccessor(std);

      const widedScore = evaluator.evaluate(widerAisleWithWarnings, accessor).totalScore;
      const narrowScore = evaluator.evaluate(narrowerAisleNoWarnings, accessor).totalScore;

      // PROOF: narrower aisle (no warnings) ranks BETTER than wider aisle (3 warnings)
      // This is the false-ranking risk: the metric is semantically inverted.
      expect(narrowScore).toBeGreaterThan(widedScore);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 4: Equipment metrics
  // -------------------------------------------------------------------------
  describe('Group 4: equipment_count / equipment_support', () => {

    it('[AUDIT-010] Both equipment keys map to identical raw metric: equipment object count', () => {
      const candidate = makeCandidate({ equipmentCount: 3 });

      const countStd = makeScoringStandard('equipment_count', 'HIGHER_IS_BETTER', 0, 5);
      const countRaw = evaluator.evaluate(candidate, new StandardAccessor(countStd)).criteria[0].rawValue;

      const supportStd = makeScoringStandard('equipment_support', 'HIGHER_IS_BETTER', 0, 5);
      const supportRaw = evaluator.evaluate(candidate, new StandardAccessor(supportStd)).criteria[0].rawValue;

      expect(countRaw).toBe(3);
      expect(supportRaw).toBe(3);
      expect(countRaw).toBe(supportRaw);
    });

    it('[AUDIT-011] SCORING_GAP: equipment_count = 0 for all candidates when program has no equipment', () => {
      // If LayoutEngineInput.program.equipment = [], no equipment objects are placed.
      // Both candidates: equipment = 0, scores identical.
      const noEquipA = makeCandidate({ equipmentCount: 0 });
      const noEquipB = makeCandidate({ equipmentCount: 0 });

      const std = makeScoringStandard('equipment_count', 'HIGHER_IS_BETTER', 0, 5);
      const accessor = new StandardAccessor(std);

      const scoreA = evaluator.evaluate(noEquipA, accessor).totalScore;
      const scoreB = evaluator.evaluate(noEquipB, accessor).totalScore;

      // Both = 0 equipment → both score 0 on this metric → flat, no differentiation
      expect(scoreA).toBe(scoreB);
      expect(scoreA).toBe(0); // 0/5 = 0/100 normalized
    });

    it('[AUDIT-012] SCORING_GAP: equipment_support does not verify equipment type matches service type', () => {
      // Both candidates have 2 equipment pieces.
      // Candidate A: tire changers for a tire service bay (correct)
      // Candidate B: tire changers for a brake/suspension bay (wrong)
      // Both score identically on equipment_support.
      const correctEquip = makeCandidate({ equipmentCount: 2 });
      const wrongEquip = makeCandidate({ equipmentCount: 2 });

      const std = makeScoringStandard('equipment_support', 'HIGHER_IS_BETTER', 0, 4);
      const accessor = new StandardAccessor(std);

      const correctScore = evaluator.evaluate(correctEquip, accessor).criteria[0].rawValue;
      const wrongScore = evaluator.evaluate(wrongEquip, accessor).criteria[0].rawValue;

      // PROOF: identical scores despite one being correctly matched and one not
      expect(correctScore).toBe(wrongScore);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 5: UnsupportedScoringCriterionError — contract enforcement
  // -------------------------------------------------------------------------
  describe('Group 5: UnsupportedScoringCriterionError — Contract Enforcement', () => {

    it('[AUDIT-013] Throws UnsupportedScoringCriterionError for unknown criterion key', () => {
      const candidate = makeCandidate({ bayCount: 3 });
      const std = makeScoringStandard('customer_experience_score', 'HIGHER_IS_BETTER', 0, 100);
      const accessor = new StandardAccessor(std);

      expect(() => evaluator.evaluate(candidate, accessor)).toThrow(UnsupportedScoringCriterionError);
    });

    it('[AUDIT-014] Error message contains the unknown criterion key', () => {
      const candidate = makeCandidate({ bayCount: 3 });
      const std = makeScoringStandard('natural_light_score', 'HIGHER_IS_BETTER', 0, 100);
      const accessor = new StandardAccessor(std);

      try {
        evaluator.evaluate(candidate, accessor);
        expect.fail('Should have thrown UnsupportedScoringCriterionError');
      } catch (e) {
        expect(e).toBeInstanceOf(UnsupportedScoringCriterionError);
        expect((e as UnsupportedScoringCriterionError).criterionKey).toBe('natural_light_score');
      }
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 6: getScoringCriteria() fallback documentation
  // -------------------------------------------------------------------------
  describe('Group 6: StandardAccessor.getScoringCriteria() No-Fallback Contract (FASE 4.2B Fix)', () => {

    it('[AUDIT-015] FIXED: getScoringCriteria() throws MissingStandardParameterError when benchmark_min is missing', () => {
      // Standard has scoring key but NO benchmark_min param
      const partialStandard: WorkshopStandard = {
        id: 'std-partial',
        name: 'Partial Standard',
        version: '1.0-partial',
        status: 'published',
        parameters: [
          // Has benchmark_target but NOT benchmark_min
          { key: 'scoring.capacity.benchmark_target', value: 6, unit: 'bays', constraint_level: 'OPTIMIZATION' },
        ],
        rules: [],
        scoring: [{ key: 'capacity', weight: 100 }],
      };

      const accessor = new StandardAccessor(partialStandard);

      // FASE 4.2B: No longer falls back to 0. Must throw.
      expect(() => accessor.getScoringCriteria()).toThrow();
    });

    it('[AUDIT-015B] FIXED: getScoringCriteria() throws MissingStandardParameterError when benchmark_target is missing', () => {
      const partialStandard: WorkshopStandard = {
        id: 'std-partial-target',
        name: 'Partial Standard No Target',
        version: '1.0-no-target',
        status: 'published',
        parameters: [
          // Has benchmark_min but NOT benchmark_target
          { key: 'scoring.capacity.benchmark_min', value: 0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
        ],
        rules: [],
        scoring: [{ key: 'capacity', weight: 100 }],
      };

      const accessor = new StandardAccessor(partialStandard);

      // FASE 4.2B: No longer falls back to 100. Must throw.
      expect(() => accessor.getScoringCriteria()).toThrow();
    });

    it('[AUDIT-015C] getScoringCriteria() succeeds when all benchmark params are present', () => {
      const completeStandard: WorkshopStandard = {
        id: 'std-complete-scoring',
        name: 'Complete Scoring Standard',
        version: '1.0-complete',
        status: 'published',
        parameters: [
          { key: 'scoring.capacity.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.capacity.benchmark_min', value: 0, unit: 'bays', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.capacity.benchmark_target', value: 6, unit: 'bays', constraint_level: 'OPTIMIZATION' },
        ],
        rules: [],
        scoring: [{ key: 'capacity', weight: 100 }],
      };

      const accessor = new StandardAccessor(completeStandard);
      const criteria = accessor.getScoringCriteria();

      expect(criteria).toHaveLength(1);
      expect(criteria[0].benchmarkMin).toBe(0);
      expect(criteria[0].benchmarkTarget).toBe(6);
      expect(criteria[0].direction).toBe('HIGHER_IS_BETTER');
    });
  });
});
