/**
 * Mobeng Workshop Studio — Layout Summary Engine (Phase 3.3)
 *
 * Pure domain module (no React, no UI) that derives:
 * 1. Physical bay counts from the actual candidate layout objects
 * 2. Service/function list from the WorkshopLayoutRequirement
 * 3. Space program summary grouped by functional zone
 * 4. Requirement traceability: requirement vs generated vs status
 *
 * Source of truth:
 *   WorkshopLayoutRequirement → candidateLayout.objects → derived summary
 *
 * Rules:
 * - Physical bay count comes ONLY from layout objects with type='service_bay'
 *   and metadata.bayType in ['SERVICE_BAY', 'SPOORING_BAY', 'GENERAL_REPAIR_BAY']
 * - Service functions (Quick Lube, Detailing, etc.) are NOT counted as physical bays
 * - No geometry, no coordinates, no engineering standards are used or checked
 */

import { LayoutObject } from '@/domain/models/project';
import {
  WorkshopLayoutRequirement,
  ServiceType,
  MobengBayType,
  derivePhysicalBayRequirements,
  ServiceProgramItem,
} from '@/domain/requirements/requirementTypes';
import {
  FunctionalZone,
  deriveFunctionalZone,
  getHumanObjectLabel,
  FUNCTIONAL_ZONE_LABELS,
} from '@/domain/models/functionalZone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TraceabilityStatus =
  | 'FULFILLED'           // ✓ Requirement fully met
  | 'FULFILLED_AS_FUNCTION' // ✓ Fulfilled as hosted function (not physical bay)
  | 'NOT_GENERATED'       // ⚠ Layout not yet generated
  | 'NOT_FULFILLED';      // ✕ Required but not present in generated layout

export interface PhysicalBaySummary {
  readonly serviceBayCount: number;
  readonly spooringBayCount: number;
  readonly generalRepairBayCount: number;
  readonly totalPhysicalBays: number;
}

export interface ServiceFunctionItem {
  readonly serviceType: ServiceType;
  readonly displayLabel: string;
  readonly bayCount: number;        // requested bayCount from requirement
  readonly isPhysicalBay: boolean;  // true = creates physical bay, false = function only
  readonly hostBayType: MobengBayType | null;
}

export interface SpaceGroupSummary {
  readonly zone: FunctionalZone;
  readonly zoneLabel: string;
  readonly spaces: readonly SpaceItem[];
}

export interface SpaceItem {
  readonly id: string;
  readonly humanLabel: string;
  readonly objectType: string;
}

export interface TraceabilityItem {
  readonly label: string;
  readonly requirementCount: number;
  readonly generatedCount: number | null;  // null = layout not generated
  readonly status: TraceabilityStatus;
  readonly notes?: string;
}

export interface LayoutSummaryResult {
  /** True if a generated layout is available and valid */
  readonly hasGeneratedLayout: boolean;
  /** Physical bay counts from actual layout objects */
  readonly physicalBays: PhysicalBaySummary;
  /** Services/functions from the requirement */
  readonly serviceFunctions: readonly ServiceFunctionItem[];
  /** Spaces grouped by functional zone from actual layout objects */
  readonly spaceProgram: readonly SpaceGroupSummary[];
  /** Requirement vs generated traceability */
  readonly traceability: readonly TraceabilityItem[];
}

// ---------------------------------------------------------------------------
// Label Helpers
// ---------------------------------------------------------------------------

const SERVICE_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  general_service: 'General Service',
  quick_lube: 'Quick Lube',
  service_rasa_mesin_baru: 'Service Rasa Mesin Baru',
  wheel_alignment: 'Spooring / Wheel Alignment',
  general_repair: 'General Repair',
  brake_suspension: 'Kaki-kaki & Rem',
  tire_service: 'Tire Service',
  detailing: 'Detailing',
  engine_overhaul: 'Engine Overhaul',
  ac_service: 'AC Service',
  body_repair: 'Body Repair',
  paint: 'Cat & Paint',
  inspection: 'Inspection',
  electrical: 'Electrical',
});

function getServiceLabel(serviceType: string): string {
  return SERVICE_TYPE_LABELS[serviceType] ?? serviceType.replace(/_/g, ' ');
}

/** Canonical function-only services that do NOT generate a physical bay */
const FUNCTION_ONLY_SERVICES = new Set<string>([
  'quick_lube',
  'service_rasa_mesin_baru',
  'detailing',
  'tire_service',
  'engine_overhaul',
  'ac_service',
  'body_repair',
  'paint',
  'inspection',
  'electrical',
]);

