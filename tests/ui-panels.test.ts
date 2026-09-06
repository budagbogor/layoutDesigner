import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CadStore, STANDARD_CAD_LAYERS } from '@/application/state/CadStore';
import { PropertiesPanel } from '@/presentation/components/panels/PropertiesPanel';
import type { WorkshopProject } from '@/domain/models/project';

describe('Phase 1.7 — CAD UI Panels & Inspector', () => {
  let project: WorkshopProject;

  beforeEach(() => {
    project = {
      project: {
        id: 'panels-test-01',
        name: 'UI Panels Test Project',
        unit: 'meter',
        standard_version_id: 'std-demo-v1',
      },
      site: { width: 30, length: 40 },
      building: { width: 18.0, length: 25.0 },
      layout: {
        status: 'draft',
        score: null,
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
  });

  describe('Properties Panel Numeric Edits via CadStore', () => {
    it('updates object position (X, Y) with millimeter precision', () => {
      const store = new CadStore(project);
      store.select('bay-01');

      // Edit X to 3.456m and Y to 6.789m
      store.updateObjectGeometry('bay-01', { x: 3.456, y: 6.789 });

      const obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(obj?.geometry.x).toBe(3.456);
      expect(obj?.geometry.y).toBe(6.789);

      // Verify mutation is recorded in undo stack
      expect(store.getState().canUndo).toBe(true);
      store.undo();
      const reverted = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(reverted?.geometry.x).toBe(2.0);
      expect(reverted?.geometry.y).toBe(3.0);
    });

    it('updates object dimensions (width, length) with positive clamping', () => {
      const store = new CadStore(project);
      store.updateObjectGeometry('bay-01', { width: 5.2, length: 8.5 });

      const obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(obj?.geometry.width).toBe(5.2);
      expect(obj?.geometry.length).toBe(8.5);

      // Clamp test via resizeObject
      store.resizeObject('bay-01', -1.0, 0.05);
      const clamped = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(clamped?.geometry.width).toBe(0.1);
      expect(clamped?.geometry.length).toBe(0.1);
    });

    it('updates rotation angle and normalizes to [0, 360) range', () => {
      const store = new CadStore(project);
      store.updateObjectGeometry('bay-01', { rotation: 450 });

      let obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(obj?.geometry.rotation).toBe(90);

      store.updateObjectGeometry('bay-01', { rotation: -30 });
      obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(obj?.geometry.rotation).toBe(330);
    });

    it('updates object type and layer', () => {
      const store = new CadStore(project);
      store.updateObject('bay-01', { type: 'equipment', layer: '06-LIFT' });

      const obj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(obj?.type).toBe('equipment');
      expect(obj?.layer).toBe('06-LIFT');

      // Undo restores original type and layer
      store.undo();
      const reverted = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(reverted?.type).toBe('service_bay');
      expect(reverted?.layer).toBe('08-SERVICE-BAY');
    });

    it('triggers boundary validation immediately on numeric edit', () => {
      const store = new CadStore(project);
      expect(store.getState().validationReport.valid).toBe(true);

      // Edit X from 2.0 to 16.0 (width 4.0 -> maxX 20.0, overflows 18m building by 2.0m!)
      store.updateObjectGeometry('bay-01', { x: 16.0 });

      const report = store.getState().validationReport;
      expect(report.valid).toBe(false);
      expect(report.hardCount).toBe(1);
      expect(report.issues[0].ruleId).toBe('BOUNDARY-001');
      expect(report.issues[0].difference).toBe(2.0);

      // Undo immediately clears the issue
      store.undo();
      expect(store.getState().validationReport.valid).toBe(true);
    });
  });

  describe('Layers Panel State & Controls', () => {
    it('initializes with all 15 standard CAD layers', () => {
      const store = new CadStore(project);
      const layers = store.getState().layers;

      expect(layers).toHaveLength(15);
      expect(layers.map((l) => l.id)).toEqual(STANDARD_CAD_LAYERS.map((l) => l.id));

      // All layers initially visible and unlocked
      expect(layers.every((l) => l.visible === true)).toBe(true);
      expect(layers.every((l) => l.locked === false)).toBe(true);
    });

    it('toggles layer visibility', () => {
      const store = new CadStore(project);
      store.toggleLayerVisibility('08-SERVICE-BAY');

      let layer = store.getState().layers.find((l) => l.id === '08-SERVICE-BAY');
      expect(layer?.visible).toBe(false);

      store.toggleLayerVisibility('08-SERVICE-BAY');
      layer = store.getState().layers.find((l) => l.id === '08-SERVICE-BAY');
      expect(layer?.visible).toBe(true);
    });

    it('toggles layer lock', () => {
      const store = new CadStore(project);
      store.toggleLayerLock('01-WALL');

      let layer = store.getState().layers.find((l) => l.id === '01-WALL');
      expect(layer?.locked).toBe(true);

      store.toggleLayerLock('01-WALL');
      layer = store.getState().layers.find((l) => l.id === '01-WALL');
      expect(layer?.locked).toBe(false);
    });
  });

  describe('Validation Panel & Selection Focus', () => {
    it('allows focusing on the affected object when clicking an issue', () => {
      const store = new CadStore(project);
      // Move bay-01 out of bounds
      store.updateObjectGeometry('bay-01', { x: 25.0 });

      const report = store.getState().validationReport;
      expect(report.issues).toHaveLength(1);
      const issue = report.issues[0];

      expect(issue.objectId).toBe('bay-01');
      expect(issue.severity).toBe('HARD');

      // Click to focus/select
      store.select(issue.objectId);
      expect(store.getState().selectedIds).toEqual(['bay-01']);
    });
  });

  describe('Properties Panel Enter Key Commit & Blur UX', () => {
    function findByTestId(node: any, testId: string): any {
      if (!node || typeof node !== 'object') return null;
      if (node.props?.['data-testid'] === testId) return node;
      const children = Array.isArray(node.props?.children)
        ? node.props.children
        : [node.props?.children];
      for (const child of children) {
        const found = findByTestId(child, testId);
        if (found) return found;
      }
      return null;
    }

    it('commits numeric value and releases focus (blur) when Enter is pressed on X, Y, Width, Length, Rotation', () => {
      const store = new CadStore(project);
      store.select('bay-01');

      const mockBlur = vi.fn();
      const mockPreventDefault = vi.fn();

      const tree = PropertiesPanel({
        selectedObject: store.getState().project.layout.objects[0],
        building: store.getState().project.building,
        site: store.getState().project.site,
        onUpdateBuilding: (dim) => store.updateBuilding(dim),
        onUpdateSite: (dim) => store.updateSite(dim),
        onUpdateGeometry: (id, partial) => store.updateObjectGeometry(id, partial),
        onUpdateObject: (id, updates) => store.updateObject(id, updates),
        onDelete: (id) => store.deleteObjects([id]),
      });

      // 1. Test X input
      const inputX = findByTestId(tree, 'prop-input-x');
      expect(inputX).not.toBeNull();
      inputX.props.onKeyDown({
        key: 'Enter',
        preventDefault: mockPreventDefault,
        currentTarget: { value: '4.25', blur: mockBlur },
      });
      expect(mockPreventDefault).toHaveBeenCalled();
      expect(mockBlur).toHaveBeenCalledTimes(1);

      // Verify geometry was committed in store
      let updatedObj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(updatedObj?.geometry.x).toBe(4.25);
      // Verify object remains selected
      expect(store.getState().selectedIds).toEqual(['bay-01']);

      // 2. Test Y input
      const inputY = findByTestId(tree, 'prop-input-y');
      expect(inputY).not.toBeNull();
      inputY.props.onKeyDown({
        key: 'Enter',
        preventDefault: mockPreventDefault,
        currentTarget: { value: '7.80', blur: mockBlur },
      });
      expect(mockBlur).toHaveBeenCalledTimes(2);
      updatedObj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(updatedObj?.geometry.y).toBe(7.8);
      expect(store.getState().selectedIds).toEqual(['bay-01']);

      // 3. Test Width input
      const inputW = findByTestId(tree, 'prop-input-width');
      expect(inputW).not.toBeNull();
      inputW.props.onKeyDown({
        key: 'Enter',
        preventDefault: mockPreventDefault,
        currentTarget: { value: '5.50', blur: mockBlur },
      });
      expect(mockBlur).toHaveBeenCalledTimes(3);
      updatedObj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(updatedObj?.geometry.width).toBe(5.5);

      // 4. Test Length input
      const inputL = findByTestId(tree, 'prop-input-length');
      expect(inputL).not.toBeNull();
      inputL.props.onKeyDown({
        key: 'Enter',
        preventDefault: mockPreventDefault,
        currentTarget: { value: '9.20', blur: mockBlur },
      });
      expect(mockBlur).toHaveBeenCalledTimes(4);
      updatedObj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(updatedObj?.geometry.length).toBe(9.2);

      // 5. Test Rotation input
      const inputRot = findByTestId(tree, 'prop-input-rotation');
      expect(inputRot).not.toBeNull();
      inputRot.props.onKeyDown({
        key: 'Enter',
        preventDefault: mockPreventDefault,
        currentTarget: { value: '90', blur: mockBlur },
      });
      expect(mockBlur).toHaveBeenCalledTimes(5);
      updatedObj = store.getState().project.layout.objects.find((o) => o.id === 'bay-01');
      expect(updatedObj?.geometry.rotation).toBe(90);

      // Verify exact undo behavior remains intact
      expect(store.getState().canUndo).toBe(true);
      store.undo(); // undo rotation
      expect(store.getState().project.layout.objects.find((o) => o.id === 'bay-01')?.geometry.rotation).toBe(0);
    });
  });
});
