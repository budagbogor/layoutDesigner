import { WorkshopStandard } from '@/domain/models/standard';

/**
 * Port interface for Workshop Standard persistence.
 * Decouples standards resolution from storage implementation.
 */
export interface IStandardRepository {
  getStandardById(id: string): Promise<WorkshopStandard | null>;
  saveStandard(standard: WorkshopStandard): Promise<void>;
  listStandards(): Promise<WorkshopStandard[]>;
}
