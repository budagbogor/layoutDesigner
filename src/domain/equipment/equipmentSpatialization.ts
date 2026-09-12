/**
 * ============================================================================
 * MOBENG Workshop CAD Designer
 * Milestone M2B.4 — Equipment Spatialization Foundation
 * ============================================================================
 * 
 * Source of Truth:
 * - docs/PRODUCT_REQUIREMENT_BASELINE.md
 * - MOBENG Space Standard V1 (PO-Approved Specifications)
 * 
 * CRITICAL DOMAIN RULES:
 * 1. Equipment physical dimensions are currently UNKNOWN.
 * 2. DO NOT create fake footprints (e.g., 2x2, 1.5x1, 1x1).
 * 3. DO NOT use generic dimensions as engineering geometry.
 * 4. Equipment is deterministically associated with workshop functions and canonical bay types.
 * 5. If no approved physical footprint exists, equipment remains semantic and unplaced in CAD geometry.
 */

import {
  MobengBayType,
  MobengProvenance,
  MOBENG_OPERATIONAL_EQUIPMENT_LIST,
  MOBENG_EQUIPMENT_ELECTRICAL_PHASES,
  MOBENG_EQUIPMENT_VENDOR_REFERENCES,
} from '../requirements/requirementTypes';

export type MobengEquipmentCanonicalType =
  | 'mesin_spooring'
  | 'mesin_balancing'
  | 'tire_changer'
  | 'atf_flushing_machine'
  | 'nitrogen_tire_inflator'
  | 'oil_drain_suction'
  | 'air_compressor'
  | 'genset_10kva'
  | '2_post_lift'
  | '4_post_lift'
  | 'scissor_lift'
  | 'vehicle_lift';

export type MobengWorkshopFunction =
  | 'spooring'
  | 'tire_service'
  | 'general_service'
  | 'quick_lube'
  | 'general_repair'
  | 'workshop_utility'
  | 'utility';

export type EquipmentFootprintStatus = 'KNOWN' | 'UNKNOWN';

/**
 * Full equipment specification and spatial association metadata.
 */
export interface MobengEquipmentSpecification {
  readonly id: string;
  readonly canonicalType: MobengEquipmentCanonicalType;
  readonly displayName: string;
  readonly alternativeNames: readonly string[];
  readonly associatedBayType?: MobengBayType;
  readonly associatedFunction: MobengWorkshopFunction;
  readonly electricalPhase?: number; // 1 or 3, undefined if UNKNOWN
  readonly electricalProvenance: MobengProvenance;
  readonly capacity?: number; // e.g. 10.0 for Genset
  readonly capacityUnit?: string; // e.g. 'kVA'
  readonly vendorReferences?: readonly string[];
  readonly footprintStatus: EquipmentFootprintStatus;
  readonly hasPhysicalFootprint: boolean;
  readonly provenance: MobengProvenance;
}

/**
 * Canonical registry of official PO-approved MOBENG equipment items.
 */
