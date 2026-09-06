import { IProjectRepository } from '@/application/ports/IProjectRepository';
import { WorkshopProject } from '@/domain/models/project';
import {
  validateWorkshopProject,
  ProjectPersistenceError,
} from '@/domain/validation/projectValidator';
import demoProjectFixture from '../../../data/demo-project.json';

const STORAGE_KEY = 'mobeng_cad_projects';

/**
 * Local implementation of IProjectRepository.
 * Seeds with demo-project.json fixture and persists in-memory / localStorage.
 * Validates project schema before saving and throws explicit ProjectPersistenceError on failure.
 */
export class LocalProjectRepository implements IProjectRepository {
  private projectsMap: Map<string, WorkshopProject> = new Map();

  constructor(initialProjects?: WorkshopProject[]) {
    if (initialProjects !== undefined) {
      for (const p of initialProjects) {
        validateWorkshopProject(p);
        this.projectsMap.set(p.project.id, structuredClone(p));
      }
    } else {
      // Seed default demo project fixture
      const defaultProject = demoProjectFixture as unknown as WorkshopProject;
      this.projectsMap.set(defaultProject.project.id, structuredClone(defaultProject));

      // Attempt to load from localStorage if in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const list: WorkshopProject[] = JSON.parse(raw);
            for (const p of list) {
              try {
                validateWorkshopProject(p);
                this.projectsMap.set(p.project.id, p);
              } catch {
                // Ignore invalid individual items in localStorage
              }
            }
          }
        } catch {
          // Ignore localStorage parsing errors and fallback to fixture
        }
      }
    }
  }

  async getProjectById(id: string): Promise<WorkshopProject | null> {
    const proj = this.projectsMap.get(id);
    if (!proj) return null;
    validateWorkshopProject(proj);
    return structuredClone(proj);
  }

  async saveProject(project: WorkshopProject): Promise<void> {
    // 1. Enforce structural validation boundary
    validateWorkshopProject(project);

    const projectId = project.project.id;
    const previousProject = this.projectsMap.get(projectId);
    const clonedNew = structuredClone(project);

    // 2. Speculatively update in-memory state
    this.projectsMap.set(projectId, clonedNew);

    // 3. Persist to storage with automatic rollback on failure
    try {
      this.syncToStorage(projectId);
    } catch (err) {
      if (previousProject !== undefined) {
        this.projectsMap.set(projectId, previousProject);
      } else {
        this.projectsMap.delete(projectId);
      }
      throw err;
    }
  }

  async listProjects(): Promise<WorkshopProject[]> {
    return Array.from(this.projectsMap.values()).map((p) => structuredClone(p));
  }

  async deleteProject(id: string): Promise<void> {
    const existing = this.projectsMap.get(id);
    if (!existing) {
      throw new ProjectPersistenceError(
        `Project '${id}' does not exist in repository.`,
        'ProjectNotFound'
      );
    }

    // Speculatively delete
    this.projectsMap.delete(id);

    // Persist with rollback on failure
    try {
      this.syncToStorage(id);
    } catch (err) {
      this.projectsMap.set(id, existing);
      throw err;
    }
  }

  private syncToStorage(targetProjectId?: string): void {
    if (typeof window !== 'undefined') {
      if (!window.localStorage) {
        throw new ProjectPersistenceError(
          'localStorage is not available in the current browser environment.',
          'StorageUnavailable'
        );
      }

      try {
        const list = Array.from(this.projectsMap.values());
        const json = JSON.stringify(list);
        window.localStorage.setItem(STORAGE_KEY, json);
      } catch (err: any) {
        const projId = targetProjectId || 'unknown';
        if (err?.name === 'QuotaExceededError' || err?.code === 22) {
          throw new ProjectPersistenceError(
            `Storage quota exceeded while attempting to save project '${projId}'.`,
            'QuotaExceededError'
          );
        } else if (err?.name === 'SecurityError') {
          throw new ProjectPersistenceError(
            'Access to localStorage was denied due to browser security restrictions (e.g. private browsing).',
            'SecurityError'
          );
        } else {
          throw new ProjectPersistenceError(
            err?.message || `Failed to write project '${projId}' to localStorage.`,
            err?.name || 'StorageWriteError'
          );
        }
      }
    }
  }
}
