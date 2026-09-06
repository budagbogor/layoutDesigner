import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalProjectRepository } from '@/application/adapters/LocalProjectRepository';
import {
  saveCurrentProject,
  SaveProjectResult,
} from '@/application/services/projectPersistenceService';
import {
  validateWorkshopProject,
  ProjectValidationError,
  ProjectPersistenceError,
} from '@/domain/validation/projectValidator';
import { CadStore } from '@/application/state/CadStore';
import { WorkshopProject } from '@/domain/models/project';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import { WorkshopStandard } from '@/domain/models/standard';
import { RequirementMapper } from '@/application/requirements/requirementMapper';
import { candidateToCadProject } from '@/domain/export/cadRepresentation';
import { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';
import demoStandardFixture from '../data/demo-standard.json';

describe('FASE 4.7B — Persistence Foundation: Save Current CAD Project', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  const sampleRequirement: WorkshopLayoutRequirement = {
    projectName: 'Bengkel Persist Test',
    workshopType: 'car_service',
    vehicleCategory: 'mpv',
    priority: 'BALANCED_EFFICIENCY',
    site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
    building: { widthMeters: 24, lengthMeters: 30 },
    access: { entryPosition: 'front_right' },
    services: [{ serviceType: 'general_service', bayCount: 3 }],
    ancillarySpaces: {
      customerLounge: true,
      cashierOffice: true,
      partsWarehouse: true,
      restroom: true,
    },
  };

  const validSampleProject: WorkshopProject = {
    project: {
      id: 'proj-persist-01',
      name: 'Workshop Alpha',
      unit: 'meter',
      standard_version_id: 'std-v1',
    },
    site: { width: 30, length: 40 },
    building: { width: 24, length: 30 },
    layout: {
      status: 'draft',
      score: 85.5,
      objects: [
        {
          id: 'bay-01',
          type: 'service_bay',
          layer: '08-SERVICE-BAY',
          geometry: { x: 2.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 },
        },
      ],
    },
  };

  describe('1. Structural Validation Boundary', () => {
    it('validates a correct WorkshopProject without error', () => {
      expect(() => validateWorkshopProject(validSampleProject)).not.toThrow();
    });

    it('rejects null or non-object input', () => {
      expect(() => validateWorkshopProject(null)).toThrow(ProjectValidationError);
      expect(() => validateWorkshopProject('not-an-object')).toThrow(ProjectValidationError);
    });

    it('rejects project missing required id or name', () => {
      const invalidNoId = {
        ...validSampleProject,
        project: { ...validSampleProject.project, id: '' },
      };
      expect(() => validateWorkshopProject(invalidNoId)).toThrow(ProjectValidationError);

      const invalidNoName = {
        ...validSampleProject,
        project: { ...validSampleProject.project, name: '' },
      };
      expect(() => validateWorkshopProject(invalidNoName)).toThrow(ProjectValidationError);
    });

    it('rejects project with invalid unit or missing standard_version_id', () => {
      const invalidUnit = {
        ...validSampleProject,
        project: { ...validSampleProject.project, unit: 'millimeter' as any },
      };
      expect(() => validateWorkshopProject(invalidUnit)).toThrow(ProjectValidationError);

      const invalidStd = {
        ...validSampleProject,
        project: { ...validSampleProject.project, standard_version_id: '' },
      };
      expect(() => validateWorkshopProject(invalidStd)).toThrow(ProjectValidationError);
    });

    it('rejects non-positive or NaN building and site dimensions', () => {
      const invalidSite = {
        ...validSampleProject,
        site: { width: -10, length: 40 },
      };
      expect(() => validateWorkshopProject(invalidSite)).toThrow(ProjectValidationError);

      const invalidBuilding = {
        ...validSampleProject,
        building: { width: 24, length: NaN },
      };
      expect(() => validateWorkshopProject(invalidBuilding)).toThrow(ProjectValidationError);
    });

    it('rejects objects with invalid geometry coordinates or dimensions', () => {
      const invalidObject = {
        ...validSampleProject,
        layout: {
          ...validSampleProject.layout,
          objects: [
            {
              id: 'bay-bad',
              type: 'service_bay',
              layer: '08-SERVICE-BAY',
              geometry: { x: 2.0, y: 3.0, width: -4.0, length: 7.0, rotation: 0 },
            },
          ],
        },
      };
      expect(() => validateWorkshopProject(invalidObject)).toThrow(ProjectValidationError);
    });
  });

  describe('2. LocalProjectRepository Save & Retrieval', () => {
    it('saves valid project and retrieves deep clone cleanly', async () => {
      const repo = new LocalProjectRepository();
      await repo.saveProject(validSampleProject);

      const retrieved = await repo.getProjectById('proj-persist-01');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.project.id).toBe('proj-persist-01');
      expect(retrieved?.project.name).toBe('Workshop Alpha');
      expect(retrieved?.layout.objects.length).toBe(1);
      expect(retrieved?.layout.objects[0].id).toBe('bay-01');

      // Verify deep clone isolation
      retrieved!.project.name = 'Mutated Copy';
      const freshFetch = await repo.getProjectById('proj-persist-01');
      expect(freshFetch?.project.name).toBe('Workshop Alpha');
    });

    it('rejects saving structurally invalid project via repository', async () => {
      const repo = new LocalProjectRepository();
      const corruptedProject = {
        ...validSampleProject,
        project: { ...validSampleProject.project, id: '' },
      };

      await expect(repo.saveProject(corruptedProject as any)).rejects.toThrow(
        ProjectValidationError
      );
    });
  });

  describe('3. Application Persistence Service (saveCurrentProject)', () => {
    it('returns structured success result when saving valid project', async () => {
      const repo = new LocalProjectRepository();
      const result: SaveProjectResult = await saveCurrentProject(validSampleProject, repo);

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('proj-persist-01');
      expect(result.error).toBeUndefined();
    });

    it('returns structured VALIDATION_ERROR result when project is invalid', async () => {
      const repo = new LocalProjectRepository();
      const invalidProject = {
        ...validSampleProject,
        building: { width: 0, length: 0 },
      };

      const result = await saveCurrentProject(invalidProject as any, repo);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('Building width must be a positive number');
    });

    it('returns structured STORAGE_ERROR when localStorage throws QuotaExceededError', async () => {
      const repo = new LocalProjectRepository();

      const mockQuotaError = new Error('Quota exceeded');
      mockQuotaError.name = 'QuotaExceededError';

      const prevWindow = (globalThis as any).window;

      (globalThis as any).window = {
        localStorage: {
          setItem: vi.fn().mockImplementation(() => {
            throw mockQuotaError;
          }),
          getItem: vi.fn().mockReturnValue(null),
        },
      };

      try {
        const result = await saveCurrentProject(validSampleProject, repo);
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('STORAGE_ERROR');
        expect(result.error).toContain('Storage quota exceeded');
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = prevWindow;
        }
      }
    });

    it('atomicity: storage write failure rolls back in-memory state for existing projects', async () => {
      const repo = new LocalProjectRepository([validSampleProject]);

      // Verify original baseline in memory
      const original = await repo.getProjectById('proj-persist-01');
      expect(original?.project.name).toBe('Workshop Alpha');

      // Prepare an update with modified name
      const modifiedProject: WorkshopProject = {
        ...validSampleProject,
        project: { ...validSampleProject.project, name: 'Attempted Unsaved Mutation' },
      };

      // Mock localStorage to fail on write
      const mockStorageError = new Error('Disk full');
      mockStorageError.name = 'QuotaExceededError';

      const prevWindow = (globalThis as any).window;
      (globalThis as any).window = {
        localStorage: {
          setItem: vi.fn().mockImplementation(() => {
            throw mockStorageError;
          }),
          getItem: vi.fn().mockReturnValue(null),
        },
      };

      try {
        await expect(repo.saveProject(modifiedProject)).rejects.toThrow(ProjectPersistenceError);

        // Verify in-memory state has been cleanly rolled back to original
        const afterFailedSave = await repo.getProjectById('proj-persist-01');
        expect(afterFailedSave?.project.name).toBe('Workshop Alpha');
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = prevWindow;
        }
      }
    });

    it('atomicity: storage write failure rolls back brand new project addition without leaving ghost entries', async () => {
      const repo = new LocalProjectRepository([validSampleProject]);
      const initialList = await repo.listProjects();
      expect(initialList.length).toBe(1);

      const brandNewProject: WorkshopProject = {
        ...validSampleProject,
        project: { ...validSampleProject.project, id: 'brand-new-proj-999', name: 'Brand New' },
      };

      const mockSecurityError = new Error('Access denied');
      mockSecurityError.name = 'SecurityError';

      const prevWindow = (globalThis as any).window;
      (globalThis as any).window = {
        localStorage: {
          setItem: vi.fn().mockImplementation(() => {
            throw mockSecurityError;
          }),
          getItem: vi.fn().mockReturnValue(null),
        },
      };

      try {
        await expect(repo.saveProject(brandNewProject)).rejects.toThrow(ProjectPersistenceError);

        // Must not leave ghost in memory
        const nonExistent = await repo.getProjectById('brand-new-proj-999');
        expect(nonExistent).toBeNull();

        const finalList = await repo.listProjects();
        expect(finalList.length).toBe(1);
        expect(finalList[0].project.id).toBe('proj-persist-01');
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = prevWindow;
        }
      }
    });
  });

  describe('4. CAD Mutation + Save Flow (Source of Truth = CadStore.project)', () => {
    it('saves exact mutated CAD geometry and verifies persistence', async () => {
      const repo = new LocalProjectRepository();
      const store = new CadStore(validSampleProject);

      // Perform user geometry mutations
      store.moveObject('bay-01', 3.5, 4.2);
      store.resizeObject('bay-01', 5.0, 8.0);
      store.rotateObject('bay-01', 90);

      const mutatedProject = store.getState().project;

      // Persist current edited CAD project
      const saveRes = await saveCurrentProject(mutatedProject, repo);
      expect(saveRes.success).toBe(true);

      // Retrieve directly from repository
      const saved = await repo.getProjectById('proj-persist-01');
      expect(saved).not.toBeNull();

      const savedBay = saved!.layout.objects.find((o) => o.id === 'bay-01')!;
      expect(savedBay).toBeDefined();
      expect(savedBay.geometry.x).toBe(5.5); // 2.0 + 3.5
      expect(savedBay.geometry.y).toBe(7.2); // 3.0 + 4.2
      expect(savedBay.geometry.width).toBe(5.0);
      expect(savedBay.geometry.length).toBe(8.0);
      expect(savedBay.geometry.rotation).toBe(90);

      // Verify that save did NOT alter CadStore state
      expect(store.getState().project.layout.objects[0].geometry).toEqual(savedBay.geometry);
    });
  });

  describe('5. Candidate Switch + CAD Edit + Save Flow', () => {
    it('saves candidate #2 with user edits while leaving LayoutEngineResult immutable', async () => {
      const mapper = new RequirementMapper();
      const mapping = mapper.map(sampleRequirement, accessor);
      expect(mapping.engineInput).toBeDefined();

      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(sampleRequirement, accessor);
      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.alternativeCandidates.length).toBeGreaterThan(0);

      // 1. Initial Best Candidate converted to CAD
      const bestCad = candidateToCadProject(engineResult.bestCandidate!, mapping.engineInput!);
      const store = new CadStore(bestCad);

      // 2. User switches to Alternative Candidate #2
      const altCandidate = engineResult.alternativeCandidates[0];
      const altCad = candidateToCadProject(altCandidate, mapping.engineInput!, {
        projectId: altCandidate.candidateId,
        projectName: 'Candidate #2 Custom',
      });

      store.loadProject(altCad);
      expect(store.getState().project.project.id).toBe(altCandidate.candidateId);

      // 3. User edits Candidate #2 geometry
      const firstObjId = store.getState().project.layout.objects[0].id;
      store.moveObject(firstObjId, 2.0, 1.5);

      const editedAltProject = store.getState().project;

      // 4. Save
      const repo = new LocalProjectRepository();
      const saveRes = await saveCurrentProject(editedAltProject, repo);
      expect(saveRes.success).toBe(true);
      expect(saveRes.projectId).toBe(altCandidate.candidateId);

      // 5. Verify persisted project matches Candidate #2 + edits
      const savedAlt = await repo.getProjectById(altCandidate.candidateId);
      expect(savedAlt).not.toBeNull();
      expect(savedAlt?.project.id).toBe(altCandidate.candidateId);
      expect(savedAlt?.project.name).toBe('Candidate #2 Custom');

      const savedFirstObj = savedAlt!.layout.objects.find((o) => o.id === firstObjId)!;
      expect(savedFirstObj.geometry.x).toBe(editedAltProject.layout.objects[0].geometry.x);
      expect(savedFirstObj.geometry.y).toBe(editedAltProject.layout.objects[0].geometry.y);

      // 6. Verify source LayoutEngineResult remains 100% immutable
      expect(Object.isFrozen(engineResult)).toBe(true);
      expect(engineResult.bestCandidate?.candidateId).not.toBe(altCandidate.candidateId);
      expect(engineResult.alternativeCandidates[0].candidateId).toBe(altCandidate.candidateId);
    });
  });
});
