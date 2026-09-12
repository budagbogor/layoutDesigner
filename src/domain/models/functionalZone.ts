/**
 * Mobeng Workshop CAD Designer — Functional Zoning Domain Module
 *
 * Defines the 4 canonical functional zones:
 * 1. CUSTOMER (AREA PELANGGAN)
 * 2. WORKSHOP (AREA SERVIS)
 * 3. BACK_OF_HOUSE (AREA KARYAWAN)
 * 4. STORAGE_LOGISTICS (AREA PENYIMPANAN & LOGISTIK)
 *
 * Provides deterministic zone assignment, Indonesian display labels,
 * zone colors (non-hazardous/safety compliant), and human-friendly space labels.
 */

export type FunctionalZone =
  | 'CUSTOMER'
  | 'WORKSHOP'
  | 'BACK_OF_HOUSE'
  | 'STORAGE_LOGISTICS';

export const ALL_FUNCTIONAL_ZONES: readonly FunctionalZone[] = Object.freeze([
  'CUSTOMER',
  'WORKSHOP',
  'BACK_OF_HOUSE',
  'STORAGE_LOGISTICS',
]);

/** User-facing Indonesian labels for functional zones */
export const FUNCTIONAL_ZONE_LABELS: Readonly<Record<FunctionalZone, string>> = Object.freeze({
  CUSTOMER: 'AREA PELANGGAN',
  WORKSHOP: 'AREA SERVIS',
  BACK_OF_HOUSE: 'AREA KARYAWAN',
  STORAGE_LOGISTICS: 'AREA PENYIMPANAN & LOGISTIK',
});

/**
 * Modern, non-hazardous UI/CAD color palette for functional zone visual grouping.
 * Avoids engineering safety colors (red/orange/yellow safety warnings).
 */
export const FUNCTIONAL_ZONE_COLORS: Readonly<
  Record<
    FunctionalZone,
    {
      fill: string;
      stroke: string;
      text: string;
      badgeBg: string;
      badgeText: string;
      badgeBorder: string;
    }
  >
> = Object.freeze({
  CUSTOMER: {
    fill: 'rgba(0, 210, 255, 0.07)',
    stroke: 'rgba(0, 210, 255, 0.4)',
    text: '#79c0ff',
    badgeBg: 'rgba(0, 210, 255, 0.12)',
    badgeText: '#79c0ff',
    badgeBorder: 'rgba(0, 210, 255, 0.35)',
  },
  WORKSHOP: {
    fill: 'rgba(46, 160, 67, 0.07)',
    stroke: 'rgba(46, 160, 67, 0.4)',
    text: '#3fb950',
    badgeBg: 'rgba(46, 160, 67, 0.12)',
    badgeText: '#3fb950',
    badgeBorder: 'rgba(46, 160, 67, 0.35)',
  },
  BACK_OF_HOUSE: {
    fill: 'rgba(163, 113, 247, 0.07)',
    stroke: 'rgba(163, 113, 247, 0.4)',
    text: '#d2a8ff',
    badgeBg: 'rgba(163, 113, 247, 0.12)',
    badgeText: '#d2a8ff',
    badgeBorder: 'rgba(163, 113, 247, 0.35)',
  },
  STORAGE_LOGISTICS: {
    fill: 'rgba(210, 153, 34, 0.07)',
    stroke: 'rgba(210, 153, 34, 0.4)',
    text: '#e3b341',
    badgeBg: 'rgba(210, 153, 34, 0.12)',
    badgeText: '#e3b341',
    badgeBorder: 'rgba(210, 153, 34, 0.35)',
  },
});

/**
 * Deterministically assigns a FunctionalZone based on object metadata, type, layer, or ID.
 */
