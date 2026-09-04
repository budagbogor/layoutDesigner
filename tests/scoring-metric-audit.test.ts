// ---------------------------------------------------------------------------
// FASE 4.2D — Scoring Metric Audit Resolution & Regression Tests
//
// These tests verify that the audit findings from FASE 4.2A are now enforced:
// 1. capacity and bay_count are blocked from quality scoring (HARD constraints)
// 2. vehicle_flow is deprecated in favor of flow_continuity & maneuvers
// 3. bottlenecks and aisle_congestion are blocked as SCORING_GAP
// 4. flow_continuity distinguishes drive-through from back-out
// 5. equipment_count evaluates actual equipment placed
// 6. equipment_support evaluates explicit bay-equipment matching
// 7. capacity_throughput evaluates floor area per bay (not bay count)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ConcreteStrategyEvaluator, UnsupportedScoringCriterionError } from '@/domain/engine/evaluation/strategyEvaluator';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { StrategyCandidate } from '@/domain/engine/strategies/strategyTypes';

function makeBay(id: string, x: number, y: number, serviceType: string = 'general_service'): import('@/domain/models/project').LayoutObject {
  return {
    id,
    type: 'service_bay',
    layer: '08-SERVICE-BAY',
    geometry: { x, y, width: 4, length: 7, rotation: 0 },
    metadata: { serviceType },
  };
}

function makeEquipment(id: string, associatedBayId?: string, serviceType?: string): import('@/domain/models/project').LayoutObject {
  return {
    id,
    type: 'equipment',
    layer: '06-EQUIPMENT',
    geometry: { x: 0, y: 0, width: 2, length: 2, rotation: 0 },
    metadata: {
      ...(associatedBayId ? { associatedBayId } : {}),
      ...(serviceType ? { serviceType } : {}),
    },
  };
}

function makeCandidate(overrides: {
  bayCount?: number;
  equipmentCount?: number;
  rejectionCount?: number;
  rejectionsSeverity?: 'HARD' | 'WARNING';
  arrangement?: 'SINGLE_COMB_NORTH' | 'DOUBLE_COMB_OPPOSING' | 'ZONED_BY_SERVICE';
  circulationRequirement?: 'drive_through' | 'back_out_turnaround' | 'one_way_loop';
  withEquipmentAssociation?: boolean;
}): StrategyCandidate {
  const {
    bayCount = 4,
    equipmentCount = 0,
    rejectionCount = 0,
    rejectionsSeverity = 'WARNING',
    arrangement = 'SINGLE_COMB_NORTH',
    circulationRequirement = 'back_out_turnaround',
    withEquipmentAssociation = false,
  } = overrides;

  const bays = Array.from({ length: bayCount }, (_, i) => makeBay(`bay-${i + 1}`, i * 4.5, 10));
  const equipment = Array.from({ length: equipmentCount }, (_, i) =>
    makeEquipment(
      `equip-${i + 1}`,
      withEquipmentAssociation && i < bayCount ? `bay-${i + 1}` : undefined
    )
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
    envelopes: Object.freeze([
      {
        id: 'env-aisle',
        type: 'ACCESS',
        sourceObjectId: 'aisle-main',
        geometry: { x: 0, y: 0, width: 20, length: 6, rotation: 0 },
        derivedFromStandard: { parameterKey: 'circulation.drive_aisle.min_width', appliedValue: 6.0, unit: 'meter' },
        purpose: 'Main Aisle',
        violationSemantics: { forbiddenOverlapTypes: ['PHYSICAL'], severityOnOverlap: 'WARNING', allowOverlapWithParent: true },
      },
    ]),
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
      arrangement,
      circulationRequirement,
      buildingInterior: Object.freeze({
        grossWidth: 20,
        grossLength: 30,
        grossArea: 600,
        wallThickness: 0.25,
        interiorWidth: 19.5,
        interiorLength: 29.5,
        interiorArea: 575.25,
        provenance: Object.freeze({
          source: 'building_envelope',
          wallThicknessParameterKey: 'building.wall_thickness',
          formula: '(grossWidth - 2*wallThickness) * (grossLength - 2*wallThickness)',
        }),
      }),
      provenance: Object.freeze({
        source: 'generator' as const,
        generatorName: 'TestGenerator',
        inputProgramField: 'circulationRequirement' as const,
      }),
    }),
  };
}

