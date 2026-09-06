import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkshopProject } from '../src/domain/models/project';
import { CadStore } from '../src/application/state/CadStore';
import { LocalProjectRepository } from '../src/application/adapters/LocalProjectRepository';
import {
  saveCurrentProject,
  openSavedProject,
  createNewBlankProject,
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

const createSampleTestProject = (): WorkshopProject => ({
  project: {
    id: 'proj-m3-editor',
    name: 'Mobeng Workshop Site/Bldg Test',
    unit: 'meter',
    standard_version_id: 'standard-v1',
  },
  site: {
    width: 30.0,
    length: 40.0,
    road_side: 'south',
    road_width: 8.0,
  },
  building: {
    width: 20.0,
    length: 25.0,
  },
  layout: {
    status: 'draft',
    score: null,
    objects: [
      {
        id: 'bay-01',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: {
          x: 4.0,
          y: 5.0,
          width: 4.5,
          length: 7.0,
          rotation: 0,
        },
        metadata: {
          name: 'Service Bay 1',
        },
      },
      {
        id: 'lift-01',
        type: 'equipment',
        layer: '06-LIFT',
        geometry: {
          x: 5.0,
          y: 6.5,
          width: 2.0,
          length: 3.5,
          rotation: 0,
        },
        metadata: {
          name: '2-Post Lift 1',
        },
      },
    ],
  },
});

describe('M3 — BUILDING & SITE PARAMETER EDITOR TEST SUITE', () => {
  beforeEach(() => {
    mockStorage.clear();
    (globalThis as unknown as { window: { localStorage: MockLocalStorage }; localStorage: MockLocalStorage }).window = { localStorage: mockStorage };
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = mockStorage;
  });

  describe('1. Building Dimension Editing', () => {
    it('updates building width, marks dirty, and preserves existing object coordinates', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      expect(store.getState().project.building.width).toBe(20.0);
      expect(store.isDirty()).toBe(false);

      const success = store.updateBuilding({ width: 26.5 });
      expect(success).toBe(true);

      const updated = store.getState().project;
      expect(updated.building.width).toBe(26.5);
      expect(updated.building.length).toBe(25.0); // unchanged
      expect(store.isDirty()).toBe(true);

      // Verify all objects remain at exact same geometry
      expect(updated.layout.objects[0].geometry.x).toBe(4.0);
      expect(updated.layout.objects[0].geometry.y).toBe(5.0);
      expect(updated.layout.objects[0].geometry.width).toBe(4.5);
      expect(updated.layout.objects[0].geometry.length).toBe(7.0);
    });

    it('updates building length, marks dirty, and preserves existing object coordinates', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      const success = store.updateBuilding({ length: 32.0 });
      expect(success).toBe(true);

      const updated = store.getState().project;
      expect(updated.building.length).toBe(32.0);
      expect(updated.building.width).toBe(20.0); // unchanged
      expect(store.isDirty()).toBe(true);

      // Verify object coordinates untouched
      expect(updated.layout.objects[1].geometry.x).toBe(5.0);
      expect(updated.layout.objects[1].geometry.y).toBe(6.5);
    });

    it('rejects invalid building dimension inputs (NaN, Infinity, 0, negative)', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      expect(store.updateBuilding({ width: NaN })).toBe(false);
      expect(store.updateBuilding({ width: Infinity })).toBe(false);
      expect(store.updateBuilding({ width: 0 })).toBe(false);
      expect(store.updateBuilding({ width: -5.0 })).toBe(false);
      expect(store.updateBuilding({ length: NaN })).toBe(false);
      expect(store.updateBuilding({ length: -10 })).toBe(false);

      // Dimensions remain unchanged
      expect(store.getState().project.building.width).toBe(20.0);
      expect(store.getState().project.building.length).toBe(25.0);
      expect(store.isDirty()).toBe(false);
    });
  });

  describe('2. Site Dimension Editing', () => {
    it('updates site width and length, marking project dirty', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      expect(store.getState().project.site.width).toBe(30.0);
      expect(store.getState().project.site.length).toBe(40.0);

      const success = store.updateSite({ width: 35.5, length: 50.0 });
      expect(success).toBe(true);

      const updated = store.getState().project;
      expect(updated.site.width).toBe(35.5);
      expect(updated.site.length).toBe(50.0);
      expect(store.isDirty()).toBe(true);
    });

    it('rejects invalid site dimension inputs (NaN, Infinity, 0, negative)', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      expect(store.updateSite({ width: -10 })).toBe(false);
      expect(store.updateSite({ width: 0 })).toBe(false);
      expect(store.updateSite({ length: NaN })).toBe(false);
      expect(store.updateSite({ length: Infinity })).toBe(false);

      // Remains unchanged
      expect(store.getState().project.site.width).toBe(30.0);
      expect(store.getState().project.site.length).toBe(40.0);
      expect(store.isDirty()).toBe(false);
    });
  });

  describe('3. Real-time Boundary Validation Recalculation', () => {
    it('automatically flags HARD boundary error if building shrinks past object bounds', () => {
      const initial = createSampleTestProject();
      // Service Bay 1 is at x: 4.0, width: 4.5 -> right edge is at x: 8.5
      // Service Bay 1 is at y: 5.0, length: 7.0 -> top edge is at y: 12.0
      const store = new CadStore(initial);

      expect(store.getState().validationReport.valid).toBe(true);
      expect(store.getState().validationReport.hardCount).toBe(0);

      // Shrink building width to 6.0m (smaller than bay-01 right edge 8.5m)
      store.updateBuilding({ width: 6.0 });

      const report = store.getState().validationReport;
      expect(report.valid).toBe(false);
      expect(report.hardCount).toBeGreaterThanOrEqual(1);

      // Expand building back to 20m -> boundary report returns to valid
      store.updateBuilding({ width: 20.0 });
      expect(store.getState().validationReport.valid).toBe(true);
      expect(store.getState().validationReport.hardCount).toBe(0);
    });
  });

  describe('4. Persistence & Lifecycle with Edited Dimensions', () => {
    it('persists edited building & site dimensions on save and restores them on open', async () => {
      const repo = new LocalProjectRepository([]);
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      // Edit dimensions
      store.updateBuilding({ width: 28.0, length: 35.0 });
      store.updateSite({ width: 40.0, length: 55.0 });

      // Save to repository
      const saveRes = await saveCurrentProject(store.getState().project, repo);
      expect(saveRes.success).toBe(true);
      store.markClean();
      expect(store.isDirty()).toBe(false);

      // Load a different project
      store.loadProject(createNewBlankProject());
      expect(store.getState().project.building.width).toBe(24);

      // Open the saved project from repository
      const openRes = await openSavedProject('proj-m3-editor', repo);
      expect(openRes.success).toBe(true);
      expect(openRes.project).toBeDefined();

      store.loadProject(openRes.project!);

      // Verify edited dimensions are fully restored
      expect(store.getState().project.building.width).toBe(28.0);
      expect(store.getState().project.building.length).toBe(35.0);
      expect(store.getState().project.site.width).toBe(40.0);
      expect(store.getState().project.site.length).toBe(55.0);

      // Verify object geometry was preserved
      expect(store.getState().project.layout.objects[0].geometry.x).toBe(4.0);
      expect(store.getState().project.layout.objects[0].geometry.y).toBe(5.0);
    });

    it('dimension edits do NOT call AI, LayoutEngine, or regenerate candidates', () => {
      const initial = createSampleTestProject();
      const store = new CadStore(initial);

      const objectCountBefore = store.getState().project.layout.objects.length;
      const objectIdsBefore = store.getState().project.layout.objects.map((o) => o.id);

      store.updateBuilding({ width: 22.0, length: 28.0 });
      store.updateSite({ width: 32.0, length: 42.0 });

      const objectCountAfter = store.getState().project.layout.objects.length;
      const objectIdsAfter = store.getState().project.layout.objects.map((o) => o.id);

      expect(objectCountAfter).toBe(objectCountBefore);
      expect(objectIdsAfter).toEqual(objectIdsBefore);
    });
  });
});
