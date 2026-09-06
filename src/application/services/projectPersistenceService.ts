// ---------------------------------------------------------------------------
// M1 — Complete Project Lifecycle Service
//
// Clean application boundary between CadStore/UI and IProjectRepository.
// Provides: save, list, open, rename, delete, and blank template creation.
// ---------------------------------------------------------------------------

import { WorkshopProject } from '@/domain/models/project';
import { IProjectRepository } from '../ports/IProjectRepository';
import { LocalProjectRepository } from '../adapters/LocalProjectRepository';
import {
  validateWorkshopProject,
  ProjectValidationError,
  ProjectPersistenceError,
} from '@/domain/validation/projectValidator';

export interface SaveProjectResult {
  readonly success: boolean;
  readonly projectId?: string;
  readonly error?: string;
  readonly errorCode?: 'VALIDATION_ERROR' | 'STORAGE_ERROR' | 'UNKNOWN_ERROR';
}

export interface OpenProjectResult {
  readonly success: boolean;
  readonly project?: WorkshopProject;
  readonly error?: string;
  readonly errorCode?: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'STORAGE_ERROR' | 'UNKNOWN_ERROR';
}

export interface DeleteProjectResult {
  readonly success: boolean;
  readonly error?: string;
  readonly errorCode?: 'NOT_FOUND' | 'STORAGE_ERROR' | 'UNKNOWN_ERROR';
}

export interface RenameProjectResult {
  readonly success: boolean;
  readonly project?: WorkshopProject;
  readonly error?: string;
  readonly errorCode?: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'STORAGE_ERROR' | 'UNKNOWN_ERROR';
}

/**
 * Creates a clean default blank workshop project.
 * Does not auto-persist to storage until user clicks Save.
 */
export function createNewBlankProject(customName?: string): WorkshopProject {
  const timestamp = Date.now();
  return {
    project: {
      id: `proj-${timestamp}`,
      name: customName || 'New Workshop Project',
      unit: 'meter',
      standard_version_id: 'mobeng-standard@0.1-demo',
    },
    site: {
      width: 30,
      length: 40,
      road_side: 'south',
      road_width: 8,
    },
    building: {
      width: 24,
      length: 30,
    },
    layout: {
      status: 'draft',
      score: null,
      objects: [],
    },
  };
}

/**
 * Lists all persisted projects from repository.
 */
export async function listSavedProjects(
  repository?: IProjectRepository
): Promise<WorkshopProject[]> {
  const repo = repository ?? new LocalProjectRepository();
  return repo.listProjects();
}

/**
 * Opens a project by ID from repository, enforcing structural validation.
 */
