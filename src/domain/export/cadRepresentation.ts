// ---------------------------------------------------------------------------
// FASE 4.4 — CAD Output Validation & Integration Pipeline
//
// Converts LayoutEngineResult / GeneratedCandidateLayout into:
// 1. Standard WorkshopProject document matching schemas/layout.schema.json
// 2. Pure standalone deterministic SVG representation
//
// Guaranteed:
// - Exact geometry preservation from engine coordinate system (Zero shift/fudge)
// - Visualizes building boundary, service bays, circulation aisles,
//   equipment, customer lounge, cashier, restroom, parts warehouse,
//   staff room, parking, expansion reserve, and access doors.
// - DISQUALIFIED candidates are never treated as final layouts.
// ---------------------------------------------------------------------------

import {
  WorkshopProject,
  LayoutObject,
  CadObjectType,
  CadLayerId,
} from '../models/project';
import { LayoutEngineInput } from '../engine/types';
import {
  LayoutEngineResult,
  OrchestratedCandidate,
} from '../engine/orchestrator/orchestratorTypes';
import { GeneratedCandidateLayout } from '../engine/generator/candidateGenerator';
import { exportLayoutToSvg, SvgExportOptions } from './svgExporter';
import { roundMillimeter } from '../geometry/precision';

export interface CadProjectConversionOptions {
  readonly projectId?: string;
  readonly projectName?: string;
  readonly includeEnvelopesAsObjects?: boolean;
}

/**
 * Converts a GeneratedCandidateLayout or OrchestratedCandidate into a WorkshopProject CAD document.
 * Faithfully maps all placed objects, circulation aisles, and access doors without altering geometry.
 */
