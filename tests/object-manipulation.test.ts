import { describe, it, expect, beforeEach } from 'vitest';
import { CadStore } from '@/application/state/CadStore';
import type { WorkshopProject, LayoutObject } from '@/domain/models/project';

describe('Phase 1.6 — Interactive CAD Object Manipulation', () => {
  let project: WorkshopProject;

  beforeEach(() => {
    project = {
      project: {
        id: 'test-cad-01',
        name: 'Workshop Manipulation Test',
        unit: 'meter',
        standard_version_id: 'mobeng-std@0.1-demo',
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
            geometry: { x: 2.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 },
            metadata: { name: 'Service Bay 1' },
          },
          {
            id: 'lift-1',
            type: 'equipment',
            layer: '06-LIFT',
            geometry: { x: 3.0, y: 4.5, width: 2.0, length: 4.0, rotation: 0 },
            metadata: { equipmentType: '2_post_lift' },
          },
          {
            id: 'vehicle-1',
            type: 'vehicle',
            layer: '05-VEHICLE',
            geometry: { x: 3.1, y: 4.2, width: 1.8, length: 4.7, rotation: 0 },
          },
        ],
      },
    };
  });

  describe('Single & Multi Selection', () => {
    it('selects a single object', () => {
      const store = new CadStore(project);
      store.select('bay-1');

      expect(store.getState().selectedIds).toEqual(['bay-1']);
    });

    it('switches single selection when clicking another object', () => {
      const store = new CadStore(project);
      store.select('bay-1');
      expect(store.getState().selectedIds).toEqual(['bay-1']);

      store.select('lift-1');
      expect(store.getState().selectedIds).toEqual(['lift-1']);
    });

    it('supports multi-selection via toggleSelect or multi flag', () => {
      const store = new CadStore(project);
      store.select(['bay-1', 'lift-1']);
      expect(store.getState().selectedIds).toEqual(['bay-1', 'lift-1']);

      // Toggle vehicle into selection
      store.toggleSelect('vehicle-1');
      expect(store.getState().selectedIds).toEqual(['bay-1', 'lift-1', 'vehicle-1']);

      // Toggle bay-1 out of selection
      store.toggleSelect('bay-1');
      expect(store.getState().selectedIds).toEqual(['lift-1', 'vehicle-1']);
    });

    it('clears selection on clearSelection', () => {
      const store = new CadStore(project);
      store.select(['bay-1', 'lift-1']);
      store.clearSelection();

      expect(store.getState().selectedIds).toEqual([]);
    });
  });

  describe('Object Movement & Snapping', () => {
    it('moves a single object with numeric precision in meters', () => {
      const store = new CadStore(project);
      store.setSnapEnabled(false);

      // Original is at (2.0, 3.0). Move by (+1.25m, +2.5m)
      store.moveObject('bay-1', 1.25, 2.5);

      const obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.x).toBe(3.25);
      expect(obj?.geometry.y).toBe(5.5);
    });

    it('applies grid snapping during movement', () => {
      const store = new CadStore(project);
      store.setGridSize(0.5); // 0.5m grid
      store.setSnapEnabled(true);

      // Original x: 2.0, y: 3.0. Move delta (0.33, 0.88)
      // Unsnapped: (2.33, 3.88). Snapped to 0.5m: (2.5, 4.0)
      store.moveObject('bay-1', 0.33, 0.88);

      const obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.x).toBe(2.5);
      expect(obj?.geometry.y).toBe(4.0);
    });

    it('moves multiple selected objects simultaneously in a single undo entry', () => {
      const store = new CadStore(project);
      store.setSnapEnabled(false);

      // Move bay-1 (2.0, 3.0) and lift-1 (3.0, 4.5) by (+2.0, +1.0)
      store.moveObjects(['bay-1', 'lift-1'], 2.0, 1.0);

      const bay = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      const lift = store.getState().project.layout.objects.find((o) => o.id === 'lift-1');

      expect(bay?.geometry.x).toBe(4.0);
      expect(bay?.geometry.y).toBe(4.0);

      expect(lift?.geometry.x).toBe(5.0);
      expect(lift?.geometry.y).toBe(5.5);

      // A single undo should restore BOTH objects together!
      store.undo();

      const bayRestored = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      const liftRestored = store.getState().project.layout.objects.find((o) => o.id === 'lift-1');

      expect(bayRestored?.geometry.x).toBe(2.0);
      expect(bayRestored?.geometry.y).toBe(3.0);
      expect(liftRestored?.geometry.x).toBe(3.0);
      expect(liftRestored?.geometry.y).toBe(4.5);
    });
  });

  describe('Object Resizing & Rotation', () => {
    it('resizes selected object parametrically with minimum clamp', () => {
      const store = new CadStore(project);
      // Original size: 4.0m × 7.0m
      store.resizeObject('bay-1', 5.0, 8.5);

      let obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.width).toBe(5.0);
      expect(obj?.geometry.length).toBe(8.5);

      // Clamp test: cannot resize below 0.1m
      store.resizeObject('bay-1', -2.0, 0.05);
      obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.width).toBe(0.1);
      expect(obj?.geometry.length).toBe(0.1);
    });

    it('rotates selected object and normalizes angle to [0, 360) range', () => {
      const store = new CadStore(project);
      store.rotateObject('bay-1', 90);

      let obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.rotation).toBe(90);

      // Rotate to -45 deg -> should normalize to 315 deg
      store.rotateObject('bay-1', -45);
      obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(obj?.geometry.rotation).toBe(315);
    });
  });

  describe('Deletion', () => {
    it('deletes selected object and removes it from selection state', () => {
      const store = new CadStore(project);
      store.select('lift-1');
      expect(store.getState().selectedIds).toEqual(['lift-1']);

      store.deleteSelected();

      expect(store.getState().project.layout.objects).toHaveLength(2);
      expect(store.getState().project.layout.objects.find((o) => o.id === 'lift-1')).toBeUndefined();
      expect(store.getState().selectedIds).toEqual([]);
    });

    it('deletes multiple selected objects at once and allows undo', () => {
      const store = new CadStore(project);
      store.select(['bay-1', 'lift-1']);
      store.deleteSelected();

      expect(store.getState().project.layout.objects).toHaveLength(1);
      expect(store.getState().selectedIds).toEqual([]);

      // Undo deletion
      store.undo();
      expect(store.getState().project.layout.objects).toHaveLength(3);
    });
  });

  describe('Undo/Redo & Boundary Validation Integration', () => {
    it('keeps committed manipulation undoable and redoable', () => {
      const store = new CadStore(project);
      // Move bay-1 from (2.0, 3.0) to (5.0, 5.0)
      store.moveObject('bay-1', 3.0, 2.0);
      expect(store.getState().canUndo).toBe(true);

      store.undo();
      const bayReverted = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(bayReverted?.geometry.x).toBe(2.0);
      expect(bayReverted?.geometry.y).toBe(3.0);

      store.redo();
      const bayRedone = store.getState().project.layout.objects.find((o) => o.id === 'bay-1');
      expect(bayRedone?.geometry.x).toBe(5.0);
      expect(bayRedone?.geometry.y).toBe(5.0);
    });

    it('triggers boundary validation when object is moved outside building and recovers on undo', () => {
      const store = new CadStore(project);
      expect(store.getState().validationReport.valid).toBe(true);

      // Building is 18.0m wide. Move bay-1 (width 4.0) to x: 16.0 -> max X is 20.0 (overflow 2.0m!)
      store.moveObject('bay-1', 14.0, 0);

      const stateViolation = store.getState();
      expect(stateViolation.validationReport.valid).toBe(false);
      expect(stateViolation.validationReport.hardCount).toBe(1);
      expect(stateViolation.validationReport.issues[0].ruleId).toBe('BOUNDARY-001');
      expect(stateViolation.validationReport.issues[0].difference).toBe(2.0);

      // Undo manipulation -> validation immediately restores to valid!
      store.undo();
      const stateRecovered = store.getState();
      expect(stateRecovered.validationReport.valid).toBe(true);
      expect(stateRecovered.validationReport.hardCount).toBe(0);
    });
  });
});
