import { WorkshopProject, LayoutObject, Geometry } from '@/domain/models/project';
import { generateValidationReport } from '@/domain/validation/boundaryValidator';
import { roundMillimeter } from '@/domain/geometry/precision';
import { snapValue, normalizeAngle } from '@/domain/geometry/primitives';
import { CadEditorState, CadTool, ViewportState, CadStateListener, LayerState } from './types';

export const STANDARD_CAD_LAYERS: LayerState[] = [
  { id: '00-GRID', name: 'Grid & Coordinate Axes', visible: true, locked: false },
  { id: '01-WALL', name: 'Walls & Building Shell', visible: true, locked: false },
  { id: '02-COLUMN', name: 'Columns & Pillars', visible: true, locked: false },
  { id: '03-DOOR', name: 'Doors & Openings', visible: true, locked: false },
  { id: '04-WINDOW', name: 'Windows & Glazing', visible: true, locked: false },
  { id: '05-VEHICLE', name: 'Vehicles & Envelopes', visible: true, locked: false },
  { id: '06-LIFT', name: 'Lifts & Hoists', visible: true, locked: false },
  { id: '07-EQUIPMENT', name: 'Shop Equipment', visible: true, locked: false },
  { id: '08-SERVICE-BAY', name: 'Service Bays', visible: true, locked: false },
  { id: '09-DIMENSION', name: 'Dimensions & Annotations', visible: true, locked: false },
  { id: '10-TEXT', name: 'Text & Labels', visible: true, locked: false },
  { id: '11-CIRCULATION', name: 'Circulation & Flow Paths', visible: true, locked: false },
  { id: '12-SAFETY', name: 'Safety & Clearances', visible: true, locked: false },
  { id: '13-UTILITY', name: 'Utilities & MEP', visible: true, locked: false },
  { id: '14-REFERENCE', name: 'Reference & Site', visible: true, locked: false },
];

const DEFAULT_VIEWPORT: ViewportState = {
  panX: 0,
  panY: 0,
  zoom: 1.0,
  gridSize: 0.1, // 0.1 meter = 100mm default CAD grid
  snapEnabled: true,
};

export class CadStore {
  private state: CadEditorState;
  private undoStack: LayoutObject[][] = [];
  private redoStack: LayoutObject[][] = [];
  private listeners: Set<CadStateListener> = new Set();
  private maxHistoryDepth: number;

  constructor(initialProject: WorkshopProject, maxHistoryDepth: number = 50) {
    this.maxHistoryDepth = maxHistoryDepth;

    const initialObjects = initialProject.layout.objects
      ? structuredClone(initialProject.layout.objects)
      : [];

    const initialReport = generateValidationReport(
      initialProject.building,
      initialObjects
    );

    this.state = {
      project: {
        ...structuredClone(initialProject),
        layout: {
          ...structuredClone(initialProject.layout),
          objects: initialObjects,
        },
      },
      selectedIds: [],
      activeTool: 'select',
      viewport: { ...DEFAULT_VIEWPORT },
      layers: structuredClone(STANDARD_CAD_LAYERS),
      validationReport: initialReport,
      canUndo: false,
      canRedo: false,
      isDirty: false,
    };
  }

  // ---------------------------------------------------------
  // State Access & Subscriptions
  // ---------------------------------------------------------

  public getState(): CadEditorState {
    return this.state;
  }

  /**
   * Replaces the active project in the CadStore with a newly loaded WorkshopProject.
   * Resets undo/redo history cleanly, regenerates boundary validation report,
   * clears selection, resets isDirty, and notifies all subscribers.
   * Does NOT alter source candidate or mutate geometry.
   */
  public loadProject(newProject: WorkshopProject): void {
    const newObjects = newProject.layout.objects
      ? structuredClone(newProject.layout.objects)
      : [];
    const report = generateValidationReport(newProject.building, newObjects);

    this.undoStack = [];
    this.redoStack = [];

    this.state = {
      ...this.state,
      project: {
        ...structuredClone(newProject),
        layout: {
          ...structuredClone(newProject.layout),
          objects: newObjects,
        },
      },
      selectedIds: [],
      validationReport: report,
      canUndo: false,
      canRedo: false,
      isDirty: false,
    };

    this.notify();
  }

