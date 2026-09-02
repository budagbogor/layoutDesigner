import { IStandardRepository } from '@/application/ports/IStandardRepository';
import { WorkshopStandard } from '@/domain/models/standard';
import demoStandardFixture from '../../../data/demo-standard.json';

const STORAGE_KEY = 'mobeng_cad_standards';

/**
 * Local implementation of IStandardRepository.
 * Seeds with demo-standard.json fixture and persists in-memory / localStorage.
 */
export class LocalStandardRepository implements IStandardRepository {
  private standardsMap: Map<string, WorkshopStandard> = new Map();

  constructor(initialStandards?: WorkshopStandard[]) {
    if (initialStandards && initialStandards.length > 0) {
      for (const s of initialStandards) {
        this.standardsMap.set(s.id, structuredClone(s));
      }
    } else {
      // Seed default demo standard fixture
      const defaultStandard = demoStandardFixture as unknown as WorkshopStandard;
      this.standardsMap.set(defaultStandard.id, structuredClone(defaultStandard));

      // Attempt to load from localStorage if in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const list: WorkshopStandard[] = JSON.parse(raw);
            for (const s of list) {
              this.standardsMap.set(s.id, s);
            }
          }
        } catch {
          // Ignore localStorage parsing errors and fallback to fixture
        }
      }
    }
  }

  async getStandardById(id: string): Promise<WorkshopStandard | null> {
    const std = this.standardsMap.get(id);
    return std ? structuredClone(std) : null;
  }

  async saveStandard(standard: WorkshopStandard): Promise<void> {
    this.standardsMap.set(standard.id, structuredClone(standard));
    this.syncToStorage();
  }

  async listStandards(): Promise<WorkshopStandard[]> {
    return Array.from(this.standardsMap.values()).map((s) => structuredClone(s));
  }

  private syncToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const list = Array.from(this.standardsMap.values());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Storage might be full or disabled
      }
    }
  }
}
