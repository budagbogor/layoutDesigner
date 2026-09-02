import { LayoutObject, Geometry } from '../../models/project';
import { ObjectEnvelope, EnvelopeViolationSemantics } from '../types';
import { StandardAccessor, MissingStandardParameterError } from '../StandardAccessor';
import { createPhysicalEnvelope } from './physicalEnvelope';
import { roundMillimeter } from '../../geometry/precision';
import { rotatePoint } from '../../geometry/primitives';

export const SAFETY_ENVELOPE_PURPOSE =
  'Mandatory safety perimeter to protect technicians and visitors from hazardous machinery or moving equipment.';

/**
 * Returns the candidate standard parameter keys for an object's safety buffer.
 */
function getSafetyParameterCandidateKeys(object: LayoutObject): string[] {
  const metaKey = object.metadata?.safetyBufferParameterKey as string | undefined;
  if (metaKey) {
    return [metaKey];
  }

  const subType = object.metadata?.equipmentType ?? object.metadata?.vehicleType ?? object.metadata?.serviceType;

  const candidates: string[] = [];
  if (subType) {
    candidates.push(`safety.buffer.${object.type}.${subType}`);
    candidates.push(`safety.buffer.${subType}`);
    candidates.push(`safety.clearance.${subType}`);
  }
  candidates.push(`safety.buffer.${object.type}`);
  candidates.push(`safety.clearance.${object.type}`);
  candidates.push('safety.equipment_buffer');
  candidates.push('safety.clearance');

  return candidates;
}

/**
 * Checks if an object has an applicable safety clearance parameter in the standard snapshot.
 */
export function hasSafetyRequirement(
  object: LayoutObject,
  accessor: StandardAccessor
): boolean {
  const candidateKeys = getSafetyParameterCandidateKeys(object);
  return candidateKeys.some((k) => accessor.hasParameter(k));
}

/**
 * Resolves the safety buffer parameter for an object from StandardAccessor.
 * Throws MissingStandardParameterError if absent from the snapshot (zero fallbacks).
 */
function resolveSafetyParameter(
  object: LayoutObject,
  accessor: StandardAccessor
) {
  const candidateKeys = getSafetyParameterCandidateKeys(object);
  for (const key of candidateKeys) {
    if (accessor.hasParameter(key)) {
      return accessor.getRequiredParameter(key);
    }
  }

  throw new MissingStandardParameterError(
    `safety.buffer.${object.type} or safety.clearance`
  );
}

/**
 * Resolves the violation semantics data-driven from the Standard's rules.
 * Uses the severity defined in the standard rule ('SAFETY-001' or similar) rather than hardcoded assumptions.
 */
function resolveSafetyViolationSemantics(
  accessor: StandardAccessor
): EnvelopeViolationSemantics {
  const safetyRule = accessor.getRule('SAFETY-001') ?? accessor.getRule('CLEARANCE-001');
  const severityOnOverlap = safetyRule ? safetyRule.severity : 'HARD';

  return {
    forbiddenOverlapTypes: ['PHYSICAL', 'ACCESS'],
    severityOnOverlap,
    allowOverlapWithParent: true,
  };
}

/**
 * Creates a pure, deterministic SAFETY envelope for a given LayoutObject.
 * Based on the PHYSICAL envelope and expanded outward by the standard safety buffer parameter.
 * Preserves the object's orientation and rotation.
 *
 * Throws MissingStandardParameterError if the required parameter is missing from the snapshot.
 */
export function createSafetyEnvelope(
  object: LayoutObject,
  accessor: StandardAccessor
): ObjectEnvelope {
  // 1. Establish base physical envelope
  const physicalEnvelope = createPhysicalEnvelope(object, accessor);
  const physGeo = physicalEnvelope.geometry;

  // 2. Retrieve required safety buffer parameter from standard (zero fallbacks)
  const safetyParam = resolveSafetyParameter(object, accessor);
  const safetyBuffer = roundMillimeter(safetyParam.value);

  // 3. Compute expanded dimensions in meters
  const newWidth = roundMillimeter(physGeo.width + 2 * safetyBuffer);
  const newLength = roundMillimeter(physGeo.length + 2 * safetyBuffer);

  // 4. Compute rotated concentric bottom-left coordinate
  const unrotatedBL = {
    x: roundMillimeter(physGeo.x - safetyBuffer),
    y: roundMillimeter(physGeo.y - safetyBuffer),
  };

  const newBL = rotatePoint(
    unrotatedBL,
    physGeo.rotation,
    { x: physGeo.x, y: physGeo.y }
  );

  const safetyGeometry: Geometry = {
    x: newBL.x,
    y: newBL.y,
    width: newWidth,
    length: newLength,
    rotation: physGeo.rotation,
  };

  // 5. Data-driven violation semantics from standard rules
  const violationSemantics = resolveSafetyViolationSemantics(accessor);

  return {
    id: `envelope-safe-${object.id}`,
    type: 'SAFETY',
    sourceObjectId: object.id,
    derivedFromStandard: {
      parameterKey: safetyParam.key,
      appliedValue: safetyParam.value,
      unit: safetyParam.unit,
    },
    geometry: safetyGeometry,
    purpose: SAFETY_ENVELOPE_PURPOSE,
    violationSemantics,
  };
}

/**
 * Batch generates SAFETY envelopes for all objects that have a safety requirement in the standard.
 * Filters out objects without standard safety requirements.
 * Guarantees 100% deterministic output ordering sorted by sourceObjectId.
 */
export function generateSafetyEnvelopes(
  objects: LayoutObject[],
  accessor: StandardAccessor
): ObjectEnvelope[] {
  return [...objects]
    .filter((obj) => hasSafetyRequirement(obj, accessor))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((obj) => createSafetyEnvelope(obj, accessor));
}
