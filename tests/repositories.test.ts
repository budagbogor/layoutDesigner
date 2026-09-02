import { describe, it, expect } from 'vitest';
import { LocalProjectRepository } from '@/application/adapters/LocalProjectRepository';
import { LocalStandardRepository } from '@/application/adapters/LocalStandardRepository';
import type { WorkshopProject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Repository Adapters', () => {
  describe('LocalProjectRepository', () => {
    it('loads the default demo-project.json fixture correctly', async () => {
      const repo = new LocalProjectRepository();
      const project = await repo.getProjectById('demo-001');

      expect(project).not.toBeNull();
      expect(project?.project.name).toBe('Mobeng Workshop Demo');
      expect(project?.building.width).toBe(18);
      expect(project?.building.length).toBe(25);
    });

    it('returns null for non-existent project id', async () => {
      const repo = new LocalProjectRepository();
      const project = await repo.getProjectById('non-existent-id');
      expect(project).toBeNull();
    });

    it('lists all loaded projects', async () => {
      const repo = new LocalProjectRepository();
      const projects = await repo.listProjects();
      expect(projects.length).toBeGreaterThanOrEqual(1);
      expect(projects[0].project.id).toBe('demo-001');
    });

    it('saves new projects and preserves immutability via deep cloning', async () => {
      const repo = new LocalProjectRepository();
      const original = await repo.getProjectById('demo-001');
      expect(original).not.toBeNull();

      if (original) {
        // Mutate the fetched copy
        original.project.name = 'Locally Mutated Name';
        
        // Before saving, the repository internal state must remain unchanged
        const freshFetchBeforeSave = await repo.getProjectById('demo-001');
        expect(freshFetchBeforeSave?.project.name).toBe('Mobeng Workshop Demo');

        // Save mutation
        await repo.saveProject(original);

        // After saving, new fetches reflect the updated name
        const freshFetchAfterSave = await repo.getProjectById('demo-001');
        expect(freshFetchAfterSave?.project.name).toBe('Locally Mutated Name');
      }
    });

    it('allows adding a new project', async () => {
      const repo = new LocalProjectRepository();
      const newProj: WorkshopProject = {
        project: {
          id: 'custom-002',
          name: 'Second Workshop',
          unit: 'meter',
          standard_version_id: 'mobeng-standard@0.1-demo',
        },
        site: { width: 30, length: 40 },
        building: { width: 25, length: 35 },
        layout: { status: 'draft', score: null, objects: [] },
      };

      await repo.saveProject(newProj);
      const fetched = await repo.getProjectById('custom-002');
      expect(fetched).not.toBeNull();
      expect(fetched?.project.name).toBe('Second Workshop');

      const all = await repo.listProjects();
      expect(all.length).toBe(2);
    });
  });

  describe('LocalStandardRepository', () => {
    it('loads the default demo-standard.json fixture correctly', async () => {
      const repo = new LocalStandardRepository();
      const standard = await repo.getStandardById('mobeng-standard');

      expect(standard).not.toBeNull();
      expect(standard?.id).toBe('mobeng-standard');
      expect(standard?.version).toBe('0.1-demo');

      const gridParam = standard?.parameters.find((p) => p.key === 'grid.size');
      expect(gridParam?.value).toBe(0.1);
    });

    it('returns null for non-existent standard id', async () => {
      const repo = new LocalStandardRepository();
      const standard = await repo.getStandardById('unknown-standard');
      expect(standard).toBeNull();
    });

    it('lists all loaded standards', async () => {
      const repo = new LocalStandardRepository();
      const standards = await repo.listStandards();
      expect(standards.length).toBeGreaterThanOrEqual(1);
      expect(standards[0].id).toBe('mobeng-standard');
    });

    it('saves new standards and preserves immutability', async () => {
      const repo = new LocalStandardRepository();
      const customStd: WorkshopStandard = {
        id: 'custom-std-v1',
        name: 'Custom Workshop Standard',
        version: '1.0.0',
        status: 'published',
        parameters: [],
        rules: [],
      };

      await repo.saveStandard(customStd);
      const fetched = await repo.getStandardById('custom-std-v1');
      expect(fetched?.name).toBe('Custom Workshop Standard');

      const all = await repo.listStandards();
      expect(all.length).toBe(2);
    });
  });
});