export function deriveFunctionalZone(obj: {
  id?: string;
  type?: string;
  layer?: string;
  metadata?: Record<string, unknown>;
}): FunctionalZone {
  // 1. Explicit metadata zone check
  if (obj.metadata?.zone && typeof obj.metadata.zone === 'string') {
    const metaZone = obj.metadata.zone.toUpperCase();
    if (metaZone === 'CUSTOMER') return 'CUSTOMER';
    if (metaZone === 'WORKSHOP') return 'WORKSHOP';
    if (metaZone === 'BACK_OF_HOUSE') return 'BACK_OF_HOUSE';
    if (metaZone === 'STORAGE_LOGISTICS' || metaZone === 'STORAGE' || metaZone === 'LOGISTICS') return 'STORAGE_LOGISTICS';
  }

  const type = (obj.type ?? '').toLowerCase();
  const id = (obj.id ?? '').toLowerCase();
  const layer = (obj.layer ?? '').toUpperCase();
  const spaceType = typeof obj.metadata?.spaceType === 'string' ? obj.metadata.spaceType.toLowerCase() : '';
  const bayType = typeof obj.metadata?.bayType === 'string' ? obj.metadata.bayType.toUpperCase() : '';

  // 2. WORKSHOP Zone
  if (
    type === 'service_bay' ||
    layer === '08-SERVICE-BAY' ||
    layer === '06-LIFT' ||
    layer === '07-EQUIPMENT' ||
    type === 'equipment' ||
    bayType === 'SERVICE_BAY' ||
    bayType === 'SPOORING_BAY' ||
    bayType === 'GENERAL_REPAIR_BAY' ||
    id.includes('bay') ||
    id.includes('lift') ||
    id.includes('compressor-unit') ||
    id.includes('tool-cabinet') ||
    id.includes('tire-changer')
  ) {
    // Exception for compressor room (which goes to storage/logistics)
    if (id.includes('compressor-room') || id.includes('compressor_room') || spaceType.includes('compressor_room')) {
      return 'STORAGE_LOGISTICS';
    }
    return 'WORKSHOP';
  }

  // 3. STORAGE / LOGISTICS Zone
  if (
    id.includes('parts-warehouse') ||
    id.includes('parts_warehouse') ||
    spaceType.includes('parts_warehouse') ||
    spaceType.includes('warehouse') ||
    id.includes('compressor-room') ||
    id.includes('compressor_room') ||
    spaceType.includes('compressor_room') ||
    id.includes('waste') ||
    spaceType.includes('waste')
  ) {
    return 'STORAGE_LOGISTICS';
  }

  // 4. BACK OF HOUSE Zone
  if (
    id.includes('employee-mess') ||
    id.includes('employee_mess') ||
    id.includes('staff-room') ||
    id.includes('staff_room') ||
    spaceType.includes('staff_room') ||
    spaceType.includes('employee') ||
    id.includes('employee-restroom') ||
    id.includes('employee_restroom') ||
    id.includes('employee-parking') ||
    id.includes('employee_parking')
  ) {
    return 'BACK_OF_HOUSE';
  }

  // 5. CUSTOMER Zone
  if (
    id.includes('customer') ||
    id.includes('lounge') ||
    id.includes('reception') ||
    id.includes('cashier') ||
    id.includes('mushola') ||
    id.includes('wudhu') ||
    id.includes('restroom') ||
    spaceType.includes('customer') ||
    spaceType.includes('lounge') ||
    spaceType.includes('cashier') ||
    spaceType.includes('restroom') ||
    spaceType.includes('mushola') ||
    spaceType.includes('wudhu') ||
    type === 'parking_spot' ||
    id.includes('parking')
  ) {
    return 'CUSTOMER';
  }

  // Fallback default
  return 'WORKSHOP';
}

/**
 * Returns a clean, user-facing Indonesian/English title for a layout space or object.
 * Label source (priority order):
 * 1. metadata.bayIndex + metadata.bayType → "SERVICE BAY 01", "SPOORING BAY 01"
 * 2. metadata.bayType alone → "SERVICE BAY", "SPOORING BAY"
 * 3. ID pattern matching for semantic spaces
 * 4. metadata.name fallback
 * NEVER uses coordinates, dimensions, or AI-generated strings.
 */