  public renameProject(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed || this.state.project.project.name === trimmed) return;

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        project: {
          ...this.state.project.project,
          name: trimmed,
        },
      },
      isDirty: true,
    };
    this.notify();
  }

  public markClean(): void {
    if (!this.state.isDirty) return;
    this.state = {
      ...this.state,
      isDirty: false,
    };
    this.notify();
  }

  public isDirty(): boolean {
    return this.state.isDirty;
  }

  /**
   * Updates building dimensions (width and length in meters).
   * Validates positive finite numbers, recalculates boundary validation report,
   * marks project dirty, and preserves all object coordinates.
   */
  public updateBuilding(dimensions: { width?: number; length?: number }): boolean {
    const { width, length } = dimensions;
    const currentBuilding = this.state.project.building;

    const newWidth = width !== undefined ? width : currentBuilding.width;
    const newLength = length !== undefined ? length : currentBuilding.length;

    // Strict validation: Reject NaN, Infinity, zero, negative, non-numeric
    if (
      typeof newWidth !== 'number' ||
      isNaN(newWidth) ||
      !isFinite(newWidth) ||
      newWidth <= 0 ||
      typeof newLength !== 'number' ||
      isNaN(newLength) ||
      !isFinite(newLength) ||
      newLength <= 0
    ) {
      return false;
    }

    const roundedWidth = roundMillimeter(newWidth);
    const roundedLength = roundMillimeter(newLength);

    if (currentBuilding.width === roundedWidth && currentBuilding.length === roundedLength) {
      return true;
    }

    const newBuilding = {
      ...currentBuilding,
      width: roundedWidth,
      length: roundedLength,
    };

    const report = generateValidationReport(newBuilding, this.state.project.layout.objects);

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        building: newBuilding,
      },
      validationReport: report,
      isDirty: true,
    };

    this.notify();
    return true;
  }

  /**
   * Updates site dimensions (width and length in meters).
   * Validates positive finite numbers, marks project dirty.
   */
  public updateSite(dimensions: { width?: number; length?: number }): boolean {
    const { width, length } = dimensions;
    const currentSite = this.state.project.site;

    const newWidth = width !== undefined ? width : currentSite.width;
    const newLength = length !== undefined ? length : currentSite.length;

    // Strict validation: Reject NaN, Infinity, zero, negative, non-numeric
    if (
      typeof newWidth !== 'number' ||
      isNaN(newWidth) ||
      !isFinite(newWidth) ||
      newWidth <= 0 ||
      typeof newLength !== 'number' ||
      isNaN(newLength) ||
      !isFinite(newLength) ||
      newLength <= 0
    ) {
      return false;
    }

    const roundedWidth = roundMillimeter(newWidth);
    const roundedLength = roundMillimeter(newLength);

    if (currentSite.width === roundedWidth && currentSite.length === roundedLength) {
      return true;
    }

    const newSite = {
      ...currentSite,
      width: roundedWidth,
      length: roundedLength,
    };

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        site: newSite,
      },
      isDirty: true,
    };

    this.notify();
    return true;
  }

  public subscribe(listener: CadStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // ---------------------------------------------------------
  // Selection Management (Does NOT pollute geometry undo stack)
  // ---------------------------------------------------------

  public select(ids: string | string[], multi: boolean = false): void {
    const targetIds = Array.isArray(ids) ? ids : [ids];

    let newSelected: string[];
    if (multi) {
      const set = new Set(this.state.selectedIds);
      for (const id of targetIds) {
        set.add(id);
      }
      newSelected = Array.from(set);
    } else {
      newSelected = [...targetIds];
    }

    this.state = {
      ...this.state,
      selectedIds: newSelected,
    };
    this.notify();
  }

  public toggleSelect(id: string): void {
    const exists = this.state.selectedIds.includes(id);
    const newSelected = exists
      ? this.state.selectedIds.filter((item) => item !== id)
      : [...this.state.selectedIds, id];

    this.state = {
      ...this.state,
      selectedIds: newSelected,
    };
    this.notify();
  }

  public clearSelection(): void {
    if (this.state.selectedIds.length === 0) return;
    this.state = {
      ...this.state,
      selectedIds: [],
    };
    this.notify();
  }

  // ---------------------------------------------------------
  // Tool & Viewport Management (Does NOT pollute geometry undo)
  // ---------------------------------------------------------

  public setActiveTool(tool: CadTool): void {
    if (this.state.activeTool === tool) return;
    this.state = {
      ...this.state,
      activeTool: tool,
    };
    this.notify();
  }

  public setPan(panX: number, panY: number): void {
    this.state = {
      ...this.state,
      viewport: {
        ...this.state.viewport,
        panX: roundMillimeter(panX),
        panY: roundMillimeter(panY),
      },
    };
    this.notify();
  }

  public setZoom(zoom: number): void {
    // Clamp zoom between 0.1x (10%) and 10x (1000%)
    const clampedZoom = Math.min(Math.max(zoom, 0.1), 10.0);
    this.state = {
      ...this.state,
      viewport: {
        ...this.state.viewport,
        zoom: roundMillimeter(clampedZoom),
      },
    };
    this.notify();
  }

  public setGridSize(gridSize: number): void {
    if (gridSize <= 0) return;
    this.state = {
      ...this.state,
      viewport: {
        ...this.state.viewport,
        gridSize: roundMillimeter(gridSize),
      },
    };
    this.notify();
  }

  public setSnapEnabled(enabled: boolean): void {
    this.state = {
      ...this.state,
      viewport: {
        ...this.state.viewport,
        snapEnabled: enabled,
      },
    };
    this.notify();
  }

  public resetViewport(): void {
    this.state = {
      ...this.state,
      viewport: { ...DEFAULT_VIEWPORT },
    };
    this.notify();
  }

  // ---------------------------------------------------------
  // Layer Management (Visibility & Lock toggles)
  // ---------------------------------------------------------

  public toggleLayerVisibility(layerId: string): void {
    this.state = {
      ...this.state,
      layers: this.state.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      ),
    };
    this.notify();
  }

  public toggleLayerLock(layerId: string): void {
    this.state = {
      ...this.state,
      layers: this.state.layers.map((l) =>
        l.id === layerId ? { ...l, locked: !l.locked } : l
      ),
    };
    this.notify();
  }

  public setLayerVisibility(layerId: string, visible: boolean): void {
    this.state = {
      ...this.state,
      layers: this.state.layers.map((l) =>
        l.id === layerId ? { ...l, visible } : l
      ),
    };
    this.notify();
  }

  public setLayerLock(layerId: string, locked: boolean): void {
    this.state = {
      ...this.state,
      layers: this.state.layers.map((l) =>
        l.id === layerId ? { ...l, locked } : l
      ),
    };
    this.notify();
  }

  // ---------------------------------------------------------
  // Undo / Redo Pipeline & Mutation Commit
  // ---------------------------------------------------------

  private pushUndoSnapshot(): void {
    // Deep clone current layout objects to maintain immutable snapshots
    const snapshot = structuredClone(this.state.project.layout.objects);
    this.undoStack.push(snapshot);

    if (this.undoStack.length > this.maxHistoryDepth) {
      this.undoStack.shift();
    }

    // A new mutation always clears the redo stack
    this.redoStack = [];
  }

  private commitMutation(newObjects: LayoutObject[]): void {
    this.pushUndoSnapshot();

    const report = generateValidationReport(this.state.project.building, newObjects);

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        layout: {
          ...this.state.project.layout,
          objects: newObjects,
        },
      },
      validationReport: report,
      canUndo: this.undoStack.length > 0,
      canRedo: false,
      isDirty: true,
    };

    this.notify();
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;

    // Push current state to redo stack
    const currentSnapshot = structuredClone(this.state.project.layout.objects);
    this.redoStack.push(currentSnapshot);

    // Restore previous snapshot
    const previousObjects = this.undoStack.pop()!;
    const report = generateValidationReport(this.state.project.building, previousObjects);

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        layout: {
          ...this.state.project.layout,
          objects: previousObjects,
        },
      },
      validationReport: report,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      isDirty: true,
    };

    this.notify();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;

    // Push current state to undo stack
    const currentSnapshot = structuredClone(this.state.project.layout.objects);
    this.undoStack.push(currentSnapshot);

    // Restore next snapshot
    const nextObjects = this.redoStack.pop()!;
    const report = generateValidationReport(this.state.project.building, nextObjects);

    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        layout: {
          ...this.state.project.layout,
          objects: nextObjects,
        },
      },
      validationReport: report,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      isDirty: true,
    };

    this.notify();
    return true;
  }

  // ---------------------------------------------------------
  // Object Geometry Mutations (Undoable & Deterministic)
  // ---------------------------------------------------------

  public addObject(object: LayoutObject): void {
    const objects = [...this.state.project.layout.objects, structuredClone(object)];
    this.commitMutation(objects);
  }

  public updateObject(id: string, updates: Partial<Omit<LayoutObject, 'id'>>): void {
    const newObjects = this.state.project.layout.objects.map((obj) => {
      if (obj.id !== id) return obj;
      return {
        ...obj,
        ...updates,
        geometry: updates.geometry ? { ...obj.geometry, ...updates.geometry } : obj.geometry,
      };
    });
    this.commitMutation(newObjects);
  }

  public updateObjectGeometry(id: string, partialGeo: Partial<Geometry>, applySnap: boolean = false): void {
    const { snapEnabled, gridSize } = this.state.viewport;
    const shouldSnap = applySnap && snapEnabled;

    const newObjects = this.state.project.layout.objects.map((obj) => {
      if (obj.id !== id) return obj;

      const current = obj.geometry;
      let newX = partialGeo.x !== undefined ? partialGeo.x : current.x;
      let newY = partialGeo.y !== undefined ? partialGeo.y : current.y;
      let newWidth = partialGeo.width !== undefined ? partialGeo.width : current.width;
      let newLength = partialGeo.length !== undefined ? partialGeo.length : current.length;
      let newRotation = partialGeo.rotation !== undefined ? partialGeo.rotation : current.rotation;

      if (shouldSnap) {
        if (partialGeo.x !== undefined) newX = snapValue(newX, gridSize);
        if (partialGeo.y !== undefined) newY = snapValue(newY, gridSize);
        if (partialGeo.width !== undefined) newWidth = snapValue(newWidth, gridSize);
        if (partialGeo.length !== undefined) newLength = snapValue(newLength, gridSize);
      } else {
        newX = roundMillimeter(newX);
        newY = roundMillimeter(newY);
        newWidth = roundMillimeter(newWidth);
        newLength = roundMillimeter(newLength);
      }

      if (partialGeo.rotation !== undefined) {
        newRotation = normalizeAngle(roundMillimeter(partialGeo.rotation));
      } else {
        newRotation = roundMillimeter(current.rotation);
      }

      return {
        ...obj,
        geometry: {
          x: newX,
          y: newY,
          width: newWidth,
          length: newLength,
          rotation: newRotation,
        },
      };
    });

    this.commitMutation(newObjects);
  }

  public moveObject(id: string, deltaX: number, deltaY: number): void {
    this.moveObjects([id], deltaX, deltaY);
  }

  public moveObjects(ids: string[], deltaX: number, deltaY: number): void {
    if (ids.length === 0) return;
    const { snapEnabled, gridSize } = this.state.viewport;
    const targetSet = new Set(ids);

    const newObjects = this.state.project.layout.objects.map((obj) => {
      if (!targetSet.has(obj.id)) return obj;

      let newX = obj.geometry.x + deltaX;
      let newY = obj.geometry.y + deltaY;

      if (snapEnabled) {
        newX = snapValue(newX, gridSize);
        newY = snapValue(newY, gridSize);
      } else {
        newX = roundMillimeter(newX);
        newY = roundMillimeter(newY);
      }

      return {
        ...obj,
        geometry: {
          ...obj.geometry,
          x: newX,
          y: newY,
        },
      };
    });

    this.commitMutation(newObjects);
  }

  public resizeObject(id: string, width: number, length: number): void {
    // Enforce positive minimum size of 0.1m
    const minSize = 0.1;
    const clampedW = Math.max(width, minSize);
    const clampedL = Math.max(length, minSize);
    this.updateObjectGeometry(id, { width: clampedW, length: clampedL });
  }

  public rotateObject(id: string, rotation: number): void {
    this.updateObjectGeometry(id, { rotation });
  }

  public deleteSelected(): void {
    this.deleteObjects(this.state.selectedIds);
  }

  public deleteObjects(idsToDelete?: string[]): void {
    const ids = idsToDelete ?? this.state.selectedIds;
    if (ids.length === 0) return;

    const idSet = new Set(ids);
    const newObjects = this.state.project.layout.objects.filter((obj) => !idSet.has(obj.id));

    // Clear deleted items from selection
    this.state = {
      ...this.state,
      selectedIds: this.state.selectedIds.filter((id) => !idSet.has(id)),
    };

    this.commitMutation(newObjects);
  }
}