export async function openSavedProject(
  id: string,
  repository?: IProjectRepository
): Promise<OpenProjectResult> {
  const repo = repository ?? new LocalProjectRepository();

  try {
    const project = await repo.getProjectById(id);
    if (!project) {
      return {
        success: false,
        error: `Project '${id}' was not found in storage.`,
        errorCode: 'NOT_FOUND',
      };
    }

    validateWorkshopProject(project);

    return {
      success: true,
      project,
    };
  } catch (err: unknown) {
    if (err instanceof ProjectValidationError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'VALIDATION_ERROR',
      };
    }

    if (err instanceof ProjectPersistenceError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'STORAGE_ERROR',
      };
    }

    const fallbackMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred while opening the project.';
    return {
      success: false,
      error: fallbackMsg,
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Saves the current WorkshopProject state to the repository.
 * Strictly guarantees that the source of truth is the current project,
 * enforcing validation and returning structured success/error semantics.
 */
export async function saveCurrentProject(
  project: WorkshopProject,
  repository?: IProjectRepository
): Promise<SaveProjectResult> {
  const repo = repository ?? new LocalProjectRepository();

  try {
    await repo.saveProject(project);
    return {
      success: true,
      projectId: project.project.id,
    };
  } catch (err: unknown) {
    if (err instanceof ProjectValidationError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'VALIDATION_ERROR',
      };
    }

    if (err instanceof ProjectPersistenceError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'STORAGE_ERROR',
      };
    }

    const fallbackMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred while saving the project.';
    return {
      success: false,
      error: fallbackMsg,
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Renames a saved project in repository.
 * Preserves project ID and updates project name.
 */
export async function renameSavedProject(
  id: string,
  newName: string,
  repository?: IProjectRepository
): Promise<RenameProjectResult> {
  const repo = repository ?? new LocalProjectRepository();
  const trimmed = newName.trim();

  if (!trimmed) {
    return {
      success: false,
      error: 'Project name cannot be empty.',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  try {
    const existing = await repo.getProjectById(id);
    if (!existing) {
      return {
        success: false,
        error: `Project '${id}' not found.`,
        errorCode: 'NOT_FOUND',
      };
    }

    const updated: WorkshopProject = {
      ...existing,
      project: {
        ...existing.project,
        name: trimmed,
      },
    };

    await repo.saveProject(updated);

    return {
      success: true,
      project: updated,
    };
  } catch (err: unknown) {
    if (err instanceof ProjectValidationError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'VALIDATION_ERROR',
      };
    }

    if (err instanceof ProjectPersistenceError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'STORAGE_ERROR',
      };
    }

    const fallbackMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred while renaming the project.';
    return {
      success: false,
      error: fallbackMsg,
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Deletes a project from repository by ID.
 */
export async function deleteSavedProject(
  id: string,
  repository?: IProjectRepository
): Promise<DeleteProjectResult> {
  const repo = repository ?? new LocalProjectRepository();

  try {
    await repo.deleteProject(id);
    return {
      success: true,
    };
  } catch (err: unknown) {
    if (err instanceof ProjectPersistenceError && err.code === 'ProjectNotFound') {
      return {
        success: false,
        error: err.message,
        errorCode: 'NOT_FOUND',
      };
    }

    if (err instanceof ProjectPersistenceError) {
      return {
        success: false,
        error: err.message,
        errorCode: 'STORAGE_ERROR',
      };
    }

    const fallbackMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred while deleting the project.';
    return {
      success: false,
      error: fallbackMsg,
      errorCode: 'UNKNOWN_ERROR',
    };
  }
}

// ---------------------------------------------------------------------------
// M2 — Professional Export & Import Functions
// ---------------------------------------------------------------------------

import { exportLayoutToSvg } from '@/domain/export/svgExporter';
import { exportLayoutToDxf } from '@/domain/export/dxfExporter';
import { sanitizeFilename } from '@/domain/export/fileSanitizer';
import { LayerState } from '../state/types';

export interface ImportProjectResult {
  readonly success: boolean;
  readonly project?: WorkshopProject;
  readonly error?: string;
  readonly issues?: readonly string[];
}

/**
 * Triggers a browser file download using standard Blob & object URL.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports current CadStore project as a pretty-printed .json deliverable.
 */
export function exportProjectAsJson(project: WorkshopProject): void {
  validateWorkshopProject(project);
  const jsonContent = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const filename = `${sanitizeFilename(project.project.name)}.json`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports current CadStore layout as a layered resolution-independent vector .svg.
 */
export function exportProjectAsSvg(project: WorkshopProject, layers?: LayerState[]): void {
  validateWorkshopProject(project);
  const svgContent = exportLayoutToSvg({ project, layers });
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `${sanitizeFilename(project.project.name)}.svg`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports current CadStore layout as a native 2D AutoCAD-compliant .dxf deliverable.
 */
export function exportProjectAsDxf(project: WorkshopProject, layers?: LayerState[]): void {
  validateWorkshopProject(project);
  const dxfContent = exportLayoutToDxf({ project, layers });
  const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
  const filename = `${sanitizeFilename(project.project.name)}.dxf`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Imports and validates a JSON string as a WorkshopProject document.
 * Throws zero unhandled errors, returning structured validation feedback.
 */
export function importProjectFromJsonString(jsonString: string): ImportProjectResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      success: false,
      error: `Invalid JSON format: ${(err as Error).message}`,
      issues: ['File is not valid JSON syntax.'],
    };
  }

  try {
    validateWorkshopProject(parsed);
    return {
      success: true,
      project: parsed,
    };
  } catch (err) {
    if (err instanceof ProjectValidationError) {
      return {
        success: false,
        error: err.message,
        issues: err.issues,
      };
    }
    return {
      success: false,
      error: (err as Error).message || 'Validation failed on imported project.',
      issues: [(err as Error).message],
    };
  }
}

