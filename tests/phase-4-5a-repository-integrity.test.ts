// ---------------------------------------------------------------------------
// FASE 4.5A — Repository Integrity & Architecture Consolidation Regression Tests
//
// Verifies:
// 1. Zero Engineering Fallbacks (no magic dimensions, missing params fail explicitly)
// 2. Strict candidateToCadProject boundary (disqualified cannot be converted to final CAD)
// 3. Single Source of Truth requirement mapping
// 4. Deterministic geometry & scoring independent of execution timestamps
// 5. Scoring standard snapshot alignment with SSOT metric contracts
// 6. Deep nested AI geometry boundary guards (including coordinates, envelopes, etc.)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { RequirementMapper } from '../src/application/requirements/requirementMapper';
import {
  candidateToCadProject,
  layoutEngineResultToCadProject,
} from '../src/domain/export/cadRepresentation';
import {
  detectCadGeometryInResponse,
} from '../src/application/ai/requirementParser';
import { ConcreteStrategyEvaluator } from '../src/domain/engine/evaluation/strategyEvaluator';
import { StrategyCandidate } from '../src/domain/engine/strategies/strategyTypes';
import { toStrategyCandidate } from '../src/domain/engine/orchestrator/orchestratorTypes';
import { WorkshopStandard } from '../src/domain/models/standard';
import { LayoutEngineInput } from '../src/domain/engine/types';
import { WorkshopLayoutRequirement } from '../src/domain/requirements/requirementTypes';
import demoStandardJson from '../data/demo-standard.json';

const standard = demoStandardJson as unknown as WorkshopStandard;
const accessor = new StandardAccessor(standard);

const validTestInput: LayoutEngineInput = {
  site: { width: 30, length: 40, roadSide: 'south' },
  building: { width: 24, length: 30, frontSetbackMeters: 5 },
  accessPoints: [
    {
      id: 'ap-01',
      type: 'entrance',
      wall: 'south',
      offsetMeters: 20,
      widthMeters: 3.5,
    },
  ],
  program: {
    bays: [{ serviceType: 'general_service', quantity: 3 }],
    equipment: [],
    customerZoneRequired: true,
    circulationRequirement: 'back_out_turnaround',
    vehicleClassKey: 'vehicle.sedan',
    ancillarySpaces: {
      customerLounge: true,
      cashierOffice: true,
      partsWarehouse: false,
      restroom: true,
      staffRoom: false,
    },
    futureExpansionBays: 0,
  },
};

const disqualifiedTestInput: LayoutEngineInput = {
  site: { width: 10, length: 10, roadSide: 'south' },
  building: { width: 20, length: 20, frontSetbackMeters: 0 }, // Exceeds site
  accessPoints: [
    {
      id: 'ap-01',
      type: 'entrance',
      wall: 'south',
      offsetMeters: 5,
      widthMeters: 3.5,
    },
  ],
  program: {
    bays: [{ serviceType: 'general_service', quantity: 10 }],
    equipment: [],
    customerZoneRequired: false,
    circulationRequirement: 'back_out_turnaround',
    vehicleClassKey: 'vehicle.sedan',
    futureExpansionBays: 0,
  },
};

