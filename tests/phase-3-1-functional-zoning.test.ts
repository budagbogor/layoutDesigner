import { describe, it, expect } from 'vitest';
import {
  deriveFunctionalZone,
  FUNCTIONAL_ZONE_LABELS,
  getHumanObjectLabel,
  getHumanObjectTypeLabel,
  getObjectServicesList,
  FunctionalZone,
} from '@/domain/models/functionalZone';
import { LayoutObject, WorkshopProject } from '@/domain/models/project';
import { derivePhysicalBayRequirements, WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { WorkshopStandard } from '@/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';


describe('FASE 3.1 — Functional Zoning & Layout Readability Tests', () => {
  // 1-3. Workshop Bays → WORKSHOP Zone
  it('1. maps Service Bay to WORKSHOP zone', () => {
    const obj: LayoutObject = {
      id: 'bay-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'SERVICE_BAY' },
    };
    expect(deriveFunctionalZone(obj)).toBe('WORKSHOP');
  });

  it('2. maps Spooring Bay to WORKSHOP zone', () => {
    const obj: LayoutObject = {
      id: 'bay-spooring-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4.5, length: 9.5, rotation: 0 },
      metadata: { bayType: 'SPOORING_BAY' },
    };
    expect(deriveFunctionalZone(obj)).toBe('WORKSHOP');
    expect(getHumanObjectLabel(obj)).toBe('SPOORING BAY');
  });

  it('3. maps General Repair Bay to WORKSHOP zone', () => {
    const obj: LayoutObject = {
      id: 'bay-gr-01',
      type: 'service_bay',
      layer: '08-SERVICE-BAY',
      geometry: { x: 0, y: 0, width: 4, length: 9, rotation: 0 },
      metadata: { bayType: 'GENERAL_REPAIR_BAY' },
    };
    expect(deriveFunctionalZone(obj)).toBe('WORKSHOP');
    expect(getHumanObjectLabel(obj)).toBe('GENERAL REPAIR BAY');
  });

  // 4-7. Customer Spaces → CUSTOMER Zone
  it('4. maps Waiting Lounge & Reception to CUSTOMER zone', () => {
    const obj = { id: 'customer-lounge-01', type: 'zone', metadata: { spaceType: 'customer_lounge' } };
    expect(deriveFunctionalZone(obj)).toBe('CUSTOMER');
    expect(getHumanObjectLabel(obj)).toBe('WAITING + RECEPTION + CASHIER');
  });

  it('5. maps Customer Toilet to CUSTOMER zone', () => {
    const obj = { id: 'customer-restroom-01', type: 'zone', metadata: { spaceType: 'customer_restroom' } };
    expect(deriveFunctionalZone(obj)).toBe('CUSTOMER');
    expect(getHumanObjectLabel(obj)).toBe('CUSTOMER TOILET');
  });

  it('6. maps Mushola to CUSTOMER zone', () => {
    const obj = { id: 'mushola-01', type: 'zone', metadata: { spaceType: 'mushola' } };
    expect(deriveFunctionalZone(obj)).toBe('CUSTOMER');
    expect(getHumanObjectLabel(obj)).toBe('MUSHOLA');
  });

  it('7. maps Wudhu to CUSTOMER zone', () => {
    const obj = { id: 'wudhu-01', type: 'zone', metadata: { spaceType: 'wudhu' } };
    expect(deriveFunctionalZone(obj)).toBe('CUSTOMER');
    expect(getHumanObjectLabel(obj)).toBe('WUDHU');
  });

  // 8-9. Back of House → BACK_OF_HOUSE Zone
  it('8. maps Employee Mess / Staff Room to BACK_OF_HOUSE zone', () => {
    const obj = { id: 'employee-mess-01', type: 'zone', metadata: { spaceType: 'employee_mess' } };
    expect(deriveFunctionalZone(obj)).toBe('BACK_OF_HOUSE');
    expect(getHumanObjectLabel(obj)).toBe('EMPLOYEE MESS');
  });

  it('9. maps Employee Toilet to BACK_OF_HOUSE zone', () => {
    const obj = { id: 'employee-restroom-01', type: 'zone', metadata: { spaceType: 'employee_restroom' } };
    expect(deriveFunctionalZone(obj)).toBe('BACK_OF_HOUSE');
    expect(getHumanObjectLabel(obj)).toBe('EMPLOYEE TOILET');
  });

  // 10-11. Storage & Logistics → STORAGE_LOGISTICS Zone
  it('10. maps Parts Warehouse to STORAGE_LOGISTICS zone', () => {
    const obj = { id: 'parts-warehouse-01', type: 'zone', metadata: { spaceType: 'parts_warehouse' } };
    expect(deriveFunctionalZone(obj)).toBe('STORAGE_LOGISTICS');
    expect(getHumanObjectLabel(obj)).toBe('SPAREPART WAREHOUSE');
  });

  it('11. maps Waste Compound to STORAGE_LOGISTICS zone', () => {
    const obj = { id: 'waste-compound-01', type: 'zone', metadata: { spaceType: 'waste_compound' } };
    expect(deriveFunctionalZone(obj)).toBe('STORAGE_LOGISTICS');
    expect(getHumanObjectLabel(obj)).toBe('WASTE AREA');
  });

  // 12-13. Service Function vs Physical Bay Verification
  it('12. verifies Quick Lube does NOT generate extra physical bay', () => {
    const reqs = [
      { serviceType: 'general_service' as const, bayCount: 2 },
      { serviceType: 'quick_lube' as const, bayCount: 1 },
    ];
    const physicalBays = derivePhysicalBayRequirements(reqs);
    expect(physicalBays.length).toBe(1);
    expect(physicalBays[0].bayCount).toBe(2); // Only 2 physical bays requested
  });

  it('13. verifies Detailing does NOT generate extra physical bay', () => {
    const reqs = [
      { serviceType: 'general_service' as const, bayCount: 2 },
      { serviceType: 'detailing' as const, bayCount: 1 },
    ];
    const physicalBays = derivePhysicalBayRequirements(reqs);
    expect(physicalBays.length).toBe(1);
    expect(physicalBays[0].bayCount).toBe(2); // Detailing is function-only
  });

  // 14. Backward Compatibility for Legacy Projects
  it('14. handles legacy projects without zone metadata safely', () => {
    const legacyProject: WorkshopProject = {
      project: {
        id: 'proj-legacy-01',
        name: 'Bengkel Lama',
        unit: 'meter',
        standard_version_id: 'MOBENG-STD-2026.1',
      },
      site: { width: 20, length: 30 },
      building: { width: 16, length: 25 },
      layout: {
        status: 'draft',
        score: 85,
        objects: [
          {
            id: 'bay-01',
            type: 'service_bay',
            layer: '08-SERVICE-BAY',
            geometry: { x: 2, y: 5, width: 4, length: 9, rotation: 0 },
            // NO zone metadata present
          },
          {
            id: 'customer-lounge',
            type: 'zone',
            layer: '10-TEXT',
            geometry: { x: 10, y: 15, width: 4, length: 5, rotation: 0 },
            // NO zone metadata present
          },
        ],
      },
    };

    // Verify zone is safely derived deterministically without crashing
    const bayZone = deriveFunctionalZone(legacyProject.layout.objects[0]);
    const loungeZone = deriveFunctionalZone(legacyProject.layout.objects[1]);

    expect(bayZone).toBe('WORKSHOP');
    expect(loungeZone).toBe('CUSTOMER');
    expect(FUNCTIONAL_ZONE_LABELS[bayZone]).toBe('AREA SERVIS');
    expect(FUNCTIONAL_ZONE_LABELS[loungeZone]).toBe('AREA PELANGGAN');
  });

  // 15. Alternative Candidate Zone Preservation
  it('15. preserves functional zone metadata across candidate generator', () => {
    const accessor = new StandardAccessor(demoStandardFixture as unknown as WorkshopStandard);

    const requirement: WorkshopLayoutRequirement = {
      projectName: 'Bengkel Test Zone',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 20, lengthMeters: 35 },
      building: { widthMeters: 16, lengthMeters: 28 },
      access: { entryPosition: 'front_center' },
      services: [{ serviceType: 'general_service', bayCount: 3 }],

      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        compressorRoom: true,
        restroom: true,
      },
    };

    const orchestrator = new LayoutOrchestrator();
    const result = orchestrator.generateFromRequirement(requirement, accessor);

    expect(result.status).toBe('SUCCESS');
    expect(result.bestCandidate).toBeDefined();

    // Every layout object in best candidate can derive a valid FunctionalZone
    result.bestCandidate!.layout.objects.forEach((obj) => {
      const zone = deriveFunctionalZone(obj);
      expect(['CUSTOMER', 'WORKSHOP', 'BACK_OF_HOUSE', 'STORAGE_LOGISTICS']).toContain(zone);
    });
  });
});

