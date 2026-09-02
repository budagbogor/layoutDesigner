import { describe, it, expect, beforeEach } from 'vitest';
import { CadStore } from '@/application/state/CadStore';
import type { WorkshopProject, LayoutObject } from '@/domain/models/project';

describe('CadStore — Application State & Undo/Redo Pipeline', () => {
  let sampleProject: WorkshopProject;

  beforeEach(() => {
    sampleProject = {
      project: {
        id: 'test-proj-01',
        name: 'Test CAD Project',
        unit: 'meter',
        standard_version_id: 'std-v1',
      },
      site: { width: 30, length: 40 },
      building: { width: 18.0, length: 25.0 },
      layout: {
        status: 'draft',
        score: null,
        objects: [
          {
            id: 'bay-1',
            type: 'service_bay',
            layer: '08-SERVICE-BAY',
            geometry: { x: 2.0, y: 2.0, width: 4.0, length: 7.0, rotation: 0 },
          },
        ],
      },
    };
  });

  describe('Initial State', () => {
    it('initializes with provided project, clean history, and default viewport', () => {
      const store = new CadStore(sampleProject);
      const state = store.getState();

      expect(state.project.project.id).toBe('test-proj-01');
      expect(state.project.layout.objects).toHaveLength(1);
      expect(state.selectedIds).toEqual([]);
      expect(state.activeTool).toBe('select');
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);

      // Default Viewport
      expect(state.viewport.zoom).toBe(1.0);
      expect(state.viewport.panX).toBe(0);
      expect(state.viewport.panY).toBe(0);
      expect(state.viewport.gridSize).toBe(0.1);
      expect(state.viewport.snapEnabled).toBe(true);

      // Initial validation on valid object
      expect(state.validationReport.valid).toBe(true);
      expect(state.validationReport.hardCount).toBe(0);
    });
  });

  describe('Selection Management', () => {
    it('selects single object and replaces previous selection', () => {
      const store = new CadStore(sampleProject);
      store.select('bay-1');
      expect(store.getState().selectedIds).toEqual(['bay-1']);

      store.select('bay-2');
      expect(store.getState().selectedIds).toEqual(['bay-2']);
    });

    it('supports multi-selection without clearing existing items', () => {
      const store = new CadStore(sampleProject);
      store.select('bay-1');
      store.select('bay-2', true);
      expect(store.getState().selectedIds).toEqual(['bay-1', 'bay-2']);
    });

    it('toggles selection and clears selection', () => {
      const store = new CadStore(sampleProject);
      store.select('bay-1');
      store.toggleSelect('bay-2');
      expect(store.getState().selectedIds).toEqual(['bay-1', 'bay-2']);

      store.toggleSelect('bay-1');
      expect(store.getState().selectedIds).toEqual(['bay-2']);

      store.clearSelection();
      expect(store.getState().selectedIds).toEqual([]);
    });

    it('does NOT pollute undo/redo history when changing selection', () => {
      const store = new CadStore(sampleProject);
      store.select('bay-1');
      store.clearSelection();

      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().canRedo).toBe(false);
    });
  });

  describe('Tool & Viewport State', () => {
    it('updates active tool without affecting undo stack', () => {
      const store = new CadStore(sampleProject);
      store.setActiveTool('bay');
      expect(store.getState().activeTool).toBe('bay');
      expect(store.getState().canUndo).toBe(false);

      store.setActiveTool('pan');
      expect(store.getState().activeTool).toBe('pan');
    });

    it('updates viewport pan, zoom, grid, and snap settings', () => {
      const store = new CadStore(sampleProject);
      store.setPan(150.5, -75.2);
      store.setZoom(1.5);
      store.setGridSize(0.5);
      store.setSnapEnabled(false);

      const vp = store.getState().viewport;
      expect(vp.panX).toBe(150.5);
      expect(vp.panY).toBe(-75.2);
      expect(vp.zoom).toBe(1.5);
      expect(vp.gridSize).toBe(0.5);
      expect(vp.snapEnabled).toBe(false);
      expect(store.getState().canUndo).toBe(false);
    });

    it('clamps zoom within safe bounds and resets viewport', () => {
      const store = new CadStore(sampleProject);
      store.setZoom(50.0); // should clamp to 10.0
      expect(store.getState().viewport.zoom).toBe(10.0);

      store.setZoom(0.01); // should clamp to 0.1
      expect(store.getState().viewport.zoom).toBe(0.1);

      store.resetViewport();
      expect(store.getState().viewport.zoom).toBe(1.0);
      expect(store.getState().viewport.gridSize).toBe(0.1);
    });
  });

  describe('Object Mutations & Undo/Redo Pipeline', () => {
    it('adds an object and allows undoing and redoing', () => {
      const store = new CadStore(sampleProject);
      const newObj: LayoutObject = {
        id: 'lift-1',
        type: 'equipment',
        layer: '06-LIFT',
        geometry: { x: 5.0, y: 5.0, width: 2.0, length: 3.0, rotation: 0 },
      };

      store.addObject(newObj);
      expect(store.getState().project.layout.objects).toHaveLength(2);
      expect(store.getState().canUndo).toBe(true);
      expect(store.getState().canRedo).toBe(false);

      // Undo
      const undone = store.undo();
      expect(undone).toBe(true);
      expect(store.getState().project.layout.objects).toHaveLength(1);
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().canRedo).toBe(true);

      // Redo
      const redone = store.redo();
      expect(redone).toBe(true);
      expect(store.getState().project.layout.objects).toHaveLength(2);
      expect(store.getState().canUndo).toBe(true);
      expect(store.getState().canRedo).toBe(false);
    });

    it('moves an object with grid snapping and undoes', () => {
      const store = new CadStore(sampleProject);
      // Original is at (2.0, 2.0)
      store.moveObject('bay-1', 1.05, 2.03); // snaps with grid 0.1 to delta 1.1, 2.0 -> (3.1, 4.0)

      const moved = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(moved?.geometry.x).toBe(3.1);
      expect(moved?.geometry.y).toBe(4.0);

      store.undo();
      const reverted = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(reverted?.geometry.x).toBe(2.0);
      expect(reverted?.geometry.y).toBe(2.0);
    });

    it('resizes and rotates an object', () => {
      const store = new CadStore(sampleProject);
      store.resizeObject('bay-1', 4.5, 7.5);
      store.rotateObject('bay-1', 90);

      const updated = store.getState().project.layout.objects[0];
      expect(updated.geometry.width).toBe(4.5);
      expect(updated.geometry.length).toBe(7.5);
      expect(updated.geometry.rotation).toBe(90);

      store.undo(); // undoes rotation
      expect(store.getState().project.layout.objects[0].geometry.rotation).toBe(0);
      expect(store.getState().project.layout.objects[0].geometry.width).toBe(4.5);

      store.undo(); // undoes resize
      expect(store.getState().project.layout.objects[0].geometry.width).toBe(4.0);
    });

    it('deletes selected objects and clears them from selection', () => {
      const store = new CadStore(sampleProject);
      store.select('bay-1');
      store.deleteObjects();

      expect(store.getState().project.layout.objects).toHaveLength(0);
      expect(store.getState().selectedIds).toEqual([]);
      expect(store.getState().canUndo).toBe(true);

      store.undo();
      expect(store.getState().project.layout.objects).toHaveLength(1);
    });
  });

  describe('Redo Stack Clearing & Immutable History', () => {
    it('clears redo stack after a new mutation is performed', () => {
      const store = new CadStore(sampleProject);
      store.moveObject('bay-1', 2.0, 0); // Mutation 1
      store.moveObject('bay-1', 0, 2.0); // Mutation 2

      store.undo(); // Revert Mutation 2
      expect(store.getState().canRedo).toBe(true);

      // Perform a brand new mutation instead of redo
      store.rotateObject('bay-1', 45);

      // Redo stack MUST be cleared
      expect(store.getState().canRedo).toBe(false);
      expect(store.redo()).toBe(false);
    });

    it('protects historical snapshots from external mutation (immutable history)', () => {
      const store = new CadStore(sampleProject);
      store.moveObject('bay-1', 1.0, 0); // Snapshot saved

      // Directly try to tamper with the returned object in state
      const currentObjects = store.getState().project.layout.objects;
      currentObjects[0].geometry.x = 999;

      // Undo must restore the original (2.0), not the tampered value
      store.undo();
      expect(store.getState().project.layout.objects[0].geometry.x).toBe(2.0);
    });
  });

  describe('Automatic Validation Triggering', () => {
    it('triggers boundary validation on mutation and undo/redo', () => {
      const store = new CadStore(sampleProject);
      expect(store.getState().validationReport.valid).toBe(true);
      expect(store.getState().validationReport.hardCount).toBe(0);

      // Move object outside building boundary (building width is 18.0)
      // Original x: 2.0, width: 4.0. Move +15.0 -> x: 17.0, width 4.0 -> maxX: 21.0 (overflow 3.0m)
      store.moveObject('bay-1', 15.0, 0);

      const stateAfterMove = store.getState();
      expect(stateAfterMove.validationReport.valid).toBe(false);
      expect(stateAfterMove.validationReport.hardCount).toBe(1);
      expect(stateAfterMove.validationReport.issues[0].ruleId).toBe('BOUNDARY-001');
      expect(stateAfterMove.validationReport.issues[0].difference).toBe(3.0);

      // Undo move -> validation report automatically recovers to valid
      store.undo();
      const stateAfterUndo = store.getState();
      expect(stateAfterUndo.validationReport.valid).toBe(true);
      expect(stateAfterUndo.validationReport.hardCount).toBe(0);

      // Redo move -> validation report flags error again
      store.redo();
      const stateAfterRedo = store.getState();
      expect(stateAfterRedo.validationReport.valid).toBe(false);
      expect(stateAfterRedo.validationReport.hardCount).toBe(1);
    });
  });

  describe('Subscriptions', () => {
    it('notifies subscribers on any state mutation', () => {
      const store = new CadStore(sampleProject);
      let callCount = 0;

      const unsubscribe = store.subscribe(() => {
        callCount++;
      });

      store.select('bay-1');
      expect(callCount).toBe(1);

      store.moveObject('bay-1', 1, 1);
      expect(callCount).toBe(2);

      store.undo();
      expect(callCount).toBe(3);

      unsubscribe();
      store.redo();
      expect(callCount).toBe(3); // no more calls after unsubscribe
    });
  });
});
