/**
 * Pure 2D Geometry Types
 * Unit: Meter
 * Coordinate system: Origin at building bottom-left, +X right, +Y up.
 * Zero dependencies on DOM/UI/React.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Size2D {
  readonly width: number;
  readonly length: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly length: number;
}

export interface BoundingBox2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Polygon2D {
  readonly vertices: readonly Point2D[];
}

export type RotationPivot = 'bottom-left' | 'center';
