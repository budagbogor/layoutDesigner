import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValidationPanel } from '@/presentation/components/panels/ValidationPanel';
import {
  buildCandidateViewModels,
  AlternativeLayoutPanel,
} from '@/presentation/components/panels/AlternativeLayoutPanel';
import { VehicleFlowAnalysisResult } from '@/domain/engine/flow/vehicleFlowFoundation';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import demoStandardFixture from '../data/demo-standard.json';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { ValidationReport } from '@/domain/validation/types';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';
import type { LayoutEngineResult, OrchestratedCandidate } from '@/domain/engine/orchestrator/orchestratorTypes';

describe('M2B.6 — Vehicle Flow Visualization & Validation UI', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  const mockReport: ValidationReport = {
    valid: true,
    hardCount: 0,
    warningCount: 0,
    infoCount: 0,
    issues: [],
  };

  const mockValidFlow: VehicleFlowAnalysisResult = {
    overallState: 'FLOW_VALID',
    structuralState: 'FLOW_VALID',
    isConnected: true,
    isManeuverabilityVerified: false,
    entryConnectivity: {
      isConnected: true,
      connectedAccessPointIds: ['ap-entry-01'],
      disconnectedAccessPointIds: [],
    },
    circulationConnectivity: {
      hasDriveAisle: true,
      aisleIds: ['aisle-main'],
    },
    bayConnectivity: [
      { bayId: 'bay-01', bayType: 'general_service', hasApproachConnection: true, hasCirculationConnection: true, hasEgressPath: true, isFullyConnected: true, diagnostics: [] },
      { bayId: 'bay-02', bayType: 'general_service', hasApproachConnection: true, hasCirculationConnection: true, hasEgressPath: true, isFullyConnected: true, diagnostics: [] },
      { bayId: 'bay-03', bayType: 'wheel_alignment', hasApproachConnection: true, hasCirculationConnection: true, hasEgressPath: true, isFullyConnected: true, diagnostics: [] },
    ],
    exitConnectivity: {
      hasExplicitExit: true,
      isConnected: true,
      exitAccessPointIds: ['ap-exit-01'],
    },
    diagnostics: [],
    topologyGeometryAgreement: { isConsistent: true, discrepancies: [] },
  };

  const mockWarningFlow: VehicleFlowAnalysisResult = {
    ...mockValidFlow,
    overallState: 'FLOW_WARNING',
    diagnostics: [
      {
        ruleId: 'FLOW-MANEUVER-WARNING-001',
        severity: 'SOFT',
        isDisqualifying: false,
        reason: 'Vehicle flow connectivity is structurally established, but complete vehicle maneuverability and swept-path feasibility remain unverified.',
        flowState: 'FLOW_WARNING',
        provenance: { source: 'standard', referenceKey: 'circulation.swept_path' },
      },
    ],
  };

  const mockDisconnectedFlow: VehicleFlowAnalysisResult = {
    overallState: 'FLOW_DISCONNECTED',
    structuralState: 'FLOW_DISCONNECTED',
    isConnected: false,
    isManeuverabilityVerified: false,
    entryConnectivity: {
      isConnected: false,
      connectedAccessPointIds: [],
      disconnectedAccessPointIds: ['ap-entry-01'],
    },
    circulationConnectivity: {
      hasDriveAisle: true,
      aisleIds: ['aisle-main'],
    },
    bayConnectivity: [
      { bayId: 'bay-01', bayType: 'general_service', hasApproachConnection: true, hasCirculationConnection: true, hasEgressPath: false, isFullyConnected: false, diagnostics: [] },
      {
        bayId: 'bay-02',
        bayType: 'general_service',
        hasApproachConnection: false,
        hasCirculationConnection: false,
        hasEgressPath: false,
        isFullyConnected: false,
        diagnostics: [
          {
            ruleId: 'FLOW-BAY-001',
            severity: 'HARD',
            isDisqualifying: true,
            affectedObjectIds: ['bay-02'],
            reason: "Service bay 'bay-02' approach route is physically obstructed.",
            flowState: 'FLOW_DISCONNECTED',
            provenance: { source: 'geometry' },
          },
        ],
      },
    ],
    exitConnectivity: {
      hasExplicitExit: true,
      isConnected: false,
      exitAccessPointIds: [],
    },
    diagnostics: [
      {
        ruleId: 'FLOW-ENTRY-001',
        severity: 'HARD',
        isDisqualifying: true,
        affectedObjectIds: ['ap-entry-01'],
        reason: "Vehicle entry point 'ap-entry-01' is disconnected from workshop drive aisle.",
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'geometry' },
      },
      {
        ruleId: 'FLOW-BAY-001',
        severity: 'HARD',
        isDisqualifying: true,
        affectedObjectIds: ['bay-02'],
        reason: "Service bay 'bay-02' approach route is physically obstructed.",
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'geometry' },
      },
      {
        ruleId: 'FLOW-EXIT-001',
        severity: 'HARD',
        isDisqualifying: true,
        affectedObjectIds: ['ap-exit-01'],
        reason: "Dedicated vehicle exit point 'ap-exit-01' is not reached by drive aisle.",
        flowState: 'FLOW_DISCONNECTED',
        provenance: { source: 'geometry' },
      },
    ],
    topologyGeometryAgreement: { isConsistent: true, discrepancies: [] },
  };

  // ---------------------------------------------------------------------------
  // 1 - 3. Flow States Rendering in ValidationPanel
  // ---------------------------------------------------------------------------
  describe('1 - 3. ValidationPanel Flow State Badges', () => {
    it('1. renders FLOW VALID badge when flow state is FLOW_VALID', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockValidFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('FLOW VALID');
      expect(html).toContain('Vehicle Flow');
    });

    it('2. renders FLOW WARNING badge when flow state is FLOW_WARNING', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockWarningFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('FLOW WARNING');
      expect(html).toContain('Vehicle Flow');
    });

    it('3. renders FLOW DISCONNECTED badge when flow state is FLOW_DISCONNECTED', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockDisconnectedFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('FLOW DISCONNECTED');
    });
  });

  // ---------------------------------------------------------------------------
  // 4 - 8. Detailed Flow Information Display
  // ---------------------------------------------------------------------------
  describe('4 - 8. Detailed Vehicle Flow Sections', () => {
    it('4. displays connected service bay count (e.g. 3/3 connected)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockValidFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('Service Bays: 3/3 connected');
    });

    it('5. displays disconnected bay diagnostic when a bay is detached', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockDisconnectedFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('bay-02');
      expect(html).toContain('approach route is physically obstructed');
    });

    it('6. displays entry connectivity status and diagnostic', () => {
      const validHtml = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockValidFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(validHtml).toContain('Entry: Connected');

      const discHtml = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockDisconnectedFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(discHtml).toContain('Entry: Disconnected');
      expect(discHtml).toContain('ap-entry-01');
      expect(discHtml).toContain('is disconnected from workshop drive aisle');
    });

    it('7. displays exit connectivity status and diagnostic', () => {
      const validHtml = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockValidFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(validHtml).toContain('Exit / Egress: Connected');

      const discHtml = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockDisconnectedFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(discHtml).toContain('Exit / Egress: Disconnected');
      expect(discHtml).toContain('ap-exit-01');
      expect(discHtml).toContain('is not reached by drive aisle');
    });

    it('8. displays maneuverability warning caveat explicitly distinguishing connectivity from swept path', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: mockWarningFlow,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('Vehicle maneuverability not yet verified');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Alternative Layout Explorer Candidate Cards
  // ---------------------------------------------------------------------------
  describe('9. Alternative Candidate Flow Status Display', () => {
    it('9. populates flowState on candidate cards in AlternativeLayoutPanel', () => {
      const mockResult: LayoutEngineResult = {
        status: 'SUCCESS',
        provenance: {
          standardVersionId: 'v1',
          orchestratorName: 'orch',
          executedAt: '2026-09-08',
        },
        bestCandidate: {
          candidateId: 'cand-01',
          strategy: 'BALANCED',
          arrangement: 'SINGLE_COMB_NORTH',
          validity: 'VALID',
          isValid: true,
          rejectionReasons: [],
          hardViolations: [],
          warnings: [],
          score: 88,
          scoreBreakdown: null,
          provenance: { standardVersionId: 'v1', generatorName: 'gen', orchestratorName: 'orch', executedAt: '2026-09-08', strategy: 'BALANCED', arrangement: 'SINGLE_COMB_NORTH' },
          attemptedArrangements: ['SINGLE_COMB_NORTH'],
          layout: { candidateId: 'cand-01', strategy: 'BALANCED', arrangement: 'SINGLE_COMB_NORTH', circulationRequirement: 'drive_through', objects: [], envelopes: [], validation: { isValid: true, status: 'VALID', hardViolations: [], softWarnings: [] }, status: 'VALID', rejections: [], warnings: [], provenance: {} as any, metadata: {} as any },
          flowAnalysis: mockWarningFlow,
        } as unknown as OrchestratedCandidate,
        alternativeCandidates: [
          {
            candidateId: 'cand-02',
            strategy: 'CAPACITY',
            arrangement: 'DOUBLE_COMB_OPPOSING',
            validity: 'VALID',
            isValid: true,
            rejectionReasons: [],
            hardViolations: [],
            warnings: [],
            score: 82,
            scoreBreakdown: null,
            provenance: { standardVersionId: 'v1', generatorName: 'gen', orchestratorName: 'orch', executedAt: '2026-09-08', strategy: 'CAPACITY', arrangement: 'DOUBLE_COMB_OPPOSING' },
            attemptedArrangements: ['DOUBLE_COMB_OPPOSING'],
            layout: { candidateId: 'cand-02', strategy: 'CAPACITY', arrangement: 'DOUBLE_COMB_OPPOSING', circulationRequirement: 'drive_through', objects: [], envelopes: [], validation: { isValid: true, status: 'VALID', hardViolations: [], softWarnings: [] }, status: 'VALID', rejections: [], warnings: [], provenance: {} as any, metadata: {} as any },
            flowAnalysis: mockValidFlow,
          } as unknown as OrchestratedCandidate,
        ],
        allCandidates: [],
        disqualifiedCandidates: [],
        engineeringSummary: { totalStrategiesExplored: 2, totalArrangementsExplored: 2, totalCandidatesGenerated: 2, validCandidateCount: 2, disqualifiedCandidateCount: 0 },
      };

      const viewModels = buildCandidateViewModels(mockResult, 'cand-01');
      expect(viewModels).toHaveLength(2);
      expect(viewModels[0].flowState).toBe('FLOW_WARNING');
      expect(viewModels[1].flowState).toBe('FLOW_VALID');

      const html = renderToStaticMarkup(
        React.createElement(AlternativeLayoutPanel, {
          layoutEngineResult: mockResult,
          activeCandidateId: 'cand-01',
          onSelectCandidate: vi.fn(),
        })
      );
      expect(html).toContain('FLOW WARNING');
      expect(html).toContain('FLOW VALID');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Backward Compatibility for Legacy Projects
  // ---------------------------------------------------------------------------
  describe('10. Legacy Projects Without Flow Analysis', () => {
    it('10. renders gracefully without crashing when flowAnalysis is undefined/null', () => {
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: null,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('Vehicle flow analysis unavailable for this project');
      expect(html).toContain('UNAVAILABLE');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Golden Path Layout Flow Integration
  // ---------------------------------------------------------------------------
  describe('11. Golden Path Layout Flow Integration', () => {
    it('11. verifies full orchestration automatically attaches valid flowAnalysis to candidates', () => {
      const sampleRequirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Mobil Maju Jaya',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: {
          widthMeters: 40,
          lengthMeters: 30,
          roadOrientation: 'south',
        },
        building: {
          widthMeters: 35,
          lengthMeters: 25,
        },
        access: {
          entryPosition: 'front_right',
        },
        services: [
          { serviceType: 'general_service', bayCount: 3 },
        ],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate?.flowAnalysis).toBeDefined();
      expect(result.bestCandidate?.flowAnalysis?.isConnected).toBe(true);
      expect(result.bestCandidate?.flowAnalysis?.overallState).toBe('FLOW_WARNING');

      // Test rendering in ValidationPanel
      const html = renderToStaticMarkup(
        React.createElement(ValidationPanel, {
          report: mockReport,
          flowAnalysis: result.bestCandidate?.flowAnalysis,
          onSelectObject: vi.fn(),
        })
      );
      expect(html).toContain('FLOW WARNING');
      expect(html).toContain('Service Bays: 3/3 connected');
      expect(html).toContain('Vehicle maneuverability not yet verified');
    });
  });
});
