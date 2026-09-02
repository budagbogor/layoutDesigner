import { describe, it, expect } from 'vitest';
import { exportLayoutToSvg } from '@/domain/export/svgExporter';
import type { WorkshopProject } from '@/domain/models/project';
import type { LayerState } from '@/application/state/types';
import demoProjectRaw from '../data/demo-project.json';

describe('Phase 1.8 — Deterministic Vector SVG Exporter', () => {
  const sampleProject: WorkshopProject = {
    project: {
      id: 'export-test-01',
      name: 'SVG Export Test Workshop',
      unit: 'meter',
      standard_version_id: 'mobeng-std@0.1-demo',
    },
    site: { width: 30, length: 40 },
    building: { width: 18.0, length: 25.0 },
    layout: {
      status: 'draft',
      score: null,
      objects: [
        {
          id: 'bay-01',
          type: 'service_bay',
          layer: '08-SERVICE-BAY',
          geometry: { x: 2.0, y: 3.0, width: 4.0, length: 7.0, rotation: 0 },
          metadata: { name: 'Service Bay 1' },
        },
        {
          id: 'lift-01',
          type: 'equipment',
          layer: '06-LIFT',
          geometry: { x: 3.0, y: 4.5, width: 2.0, length: 4.0, rotation: 45 },
          metadata: { name: 'Lift 1' },
        },
        {
          id: 'veh-01',
          type: 'vehicle',
          layer: '05-VEHICLE',
          geometry: { x: 3.1, y: 4.2, width: 1.8, length: 4.7, rotation: 0 },
        },
        {
          id: 'wall-01',
          type: 'wall',
          layer: '01-WALL',
          geometry: { x: 8.0, y: 3.0, width: 0.2, length: 8.0, rotation: 90 },
        },
      ],
    },
  };

  it('generates valid, standalone vector SVG XML document', () => {
    const svg = exportLayoutToSvg({ project: sampleProject });

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('preserves building boundary and physical dimensions', () => {
    const svg = exportLayoutToSvg({ project: sampleProject });

    expect(svg).toContain('id="building-boundary"');
    expect(svg).toContain('← 18.00 m →');
    expect(svg).toContain('← 25.00 m →');
    expect(svg).toContain('(0.00, 0.00)');
  });

  it('preserves object geometry and layers as SVG groups', () => {
    const svg = exportLayoutToSvg({ project: sampleProject });

    // Layer groups
    expect(svg).toContain('<g id="layer-08-SERVICE-BAY"');
    expect(svg).toContain('<g id="layer-06-LIFT"');
    expect(svg).toContain('<g id="layer-05-VEHICLE"');
    expect(svg).toContain('<g id="layer-01-WALL"');

    // Objects inside layers
    expect(svg).toContain('<g id="obj-bay-01"');
    expect(svg).toContain('<g id="obj-lift-01"');
    expect(svg).toContain('<g id="obj-veh-01"');
    expect(svg).toContain('<g id="obj-wall-01"');

    // Polygons with points
    expect(svg).toContain('<polygon points=');
  });

  it('preserves rotation in polygon geometry', () => {
    const svg = exportLayoutToSvg({ project: sampleProject });

    // lift-01 is rotated 45 degrees
    expect(svg).toContain('data-rotation="45"');
    // wall-01 is rotated 90 degrees
    expect(svg).toContain('data-rotation="90"');
  });

  it('excludes hidden layers when layer visibility filter is provided', () => {
    const layers: LayerState[] = [
      { id: '08-SERVICE-BAY', name: 'Service Bay', visible: true, locked: false },
      { id: '06-LIFT', name: 'Lift', visible: true, locked: false },
      { id: '05-VEHICLE', name: 'Vehicle', visible: false, locked: false }, // HIDDEN
      { id: '01-WALL', name: 'Wall', visible: true, locked: false },
    ];

    const svg = exportLayoutToSvg({ project: sampleProject, layers });

    // Visible objects included
    expect(svg).toContain('id="obj-bay-01"');
    expect(svg).toContain('id="obj-lift-01"');
    expect(svg).toContain('id="obj-wall-01"');

    // Hidden layer and object excluded
    expect(svg).not.toContain('id="layer-05-VEHICLE"');
    expect(svg).not.toContain('id="obj-veh-01"');
  });

  it('produces 100% deterministic output (byte-for-byte identical)', () => {
    const svg1 = exportLayoutToSvg({ project: sampleProject });
    const svg2 = exportLayoutToSvg({ project: sampleProject });

    expect(svg1).toBe(svg2);
    expect(svg1.length).toBe(svg2.length);
  });

  it('does not mutate project or layout state during export', () => {
    const copyBefore = JSON.stringify(sampleProject);
    exportLayoutToSvg({ project: sampleProject });
    const copyAfter = JSON.stringify(sampleProject);

    expect(copyBefore).toBe(copyAfter);
  });

  it('successfully exports the canonical demo-project.json fixture', () => {
    const demoProject = demoProjectRaw as unknown as WorkshopProject;
    const svg = exportLayoutToSvg({ project: demoProject });

    expect(svg).toContain('Mobeng Workshop Demo');
    expect(svg).toContain('mobeng-standard@0.1-demo');
    expect(svg).toContain('← 18.00 m →');
    expect(svg).toContain('← 25.00 m →');
    expect(svg).toContain('id="obj-bay-01"');
  });
});
