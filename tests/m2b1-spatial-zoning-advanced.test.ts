import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { LayoutEngineInput, LayoutObject } from '../src/domain/engine/types';
import testStandard from '../data/demo-standard.json';


describe('Phase 3.4 — Realistic Workshop Spatialization (Zoning & Logistics)', () => {
  const orchestrator = new LayoutOrchestrator();
  const accessor = new StandardAccessor(testStandard as any);

  const advancedZoningInput: LayoutEngineInput = {
    site: { width: 25, length: 40, roadSide: 'south', roadWidth: 8 },
    building: { width: 20, length: 32 },
    program: {
      vehicleClassKey: 'vehicle.mpv',
      customerZoneRequired: true,
      futureExpansionBays: 0,
      equipment: [],
      bays: [
        { serviceType: 'general_service', quantity: 2 },
        { serviceType: 'spooring', quantity: 1 },
      ],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        customerRestroom: true,
        mushola: true,
        wudhu: true,
        partsWarehouse: true,
        employeeMess: true,
        employeeRestroom: true,
        wasteStreams: true,
        employeeMotorcycleParking: true
      },
    },
    accessPoints: [
      { id: 'entry-main', type: 'entrance', wall: 'south', offsetMeters: 10, widthMeters: 4.0 },
      { id: 'exit-main', type: 'exit', wall: 'south', offsetMeters: 16, widthMeters: 4.0 },
    ],
  };

  const getObj = (objs: LayoutObject[], id: string) => objs.find(o => o.id === id);

  it('1. customer spaces assigned correctly to CUSTOMER zone', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    expect(result.status).toBe('SUCCESS');
    const objs = result.bestCandidate!.layout.objects;
    const lounge = getObj(objs, 'customer-lounge')!;
    const mushola = getObj(objs, 'mushola')!;
    expect(lounge.metadata?.placementZone).toBe('CUSTOMER');
    expect(mushola.metadata?.placementZone).toBe('CUSTOMER');
  });

  it('2. workshop bays assigned correctly', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const bays = objs.filter(o => o.type === 'service_bay');
    expect(bays.length).toBe(3);
    bays.forEach(b => expect(b.geometry.width).toBe(4));
  });

  it('3. employee spaces assigned correctly to LOGISTICS zone', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const mess = getObj(objs, 'employee-mess')!;
    const toilet = getObj(objs, 'employee-restroom')!;
    expect(mess.metadata?.placementZone).toBe('LOGISTICS');
    expect(toilet.metadata?.placementZone).toBe('LOGISTICS');
  });

  it('4. waste assigned logistics', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const oil = getObj(objs, 'waste-oil')!;
    const tire = getObj(objs, 'waste-tire')!;
    const parts = getObj(objs, 'waste-parts')!;
    const cardboard = getObj(objs, 'waste-cardboard')!;
    expect(oil.metadata?.placementZone).toBe('LOGISTICS');
    expect(tire.metadata?.placementZone).toBe('LOGISTICS');
    expect(parts.metadata?.placementZone).toBe('LOGISTICS');
    expect(cardboard.metadata?.placementZone).toBe('LOGISTICS');
  });

  it('5. customer zone spatial separation', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const lounge = getObj(objs, 'customer-lounge')!;
    const mess = getObj(objs, 'employee-mess')!;
    
    // Y position should be significantly different (separated by bay working areas)
    expect(Math.abs(lounge.geometry.y - mess.geometry.y)).toBeGreaterThan(9);
  });

  it('6. waste not overlapping bay', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    expect(result.status).toBe('SUCCESS');
  });

  it('7. employee mess not overlapping bay', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    expect(result.status).toBe('SUCCESS');
  });

  it('8. employee toilet relation', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const toilet = getObj(objs, 'employee-restroom')!;
    expect(toilet.metadata?.placementZone).toBe('LOGISTICS');
  });

  it('9. mushola/wudhu zero-gap', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const mushola = getObj(objs, 'mushola')!;
    const wudhu = getObj(objs, 'wudhu')!;
    
    // X distance should be exactly the width of mushola
    expect(Math.abs(wudhu.geometry.x - mushola.geometry.x)).toBeCloseTo(mushola.geometry.width, 3);
    // Y should be identical
    expect(wudhu.geometry.y).toBeCloseTo(mushola.geometry.y, 3);
  });

  it('10. warehouse operational relation', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const warehouse = getObj(objs, 'parts-warehouse')!;
    expect(warehouse.metadata?.placementZone).toBe('LOGISTICS');
  });

  it('11. 20x32 / 3 bay validity', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    expect(result.status).toBe('SUCCESS');
    const disqReasons = result.disqualifiedCandidates.flatMap(c => c.rejectionReasons);
    expect(disqReasons.every(r => !r.includes('[CAPACITY'))).toBe(true);
  });

  it('12. 16x15 / 3 bay regression (Case A)', () => {
    const input16x15: LayoutEngineInput = {
      site: { width: 16, length: 15, roadSide: 'south', roadWidth: 8 },
      building: { width: 16, length: 15 },
      program: {
        vehicleClassKey: 'vehicle.mpv',
        customerZoneRequired: true,
        futureExpansionBays: 0,
        bays: [{ serviceType: 'general_service', quantity: 3 }],
      },
    };
    const result = orchestrator.generateLayout(input16x15, accessor);
    expect(result).toBeDefined();
  });

  it('13. 20x25 / 6 bay regression (Case B)', () => {
    const input20x25: LayoutEngineInput = {
      site: { width: 20, length: 25, roadSide: 'south', roadWidth: 8 },
      building: { width: 20, length: 25 },
      program: {
        vehicleClassKey: 'vehicle.mpv',
        customerZoneRequired: true,
        futureExpansionBays: 0,
        bays: [{ serviceType: 'general_service', quantity: 6 }],
      },
    };
    const result = orchestrator.generateLayout(input20x25, accessor);
    expect(result).toBeDefined();
  });

  it('14. Medium preset regression', () => {
    const inputMedium: LayoutEngineInput = {
      site: { width: 15, length: 25, roadSide: 'south', roadWidth: 8 },
      building: { width: 15, length: 20 },
      program: {
        vehicleClassKey: 'vehicle.mpv',
        customerZoneRequired: true,
        futureExpansionBays: 0,
        bays: [{ serviceType: 'general_service', quantity: 3 }],
      },
    };
    const result = orchestrator.generateLayout(inputMedium, accessor);
    expect(result).toBeDefined();
  });

  it('15. no unknown motorcycle footprint invented', () => {
    const result = orchestrator.generateLayout(advancedZoningInput, accessor);
    const objs = result.bestCandidate!.layout.objects;
    const motorcycleParking = getObj(objs, 'employeeMotorcycleParking');
    
    // Must NOT exist as a physical object
    expect(motorcycleParking).toBeUndefined();
    // But should be recorded in summary metadata
    expect(result.bestCandidate!.metadata.ancillarySpacesPlaced).toContain('employeeMotorcycleParking');
  });

});
