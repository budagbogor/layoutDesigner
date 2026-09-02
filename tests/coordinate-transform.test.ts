import { describe, it, expect } from 'vitest';
import {
  cadToScreen,
  screenToCad,
  getBuildingOriginScreen,
  calculateGridLines,
  ViewportTransformConfig,
} from '@/presentation/canvas/coordinateTransform';
import { approxEqual, pointsApproxEqual } from '@/domain/geometry/precision';

describe('Coordinate Transformation & Grid (Presentation Layer)', () => {
  const baseConfig: ViewportTransformConfig = {
    viewportWidth: 1000,
    viewportHeight: 800,
    panX: 0,
    panY: 0,
    zoom: 1.0,
    pixelsPerMeter: 30, // 30px per meter
    buildingWidth: 18.0, // 18m -> 540px
    buildingLength: 25.0, // 25m -> 750px
  };

  describe('Origin Calculation', () => {
    it('centers the building origin (bottom-left) within the viewport at zero pan', () => {
      // Building is 540px wide, viewport is 1000px wide. Left margin is (1000 - 540) / 2 = 230px
      // Building is 750px high, viewport is 800px high. Top margin is (800 - 750) / 2 = 25px
      // In SVG, Y=0 is top. Bottom of building is at 25px + 750px = 775px
      const origin = getBuildingOriginScreen(baseConfig);
      expect(origin.x).toBe(230);
      expect(origin.y).toBe(775);
    });

    it('shifts origin when pan offset is applied', () => {
      const pannedConfig: ViewportTransformConfig = {
        ...baseConfig,
        panX: 50,
        panY: -30,
      };

      const origin = getBuildingOriginScreen(pannedConfig);
      expect(origin.x).toBe(280); // 230 + 50
      expect(origin.y).toBe(745); // 775 - 30
    });
  });

  describe('CAD to Screen Conversion & Y-Axis Inversion', () => {
    it('maps CAD origin (0, 0) bottom-left directly to the building screen origin', () => {
      const screenPt = cadToScreen({ x: 0, y: 0 }, baseConfig);
      expect(screenPt.x).toBe(230);
      expect(screenPt.y).toBe(775);
    });

    it('inverts CAD +Y upward to SVG/screen +Y downward', () => {
      // In CAD: (0, 0) is bottom-left, (0, 10) is 10 meters UP
      // In screen pixels: (0, 10) should have a SMALLER Y coordinate (higher up on screen)
      const bottomScreen = cadToScreen({ x: 0, y: 0 }, baseConfig);
      const topScreen = cadToScreen({ x: 0, y: 10 }, baseConfig);

      expect(topScreen.x).toBe(bottomScreen.x);
      // 10 meters at 30px/m = 300px higher (775 - 300 = 475)
      expect(topScreen.y).toBe(475);
      expect(topScreen.y).toBeLessThan(bottomScreen.y);
    });

    it('scales X coordinates horizontally (+X right)', () => {
      const leftScreen = cadToScreen({ x: 0, y: 0 }, baseConfig);
      const rightScreen = cadToScreen({ x: 18, y: 0 }, baseConfig);

      // 18 meters at 30px/m = 540px right (230 + 540 = 770)
      expect(rightScreen.x).toBe(770);
      expect(rightScreen.y).toBe(leftScreen.y);
    });
  });

  describe('Screen to CAD Conversion & Round-Trip', () => {
    it('accurately converts screen pixels back to CAD meters', () => {
      // Screen origin (230, 775) corresponds to CAD (0, 0)
      const cadOrigin = screenToCad({ x: 230, y: 775 }, baseConfig);
      expect(cadOrigin.x).toBe(0);
      expect(cadOrigin.y).toBe(0);

      // Screen (770, 25) corresponds to CAD top-right corner (18, 25)
      const cadTopRight = screenToCad({ x: 770, y: 25 }, baseConfig);
      expect(cadTopRight.x).toBe(18);
      expect(cadTopRight.y).toBe(25);
    });

    it('performs exact round-trip conversion: CAD -> Screen -> CAD', () => {
      const testPoints = [
        { x: 0, y: 0 },
        { x: 5.25, y: 12.8 },
        { x: 18.0, y: 25.0 },
        { x: -3.5, y: -2.1 },
        { x: 100.123, y: 55.456 },
      ];

      for (const pt of testPoints) {
        const screen = cadToScreen(pt, baseConfig);
        const roundTrip = screenToCad(screen, baseConfig);

        expect(pointsApproxEqual(pt, roundTrip, 0.001)).toBe(true);
      }
    });

    it('performs exact round-trip conversion: Screen -> CAD -> Screen', () => {
      const screenPoints = [
        { x: 0, y: 0 },
        { x: 500, y: 400 },
        { x: 1000, y: 800 },
      ];

      for (const sp of screenPoints) {
        const cad = screenToCad(sp, baseConfig);
        const roundTripScreen = cadToScreen(cad, baseConfig);

        expect(approxEqual(sp.x, roundTripScreen.x, 0.05)).toBe(true);
        expect(approxEqual(sp.y, roundTripScreen.y, 0.05)).toBe(true);
      }
    });
  });

  describe('Zoom Behavior', () => {
    it('scales pixel distances proportionally with zoom multiplier', () => {
      const zoom2Config: ViewportTransformConfig = {
        ...baseConfig,
        zoom: 2.0, // 60px per meter
      };

      const p0 = cadToScreen({ x: 0, y: 0 }, zoom2Config);
      const p1 = cadToScreen({ x: 1, y: 0 }, zoom2Config);

      expect(p1.x - p0.x).toBe(60);
    });

    it('preserves CAD coordinates across varying zoom levels', () => {
      const zoomHalfConfig: ViewportTransformConfig = {
        ...baseConfig,
        zoom: 0.5, // 15px per meter
      };

      const targetCad = { x: 7.5, y: 14.0 };
      const screenPos = cadToScreen(targetCad, zoomHalfConfig);
      const recoveredCad = screenToCad(screenPos, zoomHalfConfig);

      expect(pointsApproxEqual(targetCad, recoveredCad)).toBe(true);
    });
  });

  describe('Dynamic Grid Calculations', () => {
    it('calculates minor and major grid lines for visible viewport', () => {
      const grid = calculateGridLines(baseConfig, 0.5);

      expect(grid.verticalLines.length).toBeGreaterThan(0);
      expect(grid.horizontalLines.length).toBeGreaterThan(0);

      // Check that lines have isMajor flags
      const majorVerticals = grid.verticalLines.filter((l) => l.isMajor);
      expect(majorVerticals.length).toBeGreaterThan(0);
    });

    it('adapts grid density when zoomed far out to prevent rendering thousands of lines', () => {
      const zoomedOutConfig: ViewportTransformConfig = {
        ...baseConfig,
        zoom: 0.1, // 3px per meter
      };

      // When zoomed out, requested 0.1m grid should adapt up to 1.0m or 5.0m
      const grid = calculateGridLines(zoomedOutConfig, 0.1);
      expect(grid.minorStep).toBeGreaterThanOrEqual(1.0);
    });
  });
});
