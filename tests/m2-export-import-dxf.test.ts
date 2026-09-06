import { describe, it, expect, vi } from 'vitest';
import { WorkshopProject } from '../src/domain/models/project';
import { CadStore } from '../src/application/state/CadStore';
import { exportLayoutToSvg } from '../src/domain/export/svgExporter';
import { exportLayoutToDxf } from '../src/domain/export/dxfExporter';
import { sanitizeFilename } from '../src/domain/export/fileSanitizer';
import {
  importProjectFromJsonString,
  createNewBlankProject,
} from '../src/application/services/projectPersistenceService';

const createSampleTestProject = (): WorkshopProject => ({
  project: {
    id: 'proj-m2-test',
    name: 'Mobeng Workshop: Dago & Riau / Phase * 1',
    unit: 'meter',
    standard_version_id: 'standard-v1',
  },
  site: {
    width: 25,
    length: 35,
    road_side: 'south',
    road_width: 8,
  },
  building: {
    width: 18.0,
    length: 24.0,
  },
  layout: {
    status: 'draft',
    score: null,
    objects: [
      {
        id: 'bay-01',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: {
          x: 4.0,
          y: 5.0,
          width: 4.0,
          length: 7.0,
          rotation: 90,
        },
        metadata: {
          name: 'Service Bay 1',
        },
      },
      {
        id: 'lift-01',
        type: 'equipment',
        layer: '06-LIFT',
        geometry: {
          x: 4.5,
          y: 6.0,
          width: 2.0,
          length: 3.5,
          rotation: 90,
        },
        metadata: {
          name: '2-Post Lift 1',
        },
      },
      {
        id: 'wall-01',
        type: 'wall',
        layer: '01-WALL',
        geometry: {
          x: 0.0,
          y: 0.0,
          width: 0.2,
          length: 24.0,
          rotation: 0,
        },
      },
    ],
  },
});

