import { describe, it, expect } from 'vitest';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';

describe('debug 20x32', () => {
   it('logs placements', () => {
      const standard = demoStandardFixture as unknown as WorkshopStandard;
      const accessor = new StandardAccessor(standard);
      const generator = new CandidateGenerator();

      const advancedZoningInput = {
        site: { width: 25, length: 40, roadSide: 'south' as const, roadWidth: 8 },
        building: { width: 20, length: 32 },
        program: {
          vehicleClassKey: 'vehicle.mpv',
          customerZoneRequired: true,
          futureExpansionBays: 0,
          equipment: [],
          bays: [
            { serviceType: 'general_service' as const, quantity: 2 },
            { serviceType: 'spooring' as const, quantity: 1 },
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
            employeeMotorcycleParking: true,
          },
        },
        accessPoints: [
          { id: 'entry-main', type: 'entrance' as const, wall: 'south' as const, offsetMeters: 10, widthMeters: 4.0 },
          { id: 'exit-main', type: 'exit' as const, wall: 'south' as const, offsetMeters: 16, widthMeters: 4.0 },
        ],
      };
      
      const candidate = generator.generate(advancedZoningInput as any, accessor);
      console.log('STATUS:', candidate.status);
      for (const o of candidate.objects as any[]) {
        console.log(o.id, 'placementZone:', o.metadata?.placementZone, 'y:', o.geometry?.y, 'x:', o.geometry?.x, 'w:', o.geometry?.width, 'l:', o.geometry?.length);
      }
   });
});
