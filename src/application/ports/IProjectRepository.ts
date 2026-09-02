import { WorkshopProject } from '@/domain/models/project';

/**
 * Port interface for Workshop Project persistence.
 * Decouples domain logic from storage implementation (local JSON, localStorage, or future database).
 */
export interface IProjectRepository {
  getProjectById(id: string): Promise<WorkshopProject | null>;
  saveProject(project: WorkshopProject): Promise<void>;
  listProjects(): Promise<WorkshopProject[]>;
}