export function getHumanObjectLabel(obj: {
  id?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}): string {
  const id = obj.id ?? '';
  const type = obj.type ?? '';
  const metaName = typeof obj.metadata?.name === 'string' ? obj.metadata.name : '';
  const bayType = typeof obj.metadata?.bayType === 'string' ? obj.metadata.bayType.toUpperCase() : '';
  const bayIndex = typeof obj.metadata?.bayIndex === 'number' ? obj.metadata.bayIndex : null;
  const spaceType = typeof obj.metadata?.spaceType === 'string' ? obj.metadata.spaceType.toLowerCase() : '';

  // ─── Physical Bays (canonical MOBENG bay types only) ────────────────────
  if (type === 'service_bay' || bayType) {
    const numStr = bayIndex !== null ? String(bayIndex).padStart(2, '0') : null;

    if (bayType === 'SPOORING_BAY' || id.includes('spooring')) {
      return numStr ? `SPOORING BAY ${numStr}` : 'SPOORING BAY';
    }
    if (bayType === 'GENERAL_REPAIR_BAY' || id.includes('general-repair') || id.includes('general_repair')) {
      return numStr ? `GENERAL REPAIR BAY ${numStr}` : 'GENERAL REPAIR BAY';
    }
    // Default: SERVICE_BAY
    if (numStr) return `SERVICE BAY ${numStr}`;
    // Fallback: extract number from ID pattern e.g. bay-01
    const match = id.match(/bay-?(\d+)/i) || metaName.match(/bay-?(\d+)/i);
    if (match) return `SERVICE BAY ${match[1].padStart(2, '0')}`;
    return 'SERVICE BAY';
  }

  // Legacy: id-based bay detection (backward compat for objects without metadata.bayType)
  if (id.includes('bay')) {
    if (id.includes('spooring')) return 'SPOORING BAY';
    if (id.includes('general-repair') || id.includes('general_repair')) return 'GENERAL REPAIR BAY';
    const match = id.match(/bay-?(\d+)/i);
    if (match) return `SERVICE BAY ${match[1].padStart(2, '0')}`;
    return 'SERVICE BAY';
  }

  // ─── Customer Spaces ────────────────────────────────────────────────────
  if (
    spaceType === 'customer_lounge' ||
    spaceType === 'reception_cashier' ||
    id.includes('customer-lounge') ||
    id.includes('customer_lounge') ||
    id.includes('cashier') ||
    id.includes('reception')
  ) {
    return 'WAITING + RECEPTION + CASHIER';
  }

  if (id.includes('customer-parking') || id.includes('customer_parking') || spaceType === 'customer_parking') {
    return 'CUSTOMER PARKING';
  }

  if (
    id.includes('customer-restroom') ||
    id.includes('customer_restroom') ||
    spaceType === 'customer_restroom'
  ) {
    return 'CUSTOMER TOILET';
  }

  if (id.includes('mushola') || spaceType === 'mushola') return 'MUSHOLA';
  if (id.includes('wudhu') || spaceType === 'wudhu') return 'WUDHU';

  // ─── Back of House Spaces (checked BEFORE generic restroom fallback) ───────
  if (
    id.includes('employee-mess') ||
    id.includes('employee_mess') ||
    id.includes('staff-room') ||
    spaceType === 'staff_room' ||
    spaceType === 'employee_mess'
  ) {
    return 'EMPLOYEE MESS';
  }

  if (
    id.includes('employee-restroom') ||
    id.includes('employee_restroom') ||
    spaceType === 'employee_restroom'
  ) {
    return 'EMPLOYEE TOILET';
  }

  if (
    id.includes('employee-parking') ||
    id.includes('employee_parking') ||
    spaceType === 'employee_parking'
  ) {
    return 'PARKIR MOTOR KARYAWAN';
  }

  // Generic restroom fallback — only if NOT an employee space
  if (id.includes('restroom') && !id.includes('employee')) return 'CUSTOMER TOILET';

  // ─── Storage & Logistics ────────────────────────────────────────────────
  if (
    id.includes('parts-warehouse') ||
    id.includes('parts_warehouse') ||
    spaceType.includes('warehouse')
  ) {
    return 'SPAREPART WAREHOUSE';
  }

  if (
    id.includes('compressor-room') ||
    id.includes('compressor_room') ||
    spaceType === 'compressor_room'
  ) {
    return 'COMPRESSOR ROOM';
  }

  if (id.includes('waste') || spaceType.includes('waste')) {
    return 'WASTE AREA';
  }

  // ─── Circulation / Drive Aisle ──────────────────────────────────────────
  if (
    type === 'circulation_path' ||
    id.includes('circulation') ||
    id.includes('drive-aisle') ||
    id.includes('drive_aisle') ||
    id.includes('aisle')
  ) {
    return 'DRIVE AISLE';
  }

  // ─── Vehicles / Equipment ───────────────────────────────────────────────
  if (type === 'vehicle') {
    const vehType = (obj.metadata?.vehicleType as string) ?? 'MPV';
    return `KENDARAAN (${vehType})`;
  }
  if (type === 'equipment') {
    const equipName = (obj.metadata?.name as string) ?? metaName ?? id;
    return `PERALATAN: ${equipName.toUpperCase()}`;
  }

  return metaName ? metaName : id.toUpperCase();
}