function makeScoringStandard(
  key: string,
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER',
  benchmarkMin: number,
  benchmarkTarget: number,
  weight: number = 100
): WorkshopStandard {
  const dirValue = direction === 'HIGHER_IS_BETTER' ? 1 : -1;
  return {
    id: `std-scoring-${key}`,
    name: `Scoring standard for ${key}`,
    version: '1.0',
    status: 'published',
    parameters: [
      { key: 'building.wall_thickness', value: 0.25, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: `scoring.${key}.direction`, value: dirValue, unit: 'dir', constraint_level: 'OPTIMIZATION' },
      { key: `scoring.${key}.benchmark_min`, value: benchmarkMin, unit: 'unit', constraint_level: 'OPTIMIZATION' },
      { key: `scoring.${key}.benchmark_target`, value: benchmarkTarget, unit: 'unit', constraint_level: 'OPTIMIZATION' },
    ],
    rules: [],
    scoring: [{ key, weight }],
  };
}

const evaluator = new ConcreteStrategyEvaluator();

describe('FASE 4.2D — Scoring Metric Audit Resolution & Regression Tests', () => {

  // -------------------------------------------------------------------------
  // GROUP 1: capacity / bay_count / capacity_throughput Resolution
  // -------------------------------------------------------------------------
  describe('Group 1: capacity / bay_count / capacity_throughput Resolution', () => {

    it('[AUDIT-001] capacity and bay_count are blocked as HARD constraints', () => {
      const candidate = makeCandidate({ bayCount: 5 });

      const capacityStd = makeScoringStandard('capacity', 'HIGHER_IS_BETTER', 0, 10);
      expect(() => evaluator.evaluate(candidate, new StandardAccessor(capacityStd))).toThrow(
        UnsupportedScoringCriterionError
      );

      const bayCountStd = makeScoringStandard('bay_count', 'HIGHER_IS_BETTER', 0, 10);
      expect(() => evaluator.evaluate(candidate, new StandardAccessor(bayCountStd))).toThrow(
        UnsupportedScoringCriterionError
      );
    });

    it('[AUDIT-002] capacity_throughput evaluates floor area per bay (not bay count proxy)', () => {
      const candidate4Bays = makeCandidate({ bayCount: 4 });
      const candidate8Bays = makeCandidate({ bayCount: 8 });

      const throughputStd = makeScoringStandard('capacity_throughput', 'HIGHER_IS_BETTER', 20, 100);
      const accessor = new StandardAccessor(throughputStd);

      const res4 = evaluator.evaluate(candidate4Bays, accessor);
      const res8 = evaluator.evaluate(candidate8Bays, accessor);

      // Usable area / 4 bays > Usable area / 8 bays
      expect(res4.criteria[0].rawValue).toBeGreaterThan(res8.criteria[0].rawValue);
      expect(res4.totalScore).toBeGreaterThan(res8.totalScore);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 2: vehicle_flow / flow_continuity / maneuvers Resolution
  // -------------------------------------------------------------------------
  describe('Group 2: vehicle_flow / flow_continuity / maneuvers Resolution', () => {

    it('[AUDIT-003] vehicle_flow is blocked as a deprecated proxy', () => {
      const candidate = makeCandidate({ bayCount: 4 });
      const flowStd = makeScoringStandard('vehicle_flow', 'HIGHER_IS_BETTER', 0, 10);

      expect(() => evaluator.evaluate(candidate, new StandardAccessor(flowStd))).toThrow(
        UnsupportedScoringCriterionError
      );
    });

    it('[AUDIT-004] flow_continuity correctly distinguishes drive-through from back-out circulation', () => {
      const driveThrough = makeCandidate({ bayCount: 4, circulationRequirement: 'drive_through' });
      const backOut = makeCandidate({ bayCount: 4, circulationRequirement: 'back_out_turnaround' });

      const continuityStd = makeScoringStandard('flow_continuity', 'HIGHER_IS_BETTER', 0.0, 1.0);
      const accessor = new StandardAccessor(continuityStd);

      const dtScore = evaluator.evaluate(driveThrough, accessor).criteria[0].rawValue;
      const boScore = evaluator.evaluate(backOut, accessor).criteria[0].rawValue;

      // PROOF: drive_through (1.0) scores higher than back_out (0.25)
      expect(dtScore).toBe(1.0);
      expect(boScore).toBe(0.25);
      expect(dtScore).toBeGreaterThan(boScore);
    });

    it('[AUDIT-005] maneuvers metric distinguishes DOUBLE_COMB from SINGLE_COMB under drive_through', () => {
      const doubleComb = makeCandidate({ arrangement: 'DOUBLE_COMB_OPPOSING', circulationRequirement: 'drive_through' });
      const singleComb = makeCandidate({ arrangement: 'SINGLE_COMB_NORTH', circulationRequirement: 'drive_through' });

      const maneuversStd = makeScoringStandard('maneuvers', 'LOWER_IS_BETTER', 2.0, 0.0);
      const accessor = new StandardAccessor(maneuversStd);

      const doubleManeuvers = evaluator.evaluate(doubleComb, accessor).criteria[0].rawValue;
      const singleManeuvers = evaluator.evaluate(singleComb, accessor).criteria[0].rawValue;

      // DOUBLE_COMB drive_through = 0 maneuvers; SINGLE_COMB drive_through = 0.5 maneuvers
      expect(doubleManeuvers).toBe(0.0);
      expect(singleManeuvers).toBe(0.5);
      expect(doubleManeuvers).toBeLessThan(singleManeuvers);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 3: bottlenecks / aisle_congestion Resolution
  // -------------------------------------------------------------------------
  describe('Group 3: bottlenecks / aisle_congestion SCORING_GAP Blocking', () => {

    it('[AUDIT-006] bottlenecks and aisle_congestion are blocked as SCORING_GAP', () => {
      const candidate = makeCandidate({ rejectionCount: 0 });

      const bottlenecksStd = makeScoringStandard('bottlenecks', 'LOWER_IS_BETTER', 5, 0);
      expect(() => evaluator.evaluate(candidate, new StandardAccessor(bottlenecksStd))).toThrow(
        UnsupportedScoringCriterionError
      );

      const congestionStd = makeScoringStandard('aisle_congestion', 'LOWER_IS_BETTER', 5, 0);
      expect(() => evaluator.evaluate(candidate, new StandardAccessor(congestionStd))).toThrow(
        UnsupportedScoringCriterionError
      );
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 4: Equipment metrics Resolution
  // -------------------------------------------------------------------------
  describe('Group 4: equipment_count & equipment_support Resolution', () => {

    it('[AUDIT-007] equipment_count evaluates actual equipment units placed', () => {
      const candidate = makeCandidate({ equipmentCount: 3, withEquipmentAssociation: true });

      const countStd = makeScoringStandard('equipment_count', 'HIGHER_IS_BETTER', 0, 5);
      const countRaw = evaluator.evaluate(candidate, new StandardAccessor(countStd)).criteria[0].rawValue;

      expect(countRaw).toBe(3);
    });

    it('[AUDIT-008] equipment_support evaluates explicit bay matching ratio', () => {
      // 4 bays, 2 equipment items explicitly associated to bay-1 and bay-2
      const candidate = makeCandidate({ bayCount: 4, equipmentCount: 2, withEquipmentAssociation: true });

      const supportStd = makeScoringStandard('equipment_support', 'HIGHER_IS_BETTER', 0.0, 1.0);
      const supportRaw = evaluator.evaluate(candidate, new StandardAccessor(supportStd)).criteria[0].rawValue;

      // 2 supported out of 4 bays = 0.5
      expect(supportRaw).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 5: UnsupportedScoringCriterionError
  // -------------------------------------------------------------------------
  describe('Group 5: UnsupportedScoringCriterionError Enforcement', () => {

    it('[AUDIT-009] Throws UnsupportedScoringCriterionError for unknown criterion key', () => {
      const candidate = makeCandidate({ bayCount: 3 });
      const std = makeScoringStandard('customer_experience_score', 'HIGHER_IS_BETTER', 0, 100);
      const accessor = new StandardAccessor(std);

      expect(() => evaluator.evaluate(candidate, accessor)).toThrow(UnsupportedScoringCriterionError);
    });
  });

  // -------------------------------------------------------------------------
  // GROUP 6: StandardAccessor No-Fallback Contract
  // -------------------------------------------------------------------------
  describe('Group 6: StandardAccessor No-Fallback Contract', () => {

    it('[AUDIT-010] getScoringCriteria() throws MissingStandardParameterError when benchmark_min is missing', () => {
      const partialStandard: WorkshopStandard = {
        id: 'std-partial',
        name: 'Partial Standard',
        version: '1.0-partial',
        status: 'published',
        parameters: [
          { key: 'scoring.flow_continuity.benchmark_target', value: 1.0, unit: 'score', constraint_level: 'OPTIMIZATION' },
        ],
        rules: [],
        scoring: [{ key: 'flow_continuity', weight: 100 }],
      };

      const accessor = new StandardAccessor(partialStandard);
      expect(() => accessor.getScoringCriteria()).toThrow(MissingStandardParameterError);
    });

    it('[AUDIT-011] getScoringCriteria() throws MissingStandardParameterError when benchmark_target is missing', () => {
      const partialStandard: WorkshopStandard = {
        id: 'std-partial-target',
        name: 'Partial Standard No Target',
        version: '1.0-no-target',
        status: 'published',
        parameters: [
          { key: 'scoring.flow_continuity.benchmark_min', value: 0.0, unit: 'score', constraint_level: 'OPTIMIZATION' },
        ],
        rules: [],
        scoring: [{ key: 'flow_continuity', weight: 100 }],
      };

      const accessor = new StandardAccessor(partialStandard);
      expect(() => accessor.getScoringCriteria()).toThrow(MissingStandardParameterError);
    });
  });
});
