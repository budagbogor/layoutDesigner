import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import testStandard from '../data/demo-standard.json';

describe('scratch 8m test', () => {
   it('logs geometry', () => {
       const tooNarrowRequirement = {
        projectName: 'Bengkel Terlalu Sempit',
        workshopType: 'car_service' as const,
        vehicleCategory: 'passenger_4w' as const,
        priority: 'BALANCED_EFFICIENCY' as const,
        site: { widthMeters: 10, lengthMeters: 20, roadOrientation: 'south' as const },
        building: { widthMeters: 8, lengthMeters: 15, frontSetbackMeters: 3 },
        access: { entryPosition: 'front_center' as const },
        services: [
          { serviceType: 'general_service', bayCount: 2 },
          { serviceType: 'wheel_alignment', bayCount: 1 },
        ],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

       const accessor = new StandardAccessor(testStandard as any);
       const orchestrator = new LayoutOrchestrator();
       const result = orchestrator.generateFromRequirement(tooNarrowRequirement, accessor);
       
       console.log("REASON:", result.engineeringSummary.primaryDisqualificationReason);
       console.log("BREAKDOWN:", JSON.stringify(result.engineeringSummary.disqualificationBreakdown, null, 2));
   });
});