describe('FASE 4.5A: Repository Integrity & Architecture Consolidation', () => {
  // =========================================================================
  // TASK 1: Zero Engineering Fallbacks
  // =========================================================================
  describe('Task 1: Zero Engineering Fallbacks', () => {
    it('uses standard parameters from candidate metadata when converting to CAD', () => {
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(validTestInput, accessor);
      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).toBeDefined();

      const cadProject = layoutEngineResultToCadProject(result, validTestInput);
      expect(cadProject).not.toBeNull();
      expect(cadProject!.building.width).toBe(24);
      expect(cadProject!.building.length).toBe(30);

      const doors = cadProject!.layout.objects.filter((o) => o.type === 'door');
      expect(doors.length).toBeGreaterThan(0);
      expect(doors[0].geometry.width).toBe(3.5); // Exact width from accessPoint without fallback
    });

    it('strictly throws when candidate metadata is missing wallThickness instead of falling back to 0.25', () => {
      const fakeCandidate = {
        candidateId: 'fake-cand-01',
        strategy: 'CAPACITY' as const,
        arrangement: 'SINGLE_COMB_NORTH' as const,
        status: 'VALID' as const,
        objects: [],
        envelopes: [],
        rejections: [],
        provenance: { standardVersionId: '0.1-demo', generatorName: 'test', generatedAt: '2026-09-01' },
        metadata: {
          totalBaysPlaced: 1,
          totalBaysRequested: 1,
          ancillarySpacesPlaced: [],
          // No buildingInterior.wallThickness
        },
      };

      expect(() => {
        candidateToCadProject(fakeCandidate as any, validTestInput);
      }).toThrow(/Missing required standard parameter: building\.wall_thickness/);
    });

    it('strictly throws when access point has invalid widthMeters instead of falling back to 4.0', () => {
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(validTestInput, accessor);
      expect(result.status).toBe('SUCCESS');

      const invalidAccessInput: LayoutEngineInput = {
        ...validTestInput,
        accessPoints: [
          {
            id: 'ap-bad',
            type: 'entrance',
            wall: 'south',
            offsetMeters: 5,
            widthMeters: 0, // Invalid width
          },
        ],
      };

      expect(() => {
        candidateToCadProject(result.bestCandidate!, invalidAccessInput);
      }).toThrow(/missing a valid widthMeters dimension/);
    });
  });

  // =========================================================================
  // TASK 2: candidateToCadProject Boundary
  // =========================================================================
  describe('Task 2: candidateToCadProject Boundary', () => {
    it('returns null from layoutEngineResultToCadProject when result is DISQUALIFIED', () => {
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(disqualifiedTestInput, accessor);
      expect(result.status).toBe('DISQUALIFIED');

      const cadProject = layoutEngineResultToCadProject(result, disqualifiedTestInput);
      expect(cadProject).toBeNull();
    });

    it('strictly throws when candidateToCadProject is called directly on a DISQUALIFIED candidate without allowDiagnostic', () => {
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(disqualifiedTestInput, accessor);
      const disqCandidate = result.disqualifiedCandidates[0];
      expect(disqCandidate).toBeDefined();

      expect(() => {
        candidateToCadProject(disqCandidate, disqualifiedTestInput);
      }).toThrow(/Cannot convert DISQUALIFIED or invalid candidate/);
    });

    it('permits conversion with status draft when allowDiagnostic is explicitly true', () => {
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(disqualifiedTestInput, accessor);
      const disqCandidate = result.disqualifiedCandidates[0];

      const diagProject = candidateToCadProject(disqCandidate, disqualifiedTestInput, {
        allowDiagnostic: true,
      });
      expect(diagProject).toBeDefined();
      expect(diagProject.layout.status).toBe('draft');
    });
  });

  // =========================================================================
  // TASK 3: Single Source of Truth Requirement Mapping
  // =========================================================================
  describe('Task 3: Single Source of Truth Mapping', () => {
    it('produces a valid LayoutEngineInput once from WorkshopLayoutRequirement', () => {
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'SSOT Workshop Test',
        workshopType: 'car_service',
        site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
        building: { widthMeters: 24, lengthMeters: 30, frontSetbackMeters: 5 },
        access: { entryPosition: 'front_right' },
        vehicleCategory: 'sedan',
        services: [{ serviceType: 'general_service', bayCount: 3 }],
        ancillarySpaces: { customerLounge: true, cashierOffice: true, partsWarehouse: false, restroom: true },
        priority: 'BALANCED_EFFICIENCY',
      };

      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(requirement, accessor);
      expect(mappingResult.success).toBe(true);
      expect(mappingResult.engineInput).toBeDefined();

      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateLayout(mappingResult.engineInput!, accessor);
      expect(engineResult.status).toBe('SUCCESS');

      const cadProject = layoutEngineResultToCadProject(engineResult, mappingResult.engineInput!, {
        projectName: requirement.projectName,
      });
      expect(cadProject).not.toBeNull();
      expect(cadProject!.project.name).toBe('SSOT Workshop Test');
    });
  });

  // =========================================================================
  // TASK 4: Timestamp & Determinism
  // =========================================================================
  describe('Task 4: Timestamp & Determinism', () => {
    it('proves that changing execution timestamps has ZERO effect on geometry, candidate IDs, scores, and ranking', () => {
      const orchestrator = new LayoutOrchestrator();

      const runA = orchestrator.generateLayout(validTestInput, accessor, {
        executedAt: '2020-01-01T00:00:00.000Z',
      });
      const runB = orchestrator.generateLayout(validTestInput, accessor, {
        executedAt: '2035-12-31T23:59:59.999Z',
      });

      expect(runA.status).toBe(runB.status);
      expect(runA.allCandidates.length).toBe(runB.allCandidates.length);
      expect(runA.bestCandidate?.candidateId).toBe(runB.bestCandidate?.candidateId);
      expect(runA.bestCandidate?.score).toBe(runB.bestCandidate?.score);

      // Compare every object's geometry across runs
      const objectsA = runA.bestCandidate!.layout.objects;
      const objectsB = runB.bestCandidate!.layout.objects;
      expect(objectsA.length).toBe(objectsB.length);

      for (let i = 0; i < objectsA.length; i++) {
        expect(objectsA[i].id).toBe(objectsB[i].id);
        expect(objectsA[i].geometry).toEqual(objectsB[i].geometry);
      }

      // Provenance carries the provided timestamp without corrupting calculations
      expect(runA.provenance.executedAt).toBe('2020-01-01T00:00:00.000Z');
      expect(runB.provenance.executedAt).toBe('2035-12-31T23:59:59.999Z');
    });
  });

  // =========================================================================
  // TASK 5: Scoring Standard Snapshot Alignment
  // =========================================================================
  describe('Task 5: Scoring Standard Snapshot Alignment', () => {
    it('has total scoring weights equal to exactly 100 in demo-standard.json', () => {
      const scoringConfigs = accessor.getScoringCriteria();
      const totalWeight = scoringConfigs.reduce((sum, c) => sum + c.weight, 0);
      expect(totalWeight).toBe(100);
    });

    it('evaluates active capacity_throughput scoring cleanly with provenance', () => {
      const evaluator = new ConcreteStrategyEvaluator();
      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateLayout(validTestInput, accessor);

      const candidate = result.bestCandidate!;
      const strategyCandidate = toStrategyCandidate(candidate.layout);
      const evalResult = evaluator.evaluate(strategyCandidate, accessor);

      expect(evalResult.isEligible).toBe(true);
      expect(evalResult.totalScore).toBeGreaterThan(0);
      expect(evalResult.criteria.length).toBe(1);
      expect(evalResult.criteria[0].criterionId).toBe('capacity_throughput');
    });

    it('strictly throws UnsupportedScoringCriterionError on SCORING_GAP metrics (e.g. vehicle_flow, bottlenecks)', () => {
      const evaluator = new ConcreteStrategyEvaluator();
      const mockCandidate: StrategyCandidate = {
        id: 'mock-01',
        strategyId: 'CAPACITY',
        name: 'mock',
        description: '',
        topologyId: '',
        layout: { objects: [] },
        envelopes: [],
        status: 'VALID',
        rejections: [],
        provenance: { standardVersionId: '0.1-demo', generatorName: 'test', generatedAt: '2026-09-01' },
        explanation: { strategyRationale: '', layoutSummary: '', tradeOffs: '' },
        spatialContext: {
          arrangement: 'SINGLE_COMB_NORTH',
          circulationRequirement: 'back_out_turnaround',
          provenance: { source: 'generator', generatorName: 'test', inputProgramField: 'circulationRequirement' },
        },
      };

      expect(() => {
        evaluator.extractRawMetricWithProvenance(mockCandidate, 'vehicle_flow', accessor);
      }).toThrow(/Deprecated legacy metric/);

      expect(() => {
        evaluator.extractRawMetricWithProvenance(mockCandidate, 'bottlenecks', accessor);
      }).toThrow(/Classified as SCORING_GAP/);
    });

    it('enforces structured scoring failure in LayoutOrchestrator when standard contains an unsupported scoring criterion', () => {
      // Standard that defines an unresolvable / SCORING_GAP metric
      const brokenScoringStandard: WorkshopStandard = {
        ...standard,
        scoring: [
          { key: 'vehicle_flow', weight: 100 },
        ],
        parameters: [
          ...standard.parameters,
          { key: 'scoring.vehicle_flow.direction', value: 1, unit: 'dir', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.vehicle_flow.benchmark_min', value: 0, unit: 'score', constraint_level: 'OPTIMIZATION' },
          { key: 'scoring.vehicle_flow.benchmark_target', value: 100, unit: 'score', constraint_level: 'OPTIMIZATION' },
        ],
      };

      const brokenAccessor = new StandardAccessor(brokenScoringStandard);
      const orchestrator = new LayoutOrchestrator();

      const result = orchestrator.generateLayout(validTestInput, brokenAccessor);

      // Scoring failure must NOT be swallowed into valid unscored candidate
      expect(result.status).toBe('DISQUALIFIED');
      expect(result.bestCandidate).toBeNull();
      expect(result.engineeringSummary.validCandidateCount).toBe(0);
      expect(result.disqualifiedCandidates.length).toBeGreaterThan(0);

      const firstDisq = result.disqualifiedCandidates[0];
      expect(firstDisq.validity).toBe('DISQUALIFIED');
      expect(firstDisq.isValid).toBe(false);
      expect(firstDisq.score).toBeNull();
      expect(firstDisq.rejectionReasons.some((r) => r.includes('[SCORING-FAILURE-001]'))).toBe(true);
      expect(result.engineeringSummary.primaryDisqualificationReason).toMatch(/SCORING-FAILURE-001/);
    });
  });

  // =========================================================================
  // TASK 9: Deep AI Geometry Boundary Guards
  // =========================================================================
  describe('Task 9: Deep AI Geometry Boundary Guards', () => {
    it('detects top-level and deeply nested forbidden CAD geometry keys including coordinates, vertices, polygon', () => {
      const safePayload = {
        projectName: 'Safe Bengkel',
        site: { widthMeters: 30, lengthMeters: 40 },
        building: { widthMeters: 24, lengthMeters: 30 },
        services: [{ serviceType: 'general_service', bayCount: 3 }],
      };
      expect(detectCadGeometryInResponse(safePayload)).toEqual([]);

      const nestedForbiddenPayload = {
        projectName: 'Infiltrated Bengkel',
        site: { widthMeters: 30, lengthMeters: 40 },
        building: {
          widthMeters: 24,
          lengthMeters: 30,
          nestedDetails: {
            coordinates: [10, 20], // FORBIDDEN
            wallThickness: 0.25,  // FORBIDDEN
          },
        },
        services: [
          {
            serviceType: 'general_service',
            bayCount: 3,
            proposedPlacement: {
              x: 10,              // FORBIDDEN
              y: 15,              // FORBIDDEN
              rotation: 90,       // FORBIDDEN
              polygon: [[0, 0]],  // FORBIDDEN
            },
          },
        ],
      };

      const violations = detectCadGeometryInResponse(nestedForbiddenPayload);
      expect(violations).toContain('building.nestedDetails.coordinates');
      expect(violations).toContain('building.nestedDetails.wallThickness');
      expect(violations).toContain('services[0].proposedPlacement.x');
      expect(violations).toContain('services[0].proposedPlacement.y');
      expect(violations).toContain('services[0].proposedPlacement.rotation');
      expect(violations).toContain('services[0].proposedPlacement.polygon');
    });
  });
});