const BAY_TYPE_FOR_FUNCTION: Partial<Record<string, MobengBayType>> = {
  quick_lube: 'SERVICE_BAY',
  service_rasa_mesin_baru: 'SERVICE_BAY',
  wheel_alignment: 'SPOORING_BAY',
  general_repair: 'GENERAL_REPAIR_BAY',
  brake_suspension: 'GENERAL_REPAIR_BAY',
};

// ---------------------------------------------------------------------------
// Core: Count physical bays from actual layout objects
// ---------------------------------------------------------------------------

export function countPhysicalBaysFromObjects(objects: readonly LayoutObject[]): PhysicalBaySummary {
  let serviceBayCount = 0;
  let spooringBayCount = 0;
  let generalRepairBayCount = 0;

  for (const obj of objects) {
    if (obj.type !== 'service_bay') continue;
    const bayType = typeof obj.metadata?.bayType === 'string'
      ? obj.metadata.bayType.toUpperCase()
      : 'SERVICE_BAY';

    if (bayType === 'SPOORING_BAY') {
      spooringBayCount++;
    } else if (bayType === 'GENERAL_REPAIR_BAY') {
      generalRepairBayCount++;
    } else {
      // SERVICE_BAY (default)
      serviceBayCount++;
    }
  }

  return Object.freeze({
    serviceBayCount,
    spooringBayCount,
    generalRepairBayCount,
    totalPhysicalBays: serviceBayCount + spooringBayCount + generalRepairBayCount,
  });
}

// ---------------------------------------------------------------------------
// Core: Service functions from requirement
// ---------------------------------------------------------------------------

export function deriveServiceFunctionList(
  services: readonly ServiceProgramItem[]
): readonly ServiceFunctionItem[] {
  const items: ServiceFunctionItem[] = [];

  for (const svc of services) {
    const isPhysical = !FUNCTION_ONLY_SERVICES.has(svc.serviceType);
    const hostBay = BAY_TYPE_FOR_FUNCTION[svc.serviceType] ?? null;

    items.push(Object.freeze({
      serviceType: svc.serviceType,
      displayLabel: getServiceLabel(svc.serviceType),
      bayCount: svc.bayCount,
      isPhysicalBay: isPhysical,
      hostBayType: isPhysical ? null : hostBay,
    }));
  }

  return Object.freeze(items);
}

// ---------------------------------------------------------------------------
// Core: Space program grouped by functional zone
// ---------------------------------------------------------------------------

const ZONE_ORDER: readonly FunctionalZone[] = Object.freeze([
  'CUSTOMER',
  'WORKSHOP',
  'BACK_OF_HOUSE',
  'STORAGE_LOGISTICS',
]);

export function deriveSpaceProgram(objects: readonly LayoutObject[]): readonly SpaceGroupSummary[] {
  // Filter to semantic spaces (exclude walls, doors, columns, dimension lines)
  const semanticObjects = objects.filter((obj) =>
    obj.type !== 'wall' &&
    obj.type !== 'column' &&
    obj.type !== 'door' &&
    obj.type !== 'window' &&
    obj.type !== 'dimension' &&
    obj.type !== 'text' &&
    obj.type !== 'vehicle' &&
    obj.type !== 'equipment'
  );

  const byZone = new Map<FunctionalZone, SpaceItem[]>();
  for (const zone of ZONE_ORDER) {
    byZone.set(zone, []);
  }

  for (const obj of semanticObjects) {
    const zone = deriveFunctionalZone(obj);
    const label = getHumanObjectLabel(obj);
    const zoneList = byZone.get(zone) ?? [];
    zoneList.push(Object.freeze({ id: obj.id, humanLabel: label, objectType: obj.type }));
    byZone.set(zone, zoneList);
  }

  const result: SpaceGroupSummary[] = [];
  for (const zone of ZONE_ORDER) {
    const spaces = byZone.get(zone) ?? [];
    if (spaces.length > 0) {
      result.push(Object.freeze({
        zone,
        zoneLabel: FUNCTIONAL_ZONE_LABELS[zone],
        spaces: Object.freeze(spaces),
      }));
    }
  }

  return Object.freeze(result);
}

// ---------------------------------------------------------------------------
// Core: Requirement Traceability
// ---------------------------------------------------------------------------

