import { describe, it, expect } from 'vitest';
import type { WorkshopProject, LayoutObject } from '@/domain/models/project';
import type { WorkshopStandard } from '@/domain/models/standard';
import demoProjectRaw from '../data/demo-project.json';
import demoStandardRaw from '../data/demo-standard.json';

describe('Domain Models & Fixture Conformance', () => {
  it('validates demo-project.json adheres to WorkshopProject domain model', () => {
    const project = demoProjectRaw as unknown as WorkshopProject;

    expect(project.project.id).toBe('demo-001');
    expect(project.project.name).toBe('Mobeng Workshop Demo');
    expect(project.project.unit).toBe('meter');
    expect(project.project.standard_version_id).toBe('mobeng-standard@0.1-demo');

    // Site & Building dimensions
    expect(project.site.width).toBe(20);
    expect(project.site.length).toBe(30);
    expect(project.site.road_side).toBe('south');
    expect(project.site.road_width).toBe(8);

    expect(project.building.width).toBe(18);
    expect(project.building.length).toBe(25);

    // Layout
    expect(project.layout.status).toBe('draft');
    expect(project.layout.score).toBeNull();
    expect(Array.isArray(project.layout.objects)).toBe(true);
  });

  it('validates demo-standard.json adheres to WorkshopStandard domain model', () => {
    const standard = demoStandardRaw as unknown as WorkshopStandard;

    expect(standard.id).toBe('mobeng-standard');
    expect(standard.version).toBe('0.1-demo');
    expect(standard.status).toBe('draft');

    // Parameters
    const wallParam = standard.parameters.find((p) => p.key === 'building.wall_thickness');
    expect(wallParam).toBeDefined();
    expect(wallParam?.value).toBe(0.15);
    expect(wallParam?.unit).toBe('meter');

    // Rules
    const boundaryRule = standard.rules.find((r) => r.id === 'BOUNDARY-001');
    expect(boundaryRule).toBeDefined();
    expect(boundaryRule?.severity).toBe('HARD');
    expect(boundaryRule?.active).toBe(true);

    // Scoring weights
    expect(standard.scoring).toBeDefined();
    const capacityScore = standard.scoring?.find((s) => s.key === 'capacity_throughput');
    expect(capacityScore?.weight).toBe(100);
  });

  it('allows creating typed layout objects in accordance with the schema', () => {
    const bayObject: LayoutObject = {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: {
        x: 2.5,
        y: 5.0,
        width: 4.0,
        length: 7.0,
        rotation: 0,
      },
      metadata: {
        bayType: 'general_service',
      },
    };

    expect(bayObject.type).toBe('service_bay');
    expect(bayObject.geometry.width).toBe(4.0);
    expect(bayObject.geometry.length).toBe(7.0);
  });
});
