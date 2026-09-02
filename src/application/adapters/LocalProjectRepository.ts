import { IProjectRepository } from '@/application/ports/IProjectRepository';
import { WorkshopProject } from '@/domain/models/project';
import demoProjectFixture from '../../../data/demo-project.json';

const STORAGE_KEY = 'mobeng_cad_projects';

/**
 * Local implementation of IProjectRepository.
 * Seeds with demo-project.json fixture and persists in-memory / localStorage.
 */
export class LocalProjectRepository implements IProjectRepository {
  private projectsMap: Map<string, WorkshopProject> = new Map();

  constructor(initialProjects?: WorkshopProject[]) {
    if (initialProjects && initialProjects.length > 0) {
      for (const p of initialProjects) {
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
              this.projectsMap.set(p.project.id, p);
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
    return proj ? structuredClone(proj) : null;
  }

  async saveProject(project: WorkshopProject): Promise<void> {
    this.projectsMap.set(project.project.id, structuredClone(project));
    this.syncToStorage();
  }

  async listProjects(): Promise<WorkshopProject[]> {
    return Array.from(this.projectsMap.values()).map((p) => structuredClone(p));
  }

  private syncToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const list = Array.from(this.projectsMap.values());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Storage might be full or disabled
      }
    }
  }
}
