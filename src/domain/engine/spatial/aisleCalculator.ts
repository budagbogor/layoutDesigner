import { Geometry } from '../../models/project';
import { Point2D } from '../../geometry/types';
import { ObjectEnvelope, EnvelopeViolationSemantics } from '../types';
import { StandardAccessor, MissingStandardParameterError } from '../StandardAccessor';
import { roundMillimeter, CAD_EPSILON } from '../../geometry/precision';
import { rotatePoint, normalizeAngle } from '../../geometry/primitives';

export type ApproachDirection = 'front' | 'rear' | 'left' | 'right' | number;

export interface AisleSpecification {
  id: string;
  origin: Point2D;
  length: number;                 // Length along the aisle corridor axis in meters
  rotation?: number;              // Orientation degrees in CAD space (default: 0)
  widthParameterKey?: string;     // Optional custom standard parameter key
  customWidth?: number;           // Optional explicit width in meters (must be >= min_width standard)
}

export interface ApproachSpecification {
  id: string;
  targetGeometry: Geometry;
  direction: ApproachDirection;
  depthParameterKey?: string;     // Optional custom standard parameter key
}

export const AISLE_VIOLATION_SEMANTICS: EnvelopeViolationSemantics = {
  forbiddenOverlapTypes: ['PHYSICAL', 'SAFETY'],
  severityOnOverlap: 'HARD',
  allowOverlapWithParent: true,
};

export const APPROACH_VIOLATION_SEMANTICS: EnvelopeViolationSemantics = {
  forbiddenOverlapTypes: ['PHYSICAL', 'SAFETY'],
  severityOnOverlap: 'HARD',
  allowOverlapWithParent: false,
};

/**
 * Validates whether an actual aisle width meets or exceeds the minimum required aisle width.
 * Strictly queries the required width from StandardAccessor.
 * Throws MissingStandardParameterError if parameter is missing (zero fallbacks).
 */
export function isAisleWidthValid(
  actualAisleWidth: number,
  accessor: StandardAccessor,
  customParameterKey?: string
): boolean {
  const paramKey = customParameterKey ?? 'circulation.drive_aisle.min_width';
  const minWidth = accessor.getRequiredNumericValue(paramKey);
  return roundMillimeter(actualAisleWidth) >= roundMillimeter(minWidth) - CAD_EPSILON;
}

/**
 * Calculates a deterministic aisle corridor envelope.
 * Width is strictly resolved from StandardAccessor.
 *
 * In CAD Cartesian space:
 * - width: the lane width (along local X)
 * - length: corridor span (along local Y)
 * - rotation: orientation in degrees (0 = vertical along +Y, 90 = rotated 90 deg, 45 = rotated 45 deg)
 */
export function calculateAisleEnvelope(
  spec: AisleSpecification,
  accessor: StandardAccessor
): ObjectEnvelope {
  const paramKey = spec.widthParameterKey ?? 'circulation.drive_aisle.min_width';
  const widthParam = accessor.getRequiredParameter(paramKey);
  const aisleWidth = spec.customWidth
    ? roundMillimeter(spec.customWidth)
    : roundMillimeter(widthParam.value);
  const corridorLength = roundMillimeter(spec.length);
  const rotation = normalizeAngle(roundMillimeter(spec.rotation ?? 0));

  const geometry: Geometry = {
    x: roundMillimeter(spec.origin.x),
    y: roundMillimeter(spec.origin.y),
    width: aisleWidth,
    length: corridorLength,
    rotation,
  };

  return {
    id: `envelope-aisle-${spec.id}`,
    type: 'ACCESS',
    sourceObjectId: spec.id,
    derivedFromStandard: {
      parameterKey: widthParam.key,
      appliedValue: widthParam.value,
      unit: widthParam.unit,
    },
    geometry,
    purpose: 'Central vehicle circulation and drive aisle corridor.',
    violationSemantics: { ...AISLE_VIOLATION_SEMANTICS },
  };
}

/**
 * Calculates a directional approach corridor envelope using an explicit approach direction.
 * Approach depth is strictly resolved from StandardAccessor.
 * Supports arbitrary rotations and explicit directional projections:
 * - 'front': entry along Y=0 threshold, projecting outward along -Y
 * - 'rear': exit along Y=length threshold, projecting outward along +Y
 * - 'left': access along X=0 threshold, projecting outward along -X
 * - 'right': access along X=width threshold, projecting outward along +X
 * - number: custom angle offset in degrees relative to object local orientation
 */
export function calculateApproachEnvelope(
  spec: ApproachSpecification,
  accessor: StandardAccessor
): ObjectEnvelope {
  const paramKey =
    spec.depthParameterKey ??
    (accessor.hasParameter('circulation.bay_approach_depth')
      ? 'circulation.bay_approach_depth'
      : 'access.approach_depth');

  const depthParam = accessor.getRequiredParameter(paramKey);
  const depth = roundMillimeter(depthParam.value);

  const { targetGeometry, direction } = spec;
  const objW = roundMillimeter(targetGeometry.width);
  const objL = roundMillimeter(targetGeometry.length);
  const objRot = normalizeAngle(roundMillimeter(targetGeometry.rotation));

  let localBL: Point2D;
  let approachWidth: number;
  let approachLength: number;

  if (direction === 'front') {
    // Protrudes outward from front threshold (Y = 0) down by depth
    localBL = { x: 0, y: -depth };
    approachWidth = objW;
    approachLength = depth;
  } else if (direction === 'rear') {
    // Protrudes outward from rear threshold (Y = objL) up by depth
    localBL = { x: 0, y: objL };
    approachWidth = objW;
    approachLength = depth;
  } else if (direction === 'left') {
    // Protrudes outward from left threshold (X = 0) left by depth
    localBL = { x: -depth, y: 0 };
    approachWidth = depth;
    approachLength = objL;
  } else if (direction === 'right') {
    // Protrudes outward from right threshold (X = objW) right by depth
    localBL = { x: objW, y: 0 };
    approachWidth = depth;
    approachLength = objL;
  } else if (typeof direction === 'number') {
    // Custom angle offset in degrees relative to object local orientation
    const rad = (direction * Math.PI) / 180;
    localBL = {
      x: -depth * Math.sin(rad),
      y: -depth * Math.cos(rad),
    };
    approachWidth = objW;
    approachLength = depth;
  } else {
    throw new Error(`Unsupported approach direction: '${direction}'`);
  }

  // Rotate local start point by the object's orientation around targetGeometry (x, y)
  const worldBL = rotatePoint(
    {
      x: targetGeometry.x + localBL.x,
      y: targetGeometry.y + localBL.y,
    },
    objRot,
    { x: targetGeometry.x, y: targetGeometry.y }
  );

  const geometry: Geometry = {
    x: roundMillimeter(worldBL.x),
    y: roundMillimeter(worldBL.y),
    width: roundMillimeter(approachWidth),
    length: roundMillimeter(approachLength),
    rotation: objRot,
  };

  return {
    id: `envelope-approach-${spec.id}`,
    type: 'ACCESS',
    sourceObjectId: spec.id,
    derivedFromStandard: {
      parameterKey: depthParam.key,
      appliedValue: depthParam.value,
      unit: depthParam.unit,
    },
    geometry,
    purpose: `Directional approach clearance from '${direction}' direction.`,
    violationSemantics: { ...APPROACH_VIOLATION_SEMANTICS },
  };
}