describe('M2 — PROFESSIONAL PROJECT FILE & CAD EXPORT SUITE', () => {
  describe('1. File Naming & Sanitizer', () => {
    it('sanitizes unsafe filesystem characters cleanly', () => {
      const unsafe = 'Mobeng: Workshop / Dago * Test ? <v1> | "Final"';
      const clean = sanitizeFilename(unsafe);
      expect(clean).toBe('Mobeng_ Workshop _ Dago _ Test _ _v1_ _ _Final_');
      expect(clean).not.toMatch(/[\\/:*?"<>|]/);
    });

    it('falls back to default name when input is empty or invalid', () => {
      expect(sanitizeFilename('')).toBe('mobeng_workshop');
      expect(sanitizeFilename('   ')).toBe('mobeng_workshop');
    });
  });

  describe('2. JSON Export & Import', () => {
    it('exports current CadStore project into valid, parseable JSON deliverable', () => {
      const project = createSampleTestProject();
      const store = new CadStore(project);

      // Modify geometry in store
      store.updateObjectGeometry('bay-01', { x: 7.5 });

      const current = store.getState().project;
      const jsonString = JSON.stringify(current, null, 2);

      const parsed = JSON.parse(jsonString);
      expect(parsed.project.id).toBe('proj-m2-test');
      expect(parsed.layout.objects[0].geometry.x).toBe(7.5);
    });

    it('successfully imports valid JSON project into CadStore without calling AI/engine', () => {
      const original = createSampleTestProject();
      const store = new CadStore(createNewBlankProject());

      const jsonString = JSON.stringify(original, null, 2);
      const importResult = importProjectFromJsonString(jsonString);

      expect(importResult.success).toBe(true);
      expect(importResult.project).toBeDefined();

      store.loadProject(importResult.project!);

      expect(store.getState().project.project.id).toBe('proj-m2-test');
      expect(store.getState().project.layout.objects.length).toBe(3);
      expect(store.isDirty()).toBe(false);
    });

    it('rejects corrupt/invalid JSON without mutating current project state', () => {
      const store = new CadStore(createSampleTestProject());
      const stateBefore = store.getState().project;

      // Bad JSON syntax
      const badSyntaxResult = importProjectFromJsonString('{ "project": broken ...');
      expect(badSyntaxResult.success).toBe(false);
      expect(badSyntaxResult.error).toContain('Invalid JSON format');

      // Invalid schema (missing building & layout)
      const badSchemaResult = importProjectFromJsonString(JSON.stringify({
        project: { id: 'corrupt', name: 'Corrupt', unit: 'meter', standard_version_id: 'v1' },
      }));
      expect(badSchemaResult.success).toBe(false);
      expect(badSchemaResult.issues).toBeDefined();

      // Ensure active project was not modified
      expect(store.getState().project.project.id).toBe(stateBefore.project.id);
    });
  });

  describe('3. Vector SVG Export', () => {
    it('exports valid SVG matching current project geometry, layers, and building boundary', () => {
      const project = createSampleTestProject();
      const svg = exportLayoutToSvg({ project });

      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('id="building-boundary"');
      expect(svg).toContain('← 18.00 m →');
      expect(svg).toContain('← 24.00 m →');
      expect(svg).toContain('id="layer-08-SERVICE-BAY"');
      expect(svg).toContain('id="layer-06-LIFT"');
      expect(svg).toContain('id="layer-01-WALL"');
      expect(svg).toContain('Service Bay 1');
      expect(svg).toContain('2-Post Lift 1');
    });

    it('respects layer visibility filter during SVG export', () => {
      const project = createSampleTestProject();
      const layers = [
        { id: '08-SERVICE-BAY', name: 'Bays', color: '#2f81f7', visible: false, locked: false, count: 1 },
        { id: '06-LIFT', name: 'Lifts', color: '#d29922', visible: true, locked: false, count: 1 },
        { id: '01-WALL', name: 'Walls', color: '#8b949e', visible: true, locked: false, count: 1 },
      ];

      const svg = exportLayoutToSvg({ project, layers });
      expect(svg).not.toContain('id="layer-08-SERVICE-BAY"');
      expect(svg).toContain('id="layer-06-LIFT"');
    });
  });

  describe('4. Native 2D ASCII DXF Export', () => {
    it('exports standard ASCII DXF structure (HEADER, TABLES/LAYERS, ENTITIES, EOF)', () => {
      const project = createSampleTestProject();
      const dxf = exportLayoutToDxf({ project });

      // Structure checkpoints
      expect(dxf).toContain('0\nSECTION\n2\nHEADER');
      expect(dxf).toContain('9\n$ACADVER\n1\nAC1015');
      expect(dxf).toContain('9\n$INSUNITS\n70\n6'); // Units: meters
      expect(dxf).toContain('0\nSECTION\n2\nTABLES');
      expect(dxf).toContain('0\nTABLE\n2\nLAYER');
      expect(dxf).toContain('0\nLAYER\n5\n');
      expect(dxf).toContain('2\n00-BUILDING');
      expect(dxf).toContain('2\n08-SERVICE-BAY');
      expect(dxf).toContain('2\n06-LIFT');
      expect(dxf).toContain('2\n01-WALL');
      expect(dxf).toContain('0\nSECTION\n2\nENTITIES');
      expect(dxf).toContain('0\nEOF');
    });

    it('exports building boundary as closed LWPOLYLINE', () => {
      const project = createSampleTestProject();
      const dxf = exportLayoutToDxf({ project });

      expect(dxf).toContain('0\nLWPOLYLINE');
      expect(dxf).toContain('8\n00-BUILDING');
      expect(dxf).toContain('90\n4'); // 4 vertices
      expect(dxf).toContain('70\n1'); // closed
      // Building dimensions: 18 x 24
      expect(dxf).toContain('10\n18.000\n20\n0.000');
      expect(dxf).toContain('10\n18.000\n20\n24.000');
    });

    it('exports CAD objects with rotated polygon coordinates and text labels', () => {
      const project = createSampleTestProject();
      const dxf = exportLayoutToDxf({ project, includeLabels: true, includeDimensions: true });

      // Object layers
      expect(dxf).toContain('8\n08-SERVICE-BAY');
      expect(dxf).toContain('8\n06-LIFT');

      // Object label TEXT entities
      expect(dxf).toContain('0\nTEXT');
      expect(dxf).toContain('1\nService Bay 1');
      expect(dxf).toContain('1\n2-Post Lift 1');

      // Dimension annotations
      expect(dxf).toContain('8\n09-DIMENSION');
      expect(dxf).toContain('1\n18.00m');
      expect(dxf).toContain('1\n24.00m');
    });
  });
});
