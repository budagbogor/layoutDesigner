import { LayoutObject, Geometry } from '../../models/project';
import { ObjectEnvelope, EnvelopeViolationSemantics } from '../types';
import { StandardAccessor, MissingStandardParameterError } from '../StandardAccessor';
import { createPhysicalEnvelope } from './physicalEnvelope';
import { roundMillimeter } from '../../geometry/precision';
import { rotatePoint } from '../../geometry/primitives';

export const WORKING_ENVELOPE_PURPOSE =
  'Technician movement, tooling clearance, and service operation zone surrounding the object.';

export const WORKING_VIOLATION_SEMANTICS: EnvelopeViolationSemantics = {
  forbiddenOverlapTypes: ['PHYSICAL'],
  severityOnOverlap: 'HARD',
  allowOverlapWithParent: true,
};

/**
 * Resolves the required working buffer parameter key from StandardAccessor.
 * Searches in strict precedence order without hardcoding any engineering defaults.
 * Throws MissingStandardParameterError if no valid buffer parameter is present.
 */
function resolveWorkingBufferParameter(
  object: LayoutObject,
  accessor: StandardAccessor
) {
  // 1. Check explicit metadata override if provided
  const metaKey = object.metadata?.workingBufferParameterKey as string | undefined;
  if (metaKey) {
    return accessor.getRequiredParameter(metaKey);
  }

  // 2. Check candidate keys in standard snapshot
  const candidateKeys = [
    `clearance.working_buffer.${object.type}`,
    `clearance.working_buffer.${object.metadata?.equipmentType ?? object.metadata?.vehicleType}`,
    'clearance.technician_working_buffer',
    'clearance.working_buffer',
  ];

  for (const key of candidateKeys) {
    if (accessor.hasParameter(key)) {
      return accessor.getRequiredParameter(key);
    }
  }

  // 3. Strict zero-fallback rule: throw if not found
  throw new MissingStandardParameterError(
    `clearance.working_buffer.${object.type} or clearance.technician_working_buffer`
  );
}

/**
 * Creates a pure, deterministic WORKING envelope for a given LayoutObject.
 * Expands outward from the physical envelope by the working buffer distance retrieved
 * from the StandardAccessor.
 *
 * Throws MissingStandardParameterError if the required parameter is missing from the snapshot.
 */
export function createWorkingEnvelope(
  object: LayoutObject,
  accessor: StandardAccessor
): ObjectEnvelope {
  // 1. Establish base physical envelope
  const physicalEnvelope = createPhysicalEnvelope(object, accessor);
  const physGeo = physicalEnvelope.geometry;

  // 2. Retrieve required working buffer parameter (zero fallbacks)
  const bufferParam = resolveWorkingBufferParameter(object, accessor);
  const buffer = roundMillimeter(bufferParam.value);

  // 3. Compute expanded dimensions in meters
  const newWidth = roundMillimeter(physGeo.width + 2 * buffer);
  const newLength = roundMillimeter(physGeo.length + 2 * buffer);

  // 4. Compute new bottom-left coordinate rotated concentrically around original bottom-left
  const unrotatedBL = {
    x: roundMillimeter(physGeo.x - buffer),
    y: roundMillimeter(physGeo.y - buffer),
  };

  const newBL = rotatePoint(
    unrotatedBL,
    physGeo.rotation,
    { x: physGeo.x, y: physGeo.y }
  );

  const workGeometry: Geometry = {
    x: newBL.x,
    y: newBL.y,
    width: newWidth,
    length: newLength,
    rotation: physGeo.rotation,
  };

  return {
    id: `envelope-work-${object.id}`,
    type: 'WORKING',
    sourceObjectId: object.id,
    derivedFromStandard: {
      parameterKey: bufferParam.key,
      appliedValue: bufferParam.value,
      unit: bufferParam.unit,
    },
    geometry: workGeometry,
    purpose: WORKING_ENVELOPE_PURPOSE,
    violationSemantics: { ...WORKING_VIOLATION_SEMANTICS },
  };
}

/**
 * Batch generates WORKING envelopes for an array of layout objects.
 * Guarantees 100% deterministic output ordering sorted by sourceObjectId.
 */
export function generateWorkingEnvelopes(
  objects: LayoutObject[],
  accessor: StandardAccessor
): ObjectEnvelope[] {
  return [...objects]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((obj) => createWorkingEnvelope(obj, accessor));
}
