import { LayoutObject, Geometry } from '../../models/project';
import { ObjectEnvelope, EnvelopeViolationSemantics } from '../types';
import { StandardAccessor, MissingStandardParameterError } from '../StandardAccessor';
import { roundMillimeter } from '../../geometry/precision';
import { rotatePoint, normalizeAngle } from '../../geometry/primitives';

export const ACCESS_ENVELOPE_PURPOSE =
  'Directional vehicle approach, drive-on corridor, and entry clearance.';

export const ACCESS_VIOLATION_SEMANTICS: EnvelopeViolationSemantics = {
  forbiddenOverlapTypes: ['PHYSICAL'],
  severityOnOverlap: 'HARD',
  allowOverlapWithParent: false, // Access corridor is external and connects to entry threshold
};

/**
 * Resolves the required approach depth parameter from StandardAccessor.
 * Searches in strict precedence order without hardcoding any engineering defaults.
 * Throws MissingStandardParameterError if no valid parameter is present.
 */
function resolveAccessDepthParameter(
  object: LayoutObject,
  accessor: StandardAccessor
) {
  // 1. Check explicit metadata override
  const metaKey = object.metadata?.accessDepthParameterKey as string | undefined;
  if (metaKey) {
    return accessor.getRequiredParameter(metaKey);
  }

  // 2. Check candidate keys in standard snapshot
  const candidateKeys = [
    `access.approach_depth.${object.type}`,
    `access.approach_depth.${object.metadata?.vehicleType ?? object.metadata?.serviceType}`,
    'access.approach_depth',
    'circulation.bay_approach_depth',
    'circulation.approach_depth',
  ];

  for (const key of candidateKeys) {
    if (accessor.hasParameter(key)) {
      return accessor.getRequiredParameter(key);
    }
  }

  // 3. Strict zero-fallback rule: throw if not found
  throw new MissingStandardParameterError(
    `access.approach_depth.${object.type} or circulation.bay_approach_depth`
  );
}

/**
 * Creates a pure, directional ACCESS envelope for a given LayoutObject.
 * Currently supports 'service_bay' and 'vehicle'.
 *
 * Unlike concentric working buffers, the ACCESS envelope projects outward from
 * the entry threshold of the object into the approach aisle.
 *
 * Throws MissingStandardParameterError if the required parameter is missing from the snapshot.
 */
export function createAccessEnvelope(
  object: LayoutObject,
  accessor: StandardAccessor
): ObjectEnvelope {
  if (object.type !== 'service_bay' && object.type !== 'vehicle') {
    throw new Error(
      `ACCESS envelope generator currently supports 'service_bay' and 'vehicle' (received: '${object.type}').`
    );
  }

  // 1. Retrieve required approach depth from standard (zero fallbacks)
  const depthParam = resolveAccessDepthParameter(object, accessor);
  const approachDepth = roundMillimeter(depthParam.value);

  const objGeo = object.geometry;
  const width = roundMillimeter(objGeo.width);
  const rotation = normalizeAngle(roundMillimeter(objGeo.rotation));

  // 2. Compute the directional access corridor:
  // In local space, the entrance threshold is along the Y=0 edge.
  // The approach corridor projects outward in the -Y direction by approachDepth.
  // Local BL is at (0, -approachDepth).
  const unrotatedBL = {
    x: roundMillimeter(objGeo.x),
    y: roundMillimeter(objGeo.y - approachDepth),
  };

  // 3. Rotate the corridor concentrically around the object's origin (x, y)
  const newBL = rotatePoint(
    unrotatedBL,
    rotation,
    { x: objGeo.x, y: objGeo.y }
  );

  const accessGeometry: Geometry = {
    x: newBL.x,
    y: newBL.y,
    width: width,
    length: approachDepth,
    rotation: rotation,
  };

  return {
    id: `envelope-access-${object.id}`,
    type: 'ACCESS',
    sourceObjectId: object.id,
    derivedFromStandard: {
      parameterKey: depthParam.key,
      appliedValue: depthParam.value,
      unit: depthParam.unit,
    },
    geometry: accessGeometry,
    purpose: ACCESS_ENVELOPE_PURPOSE,
    violationSemantics: { ...ACCESS_VIOLATION_SEMANTICS },
  };
}

/**
 * Batch generates ACCESS envelopes for all applicable objects ('service_bay', 'vehicle').
 * Guarantees 100% deterministic output ordering sorted by sourceObjectId.
 */
export function generateAccessEnvelopes(
  objects: LayoutObject[],
  accessor: StandardAccessor
): ObjectEnvelope[] {
  return [...objects]
    .filter((obj) => obj.type === 'service_bay' || obj.type === 'vehicle')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((obj) => createAccessEnvelope(obj, accessor));
}
