/**
 * PHASE 3.3 — Layout Summary & Requirement Traceability
 * 15 behavior tests covering all traceability requirements.
 */
import { describe, it, expect } from 'vitest';
import {
  countPhysicalBaysFromObjects,
  deriveServiceFunctionList,
  deriveTraceability,
  deriveLayoutSummary,
  deriveSpaceProgram,
} from '@/domain/summary/layoutSummaryEngine';
import { LayoutObject } from '@/domain/models/project';
import { ServiceProgramItem } from '@/domain/requirements/requirementTypes';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeServiceBay(id: string, bayType = 'SERVICE_BAY', bayIndex = 1): LayoutObject {
  return {
    id,
    type: 'service_bay',
    layer: '08-SERVICE-BAY',
    geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
    metadata: { bayType, bayIndex },
  };
}

function makeSpace(id: string, spaceType: string): LayoutObject {
  return {
    id,
    type: 'ancillary_space',
    layer: '03-ANCILLARY',
    geometry: { x: 0, y: 0, width: 5, length: 5, rotation: 0 },
    metadata: { spaceType },
  };
}

const BASE_REQUIREMENT: import('@/domain/requirements/requirementTypes').WorkshopLayoutRequirement = {
  projectName: 'Test Workshop',
  workshopType: 'car_service',
  vehicleCategory: 'mpv',
  priority: 'BALANCED_EFFICIENCY',
  site: { widthMeters: 15, lengthMeters: 25 },
  building: { widthMeters: 12, lengthMeters: 20 },
  access: { entryPosition: 'front_center' },
  services: [
    { serviceType: 'general_service', bayCount: 2 },
    { serviceType: 'quick_lube', bayCount: 1 },
    { serviceType: 'wheel_alignment', bayCount: 1 },
    { serviceType: 'detailing', bayCount: 1 },
  ],
  ancillarySpaces: {
    customerLounge: true,
    cashierOffice: true,
    partsWarehouse: true,
    restroom: true,
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PHASE 3.3 — Layout Summary & Requirement Traceability', () => {

  // Test 1: 2 Service Bays counted correctly
  it('1. 2 Service Bay objects → summary count = 2', () => {
    const objects = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SERVICE_BAY', 2),
    ];
    const result = countPhysicalBaysFromObjects(objects);
    expect(result.serviceBayCount).toBe(2);
    expect(result.totalPhysicalBays).toBe(2);
  });

  // Test 2: 1 Spooring Bay counted correctly
  it('2. 1 Spooring Bay object → summary count = 1', () => {
    const objects = [makeServiceBay('bay-03', 'SPOORING_BAY', 1)];
    const result = countPhysicalBaysFromObjects(objects);
    expect(result.spooringBayCount).toBe(1);
    expect(result.serviceBayCount).toBe(0);
    expect(result.totalPhysicalBays).toBe(1);
  });

  // Test 3: General Repair Bay counted correctly
  it('3. General Repair Bay object → count correct', () => {
    const objects = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'GENERAL_REPAIR_BAY', 1),
    ];
    const result = countPhysicalBaysFromObjects(objects);
    expect(result.generalRepairBayCount).toBe(1);
    expect(result.serviceBayCount).toBe(1);
    expect(result.totalPhysicalBays).toBe(2);
  });

  // Test 4: Quick Lube NOT counted as physical bay
  it('4. Quick Lube service does NOT add physical bay count', () => {
    const services: ServiceProgramItem[] = [
      { serviceType: 'general_service', bayCount: 2 },
      { serviceType: 'quick_lube', bayCount: 1 },
    ];
    const funcList = deriveServiceFunctionList(services);
    const ql = funcList.find((f) => f.serviceType === 'quick_lube');
    expect(ql).toBeDefined();
    expect(ql!.isPhysicalBay).toBe(false);
    expect(ql!.bayCount).toBe(1);
  });

  // Test 5: Detailing NOT counted as physical bay
  it('5. Detailing service does NOT add physical bay count', () => {
    const services: ServiceProgramItem[] = [
      { serviceType: 'general_service', bayCount: 3 },
      { serviceType: 'detailing', bayCount: 1 },
    ];
    const funcList = deriveServiceFunctionList(services);
    const det = funcList.find((f) => f.serviceType === 'detailing');
    expect(det).toBeDefined();
    expect(det!.isPhysicalBay).toBe(false);
  });

  // Test 6: Service functions appear in function list
  it('6. Service functions still appear in service function list', () => {
    const services: ServiceProgramItem[] = [
      { serviceType: 'general_service', bayCount: 2 },
      { serviceType: 'quick_lube', bayCount: 1 },
      { serviceType: 'detailing', bayCount: 1 },
      { serviceType: 'wheel_alignment', bayCount: 1 },
    ];
    const funcList = deriveServiceFunctionList(services);
    const labels = funcList.map((f) => f.displayLabel);
    expect(labels).toContain('General Service');
    expect(labels).toContain('Quick Lube');
    expect(labels).toContain('Detailing');
    expect(labels).toContain('Spooring / Wheel Alignment');
  });

  // Test 7: Total physical bay count
  it('7. Total physical bay = serviceBay + spooringBay + generalRepairBay', () => {
    const objects = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SERVICE_BAY', 2),
      makeServiceBay('bay-03', 'SPOORING_BAY', 1),
    ];
    const result = countPhysicalBaysFromObjects(objects);
    expect(result.totalPhysicalBays).toBe(3);
    expect(result.serviceBayCount).toBe(2);
    expect(result.spooringBayCount).toBe(1);
    expect(result.generalRepairBayCount).toBe(0);
  });

  // Test 8: Customer spaces appear in space program
  it('8. Customer spaces grouped under CUSTOMER zone', () => {
    const objects = [
      makeSpace('customer-lounge-01', 'customer_lounge'),
      makeSpace('customer-restroom-01', 'customer_restroom'),
      makeSpace('mushola-01', 'mushola'),
    ];
    const program = deriveSpaceProgram(objects);
    const customerGroup = program.find((g) => g.zone === 'CUSTOMER');
    expect(customerGroup).toBeDefined();
    expect(customerGroup!.spaces.length).toBeGreaterThanOrEqual(3);
    const labels = customerGroup!.spaces.map((s) => s.humanLabel);
    expect(labels).toContain('WAITING + RECEPTION + CASHIER');
    expect(labels).toContain('CUSTOMER TOILET');
    expect(labels).toContain('MUSHOLA');
  });

  // Test 9: Employee spaces appear in space program
  it('9. Employee spaces grouped under BACK_OF_HOUSE zone', () => {
    const objects = [
      makeSpace('employee-mess-01', 'employee_mess'),
      makeSpace('employee-restroom-01', 'employee_restroom'),
      makeSpace('employee-parking-01', 'employee_parking'),
    ];
    const program = deriveSpaceProgram(objects);
    const bohGroup = program.find((g) => g.zone === 'BACK_OF_HOUSE');
    expect(bohGroup).toBeDefined();
    const labels = bohGroup!.spaces.map((s) => s.humanLabel);
    expect(labels).toContain('EMPLOYEE MESS');
    expect(labels).toContain('EMPLOYEE TOILET');
    expect(labels).toContain('PARKIR MOTOR KARYAWAN');
  });

  // Test 10: Storage spaces appear in space program
  it('10. Storage spaces grouped under STORAGE_LOGISTICS zone', () => {
    const objects = [
      makeSpace('parts-warehouse-01', 'parts_warehouse'),
      makeSpace('waste-area-01', 'waste_compound'),
      makeSpace('compressor-room-01', 'compressor_room'),
    ];
    const program = deriveSpaceProgram(objects);
    const storageGroup = program.find((g) => g.zone === 'STORAGE_LOGISTICS');
    expect(storageGroup).toBeDefined();
    const labels = storageGroup!.spaces.map((s) => s.humanLabel);
    expect(labels).toContain('SPAREPART WAREHOUSE');
    expect(labels).toContain('WASTE AREA');
    expect(labels).toContain('COMPRESSOR ROOM');
  });

  // Test 11: Fulfilled requirement → FULFILLED status
  it('11. Generated bays >= required bays → FULFILLED status', () => {
    const generatedObjects = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SERVICE_BAY', 2),
      makeServiceBay('bay-03', 'SPOORING_BAY', 1),
    ];
    const items = deriveTraceability(BASE_REQUIREMENT, generatedObjects);
    const serviceBayItem = items.find((i) => i.label === 'Service Bay');
    const spooringItem = items.find((i) => i.label === 'Spooring Bay');
    expect(serviceBayItem?.status).toBe('FULFILLED');
    expect(spooringItem?.status).toBe('FULFILLED');
  });

  // Test 12: Missing bay → NOT_FULFILLED status
  it('12. Generated bays < required bays → NOT_FULFILLED status', () => {
    // Requirement wants 2 service bays but only 1 generated
    const generatedObjects = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SPOORING_BAY', 1),
    ];
    const items = deriveTraceability(BASE_REQUIREMENT, generatedObjects);
    const serviceBayItem = items.find((i) => i.label === 'Service Bay');
    expect(serviceBayItem?.status).toBe('NOT_FULFILLED');
    expect(serviceBayItem?.generatedCount).toBe(1);
    expect(serviceBayItem?.requirementCount).toBe(2);
  });

  // Test 13: Failed generation → NOT_GENERATED status, no success counts
  it('13. Failed generation (hasGeneratedLayout=false) → status NOT_GENERATED', () => {
    const result = deriveLayoutSummary(BASE_REQUIREMENT, null, false);
    expect(result.hasGeneratedLayout).toBe(false);
    expect(result.physicalBays.totalPhysicalBays).toBe(0);
    const items = result.traceability;
    // All items should be NOT_GENERATED since we pass null for generatedObjects
    for (const item of items) {
      expect(item.status).toBe('NOT_GENERATED');
      expect(item.generatedCount).toBeNull();
    }
  });

  // Test 14: Alternative candidate switches summary to its objects
  it('14. Different candidate objects → summary reflects that candidate', () => {
    // Candidate A: 3 service bays
    const objectsA = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SERVICE_BAY', 2),
      makeServiceBay('bay-03', 'SERVICE_BAY', 3),
    ];
    // Candidate B: 2 service bays + 1 spooring
    const objectsB = [
      makeServiceBay('bay-01', 'SERVICE_BAY', 1),
      makeServiceBay('bay-02', 'SERVICE_BAY', 2),
      makeServiceBay('bay-03', 'SPOORING_BAY', 1),
    ];
    const summaryA = countPhysicalBaysFromObjects(objectsA);
    const summaryB = countPhysicalBaysFromObjects(objectsB);

    expect(summaryA.serviceBayCount).toBe(3);
    expect(summaryA.spooringBayCount).toBe(0);
    expect(summaryB.serviceBayCount).toBe(2);
    expect(summaryB.spooringBayCount).toBe(1);
    expect(summaryA.totalPhysicalBays).toBe(3);
    expect(summaryB.totalPhysicalBays).toBe(3);
  });

  // Test 15: Legacy project (no service metadata) opens without crashing
  it('15. Legacy objects without bayType metadata still produce valid summary', () => {
    const legacyBay: LayoutObject = {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      // No metadata at all
    };
    // Should not throw, should count as SERVICE_BAY by default
    const result = countPhysicalBaysFromObjects([legacyBay]);
    expect(result.totalPhysicalBays).toBe(1);
    expect(result.serviceBayCount).toBe(1);

    // deriveLayoutSummary should not crash on legacy data
    const summary = deriveLayoutSummary(BASE_REQUIREMENT, [legacyBay], true);
    expect(summary.hasGeneratedLayout).toBe(true);
    expect(summary.physicalBays.totalPhysicalBays).toBe(1);
  });
});
