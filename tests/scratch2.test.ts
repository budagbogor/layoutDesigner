import { describe, it, expect } from 'vitest';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import testStandard from '../data/demo-standard.json';

describe('scratch test', () => {
   it('logs', () => {
       const requirement = {
           projectName: 'Bengkel Mobil Premium MOBENG',
           workshopType: 'car_service' as const,
           vehicleCategory: 'passenger_4w' as const,
           priority: 'PREMIUM_EXPERIENCE' as const,
           site: { widthMeters: 20, lengthMeters: 35, roadOrientation: 'south' as const },
           building: { widthMeters: 16, lengthMeters: 28, frontSetbackMeters: 5 },
           access: { entryPosition: 'front_left' as const, exitPosition: 'rear_center' as const, preferDriveThrough: true },
           services: [
             { serviceType: 'general_service', bayCount: 2 },
             { serviceType: 'quick_lube', bayCount: 1 },
             { serviceType: 'detailing', bayCount: 1 },
             { serviceType: 'wheel_alignment', bayCount: 1 },
           ],
           ancillarySpaces: {
             customerLounge: true,
             cashierOffice: true,
             partsWarehouse: true,
             restroom: true,
             compressorRoom: true,
             loungeWithBayView: true,
           },
       };
       const accessor = new StandardAccessor(testStandard as any);
       const orchestrator = new LayoutOrchestrator();
       const result = orchestrator.generateFromRequirement(requirement, accessor);
       console.log("STATUS:", result.status);
       console.log("REJECTIONS:", JSON.stringify(result.engineeringSummary, null, 2));
   });
});