/**
 * Returns a human-friendly Type label in Indonesian.
 */
export function getHumanObjectTypeLabel(obj: {
  type?: string;
  metadata?: Record<string, unknown>;
}): string {
  const type = obj.type ?? '';
  const bayType = typeof obj.metadata?.bayType === 'string' ? obj.metadata.bayType.toUpperCase() : '';

  if (type === 'service_bay') {
    if (bayType === 'SPOORING_BAY') return 'Spooring Bay';
    if (bayType === 'GENERAL_REPAIR_BAY') return 'General Repair Bay';
    return 'Service Bay';
  }
  if (type === 'equipment') return 'Peralatan Bengkel';
  if (type === 'vehicle') return 'Kendaraan Servis';
  if (type === 'wall') return 'Dinding Bangunan';
  if (type === 'column') return 'Kolom Struktur';
  if (type === 'door') return 'Akses Pintu';
  if (type === 'window') return 'Jendela';
  if (type === 'zone') return 'Area Ruang';

  return 'Elemen Layout';
}

/**
 * Maps a canonical service type string to a human-friendly display label.
 */
function mapServiceTypeToLabel(serviceType: string): string {
  switch (serviceType) {
    case 'general_service':       return 'General Service';
    case 'quick_lube':            return 'Quick Lube';
    case 'service_rasa_mesin_baru': return 'Rasa Mesin Baru';
    case 'wheel_alignment':       return 'Spooring & Wheel Alignment';
    case 'general_repair':        return 'General Repair';
    case 'brake_suspension':      return 'Kaki-kaki & Rem';
    case 'detailing':             return 'Detailing';
    case 'tire_service':          return 'Tire Service';
    default:                      return serviceType;
  }
}

/**
 * Extracts a human-friendly list of service functions assigned to a physical bay/space.
 *
 * Reads from (in priority order):
 * 1. metadata.assignedServices (array of strings or objects)
 * 2. metadata.services (array)
 * 3. metadata.serviceType (singular string from candidateGenerator)
 *
 * DOES NOT guess or hallucinate services — only returns what is in metadata.
 * An empty array is returned if no service metadata is present.
 */
export function getObjectServicesList(obj: {
  metadata?: Record<string, unknown>;
}): string[] {
  const services: string[] = [];

  // 1. Try array sources first
  const assigned = obj.metadata?.assignedServices || obj.metadata?.services;
  if (Array.isArray(assigned) && assigned.length > 0) {
    for (const s of assigned) {
      if (typeof s === 'string') {
        services.push(mapServiceTypeToLabel(s));
      } else if (s && typeof s === 'object' && 'serviceType' in s) {
        services.push(mapServiceTypeToLabel((s as { serviceType: string }).serviceType));
      }
    }
    return services;
  }

  // 2. Try singular metadata.serviceType (set by candidateGenerator)
  const singleServiceType = obj.metadata?.serviceType;
  if (typeof singleServiceType === 'string' && singleServiceType.length > 0) {
    services.push(mapServiceTypeToLabel(singleServiceType));
    return services;
  }

  // 3. No service metadata — return empty (do not guess)
  return services;
}
