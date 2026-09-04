// ---------------------------------------------------------------------------
// FASE 4.2B — Scoring Metric Contract Tests
//
// Tests verify:
//   1. Catalog structure integrity (all 11 metric keys present)
//   2. Classification correctness (capacity = HARD, etc.)
//   3. Layer separation (rawMetric, normalization, userExplanation)
//   4. Metric direction contracts
//   5. Missing benchmark → MissingStandardParameterError (no fallback)
//   6. canDifferentiateEqualBayCount contracts
//   7. isDeterministic invariant
//   8. vehicle_flow redesign: NOT using ACCESS envelope count
//   9. bottlenecks/aisle_congestion redesign: NOT using rejections.length
//   10. getActivatableScoringMetrics() returns only implementable SCORING_METRICs
//   11. getAllScoringGaps() catalogs all geometry and standard parameter gaps
//   12. ScoringGap contracts: each has implementationBlocker or standardParameterGaps
//   13. DIAGNOSTIC_TIEBREAKER has normalization config
//   14. HARD_CONSTRAINT has no normalization config
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  SCORING_METRIC_CATALOG,
  getMetricContract,
  getMetricsByClassification,
  getActivatableScoringMetrics,
  getAllScoringGaps,
  type ScoringMetricContract,
  type MetricClassification,
} from '@/domain/engine/evaluation/scoringMetricContract';
import { StandardAccessor, MissingStandardParameterError } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';

// ---------------------------------------------------------------------------
// Expected metric keys (canonical set from FASE 4.2A audit)
// ---------------------------------------------------------------------------
const EXPECTED_METRIC_KEYS = [
  'capacity',
  'bay_count',
  'capacity_throughput',
  'equipment_count',
  'equipment_support',
  'vehicle_flow',
  'flow_continuity',
  'maneuvers',
  'bottlenecks',
  'aisle_congestion',
  'rejections_count',
];

