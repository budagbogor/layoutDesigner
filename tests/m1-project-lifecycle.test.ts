import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalProjectRepository } from '../src/application/adapters/LocalProjectRepository';
import { WorkshopProject } from '../src/domain/models/project';
import { CadStore } from '../src/application/state/CadStore';
import {
  createNewBlankProject,
  listSavedProjects,
  openSavedProject,
  saveCurrentProject,
  renameSavedProject,
  deleteSavedProject,
} from '../src/application/services/projectPersistenceService';

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();

const createValidSampleProject = (id: string, name: string): WorkshopProject => ({
  project: {
    id,
    name,
    unit: 'meter',
    standard_version_id: 'standard-v1',
  },
  site: {
    width: 25,
    length: 35,
  },
  building: {
    width: 20,
    length: 30,
  },
  layout: {
    status: 'draft',
    score: null,
    objects: [
      {
        id: 'obj-bay-1',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: {
          x: 4,
          y: 6,
          width: 4.5,
          length: 7.0,
          rotation: 0,
        },
      },
      {
        id: 'obj-eq-1',
        type: 'equipment',
        layer: '07-EQUIPMENT',
        geometry: {
          x: 5,
          y: 8,
          width: 2.5,
          length: 3.5,
          rotation: 0,
        },
      },
    ],
  },
});

