import { Geometry, LayoutObject } from '../../models/project';
import { ObjectEnvelope, AccessPoint } from '../types';
import {
  overlapsEnvelope,
  distanceBetweenEnvelopes,
  extractGeometry,
  SpatialEntity,
} from './spatialRelations';
import { CAD_EPSILON, roundMillimeter } from '../../geometry/precision';

export interface ConnectivityValidationResult {
  isConnected: boolean;
  reason: string;
  sourceId?: string;
  targetId?: string;
  gapMeters?: number;
}

/**
 * Extracts an ID string from a SpatialEntity or LayoutObject if present.
 */
function extractEntityId(entity: unknown): string | undefined {
  if (entity && typeof entity === 'object') {
    if ('id' in entity && typeof (entity as any).id === 'string') {
      return (entity as any).id;
    }
    if ('sourceObjectId' in entity && typeof (entity as any).sourceObjectId === 'string') {
      return (entity as any).sourceObjectId;
    }
  }
  return undefined;
}

/**
 * Validates whether an access corridor physically connects a source entity to a target entity.
 * Evaluates real geometric intersection/touching, not crude point distances.
 * Supports arbitrary rotations.
 */
export function isAccessConnected(
  source: SpatialEntity | LayoutObject,
  target: SpatialEntity | LayoutObject,
  accessCorridor: SpatialEntity | LayoutObject
): ConnectivityValidationResult {
  const sourceId = extractEntityId(source);
  const targetId = extractEntityId(target);
  const corridorId = extractEntityId(accessCorridor);

  const sourceGeo = extractGeometry(source as SpatialEntity);
  const targetGeo = extractGeometry(target as SpatialEntity);
  const corridorGeo = extractGeometry(accessCorridor as SpatialEntity);

  const touchesSource =
    overlapsEnvelope(corridorGeo, sourceGeo) ||
    distanceBetweenEnvelopes(corridorGeo, sourceGeo) <= CAD_EPSILON;

  if (!touchesSource) {
    const gap = distanceBetweenEnvelopes(corridorGeo, sourceGeo);
    return {
      isConnected: false,
      sourceId,
      targetId,
      gapMeters: gap,
      reason: `Access corridor${corridorId ? ` '${corridorId}'` : ''} does not touch or intersect the source object${sourceId ? ` '${sourceId}'` : ''} (gap of ${gap.toFixed(3)}m).`,
    };
  }

  const touchesTarget =
    overlapsEnvelope(corridorGeo, targetGeo) ||
    distanceBetweenEnvelopes(corridorGeo, targetGeo) <= CAD_EPSILON;

  if (!touchesTarget) {
    const gap = distanceBetweenEnvelopes(corridorGeo, targetGeo);
    return {
      isConnected: false,
      sourceId,
      targetId,
      gapMeters: gap,
      reason: `Access corridor${corridorId ? ` '${corridorId}'` : ''} does not reach or intersect the target object${targetId ? ` '${targetId}'` : ''} (gap of ${gap.toFixed(3)}m).`,
    };
  }

  return {
    isConnected: true,
    sourceId,
    targetId,
    gapMeters: 0,
    reason: `Access corridor${corridorId ? ` '${corridorId}'` : ''} successfully connects source${sourceId ? ` '${sourceId}'` : ''} and target${targetId ? ` '${targetId}'` : ''}.`,
  };
}

/**
 * Validates that an object's directional approach corridor connects properly to the central drive aisle.
 */
export function validateApproachConnection(
  object: LayoutObject | ObjectEnvelope,
  approachEnvelope: ObjectEnvelope,
  aisleEnvelope: ObjectEnvelope
): ConnectivityValidationResult {
  return isAccessConnected(object, aisleEnvelope, approachEnvelope);
}

/**
 * Converts an AccessPoint on a building perimeter wall into an exact 2D boundary geometry.
 */
export function accessPointToGeometry(
  accessPoint: AccessPoint,
  buildingBoundary: { width: number; length: number }
): Geometry {
  const { wall, offsetMeters, widthMeters } = accessPoint;
  const bW = roundMillimeter(buildingBoundary.width);
  const bL = roundMillimeter(buildingBoundary.length);
  const thickness = 0.001; // Thin perimeter threshold in meters

  switch (wall) {
    case 'south':
      // Wall along Y=0 from X=0 to X=bW
      return {
        x: roundMillimeter(offsetMeters),
        y: 0,
        width: roundMillimeter(widthMeters),
        length: thickness,
        rotation: 0,
      };
    case 'north':
      // Wall along Y=bL from X=0 to X=bW
      return {
        x: roundMillimeter(offsetMeters),
        y: roundMillimeter(bL - thickness),
        width: roundMillimeter(widthMeters),
        length: thickness,
        rotation: 0,
      };
    case 'west':
      // Wall along X=0 from Y=0 to Y=bL
      return {
        x: 0,
        y: roundMillimeter(offsetMeters),
        width: thickness,
        length: roundMillimeter(widthMeters),
        rotation: 0,
      };
    case 'east':
      // Wall along X=bW from Y=0 to Y=bL
      return {
        x: roundMillimeter(bW - thickness),
        y: roundMillimeter(offsetMeters),
        width: thickness,
        length: roundMillimeter(widthMeters),
        rotation: 0,
      };
    default:
      throw new Error(`Unsupported wall orientation: '${wall}'`);
  }
}

/**
 * Validates that a building access point (entrance/exit door) is physically reached
 * and connected by a circulation corridor (drive aisle or approach corridor).
 *
 * If accessPoint is missing or undefined, returns structured invalid result without inventing geometry.
 */
export function validateAccessPointConnection(
  accessPoint: AccessPoint | undefined | null,
  buildingBoundary: { width: number; length: number },
  accessCorridor: SpatialEntity | LayoutObject
): ConnectivityValidationResult {
  const corridorId = extractEntityId(accessCorridor);

  // 1. Missing Access Point Check (Zero Invented Geometry)
  if (!accessPoint) {
    return {
      isConnected: false,
      reason: 'Access point is undefined or missing. The engine cannot invent access doors.',
    };
  }

  const doorGeo = accessPointToGeometry(accessPoint, buildingBoundary);
  const corridorGeo = extractGeometry(accessCorridor as SpatialEntity);

  const touches =
    overlapsEnvelope(corridorGeo, doorGeo) ||
    distanceBetweenEnvelopes(corridorGeo, doorGeo) <= CAD_EPSILON;

  if (touches) {
    return {
      isConnected: true,
      sourceId: accessPoint.id,
      targetId: corridorId,
      gapMeters: 0,
      reason: `Access point '${accessPoint.id}' on ${accessPoint.wall} wall is properly connected to the circulation corridor.`,
    };
  }

  const gap = distanceBetweenEnvelopes(corridorGeo, doorGeo);
  return {
    isConnected: false,
    sourceId: accessPoint.id,
    targetId: corridorId,
    gapMeters: gap,
    reason: `Access corridor does not reach access point '${accessPoint.id}' on ${accessPoint.wall} wall (gap of ${gap.toFixed(3)}m).`,
  };
}