export function deriveTraceability(
  requirement: WorkshopLayoutRequirement,
  generatedObjects: readonly LayoutObject[] | null
): readonly TraceabilityItem[] {
  const items: TraceabilityItem[] = [];

  if (!generatedObjects) {
    // No layout generated yet — all requirements show NOT_GENERATED
    for (const svc of requirement.services) {
      items.push(Object.freeze({
        label: getServiceLabel(svc.serviceType),
        requirementCount: svc.bayCount,
        generatedCount: null,
        status: 'NOT_GENERATED',
        notes: 'Layout belum terbentuk',
      }));
    }
    return Object.freeze(items);
  }

  // Derive physical bay requirements from the service list
  const physicalBayReqs = derivePhysicalBayRequirements(requirement.services);
  const generatedBays = countPhysicalBaysFromObjects(generatedObjects);

  // 1. Track physical bay traceability
  for (const bayReq of physicalBayReqs) {
    let generatedCount = 0;
    let label = '';

    if (bayReq.bayType === 'SERVICE_BAY') {
      generatedCount = generatedBays.serviceBayCount;
      label = 'Service Bay';
    } else if (bayReq.bayType === 'SPOORING_BAY') {
      generatedCount = generatedBays.spooringBayCount;
      label = 'Spooring Bay';
    } else if (bayReq.bayType === 'GENERAL_REPAIR_BAY') {
      generatedCount = generatedBays.generalRepairBayCount;
      label = 'General Repair Bay';
    }

    const status: TraceabilityStatus = generatedCount >= bayReq.bayCount
      ? 'FULFILLED'
      : 'NOT_FULFILLED';

    items.push(Object.freeze({
      label,
      requirementCount: bayReq.bayCount,
      generatedCount,
      status,
      notes: status === 'FULFILLED'
        ? undefined
        : `Dibutuhkan ${bayReq.bayCount}, terbentuk ${generatedCount}`,
    }));
  }

  // 2. Track function-only services (Quick Lube, Detailing, etc.)
  for (const svc of requirement.services) {
    if (!FUNCTION_ONLY_SERVICES.has(svc.serviceType)) continue;

    const hostBayType = BAY_TYPE_FOR_FUNCTION[svc.serviceType];
    let status: TraceabilityStatus = 'NOT_FULFILLED';
    let notes: string | undefined;

    if (hostBayType) {
      // Check if the host bay type is present
      let hostBayCount = 0;
      if (hostBayType === 'SERVICE_BAY') hostBayCount = generatedBays.serviceBayCount;
      else if (hostBayType === 'SPOORING_BAY') hostBayCount = generatedBays.spooringBayCount;
      else if (hostBayType === 'GENERAL_REPAIR_BAY') hostBayCount = generatedBays.generalRepairBayCount;

      if (hostBayCount > 0) {
        status = 'FULFILLED_AS_FUNCTION';
        const bayLabel = hostBayType === 'SERVICE_BAY' ? 'Service Bay'
          : hostBayType === 'SPOORING_BAY' ? 'Spooring Bay'
          : 'General Repair Bay';
        notes = `Fungsi di-host oleh ${bayLabel}`;
      } else {
        notes = 'Host bay tidak terbentuk';
      }
    } else {
      // No canonical host bay (Detailing, Tire Service, etc.)
      status = 'FULFILLED_AS_FUNCTION';
      notes = 'Fungsi mandiri (tidak memerlukan bay fisik terpisah)';
    }

    items.push(Object.freeze({
      label: getServiceLabel(svc.serviceType),
      requirementCount: svc.bayCount,
      generatedCount: 0,
      status,
      notes,
    }));
  }

  return Object.freeze(items);
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Derives the complete Layout Summary from requirement + active candidate objects.
 *
 * @param requirement - The original WorkshopLayoutRequirement (from user input)
 * @param generatedObjects - Layout objects from the active candidate (null if not generated)
 * @param hasGeneratedLayout - True if a valid layout was generated successfully
 */
export function deriveLayoutSummary(
  requirement: WorkshopLayoutRequirement,
  generatedObjects: readonly LayoutObject[] | null,
  hasGeneratedLayout: boolean
): LayoutSummaryResult {
  const physicalBays = generatedObjects
    ? countPhysicalBaysFromObjects(generatedObjects)
    : Object.freeze<PhysicalBaySummary>({
        serviceBayCount: 0,
        spooringBayCount: 0,
        generalRepairBayCount: 0,
        totalPhysicalBays: 0,
      });

  const serviceFunctions = deriveServiceFunctionList(requirement.services);
  const spaceProgram = generatedObjects ? deriveSpaceProgram(generatedObjects) : [];
  const traceability = deriveTraceability(requirement, hasGeneratedLayout ? generatedObjects : null);

  return Object.freeze({
    hasGeneratedLayout,
    physicalBays,
    serviceFunctions,
    spaceProgram,
    traceability,
  });
}
