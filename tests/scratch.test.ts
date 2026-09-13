import { describe, it, expect } from 'vitest';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import testStandard from '../data/demo-standard.json';

describe('scratch test', () => {
   it('logs', () => {
       const standardInput = {
           site: { width: 16, length: 28, roadSide: 'south', roadWidth: 8 },
           building: { width: 16, length: 28 },
           program: {
             vehicleClassKey: 'vehicle.mpv',
             customerZoneRequired: true,
             futureExpansionBays: 0,
             equipment: [],
             bays: [{ serviceType: 'general_service', quantity: 3 }],
             ancillarySpaces: {
               customerLounge: true,
               employeeMess: true,
             },
           },
       };
       const eastInput = {
          ...standardInput,
          site: { ...standardInput.site, roadSide: 'east' as any }
       };

       const accessor = new StandardAccessor(testStandard as any);
       const generator = new CandidateGenerator();
       const candidate = generator.generate(eastInput as any, accessor);
       console.log("REJECTIONS:", JSON.stringify(candidate.rejections, null, 2));
   });
});