// ---------------------------------------------------------------------------
describe('FASE 4.2B — ScoringMetricContract', () => {

  // -------------------------------------------------------------------------
  // 1. Catalog Structure Integrity
  // -------------------------------------------------------------------------
  describe('1. Catalog Structure Integrity', () => {

    it('[CONTRACT-001] catalog contains all 11 expected metric keys', () => {
      const catalogKeys = SCORING_METRIC_CATALOG.map((m) => m.key);
      for (const key of EXPECTED_METRIC_KEYS) {
        expect(catalogKeys).toContain(key);
      }
    });

    it('[CONTRACT-002] catalog has exactly 11 entries (no extra metrics)', () => {
      expect(SCORING_METRIC_CATALOG).toHaveLength(11);
    });

    it('[CONTRACT-003] all entries have non-empty key, name, description, classificationRationale', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(metric.key.length).toBeGreaterThan(0);
        expect(metric.name.length).toBeGreaterThan(0);
        expect(metric.description.length).toBeGreaterThan(0);
        expect(metric.classificationRationale.length).toBeGreaterThan(0);
      }
    });

    it('[CONTRACT-004] all entries have non-empty userExplanation (human-readable)', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(metric.userExplanation.length).toBeGreaterThan(10);
      }
    });

    it('[CONTRACT-005] getMetricContract() retrieves by key correctly', () => {
      for (const key of EXPECTED_METRIC_KEYS) {
        const contract = getMetricContract(key);
        expect(contract).toBeDefined();
        expect(contract!.key).toBe(key);
      }
    });

    it('[CONTRACT-006] getMetricContract() returns undefined for unknown key', () => {
      expect(getMetricContract('nonexistent_metric')).toBeUndefined();
      expect(getMetricContract('')).toBeUndefined();
    });

    it('[CONTRACT-007] catalog is frozen (immutable)', () => {
      expect(Object.isFrozen(SCORING_METRIC_CATALOG)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Classification Correctness
  // -------------------------------------------------------------------------
  describe('2. Classification Correctness', () => {

    it('[CONTRACT-010] capacity is classified as HARD_CONSTRAINT (not a scoring metric)', () => {
      const contract = getMetricContract('capacity');
      expect(contract!.classification).toBe('HARD_CONSTRAINT');
    });

    it('[CONTRACT-011] bay_count is classified as HARD_CONSTRAINT (duplicate of capacity)', () => {
      const contract = getMetricContract('bay_count');
      expect(contract!.classification).toBe('HARD_CONSTRAINT');
    });

    it('[CONTRACT-012] rejections_count is classified as DIAGNOSTIC_TIEBREAKER (not primary quality)', () => {
      const contract = getMetricContract('rejections_count');
      expect(contract!.classification).toBe('DIAGNOSTIC_TIEBREAKER');
    });

    it('[CONTRACT-013] vehicle_flow is classified as SCORING_METRIC (redesigned with aisle geometry)', () => {
      const contract = getMetricContract('vehicle_flow');
      expect(contract!.classification).toBe('SCORING_METRIC');
    });

    it('[CONTRACT-014] capacity_throughput, equipment_support, flow_continuity, maneuvers, bottlenecks, aisle_congestion, equipment_count are SCORING_GAP', () => {
      const gapKeys = ['capacity_throughput', 'equipment_support', 'flow_continuity', 'maneuvers', 'bottlenecks', 'aisle_congestion', 'equipment_count'];
      for (const key of gapKeys) {
        const contract = getMetricContract(key);
        expect(contract!.classification).toBe('SCORING_GAP');
      }
    });

    it('[CONTRACT-015] getMetricsByClassification works for all classification types', () => {
      const hard = getMetricsByClassification('HARD_CONSTRAINT');
      const scoring = getMetricsByClassification('SCORING_METRIC');
      const diagnostic = getMetricsByClassification('DIAGNOSTIC_TIEBREAKER');
      const gap = getMetricsByClassification('SCORING_GAP');

      expect(hard.length).toBeGreaterThan(0);
      expect(scoring.length).toBeGreaterThan(0);
      expect(diagnostic.length).toBeGreaterThan(0);
      expect(gap.length).toBeGreaterThan(0);

      // Union must equal full catalog
      const total = hard.length + scoring.length + diagnostic.length + gap.length;
      expect(total).toBe(SCORING_METRIC_CATALOG.length);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Layer Separation: HARD_CONSTRAINT has no normalization
  // -------------------------------------------------------------------------
  describe('3. Layer Separation', () => {

    it('[CONTRACT-020] HARD_CONSTRAINT metrics have no normalization config', () => {
      const hardMetrics = getMetricsByClassification('HARD_CONSTRAINT');
      for (const metric of hardMetrics) {
        expect(metric.normalization).toBeUndefined();
      }
    });

    it('[CONTRACT-021] SCORING_METRIC and DIAGNOSTIC_TIEBREAKER metrics have normalization config', () => {
      const scoringMetrics = getMetricsByClassification('SCORING_METRIC');
      const diagnostics = getMetricsByClassification('DIAGNOSTIC_TIEBREAKER');

      for (const metric of [...scoringMetrics, ...diagnostics]) {
        expect(metric.normalization).toBeDefined();
        expect(metric.normalization!.benchmarkWorstParamKey.length).toBeGreaterThan(0);
        expect(metric.normalization!.benchmarkTargetParamKey.length).toBeGreaterThan(0);
        expect(metric.normalization!.unit.length).toBeGreaterThan(0);
      }
    });

    it('[CONTRACT-022] SCORING_GAP metrics may have undefined normalization (not yet ready)', () => {
      // SCORING_GAP metrics do not need to have normalization fully defined.
      // But if they do have normalization, it must be well-formed.
      const gapMetrics = getMetricsByClassification('SCORING_GAP');
      for (const metric of gapMetrics) {
        if (metric.normalization) {
          expect(metric.normalization.benchmarkWorstParamKey.length).toBeGreaterThan(0);
          expect(metric.normalization.benchmarkTargetParamKey.length).toBeGreaterThan(0);
        }
      }
    });

    it('[CONTRACT-023] all rawMetric definitions have non-empty formula and unit', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(metric.rawMetric.formula.length).toBeGreaterThan(0);
        expect(metric.rawMetric.unit.length).toBeGreaterThan(0);
      }
    });

    it('[CONTRACT-024] rawMetric.geometryDataRequired is always an array', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(Array.isArray(metric.rawMetric.geometryDataRequired)).toBe(true);
      }
    });

    it('[CONTRACT-025] rawMetric.standardParametersRequired is always an array', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(Array.isArray(metric.rawMetric.standardParametersRequired)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Metric Direction Contracts
  // -------------------------------------------------------------------------
  describe('4. Metric Direction Contracts', () => {

    it('[CONTRACT-030] vehicle_flow (aisle clearance) is HIGHER_IS_BETTER', () => {
      const contract = getMetricContract('vehicle_flow');
      expect(contract!.normalization!.direction).toBe('HIGHER_IS_BETTER');
    });

    it('[CONTRACT-031] rejections_count (soft warning count) is LOWER_IS_BETTER', () => {
      const contract = getMetricContract('rejections_count');
      expect(contract!.normalization!.direction).toBe('LOWER_IS_BETTER');
    });

    it('[CONTRACT-032] all metrics with normalization have a valid ScoringDirection value', () => {
      const validDirections = new Set(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER']);
      for (const metric of SCORING_METRIC_CATALOG) {
        if (metric.normalization) {
          expect(validDirections.has(metric.normalization.direction)).toBe(true);
        }
      }
    });

    it('[CONTRACT-033] all metrics with normalization have curveType "linear" or "step"', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        if (metric.normalization) {
          expect(['linear', 'step']).toContain(metric.normalization.curveType);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. canDifferentiateEqualBayCount Contract
  // -------------------------------------------------------------------------
  describe('5. canDifferentiateEqualBayCount', () => {

    it('[CONTRACT-040] capacity does NOT differentiate equal-bay-count candidates', () => {
      expect(getMetricContract('capacity')!.canDifferentiateEqualBayCount).toBe(false);
    });

    it('[CONTRACT-041] bay_count does NOT differentiate equal-bay-count candidates', () => {
      expect(getMetricContract('bay_count')!.canDifferentiateEqualBayCount).toBe(false);
    });

    it('[CONTRACT-042] vehicle_flow CAN differentiate equal-bay-count candidates', () => {
      // Aisle width varies by arrangement — two layouts with same bays can have different widths
      expect(getMetricContract('vehicle_flow')!.canDifferentiateEqualBayCount).toBe(true);
    });

    it('[CONTRACT-043] flow_continuity CAN differentiate equal-bay-count candidates', () => {
      // Drive-through vs back-out is independent of bay count
      expect(getMetricContract('flow_continuity')!.canDifferentiateEqualBayCount).toBe(true);
    });

    it('[CONTRACT-044] maneuvers CAN differentiate equal-bay-count candidates', () => {
      expect(getMetricContract('maneuvers')!.canDifferentiateEqualBayCount).toBe(true);
    });

    it('[CONTRACT-045] bottlenecks CAN differentiate equal-bay-count candidates', () => {
      // Passing clearance ratio depends on aisle width, not bay count
      expect(getMetricContract('bottlenecks')!.canDifferentiateEqualBayCount).toBe(true);
    });

    it('[CONTRACT-046] aisle_congestion CAN differentiate equal-bay-count candidates', () => {
      expect(getMetricContract('aisle_congestion')!.canDifferentiateEqualBayCount).toBe(true);
    });

    it('[CONTRACT-047] all SCORING_METRIC metrics can differentiate equal-bay-count candidates', () => {
      // If a metric is classified as SCORING_METRIC, it MUST be able to differentiate
      // candidates that have the same bay count. Otherwise it is useless for ranking.
      const scoringMetrics = getMetricsByClassification('SCORING_METRIC');
      for (const metric of scoringMetrics) {
        expect(metric.canDifferentiateEqualBayCount).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. isDeterministic Invariant
  // -------------------------------------------------------------------------
  describe('6. isDeterministic Invariant', () => {

    it('[CONTRACT-050] all metrics are deterministic', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        expect(metric.isDeterministic).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Redesigned Metric Proxy Verification
  // -------------------------------------------------------------------------
  describe('7. Redesigned Metric Proxy Verification (No Invalid Proxies)', () => {

    it('[CONTRACT-060] vehicle_flow rawMetric uses aisle envelope geometry, NOT ACCESS envelope count', () => {
      const contract = getMetricContract('vehicle_flow')!;
      // The formula must reference aisle envelope width
      expect(contract.rawMetric.formula).toContain('aisle');
      // The geometry data required must reference aisle-main
      const aisleData = contract.rawMetric.geometryDataRequired.find(
        (d) => d.accessPath.includes('aisle-main') || d.label.toLowerCase().includes('aisle')
      );
      expect(aisleData).toBeDefined();
      expect(aisleData!.availability).toBe('AVAILABLE');
      // Must NOT reference ACCESS envelope count
      expect(contract.rawMetric.formula).not.toContain('filter(e => e.type === "ACCESS").length');
    });

    it('[CONTRACT-061] bottlenecks rawMetric uses aisle geometry, NOT rejections.length', () => {
      const contract = getMetricContract('bottlenecks')!;
      // The formula must reference aisle width
      expect(contract.rawMetric.formula.toLowerCase()).toContain('aisle');
      // Must NOT reference rejections
      expect(contract.rawMetric.formula.toLowerCase()).not.toContain('rejection');
    });

    it('[CONTRACT-062] aisle_congestion rawMetric uses aisle geometry, NOT rejections.length', () => {
      const contract = getMetricContract('aisle_congestion')!;
      expect(contract.rawMetric.formula.toLowerCase()).toContain('aisle');
      expect(contract.rawMetric.formula.toLowerCase()).not.toContain('rejection');
    });

    it('[CONTRACT-063] flow_continuity rawMetric references circulationRequirement and arrangement, NOT ACCESS count', () => {
      const contract = getMetricContract('flow_continuity')!;
      expect(contract.rawMetric.formula).toContain('circulationRequirement');
      expect(contract.rawMetric.formula).not.toContain('.length');
    });

    it('[CONTRACT-064] maneuvers rawMetric references arrangement type, NOT ACCESS envelope count', () => {
      const contract = getMetricContract('maneuvers')!;
      expect(contract.rawMetric.formula).toContain('arrangement');
      expect(contract.rawMetric.formula).not.toContain('.length');
    });
  });

  // -------------------------------------------------------------------------
  // 8. getActivatableScoringMetrics — only SCORING_METRIC + isImplementableNow
  // -------------------------------------------------------------------------
  describe('8. getActivatableScoringMetrics()', () => {

    it('[CONTRACT-070] returns only SCORING_METRIC metrics that are implementable now', () => {
      const activatable = getActivatableScoringMetrics();

      for (const metric of activatable) {
        expect(metric.classification).toBe('SCORING_METRIC');
        expect(metric.rawMetric.isImplementableNow).toBe(true);
      }
    });

    it('[CONTRACT-071] vehicle_flow is in activatable metrics (it uses available aisle geometry)', () => {
      const activatable = getActivatableScoringMetrics();
      const keys = activatable.map((m) => m.key);
      expect(keys).toContain('vehicle_flow');
    });

    it('[CONTRACT-072] SCORING_GAP metrics are NOT in activatable metrics', () => {
      const activatable = getActivatableScoringMetrics();
      const keys = activatable.map((m) => m.key);

      const gapKeys = ['capacity_throughput', 'equipment_support', 'flow_continuity', 'maneuvers', 'bottlenecks', 'aisle_congestion', 'equipment_count'];
      for (const gapKey of gapKeys) {
        expect(keys).not.toContain(gapKey);
      }
    });

    it('[CONTRACT-073] HARD_CONSTRAINT metrics are NOT in activatable metrics', () => {
      const activatable = getActivatableScoringMetrics();
      const keys = activatable.map((m) => m.key);
      expect(keys).not.toContain('capacity');
      expect(keys).not.toContain('bay_count');
    });
  });

  // -------------------------------------------------------------------------
  // 9. getAllScoringGaps() — complete gap catalog
  // -------------------------------------------------------------------------
  describe('9. getAllScoringGaps()', () => {

    it('[CONTRACT-080] getAllScoringGaps() returns one entry per SCORING_GAP metric', () => {
      const gaps = getAllScoringGaps();
      const gapMetrics = getMetricsByClassification('SCORING_GAP');
      expect(gaps).toHaveLength(gapMetrics.length);
    });

    it('[CONTRACT-081] each gap entry has metricKey, geometryGaps, standardParameterGaps', () => {
      const gaps = getAllScoringGaps();
      for (const gap of gaps) {
        expect(typeof gap.metricKey).toBe('string');
        expect(gap.metricKey.length).toBeGreaterThan(0);
        expect(Array.isArray(gap.geometryGaps)).toBe(true);
        expect(Array.isArray(gap.standardParameterGaps)).toBe(true);
      }
    });

    it('[CONTRACT-082] flow_continuity and maneuvers both have arrangement as GEOMETRY_GAP', () => {
      const gaps = getAllScoringGaps();
      const flowGap = gaps.find((g) => g.metricKey === 'flow_continuity');
      const maneuversGap = gaps.find((g) => g.metricKey === 'maneuvers');

      expect(flowGap).toBeDefined();
      expect(maneuversGap).toBeDefined();

      const flowArrangementGap = flowGap!.geometryGaps.find((d) =>
        d.source === 'orchestrated.arrangement'
      );
      expect(flowArrangementGap).toBeDefined();
      expect(flowArrangementGap!.availability).toBe('GEOMETRY_GAP');

      const maneuversArrangementGap = maneuversGap!.geometryGaps.find((d) =>
        d.source === 'orchestrated.arrangement'
      );
      expect(maneuversArrangementGap).toBeDefined();
      expect(maneuversArrangementGap!.availability).toBe('GEOMETRY_GAP');
    });

    it('[CONTRACT-083] bottlenecks and aisle_congestion have vehicle width as STANDARD_GAP', () => {
      const gaps = getAllScoringGaps();
      const bottlenecksGap = gaps.find((g) => g.metricKey === 'bottlenecks');
      const congestionGap = gaps.find((g) => g.metricKey === 'aisle_congestion');

      expect(bottlenecksGap).toBeDefined();
      expect(congestionGap).toBeDefined();

      // Vehicle width standard params must be in standardParameterGaps
      expect(bottlenecksGap!.standardParameterGaps.some((k) => k.includes('vehicle'))).toBe(true);
      expect(congestionGap!.standardParameterGaps.some((k) => k.includes('vehicle'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 10. SCORING_GAP metrics have implementationBlocker documented
  // -------------------------------------------------------------------------
  describe('10. SCORING_GAP Contract Completeness', () => {

    it('[CONTRACT-090] SCORING_GAP metrics with isImplementableNow=false have implementationBlocker', () => {
      const gaps = getMetricsByClassification('SCORING_GAP');
      for (const metric of gaps) {
        if (!metric.rawMetric.isImplementableNow) {
          expect(metric.rawMetric.implementationBlocker).toBeDefined();
          expect(metric.rawMetric.implementationBlocker!.length).toBeGreaterThan(10);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11. StandardAccessor.getScoringCriteria() — No Fallback (FASE 4.2B Fix)
  // -------------------------------------------------------------------------
  describe('11. StandardAccessor.getScoringCriteria() — No Fallback Benchmark Contract', () => {

    const buildStandard = (params: { key: string; value: number }[]): WorkshopStandard => ({
      id: 'std-contract-test',
      name: 'Contract Test Standard',
      version: '1.0-contract',
      status: 'published',
      parameters: params.map((p) => ({
        key: p.key,
        value: p.value,
        unit: 'n/a',
        constraint_level: 'OPTIMIZATION' as const,
      })),
      rules: [],
      scoring: [{ key: 'vehicle_flow', weight: 100 }],
    });

    it('[CONTRACT-100] getScoringCriteria() throws when benchmark_min is absent (no fallback to 0)', () => {
      // Has target but NOT min
      const std = buildStandard([
        { key: 'scoring.vehicle_flow.direction', value: 1 },
        { key: 'scoring.vehicle_flow.benchmark_target', value: 2.0 },
        // NO scoring.vehicle_flow.benchmark_min
      ]);

      const accessor = new StandardAccessor(std);
      expect(() => accessor.getScoringCriteria()).toThrow(MissingStandardParameterError);
    });

    it('[CONTRACT-101] getScoringCriteria() throws when benchmark_target is absent (no fallback to 100)', () => {
      // Has min but NOT target
      const std = buildStandard([
        { key: 'scoring.vehicle_flow.direction', value: 1 },
        { key: 'scoring.vehicle_flow.benchmark_min', value: 0 },
        // NO scoring.vehicle_flow.benchmark_target
      ]);

      const accessor = new StandardAccessor(std);
      expect(() => accessor.getScoringCriteria()).toThrow(MissingStandardParameterError);
    });

    it('[CONTRACT-102] getScoringCriteria() throws when BOTH benchmarks are absent', () => {
      const std = buildStandard([
        { key: 'scoring.vehicle_flow.direction', value: 1 },
        // NO min, NO target
      ]);

      const accessor = new StandardAccessor(std);
      expect(() => accessor.getScoringCriteria()).toThrow(MissingStandardParameterError);
    });

    it('[CONTRACT-103] getScoringCriteria() succeeds and returns correct values when all params present', () => {
      const std = buildStandard([
        { key: 'scoring.vehicle_flow.direction', value: 1 },
        { key: 'scoring.vehicle_flow.benchmark_min', value: 0.0 },
        { key: 'scoring.vehicle_flow.benchmark_target', value: 1.5 },
      ]);

      const accessor = new StandardAccessor(std);
      const criteria = accessor.getScoringCriteria();

      expect(criteria).toHaveLength(1);
      expect(criteria[0].criterionKey).toBe('vehicle_flow');
      expect(criteria[0].benchmarkMin).toBe(0.0);
      expect(criteria[0].benchmarkTarget).toBe(1.5);
      expect(criteria[0].direction).toBe('HIGHER_IS_BETTER');
    });

    it('[CONTRACT-104] empty scoring array returns empty criteria without error', () => {
      const emptyStd: WorkshopStandard = {
        id: 'std-empty',
        name: 'Empty Scoring',
        version: '1.0',
        status: 'published',
        parameters: [],
        rules: [],
        scoring: [],
      };

      const accessor = new StandardAccessor(emptyStd);
      const criteria = accessor.getScoringCriteria();
      expect(criteria).toHaveLength(0);
    });

    it('[CONTRACT-105] error message contains the missing parameter key', () => {
      const std = buildStandard([
        { key: 'scoring.vehicle_flow.direction', value: 1 },
        { key: 'scoring.vehicle_flow.benchmark_target', value: 1.5 },
        // NO benchmark_min
      ]);

      const accessor = new StandardAccessor(std);
      try {
        accessor.getScoringCriteria();
        expect.fail('Should have thrown MissingStandardParameterError');
      } catch (e) {
        expect(e).toBeInstanceOf(MissingStandardParameterError);
        expect((e as MissingStandardParameterError).parameterKey).toContain('vehicle_flow');
        expect((e as MissingStandardParameterError).parameterKey).toContain('benchmark_min');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 12. Normalization contract: benchmarkWorstParamKey references correct keys
  // -------------------------------------------------------------------------
  describe('12. Normalization Param Key Naming Convention', () => {

    it('[CONTRACT-110] all normalization param keys follow "scoring.{key}.benchmark_{worst|target}" convention', () => {
      for (const metric of SCORING_METRIC_CATALOG) {
        if (metric.normalization) {
          expect(metric.normalization.benchmarkWorstParamKey).toMatch(
            new RegExp(`scoring\\.${metric.key}\\.benchmark_worst`)
          );
          expect(metric.normalization.benchmarkTargetParamKey).toMatch(
            new RegExp(`scoring\\.${metric.key}\\.benchmark_target`)
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 13. vehicle_flow aisle geometry data availability
  // -------------------------------------------------------------------------
  describe('13. vehicle_flow Aisle Data Availability', () => {

    it('[CONTRACT-120] vehicle_flow geometry data source is candidate.envelopes (aisle-main)', () => {
      const contract = getMetricContract('vehicle_flow')!;
      const aisleSource = contract.rawMetric.geometryDataRequired.find(
        (d) => d.source === 'candidate.envelopes'
      );
      expect(aisleSource).toBeDefined();
      expect(aisleSource!.availability).toBe('AVAILABLE');
    });

    it('[CONTRACT-121] vehicle_flow requires circulation.drive_aisle.min_width from standard', () => {
      const contract = getMetricContract('vehicle_flow')!;
      expect(contract.rawMetric.standardParametersRequired).toContain('circulation.drive_aisle.min_width');
    });

    it('[CONTRACT-122] vehicle_flow is immediately implementable', () => {
      const contract = getMetricContract('vehicle_flow')!;
      expect(contract.rawMetric.isImplementableNow).toBe(true);
    });
  });
});