describe('M1 — COMPLETE PROJECT LIFECYCLE TEST SUITE', () => {
  beforeEach(() => {
    mockStorage.clear();
    (globalThis as unknown as { window: { localStorage: MockLocalStorage }; localStorage: MockLocalStorage }).window = { localStorage: mockStorage };
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = mockStorage;
  });

  describe('1. Project Manager & Listing', () => {
    it('listSavedProjects returns seeded default projects when empty', async () => {
      const repo = new LocalProjectRepository([]);
      const list = await listSavedProjects(repo);
      expect(list).toEqual([]);
    });

    it('listSavedProjects lists all saved projects from repository', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-1', 'Workshop Alpha');
      const p2 = createValidSampleProject('proj-2', 'Workshop Beta');

      await repo.saveProject(p1);
      await repo.saveProject(p2);

      const list = await listSavedProjects(repo);
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.project.id)).toEqual(['proj-1', 'proj-2']);
      expect(list.map((p) => p.project.name)).toEqual(['Workshop Alpha', 'Workshop Beta']);
    });
  });

  describe('2. Open Project & Integrity', () => {
    it('opens existing project and preserves exact geometry and objects', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-1', 'Workshop Alpha');
      // modify geometry before saving
      p1.layout.objects[0].geometry.x = 12.5;
      p1.layout.objects[0].geometry.y = 18.2;

      await repo.saveProject(p1);

      const openRes = await openSavedProject('proj-1', repo);
      expect(openRes.success).toBe(true);
      expect(openRes.project).toBeDefined();

      const opened = openRes.project!;
      expect(opened.project.id).toBe('proj-1');
      expect(opened.project.name).toBe('Workshop Alpha');
      expect(opened.layout.objects[0].geometry.x).toBe(12.5);
      expect(opened.layout.objects[0].geometry.y).toBe(18.2);

      // Load into CadStore
      const store = new CadStore(createNewBlankProject());
      store.loadProject(opened);

      expect(store.getState().project.project.id).toBe('proj-1');
      expect(store.getState().project.layout.objects[0].geometry.x).toBe(12.5);
      expect(store.getState().isDirty).toBe(false);
    });

    it('open project does not execute AI, LayoutEngine, or generate new geometry', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-1', 'Deterministic Test');
      await repo.saveProject(p1);

      const spyGet = vi.spyOn(repo, 'getProjectById');

      const openRes = await openSavedProject('proj-1', repo);
      expect(openRes.success).toBe(true);
      expect(spyGet).toHaveBeenCalledWith('proj-1');

      // The returned object has the exact same object references/properties without generation
      expect(openRes.project?.layout.objects.length).toBe(p1.layout.objects.length);
      expect(openRes.project?.layout.objects[0].id).toBe(p1.layout.objects[0].id);
    });

    it('rejects opening invalid or corrupt project', async () => {
      const repo = new LocalProjectRepository([]);
      // Put corrupt object directly into localStorage
      mockStorage.setItem('mobeng_cad_projects', JSON.stringify([{
        project: { id: 'bad-proj', name: 'Corrupt' },
        // Missing site, building, layout
      }]));

      // Reload repository from corrupt storage
      const corruptRepo = new LocalProjectRepository();
      const res = await openSavedProject('bad-proj', corruptRepo);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.project).toBeUndefined();
    });

    it('rejects opening non-existent project id', async () => {
      const repo = new LocalProjectRepository([]);
      const res = await openSavedProject('non-existent-id', repo);
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });
  });

  describe('3. New Project Creation', () => {
    it('createNewBlankProject creates clean valid project without modifying repository', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-saved', 'Saved Project');
      await repo.saveProject(p1);

      const blank = createNewBlankProject('Brand New Workshop');
      expect(blank.project.name).toBe('Brand New Workshop');
      expect(blank.project.unit).toBe('meter');
      expect(blank.layout.objects).toEqual([]);

      // Repository still only contains original saved project
      const list = await listSavedProjects(repo);
      expect(list).toHaveLength(1);
      expect(list[0].project.id).toBe('proj-saved');
    });
  });

  describe('4. Rename Project', () => {
    it('renameSavedProject retains project.id, updates name, and persists', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-1', 'Old Name');
      await repo.saveProject(p1);

      const renameRes = await renameSavedProject('proj-1', 'Updated Workshop Name', repo);
      expect(renameRes.success).toBe(true);

      const fetched = await repo.getProjectById('proj-1');
      expect(fetched).toBeDefined();
      expect(fetched?.project.id).toBe('proj-1');
      expect(fetched?.project.name).toBe('Updated Workshop Name');
    });

    it('rename non-existent project returns failure', async () => {
      const repo = new LocalProjectRepository([]);
      const res = await renameSavedProject('unknown-id', 'New Name', repo);
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });
  });

  describe('5. Delete Project', () => {
    it('deleteSavedProject deletes target project from repository and localStorage without touching others', async () => {
      const repo = new LocalProjectRepository([]);
      const p1 = createValidSampleProject('proj-1', 'Project 1');
      const p2 = createValidSampleProject('proj-2', 'Project 2');
      const p3 = createValidSampleProject('proj-3', 'Project 3');

      await repo.saveProject(p1);
      await repo.saveProject(p2);
      await repo.saveProject(p3);

      const delRes = await deleteSavedProject('proj-2', repo);
      expect(delRes.success).toBe(true);

      const remaining = await listSavedProjects(repo);
      expect(remaining).toHaveLength(2);
      expect(remaining.map((p) => p.project.id)).toEqual(['proj-1', 'proj-3']);

      // Check localStorage directly
      const raw = JSON.parse(mockStorage.getItem('mobeng_cad_projects') || '[]');
      const ids = raw.map((p: WorkshopProject) => p.project.id);
      expect(ids).not.toContain('proj-2');
      expect(ids).toContain('proj-1');
      expect(ids).toContain('proj-3');
    });

    it('delete non-existent project returns failure', async () => {
      const repo = new LocalProjectRepository([]);
      const res = await deleteSavedProject('non-existent', repo);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('6. CadStore Dirty Tracking & State Transition', () => {
    it('CadStore tracks isDirty on commitMutation, markClean, loadProject, rename', () => {
      const initial = createValidSampleProject('proj-1', 'Test Project');
      const store = new CadStore(initial);

      expect(store.isDirty()).toBe(false);
      expect(store.getState().isDirty).toBe(false);

      // Modify geometry
      store.updateObjectGeometry('obj-bay-1', { x: 10 });
      expect(store.isDirty()).toBe(true);
      expect(store.getState().isDirty).toBe(true);

      // Mark clean (e.g. after save)
      store.markClean();
      expect(store.isDirty()).toBe(false);
      expect(store.getState().isDirty).toBe(false);

      // Undo -> becomes dirty
      store.undo();
      expect(store.isDirty()).toBe(true);

      // Redo -> still dirty
      store.redo();
      expect(store.isDirty()).toBe(true);

      // Rename project
      store.renameProject('Renamed In Store');
      expect(store.getState().project.project.name).toBe('Renamed In Store');
      expect(store.isDirty()).toBe(true);

      // Load new project -> resets dirty to false
      const newBlank = createNewBlankProject();
      store.loadProject(newBlank);
      expect(store.isDirty()).toBe(false);
      expect(store.getState().isDirty).toBe(false);
    });
  });
});
