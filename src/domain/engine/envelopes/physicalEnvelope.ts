import { LayoutObject, Geometry } from '../../models/project';
import { ObjectEnvelope, EnvelopeType, EnvelopeViolationSemantics, EnvelopeProvenance } from '../types';
import { StandardAccessor } from '../StandardAccessor';
import { roundMillimeter } from '../../geometry/precision';
import { normalizeAngle } from '../../geometry/primitives';

export const PHYSICAL_ENVELOPE_PURPOSE = 'Solid impenetrable physical boundary of the object.';

export const PHYSICAL_VIOLATION_SEMANTICS: EnvelopeViolationSemantics = {
  forbiddenOverlapTypes: ['PHYSICAL'],
  severityOnOverlap: 'HARD',
  allowOverlapWithParent: true, // e.g. vehicle legitimately occupying a service bay or lift
};

/**
 * Resolves standard parameter provenance for an object's physical footprint.
 * Strictly queries the StandardAccessor without inventing or hardcoding values.
 */
function resolvePhysicalProvenance(
  object: LayoutObject,
  accessor: StandardAccessor
): EnvelopeProvenance {
  // Check if a specific parameter key was defined in object metadata
  const metaKey = object.metadata?.standardParameterKey as string | undefined;
  if (metaKey && accessor.hasParameter(metaKey)) {
    const param = accessor.getRequiredParameter(metaKey);
    return {
      parameterKey: param.key,
      appliedValue: param.value,
      unit: param.unit,
    };
  }

  // Check type-based parameter keys in standard
  const candidates = [
    `${object.type}.${object.metadata?.equipmentType ?? object.metadata?.vehicleType ?? 'dimension'}.length`,
    `${object.type}.${object.metadata?.equipmentType ?? object.metadata?.vehicleType ?? 'dimension'}`,
    `bay.${object.type}.min_length`,
    `bay.min_length`,
    `building.wall_thickness`,
  ];

  for (const key of candidates) {
    if (accessor.hasParameter(key)) {
      const param = accessor.getRequiredParameter(key);
      return {
        parameterKey: param.key,
        appliedValue: param.value,
        unit: param.unit,
      };
    }
  }

  // If no standard parameter exists for this object, record physical footprint provenance
  return {
    parameterKey: `geometry.${object.type}.physical`,
    appliedValue: roundMillimeter(object.geometry.length),
    unit: 'meter',
  };
}

/**
 * Creates a pure, deterministic PHYSICAL envelope for a given LayoutObject.
 * Preserves millimeter precision and uses StandardAccessor for parameter provenance.
 */
export function createPhysicalEnvelope(
  object: LayoutObject,
  accessor: StandardAccessor
): ObjectEnvelope {
  const provenance = resolvePhysicalProvenance(object, accessor);

  const physicalGeometry: Geometry = {
    x: roundMillimeter(object.geometry.x),
    y: roundMillimeter(object.geometry.y),
    width: roundMillimeter(object.geometry.width),
    length: roundMillimeter(object.geometry.length),
    rotation: normalizeAngle(roundMillimeter(object.geometry.rotation)),
  };

  return {
    id: `envelope-phys-${object.id}`,
    type: 'PHYSICAL',
    sourceObjectId: object.id,
    derivedFromStandard: provenance,
    geometry: physicalGeometry,
    purpose: PHYSICAL_ENVELOPE_PURPOSE,
    violationSemantics: { ...PHYSICAL_VIOLATION_SEMANTICS },
  };
}

/**
 * Batch generates PHYSICAL envelopes for an array of layout objects.
 * Guarantees 100% deterministic output ordering sorted by sourceObjectId.
 */
export function generatePhysicalEnvelopes(
  objects: LayoutObject[],
  accessor: StandardAccessor
): ObjectEnvelope[] {
  return [...objects]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((obj) => createPhysicalEnvelope(obj, accessor));
}
