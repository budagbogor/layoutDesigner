import { Point2D } from '@/domain/geometry/types';
import { roundMillimeter } from '@/domain/geometry/precision';

export interface ViewportTransformConfig {
  viewportWidth: number;
  viewportHeight: number;
  panX: number; // in pixels offset
  panY: number; // in pixels offset
  zoom: number; // scale multiplier
  pixelsPerMeter: number; // base pixels per meter (default e.g. 30)
  buildingWidth: number; // in meters
  buildingLength: number; // in meters
  originScreenX?: number; // optional precomputed origin X
  originScreenY?: number; // optional precomputed origin Y
}

export const DEFAULT_PIXELS_PER_METER = 30;

/**
 * Calculate the screen pixel position of the building origin (CAD (0, 0) bottom-left).
 * Centers the building within the viewport, factoring in pan and zoom.
 */
export function getBuildingOriginScreen(config: ViewportTransformConfig): Point2D {
  if (config.originScreenX !== undefined && config.originScreenY !== undefined) {
    return { x: config.originScreenX, y: config.originScreenY };
  }

  const scale = config.pixelsPerMeter * config.zoom;
  const buildingPixelW = config.buildingWidth * scale;
  const buildingPixelH = config.buildingLength * scale;

  // Center horizontally: left edge + panX
  const originX = (config.viewportWidth - buildingPixelW) / 2 + config.panX;

  // Center vertically: bottom edge + panY (Y goes downward in screen pixels, so bottom is originY)
  const originY = (config.viewportHeight + buildingPixelH) / 2 + config.panY;

  return {
    x: roundMillimeter(originX),
    y: roundMillimeter(originY),
  };
}

/**
 * Convert CAD World Point (meters, +X right, +Y up, origin bottom-left)
 * to SVG Screen Point (pixels, +X right, +Y down, origin top-left).
 */
export function cadToScreen(cadPoint: Point2D, config: ViewportTransformConfig): Point2D {
  const origin = getBuildingOriginScreen(config);
  const scale = config.pixelsPerMeter * config.zoom;

  const screenX = origin.x + cadPoint.x * scale;
  const screenY = origin.y - cadPoint.y * scale; // Invert CAD +Y upward to SVG +Y downward

  return {
    x: roundMillimeter(screenX),
    y: roundMillimeter(screenY),
  };
}

/**
 * Convert SVG Screen Point (pixels, origin top-left, +Y down)
 * to CAD World Point (meters, origin bottom-left, +Y up).
 */
export function screenToCad(screenPoint: Point2D, config: ViewportTransformConfig): Point2D {
  const origin = getBuildingOriginScreen(config);
  const scale = config.pixelsPerMeter * config.zoom;

  if (scale === 0) {
    return { x: 0, y: 0 };
  }

  const cadX = (screenPoint.x - origin.x) / scale;
  const cadY = (origin.y - screenPoint.y) / scale; // Invert SVG +Y downward to CAD +Y upward

  return {
    x: roundMillimeter(cadX),
    y: roundMillimeter(cadY),
  };
}

export interface GridLine {
  isMajor: boolean;
  position: number; // coordinate in pixels
  meterValue: number; // coordinate in meters
}

export interface GridLinesResult {
  verticalLines: GridLine[];
  horizontalLines: GridLine[];
  minorStep: number;
  majorStep: number;
}

/**
 * Calculate dynamic grid lines for the visible viewport in meters and pixels.
 */
export function calculateGridLines(
  config: ViewportTransformConfig,
  requestedGridSize: number = 0.1
): GridLinesResult {
  const scale = config.pixelsPerMeter * config.zoom;

  // Adapt grid step if zoomed far out to prevent rendering thousands of dense lines
  let minorStep = requestedGridSize;
  const minPixelSpacing = 15; // minimum pixels between rendered lines

  if (minorStep * scale < minPixelSpacing) {
    if (0.5 * scale >= minPixelSpacing) {
      minorStep = 0.5;
    } else if (1.0 * scale >= minPixelSpacing) {
      minorStep = 1.0;
    } else {
      minorStep = 5.0;
    }
  }

  const majorStep = minorStep <= 0.1 ? 1.0 : minorStep <= 0.5 ? 2.5 : minorStep * 5;

  // Determine CAD bounding box currently visible on screen (with safety margin)
  const pTopLeft = screenToCad({ x: -100, y: -100 }, config);
  const pBottomRight = screenToCad(
    { x: config.viewportWidth + 100, y: config.viewportHeight + 100 },
    config
  );

  const minX = Math.min(pTopLeft.x, pBottomRight.x);
  const maxX = Math.max(pTopLeft.x, pBottomRight.x);
  const minY = Math.min(pTopLeft.y, pBottomRight.y);
  const maxY = Math.max(pTopLeft.y, pBottomRight.y);

  const verticalLines: GridLine[] = [];
  const startX = Math.floor(minX / minorStep) * minorStep;

  for (let x = startX; x <= maxX; x += minorStep) {
    const roundedX = roundMillimeter(x);
    const screenX = cadToScreen({ x: roundedX, y: 0 }, config).x;
    const isMajor = Math.abs(roundedX % majorStep) < 0.001 || Math.abs(Math.abs(roundedX % majorStep) - majorStep) < 0.001;

    verticalLines.push({
      isMajor,
      position: screenX,
      meterValue: roundedX,
    });
  }

  const horizontalLines: GridLine[] = [];
  const startY = Math.floor(minY / minorStep) * minorStep;

  for (let y = startY; y <= maxY; y += minorStep) {
    const roundedY = roundMillimeter(y);
    const screenY = cadToScreen({ x: 0, y: roundedY }, config).y;
    const isMajor = Math.abs(roundedY % majorStep) < 0.001 || Math.abs(Math.abs(roundedY % majorStep) - majorStep) < 0.001;

    horizontalLines.push({
      isMajor,
      position: screenY,
      meterValue: roundedY,
    });
  }

  return {
    verticalLines,
    horizontalLines,
    minorStep,
    majorStep,
  };
}
