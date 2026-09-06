import { WorkshopProject, LayoutObject, Geometry } from '@/domain/models/project';
import { ValidationReport } from '@/domain/validation/types';

export type CadTool =
  | 'select'
  | 'pan'
  | 'wall'
  | 'rectangle'
  | 'bay'
  | 'equipment'
  | 'vehicle'
  | 'dimension'
  | 'measure';

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number; // 1.0 = 100%
  gridSize: number; // in meters, e.g. 0.1
  snapEnabled: boolean;
}

export interface LayerState {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface CadEditorState {
  project: WorkshopProject;
  selectedIds: string[];
  activeTool: CadTool;
  viewport: ViewportState;
  layers: LayerState[];
  validationReport: ValidationReport;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
}

export type CadStateListener = (state: CadEditorState) => void;