export const MOBENG_OFFICIAL_EQUIPMENT_SPECS: Readonly<Record<string, MobengEquipmentSpecification>> = Object.freeze({
  'Mesin spooring': Object.freeze({
    id: 'eq-mesin-spooring',
    canonicalType: 'mesin_spooring' as MobengEquipmentCanonicalType,
    displayName: 'Mesin Spooring',
    alternativeNames: Object.freeze(['Mesin spooring', 'mesin_spooring', 'mesin spooring', 'spooring_machine']),
    associatedBayType: 'SPOORING_BAY' as MobengBayType,
    associatedFunction: 'spooring' as MobengWorkshopFunction,
    electricalPhase: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin spooring']?.phaseCount ?? 1,
    electricalProvenance: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin spooring']?.provenance ?? 'PO_APPROVED',
    vendorReferences: MOBENG_EQUIPMENT_VENDOR_REFERENCES['Mesin spooring'],
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Mesin balancing': Object.freeze({
    id: 'eq-mesin-balancing',
    canonicalType: 'mesin_balancing' as MobengEquipmentCanonicalType,
    displayName: 'Mesin Balancing',
    alternativeNames: Object.freeze(['Mesin balancing', 'mesin_balancing', 'mesin balancing', 'balancing_machine']),
    associatedBayType: 'SERVICE_BAY' as MobengBayType,
    associatedFunction: 'tire_service' as MobengWorkshopFunction,
    electricalPhase: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin balancing']?.phaseCount ?? 3,
    electricalProvenance: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin balancing']?.provenance ?? 'PO_APPROVED',
    vendorReferences: MOBENG_EQUIPMENT_VENDOR_REFERENCES['Mesin balancing'],
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Tire changer': Object.freeze({
    id: 'eq-tire-changer',
    canonicalType: 'tire_changer' as MobengEquipmentCanonicalType,
    displayName: 'Tire Changer',
    alternativeNames: Object.freeze(['Tire changer', 'tire_changer', 'tire changer', 'tire_changing_machine']),
    associatedBayType: 'SERVICE_BAY' as MobengBayType,
    associatedFunction: 'tire_service' as MobengWorkshopFunction,
    electricalPhase: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Tire changer']?.phaseCount ?? 3,
    electricalProvenance: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Tire changer']?.provenance ?? 'PO_APPROVED',
    vendorReferences: MOBENG_EQUIPMENT_VENDOR_REFERENCES['Tire changer'],
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'ATF flushing machine': Object.freeze({
    id: 'eq-atf-flushing-machine',
    canonicalType: 'atf_flushing_machine' as MobengEquipmentCanonicalType,
    displayName: 'ATF Flushing Machine',
    alternativeNames: Object.freeze(['ATF flushing machine', 'atf_flushing_machine', 'atf flushing machine', 'atf_machine']),
    associatedBayType: 'SERVICE_BAY' as MobengBayType,
    associatedFunction: 'general_service' as MobengWorkshopFunction,
    electricalPhase: undefined,
    electricalProvenance: 'UNKNOWN' as MobengProvenance,
    vendorReferences: undefined,
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Nitrogen tire inflator': Object.freeze({
    id: 'eq-nitrogen-tire-inflator',
    canonicalType: 'nitrogen_tire_inflator' as MobengEquipmentCanonicalType,
    displayName: 'Nitrogen Tire Inflator',
    alternativeNames: Object.freeze(['Nitrogen tire inflator', 'nitrogen_tire_inflator', 'nitrogen tire inflator', 'nitrogen_generator', 'nitrogen_inflator']),
    associatedBayType: 'SERVICE_BAY' as MobengBayType,
    associatedFunction: 'tire_service' as MobengWorkshopFunction,
    electricalPhase: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Nitrogen tire inflator']?.phaseCount,
    electricalProvenance: MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Nitrogen tire inflator']?.provenance ?? 'UNKNOWN',
    vendorReferences: MOBENG_EQUIPMENT_VENDOR_REFERENCES['Nitrogen tire inflator'],
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Oil drain & suction': Object.freeze({
    id: 'eq-oil-drain-suction',
    canonicalType: 'oil_drain_suction' as MobengEquipmentCanonicalType,
    displayName: 'Oil Drain & Suction',
    alternativeNames: Object.freeze(['Oil drain & suction', 'oil_drain_suction', 'oil drain & suction', 'oil_drain_and_suction', 'oil_extractor', 'oil drain suction']),
    associatedBayType: 'SERVICE_BAY' as MobengBayType,
    associatedFunction: 'quick_lube' as MobengWorkshopFunction,
    electricalPhase: undefined,
    electricalProvenance: 'UNKNOWN' as MobengProvenance,
    vendorReferences: undefined,
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Air compressor': Object.freeze({
    id: 'eq-air-compressor',
    canonicalType: 'air_compressor' as MobengEquipmentCanonicalType,
    displayName: 'Air Compressor',
    alternativeNames: Object.freeze(['Air compressor', 'air_compressor', 'air compressor', 'compressor']),
    associatedBayType: undefined,
    associatedFunction: 'workshop_utility' as MobengWorkshopFunction,
    electricalPhase: undefined,
    electricalProvenance: 'UNKNOWN' as MobengProvenance,
    vendorReferences: undefined,
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),

  'Genset 10 kVA': Object.freeze({
    id: 'eq-genset-10kva',
    canonicalType: 'genset_10kva' as MobengEquipmentCanonicalType,
    displayName: 'Genset 10 kVA',
    alternativeNames: Object.freeze(['Genset 10 kVA', 'genset_10kva', 'genset 10 kva', 'genset', 'generator_set', 'genset 10kva']),
    associatedBayType: undefined,
    associatedFunction: 'utility' as MobengWorkshopFunction,
    capacity: 10.0,
    capacityUnit: 'kVA',
    electricalPhase: undefined,
    electricalProvenance: 'UNKNOWN' as MobengProvenance,
    vendorReferences: undefined,
    footprintStatus: 'UNKNOWN' as EquipmentFootprintStatus,
    hasPhysicalFootprint: false,
    provenance: 'PO_APPROVED' as MobengProvenance,
  }),
});

/**
 * Retrieve official equipment specification by exact or canonical name.
 */
export function getOfficialEquipmentSpec(nameOrType: string): MobengEquipmentSpecification | undefined {
  if (!nameOrType) return undefined;
  const trimmed = nameOrType.trim();

  // 1. Direct key match
  if (MOBENG_OFFICIAL_EQUIPMENT_SPECS[trimmed]) {
    return MOBENG_OFFICIAL_EQUIPMENT_SPECS[trimmed];
  }

  // 2. Canonical or alternative name match (case-insensitive)
  const lower = trimmed.toLowerCase().replace(/[_\s-]+/g, ' ');
  for (const spec of Object.values(MOBENG_OFFICIAL_EQUIPMENT_SPECS)) {
    if (spec.canonicalType.toLowerCase().replace(/[_\s-]+/g, ' ') === lower) {
      return spec;
    }
    if (spec.displayName.toLowerCase().replace(/[_\s-]+/g, ' ') === lower) {
      return spec;
    }
    if (spec.alternativeNames.some((alt) => alt.toLowerCase().replace(/[_\s-]+/g, ' ') === lower)) {
      return spec;
    }
  }

  return undefined;
}

/**
 * Return list of all 8 official equipment specifications.
 */
export function getAllOfficialEquipmentSpecs(): readonly MobengEquipmentSpecification[] {
  return Object.values(MOBENG_OFFICIAL_EQUIPMENT_SPECS);
}

/**
 * Return all equipment associated with a specific canonical bay type.
 */
export function getEquipmentForBayType(bayType: MobengBayType): readonly MobengEquipmentSpecification[] {
  return Object.values(MOBENG_OFFICIAL_EQUIPMENT_SPECS).filter((spec) => spec.associatedBayType === bayType);
}

/**
 * Return all equipment associated with a specific workshop function.
 */
export function getEquipmentForFunction(func: MobengWorkshopFunction): readonly MobengEquipmentSpecification[] {
  return Object.values(MOBENG_OFFICIAL_EQUIPMENT_SPECS).filter((spec) => spec.associatedFunction === func);
}

/**
 * Check if a given string corresponds to one of the 8 official MOBENG operational equipment.
 */
export function isOfficialEquipment(nameOrType: string): boolean {
  return getOfficialEquipmentSpec(nameOrType) !== undefined;
}

/**
 * Validation result structure for equipment spatialization.
 */
export interface EquipmentValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly validatedItems: readonly MobengEquipmentSpecification[];
}

/**
 * Pure deterministic validator for equipment spatialization metadata.
 */
export function validateEquipmentSpatialization(items: readonly { equipmentType: string; quantity?: number }[]): EquipmentValidationResult {
  const errors: string[] = [];
  const validatedItems: MobengEquipmentSpecification[] = [];

  for (const item of items) {
    const spec = getOfficialEquipmentSpec(item.equipmentType);
    if (!spec) {
      errors.push(`Unrecognized equipment type '${item.equipmentType}'. Must be an official MOBENG operational equipment or registered lift.`);
      continue;
    }

    // Check unknown footprint constraint
    if (spec.footprintStatus !== 'UNKNOWN') {
      errors.push(`Equipment '${spec.displayName}' must have footprintStatus='UNKNOWN' until PO-approved physical dimensions exist.`);
    }

    if (spec.hasPhysicalFootprint) {
      errors.push(`Equipment '${spec.displayName}' must not claim physical footprint geometry.`);
    }

    // Check Genset specific capacity
    if (spec.canonicalType === 'genset_10kva') {
      if (spec.capacity !== 10.0 || spec.capacityUnit !== 'kVA') {
        errors.push(`Genset must have capacity=10.0 kVA.`);
      }
    }

    // Check Spooring electrical phase
    if (spec.canonicalType === 'mesin_spooring' && spec.electricalPhase !== 1) {
      errors.push(`Mesin Spooring must be 1 phase.`);
    }

    // Check Balancing & Tire Changer electrical phase
    if ((spec.canonicalType === 'mesin_balancing' || spec.canonicalType === 'tire_changer') && spec.electricalPhase !== 3) {
      errors.push(`${spec.displayName} must be 3 phase.`);
    }

    // Check Nitrogen electrical phase is unknown/undefined
    if (spec.canonicalType === 'nitrogen_tire_inflator' && spec.electricalPhase !== undefined) {
      errors.push(`Nitrogen Tire Inflator electrical phase must remain UNKNOWN / undefined.`);
    }

    validatedItems.push(spec);
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedItems,
  };
}
