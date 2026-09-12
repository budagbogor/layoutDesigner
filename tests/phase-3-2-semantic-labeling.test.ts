/**
 * PHASE 3.2 — Space & Service Semantic Labeling
 * Behavior tests: 12 tests verifying deterministic label generation,
 * physical bay vs service function separation, and backward compatibility.
 */
import { describe, it, expect } from 'vitest';
import {
  getHumanObjectLabel,
  getObjectServicesList,
} from '@/domain/models/functionalZone';
import { derivePhysicalBayRequirements } from '@/domain/requirements/requirementTypes';
import { LayoutObject } from '@/domain/models/project';

describe('PHASE 3.2 — Space & Service Semantic Labeling', () => {

  // Test 1
  it('1. SERVICE_BAY with bayIndex=1 generates label "SERVICE BAY 01"', () => {
    const obj: LayoutObject = {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'SERVICE_BAY', bayIndex: 1, serviceType: 'general_service' },
    };
    expect(getHumanObjectLabel(obj)).toBe('SERVICE BAY 01');
  });

  // Test 2
  it('2. SERVICE_BAY with bayIndex=3 generates label "SERVICE BAY 03"', () => {
    const obj: LayoutObject = {
      id: 'bay-03',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'SERVICE_BAY', bayIndex: 3, serviceType: 'quick_lube' },
    };
    expect(getHumanObjectLabel(obj)).toBe('SERVICE BAY 03');
  });

  // Test 3
  it('3. SPOORING_BAY with bayIndex=1 generates label "SPOORING BAY 01"', () => {
    const obj: LayoutObject = {
      id: 'bay-04',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4.5, length: 9.5, rotation: 0 },
      metadata: { bayType: 'SPOORING_BAY', bayIndex: 1, serviceType: 'wheel_alignment' },
    };
    expect(getHumanObjectLabel(obj)).toBe('SPOORING BAY 01');
  });

  // Test 4
  it('4. GENERAL_REPAIR_BAY with bayIndex=2 generates label "GENERAL REPAIR BAY 02"', () => {
    const obj: LayoutObject = {
      id: 'bay-05',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'GENERAL_REPAIR_BAY', bayIndex: 2, serviceType: 'general_repair' },
    };
    expect(getHumanObjectLabel(obj)).toBe('GENERAL REPAIR BAY 02');
  });

  // Test 5
  it('5. Quick Lube does NOT become a physical bay', () => {
    const reqs = [
      { serviceType: 'general_service' as const, bayCount: 2 },
      { serviceType: 'quick_lube' as const, bayCount: 1 },
    ];
    const physicalBays = derivePhysicalBayRequirements(reqs);
    expect(physicalBays.length).toBe(1);
    expect(physicalBays[0].bayType).toBe('SERVICE_BAY');
    expect(physicalBays[0].bayCount).toBe(2);
    expect(physicalBays[0].supportedServices).toContain('quick_lube');
  });

  // Test 6
  it('6. Detailing does NOT become a physical bay', () => {
    const reqs = [
      { serviceType: 'general_service' as const, bayCount: 3 },
      { serviceType: 'detailing' as const, bayCount: 1 },
    ];
    const physicalBays = derivePhysicalBayRequirements(reqs);
    expect(physicalBays.length).toBe(1);
    expect(physicalBays[0].bayType).toBe('SERVICE_BAY');
    expect(physicalBays[0].bayCount).toBe(3);
    const allBayTypes = physicalBays.map((b) => b.bayType);
    expect(allBayTypes).not.toContain('DETAILING_BAY');
  });

  // Test 7
  it('7. metadata.serviceType (singular) maps to correct service label', () => {
    const obj = { metadata: { bayType: 'SERVICE_BAY', serviceType: 'quick_lube' } };
    const services = getObjectServicesList(obj);
    expect(services).toEqual(['Quick Lube']);
  });

  // Test 8
  it('8. metadata.assignedServices (array) maps to correct service labels', () => {
    const obj = {
      metadata: {
        bayType: 'SERVICE_BAY',
        assignedServices: ['general_service', 'service_rasa_mesin_baru'],
      },
    };
    const services = getObjectServicesList(obj);
    expect(services).toContain('General Service');
    expect(services).toContain('Rasa Mesin Baru');
    expect(services.length).toBe(2);
  });

  // Test 9
  it('9. Customer spaces have correct semantic labels', () => {
    expect(getHumanObjectLabel({ id: 'customer-lounge-01', metadata: { spaceType: 'customer_lounge' } }))
      .toBe('WAITING + RECEPTION + CASHIER');
    expect(getHumanObjectLabel({ id: 'customer-restroom-01', metadata: { spaceType: 'customer_restroom' } }))
      .toBe('CUSTOMER TOILET');
    expect(getHumanObjectLabel({ id: 'mushola-01', metadata: { spaceType: 'mushola' } }))
      .toBe('MUSHOLA');
    expect(getHumanObjectLabel({ id: 'wudhu-01', metadata: { spaceType: 'wudhu' } }))
      .toBe('WUDHU');
  });

  // Test 10
  it('10. Employee / Back of House spaces have correct labels', () => {
    expect(getHumanObjectLabel({ id: 'employee-mess-01', metadata: { spaceType: 'employee_mess' } }))
      .toBe('EMPLOYEE MESS');
    expect(getHumanObjectLabel({ id: 'employee-restroom-01', metadata: { spaceType: 'employee_restroom' } }))
      .toBe('EMPLOYEE TOILET');
    expect(getHumanObjectLabel({ id: 'employee-parking-01', metadata: { spaceType: 'employee_parking' } }))
      .toBe('PARKIR MOTOR KARYAWAN');
  });

  // Test 11
  it('11. Storage & Logistics spaces have correct labels', () => {
    expect(getHumanObjectLabel({ id: 'parts-warehouse-01', metadata: { spaceType: 'parts_warehouse' } }))
      .toBe('SPAREPART WAREHOUSE');
    expect(getHumanObjectLabel({ id: 'waste-compound-01', metadata: { spaceType: 'waste_compound' } }))
      .toBe('WASTE AREA');
    expect(getHumanObjectLabel({ id: 'compressor-room-01', metadata: { spaceType: 'compressor_room' } }))
      .toBe('COMPRESSOR ROOM');
  });

  // Test 12
  it('12. Legacy objects without bayIndex still produce valid labels and no service hallucination', () => {
    const legacyBay: LayoutObject = {
      id: 'bay-02',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'SERVICE_BAY' },
    };
    const label = getHumanObjectLabel(legacyBay);
    expect(label).toBe('SERVICE BAY 02');
    expect(label).not.toContain('undefined');

    const veryLegacyBay: LayoutObject = {
      id: 'bay-05',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
    };
    expect(getHumanObjectLabel(veryLegacyBay)).toBe('SERVICE BAY 05');

    // No service metadata -> no hallucinated services
    const services = getObjectServicesList({ metadata: { bayType: 'SERVICE_BAY' } });
    expect(services).toEqual([]);
  });
});
