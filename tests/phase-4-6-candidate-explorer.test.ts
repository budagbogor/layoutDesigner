import { describe, it, expect, vi } from 'vitest';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import { WorkshopStandard } from '@/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';
import { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';
import { RequirementMapper } from '@/application/requirements/requirementMapper';
import { candidateToCadProject } from '@/domain/export/cadRepresentation';
import { CadStore } from '@/application/state/CadStore';
import {
  buildCandidateViewModels,
  AlternativeLayoutPanel,
} from '@/presentation/components/panels/AlternativeLayoutPanel';
import { OrchestratedCandidate, LayoutEngineResult } from '@/domain/engine/orchestrator/orchestratorTypes';

describe('FASE 4.6 — Alternative Layout Explorer & Switcher (Phase 1)', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  // Standard multi-bay program that yields multiple valid candidates across strategies and arrangements
  const sampleRequirement: WorkshopLayoutRequirement = {
    projectName: 'Bengkel Mobil Maju Jaya',
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

  it('1. Engine generates valid alternative candidates alongside the best candidate', () => {
    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    expect(result.status).toBe('SUCCESS');
    expect(result.bestCandidate).toBeDefined();
    expect(result.bestCandidate?.isValid).toBe(true);
    expect(result.bestCandidate?.validity).toBe('VALID');

    // Must have alternative candidates produced
    expect(result.alternativeCandidates.length).toBeGreaterThan(0);
    for (const alt of result.alternativeCandidates) {
      expect(alt.isValid).toBe(true);
      expect(alt.validity).toBe('VALID');
      expect(alt.candidateId).not.toBe(result.bestCandidate?.candidateId);
    }
  });

  it('2. View Model correctly extracts valid candidates in deterministic rank order (#1 best, #2, #3 alternatives)', () => {
    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    const viewModels = buildCandidateViewModels(result, null);

    expect(viewModels.length).toBe(1 + result.alternativeCandidates.length);

    // Rank #1 is always bestCandidate
    expect(viewModels[0].rank).toBe(1);
    expect(viewModels[0].isBest).toBe(true);
    expect(viewModels[0].isActive).toBe(true); // Default active when activeCandidateId is null
    expect(viewModels[0].candidateId).toBe(result.bestCandidate!.candidateId);
    expect(viewModels[0].strategy).toBe(result.bestCandidate!.strategy.replace(/_/g, ' '));
    expect(viewModels[0].score).toBe(result.bestCandidate!.score);
    expect(viewModels[0].bayCount).toBeGreaterThan(0);
    expect(viewModels[0].ancillaryCount).toBeGreaterThan(0);
    expect(viewModels[0].isValid).toBe(true);

    // Rank #2, #3... are alternativeCandidates
    for (let i = 1; i < viewModels.length; i++) {
      const alt = result.alternativeCandidates[i - 1];
      expect(viewModels[i].rank).toBe(i + 1);
      expect(viewModels[i].isBest).toBe(false);
      expect(viewModels[i].isActive).toBe(false);
      expect(viewModels[i].candidateId).toBe(alt.candidateId);
      expect(viewModels[i].strategy).toBe(alt.strategy.replace(/_/g, ' '));
      expect(viewModels[i].score).toBe(alt.score);
    }
  });

  it('3. DISQUALIFIED candidates are strictly excluded from selectable candidates', () => {
    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    // Construct a mock result containing disqualified candidates
    const disqualifiedMock: OrchestratedCandidate = {
      candidateId: 'candidate-disqualified-mock',
      strategy: 'CAPACITY',
      arrangement: 'SINGLE_COMB_NORTH',
      validity: 'DISQUALIFIED',
      isValid: false,
      rejectionReasons: ['Building boundary collision'],
      hardViolations: [],
      warnings: [],
      score: null,
      scoreBreakdown: null,
      provenance: result.bestCandidate!.provenance,
      attemptedArrangements: ['SINGLE_COMB_NORTH'],
      layout: result.bestCandidate!.layout,
    };

    const mockResultWithDisqualified: LayoutEngineResult = {
      ...result,
      alternativeCandidates: [...result.alternativeCandidates, disqualifiedMock],
      disqualifiedCandidates: [...result.disqualifiedCandidates, disqualifiedMock],
    };

    const viewModels = buildCandidateViewModels(mockResultWithDisqualified, null);
    const hasDisqualified = viewModels.some((vm) => vm.candidateId === 'candidate-disqualified-mock');
    expect(hasDisqualified).toBe(false);
  });

  it('4. CadStore.loadProject replaces active project cleanly without geometry corruption or undo pollution', () => {
    const mapper = new RequirementMapper();
    const mapping = mapper.map(sampleRequirement, accessor);
    expect(mapping.engineInput).toBeDefined();

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    const bestProject = candidateToCadProject(result.bestCandidate!, mapping.engineInput!);
    const store = new CadStore(bestProject);

    // Initial state
    expect(store.getState().project.project.id).toBe(bestProject.project.id);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);

    // Perform an edit on bestProject
    store.moveObject(store.getState().project.layout.objects[0].id, 1, 0);
    expect(store.getState().canUndo).toBe(true);

    // Load an alternative candidate project
    const altCandidate = result.alternativeCandidates[0];
    const altProject = candidateToCadProject(altCandidate, mapping.engineInput!);

    store.loadProject(altProject);

    const loadedState = store.getState();
    expect(loadedState.project.project.id).toBe(altProject.project.id);
    // Undo / Redo history must be cleanly reset
    expect(loadedState.canUndo).toBe(false);
    expect(loadedState.canRedo).toBe(false);
    expect(loadedState.selectedIds).toEqual([]);
    expect(loadedState.validationReport).toBeDefined();
    expect(loadedState.validationReport.valid).toBe(true);
    expect(loadedState.validationReport.hardCount).toBe(0);
  });

  it('5. Switching between Best and Alternative candidates maps to the correct source candidate objects', () => {
    const mapper = new RequirementMapper();
    const mapping = mapper.map(sampleRequirement, accessor);
    const engineInput = mapping.engineInput!;

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    const bestCad = candidateToCadProject(result.bestCandidate!, engineInput);
    const altCad = candidateToCadProject(result.alternativeCandidates[0], engineInput);

    const store = new CadStore(bestCad);

    // Switch to alternative
    store.loadProject(altCad);
    expect(store.getState().project.project.id).toBe(altCad.project.id);
    expect(store.getState().project.layout.objects.length).toBe(altCad.layout.objects.length);

    // Switch back to best
    store.loadProject(bestCad);
    expect(store.getState().project.project.id).toBe(bestCad.project.id);
    expect(store.getState().project.layout.objects.length).toBe(bestCad.layout.objects.length);
  });

  it('6. Geometry exact equality: candidate switching preserves source candidate geometry with zero shift', () => {
    const mapper = new RequirementMapper();
    const mapping = mapper.map(sampleRequirement, accessor);
    const engineInput = mapping.engineInput!;

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    for (const cand of [result.bestCandidate!, ...result.alternativeCandidates]) {
      const cadProject = candidateToCadProject(cand, engineInput);

      // Verify every object in candidate layout exists in CAD project with identical coordinates and dimensions
      for (const srcObj of cand.layout.objects) {
        const cadObj = cadProject.layout.objects.find((o) => o.id === srcObj.id);
        expect(cadObj).toBeDefined();
        expect(cadObj!.geometry.x).toBe(srcObj.geometry.x);
        expect(cadObj!.geometry.y).toBe(srcObj.geometry.y);
        expect(cadObj!.geometry.width).toBe(srcObj.geometry.width);
        expect(cadObj!.geometry.length).toBe(srcObj.geometry.length);
        expect(cadObj!.geometry.rotation).toBe(srcObj.geometry.rotation);
      }
    }
  });

  it('7. LayoutEngineResult and bestCandidate remain strictly immutable throughout candidate switching', () => {
    const mapper = new RequirementMapper();
    const mapping = mapper.map(sampleRequirement, accessor);
    const engineInput = mapping.engineInput!;

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    const initialBestId = result.bestCandidate!.candidateId;
    const initialBestScore = result.bestCandidate!.score;
    const initialAltIds = result.alternativeCandidates.map((c) => c.candidateId);

    // Perform multiple conversions and loads
    const alt0 = candidateToCadProject(result.alternativeCandidates[0], engineInput);
    const best = candidateToCadProject(result.bestCandidate!, engineInput);

    const store = new CadStore(best);
    store.loadProject(alt0);
    store.moveObject(store.getState().project.layout.objects[0].id, 2, 2);
    store.loadProject(best);

    // Engine result must remain completely untouched
    expect(result.bestCandidate!.candidateId).toBe(initialBestId);
    expect(result.bestCandidate!.score).toBe(initialBestScore);
    expect(result.alternativeCandidates.map((c) => c.candidateId)).toEqual(initialAltIds);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('8. Active candidate view model highlights the selected candidate accurately', () => {
    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    const altId = result.alternativeCandidates[0].candidateId;

    // When altId is active
    const viewModelsWithAltActive = buildCandidateViewModels(result, altId);
    expect(viewModelsWithAltActive[0].isActive).toBe(false); // Best is not active
    expect(viewModelsWithAltActive[1].isActive).toBe(true);  // Alt #1 is active

    // When best is active
    const viewModelsWithBestActive = buildCandidateViewModels(result, result.bestCandidate!.candidateId);
    expect(viewModelsWithBestActive[0].isActive).toBe(true);
    expect(viewModelsWithBestActive[1].isActive).toBe(false);
  });

  it('9. Switching candidate does not re-run AI or re-generate geometry (deterministic zero-computation)', () => {
    const mapper = new RequirementMapper();
    const mapping = mapper.map(sampleRequirement, accessor);
    const engineInput = mapping.engineInput!;

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(sampleRequirement, accessor);

    // Spy on candidateGenerator or orchestrator to ensure they are NOT called during switching
    const generateSpy = vi.spyOn(orchestrator, 'generateFromRequirement');

    // Switch candidate
    const altCad = candidateToCadProject(result.alternativeCandidates[0], engineInput);
    const store = new CadStore(altCad);

    expect(generateSpy).not.toHaveBeenCalled();
    generateSpy.mockRestore();
  });
});