export function candidateToCadProject(
  candidate: GeneratedCandidateLayout | OrchestratedCandidate,
  input: LayoutEngineInput,
  options: CadProjectConversionOptions = {}
): WorkshopProject {
  const isOrchestrated = 'layout' in candidate && 'strategy' in candidate && typeof (candidate as any).layout === 'object';
  const genLayout: GeneratedCandidateLayout = isOrchestrated
    ? (candidate as OrchestratedCandidate).layout
    : (candidate as GeneratedCandidateLayout);

  const validity = isOrchestrated
    ? (candidate as OrchestratedCandidate).validity
    : (candidate as GeneratedCandidateLayout).status;

  const score = isOrchestrated
    ? (candidate as OrchestratedCandidate).score
    : null;

  const projectId = options.projectId ?? genLayout.candidateId;
  const projectName = options.projectName ?? `Workshop Layout (${genLayout.strategy} - ${genLayout.arrangement})`;

  // 1. Base placed objects from candidate
  const objects: LayoutObject[] = [...genLayout.objects.map((obj) => ({
    id: obj.id,
    type: obj.type,
    layer: obj.layer,
    geometry: {
      x: roundMillimeter(obj.geometry.x),
      y: roundMillimeter(obj.geometry.y),
      width: roundMillimeter(obj.geometry.width),
      length: roundMillimeter(obj.geometry.length),
      rotation: roundMillimeter(obj.geometry.rotation),
    },
    metadata: obj.metadata ? { ...obj.metadata } : undefined,
  }))];

  // 2. Circulation aisles & corridors from candidate envelopes
  const aisleEnvelopes = genLayout.envelopes.filter(
    (env) => env.sourceObjectId?.startsWith('aisle-') || env.id.includes('aisle')
  );

  for (const env of aisleEnvelopes) {
    const objId = env.sourceObjectId ?? env.id.replace(/^envelope-aisle-/, '');
    if (objects.some((o) => o.id === objId)) continue;

    objects.push({
      id: objId,
      type: 'circulation_path' as CadObjectType,
      layer: '11-CIRCULATION' as CadLayerId,
      geometry: {
        x: roundMillimeter(env.geometry.x),
        y: roundMillimeter(env.geometry.y),
        width: roundMillimeter(env.geometry.width),
        length: roundMillimeter(env.geometry.length),
        rotation: roundMillimeter(env.geometry.rotation),
      },
      metadata: {
        name: objId === 'aisle-main' ? 'Main Drive Aisle' : `Circulation (${objId})`,
        envelopeType: env.type,
      },
    });
  }

  // 3. Access Doors from input definition
  if (input.accessPoints && input.accessPoints.length > 0) {
    const wallThickness = genLayout.metadata?.buildingInterior?.wallThickness ?? 0.25;

    for (const ap of input.accessPoints) {
      if (objects.some((o) => o.id === ap.id || o.id === `door-${ap.id}`)) continue;

      const doorWidth = ap.widthMeters ?? 4.0;
      let doorX = 0;
      let doorY = 0;
      let doorObjW = doorWidth;
      let doorObjL = wallThickness;

      if (ap.wall === 'south') {
        doorX = roundMillimeter(ap.offsetMeters - doorWidth / 2);
        doorY = 0;
        doorObjW = doorWidth;
        doorObjL = wallThickness;
      } else if (ap.wall === 'north') {
        doorX = roundMillimeter(ap.offsetMeters - doorWidth / 2);
        doorY = roundMillimeter(input.building.length - wallThickness);
        doorObjW = doorWidth;
        doorObjL = wallThickness;
      } else if (ap.wall === 'east') {
        doorX = roundMillimeter(input.building.width - wallThickness);
        doorY = roundMillimeter(ap.offsetMeters - doorWidth / 2);
        doorObjW = wallThickness;
        doorObjL = doorWidth;
      } else if (ap.wall === 'west') {
        doorX = 0;
        doorY = roundMillimeter(ap.offsetMeters - doorWidth / 2);
        doorObjW = wallThickness;
        doorObjL = doorWidth;
      }

      objects.push({
        id: `door-${ap.id}`,
        type: 'door' as CadObjectType,
        layer: '03-DOOR' as CadLayerId,
        geometry: {
          x: doorX,
          y: doorY,
          width: doorObjW,
          length: doorObjL,
          rotation: 0,
        },
        metadata: {
          name: `Access Door (${ap.id})`,
          accessType: ap.type,
          wall: ap.wall,
          offsetMeters: ap.offsetMeters,
        },
      });
    }
  }

  // Deterministically sort objects by layer then ID
  objects.sort((a, b) =>
    a.layer === b.layer ? a.id.localeCompare(b.id) : a.layer.localeCompare(b.layer)
  );

  return {
    project: {
      id: projectId,
      name: projectName,
      unit: 'meter',
      standard_version_id: genLayout.provenance.standardVersionId,
    },
    site: {
      width: roundMillimeter(input.site.width),
      length: roundMillimeter(input.site.length),
      road_side: input.site.roadSide,
      road_width: input.site.roadWidth,
    },
    building: {
      width: roundMillimeter(input.building.width),
      length: roundMillimeter(input.building.length),
    },
    services: input.program.bays.map((b) => ({
      type: b.serviceType,
      quantity: b.quantity,
    })),
    equipment: input.program.equipment?.map((e) => ({
      type: e.equipmentType,
      quantity: e.quantity,
    })),
    layout: {
      status: validity === 'VALID' ? 'generated' : 'draft',
      score,
      objects,
    },
  };
}

/**
 * Converts the winning candidate of a LayoutEngineResult into a final WorkshopProject.
 * If the layout run was DISQUALIFIED or no valid candidate exists, returns null.
 * Strictly guarantees that DISQUALIFIED candidates are never treated as final layouts.
 */
export function layoutEngineResultToCadProject(
  result: LayoutEngineResult,
  input: LayoutEngineInput,
  options: CadProjectConversionOptions = {}
): WorkshopProject | null {
  if (result.status === 'DISQUALIFIED' || !result.bestCandidate || !result.bestCandidate.isValid) {
    return null;
  }

  return candidateToCadProject(result.bestCandidate, input, options);
}

/**
 * Exports a candidate directly to deterministic vector SVG.
 */
export function exportCandidateToSvg(
  candidate: GeneratedCandidateLayout | OrchestratedCandidate,
  input: LayoutEngineInput,
  exportOptions?: Partial<SvgExportOptions>
): string {
  const project = candidateToCadProject(candidate, input);
  return exportLayoutToSvg({
    project,
    ...exportOptions,
  });
}

/**
 * Exports the final winning layout of a LayoutEngineResult to SVG.
 * Returns null if the result is DISQUALIFIED.
 */
export function exportLayoutEngineResultToSvg(
  result: LayoutEngineResult,
  input: LayoutEngineInput,
  exportOptions?: Partial<SvgExportOptions>
): string | null {
  const project = layoutEngineResultToCadProject(result, input);
  if (!project) {
    return null;
  }
  return exportLayoutToSvg({
    project,
    ...exportOptions,
  });
}
