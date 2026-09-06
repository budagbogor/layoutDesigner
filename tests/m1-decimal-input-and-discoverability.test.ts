import { describe, it, expect } from 'vitest';
import { parseDecimalInput, isValidDecimalInput } from '../src/presentation/utils/decimalParser';
import { CadStore } from '../src/application/state/CadStore';
import { WorkshopProject } from '../src/domain/models/project';

describe('M1 — DECIMAL COMMA INPUT & SITE/BUILDING DISCOVERABILITY', () => {
  describe('1. Decimal Comma Normalization & Parsing', () => {
    it('parses Indonesian-style comma decimals to valid floating-point numbers', () => {
      expect(parseDecimalInput('4,5')).toBe(4.5);
      expect(parseDecimalInput('12,25')).toBe(12.25);
      expect(parseDecimalInput('9,75')).toBe(9.75);
      expect(parseDecimalInput('0,1')).toBe(0.1);
      expect(parseDecimalInput('  24,50  ')).toBe(24.5);
    });

    it('parses standard dot decimals without regression', () => {
      expect(parseDecimalInput('4.5')).toBe(4.5);
      expect(parseDecimalInput('12.25')).toBe(12.25);
      expect(parseDecimalInput('9.75')).toBe(9.75);
      expect(parseDecimalInput('0.1')).toBe(0.1);
      expect(parseDecimalInput('  30.0  ')).toBe(30);
    });

    it('parses integer strings and numbers without regression', () => {
      expect(parseDecimalInput('10')).toBe(10);
      expect(parseDecimalInput('24')).toBe(24);
      expect(parseDecimalInput('0')).toBe(0);
      expect(parseDecimalInput(15)).toBe(15);
      expect(parseDecimalInput(24.5)).toBe(24.5);
    });

    it('rejects malformed, non-numeric, or multiple-delimiter inputs', () => {
      expect(parseDecimalInput('4,5,6')).toBeNull();
      expect(parseDecimalInput('12.25.1')).toBeNull();
      expect(parseDecimalInput('4,5.6')).toBeNull();
      expect(parseDecimalInput('abc')).toBeNull();
      expect(parseDecimalInput('12a')).toBeNull();
      expect(parseDecimalInput('')).toBeNull();
      expect(parseDecimalInput('   ')).toBeNull();
      expect(parseDecimalInput(null)).toBeNull();
      expect(parseDecimalInput(undefined)).toBeNull();
      expect(parseDecimalInput(NaN)).toBeNull();
      expect(parseDecimalInput(Infinity)).toBeNull();
    });

    it('verifies isValidDecimalInput boolean helper', () => {
      expect(isValidDecimalInput('4,5')).toBe(true);
      expect(isValidDecimalInput('4.5')).toBe(true);
      expect(isValidDecimalInput('100')).toBe(true);
      expect(isValidDecimalInput('invalid')).toBe(false);
      expect(isValidDecimalInput('')).toBe(false);
    });
  });

  describe('2. CadStore Integration with Normalized Decimal Inputs', () => {
    const createMockProject = (): WorkshopProject => ({
      project: {
        id: 'proj-m1-test',
        name: 'M1 Test Workshop',
        unit: 'meter',
        standard_version_id: 'mobeng-standard@0.1-demo',
      },
      site: { width: 30, length: 40, road_side: 'south', road_width: 8 },
      building: { width: 24, length: 30 },
      layout: {
        status: 'generated',
        score: 85,
        objects: [
          {
            id: 'bay-01',
            type: 'service_bay',
            layer: '08-SERVICE-BAY',
            geometry: { x: 2.0, y: 3.0, width: 4.0, length: 9.0, rotation: 0 },
            metadata: { bayType: 'SERVICE_BAY' },
          },
        ],
      },
    });

    it('updates building dimensions from parsed decimal inputs and validates layout', () => {
      const store = new CadStore(createMockProject());

      // User enters "26,5" width and "32,5" length
      const parsedWidth = parseDecimalInput('26,5');
      const parsedLength = parseDecimalInput('32,5');

      expect(parsedWidth).toBe(26.5);
      expect(parsedLength).toBe(32.5);

      const success = store.updateBuilding({ width: parsedWidth!, length: parsedLength! });
      expect(success).toBe(true);

      const state = store.getState();
      expect(state.project.building.width).toBe(26.5);
      expect(state.project.building.length).toBe(32.5);
      expect(state.isDirty).toBe(true);
      expect(state.validationReport.valid).toBe(true);
    });

    it('updates site dimensions from parsed decimal inputs and enforces boundary-site rule', () => {
      const store = new CadStore(createMockProject());

      // User enters "35,5" width and "45,5" length
      const parsedSiteWidth = parseDecimalInput('35,5');
      const parsedSiteLength = parseDecimalInput('45,5');

      expect(parsedSiteWidth).toBe(35.5);
      expect(parsedSiteLength).toBe(45.5);

      const success = store.updateSite({ width: parsedSiteWidth!, length: parsedSiteLength! });
      expect(success).toBe(true);

      const state = store.getState();
      expect(state.project.site.width).toBe(35.5);
      expect(state.project.site.length).toBe(45.5);
    });

    it('updates object geometry position and dimensions from parsed decimal inputs', () => {
      const store = new CadStore(createMockProject());

      const parsedX = parseDecimalInput('3,75');
      const parsedY = parseDecimalInput('4,25');
      const parsedW = parseDecimalInput('4,2');
      const parsedL = parseDecimalInput('9,5');

      expect(parsedX).toBe(3.75);
      expect(parsedY).toBe(4.25);
      expect(parsedW).toBe(4.2);
      expect(parsedL).toBe(9.5);

      store.updateObjectGeometry('bay-01', {
        x: parsedX!,
        y: parsedY!,
        width: parsedW!,
        length: parsedL!,
      });

      const updatedBay = store.getState().project.layout.objects.find((o) => o.id === 'bay-01')!;
      expect(updatedBay.geometry.x).toBe(3.75);
      expect(updatedBay.geometry.y).toBe(4.25);
      expect(updatedBay.geometry.width).toBe(4.2);
      expect(updatedBay.geometry.length).toBe(9.5);
      expect(store.getState().validationReport.valid).toBe(true);
    });

    it('triggers boundary violation when building size shrinks below object coordinates', () => {
      const store = new CadStore(createMockProject());

      // Place object at x: 20
      store.updateObjectGeometry('bay-01', { x: 20.0, y: 15.0 });

      // User shrinks building width to "18,5" meters
      const shrunkWidth = parseDecimalInput('18,5')!;
      store.updateBuilding({ width: shrunkWidth });

      const state = store.getState();
      expect(state.project.building.width).toBe(18.5);
      expect(state.validationReport.valid).toBe(false);
      expect(state.validationReport.hardCount).toBeGreaterThan(0);
      expect(state.validationReport.issues.some((issue) => issue.ruleId === 'BOUNDARY-001')).toBe(true);
    });
  });
});
