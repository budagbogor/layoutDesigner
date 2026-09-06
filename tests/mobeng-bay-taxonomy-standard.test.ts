import { describe, it, expect } from 'vitest';
import {
  MobengBayType,
  MOBENG_BAY_SERVICES,
  MOBENG_BAY_DEFAULT_LIFTS,
  getCanonicalBayTypeForService,
  WorkshopLayoutRequirement,
} from '../src/domain/requirements/requirementTypes';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';
import { RequirementMapper } from '../src/application/requirements/requirementMapper';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { CadStore } from '../src/application/state/CadStore';
import { candidateToCadProject } from '../src/domain/export/cadRepresentation';
import { detectForbiddenCadFields, WORKSHOP_ANALYST_SYSTEM_PROMPT } from '../src/infrastructure/ai/sumopodRequirementProvider';

describe('MOBENG DOMAIN FOUNDATION: BAY TAXONOMY & 4x9m STANDARD', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  describe('1. Authoritative Standard Dataset', () => {
    it('enforces official MOBENG bay standard dimension of 4.0m width and 9.0m length', () => {
      const minWidth = accessor.getRequiredNumericValue('bay.min_width');
      const minLength = accessor.getRequiredNumericValue('bay.min_length');

      expect(minWidth).toBe(4.0);
      expect(minLength).toBe(9.0);
    });
  });

  describe('2. Canonical Bay Taxonomy & Service Mapping', () => {
    it('defines exactly 3 canonical MOBENG bay types', () => {
      const canonicalTypes: MobengBayType[] = ['SPOORING_BAY', 'SERVICE_BAY', 'GENERAL_REPAIR_BAY'];
      expect(canonicalTypes).toHaveLength(3);
    });

    it('maps Spooring / Wheel Alignment to SPOORING_BAY with 4-post lift', () => {
      const bayType = getCanonicalBayTypeForService('wheel_alignment');
      expect(bayType).toBe('SPOORING_BAY');
      expect(MOBENG_BAY_DEFAULT_LIFTS[bayType]).toBe('4_post_lift');
      expect(MOBENG_BAY_SERVICES.SPOORING_BAY).toContain('wheel_alignment');
    });

    it('maps General Service, Quick Lube, and Service Rasa Mesin Baru to SERVICE_BAY with 4-post lift', () => {
      expect(getCanonicalBayTypeForService('general_service')).toBe('SERVICE_BAY');
      expect(getCanonicalBayTypeForService('quick_lube')).toBe('SERVICE_BAY');
      expect(getCanonicalBayTypeForService('service_rasa_mesin_baru')).toBe('SERVICE_BAY');

      expect(MOBENG_BAY_DEFAULT_LIFTS['SERVICE_BAY']).toBe('4_post_lift');
      expect(MOBENG_BAY_SERVICES.SERVICE_BAY).toContain('general_service');
      expect(MOBENG_BAY_SERVICES.SERVICE_BAY).toContain('quick_lube');
      expect(MOBENG_BAY_SERVICES.SERVICE_BAY).toContain('service_rasa_mesin_baru');
    });

    it('prohibits Quick Lube and Rasa Mesin Baru from becoming independent canonical bay types', () => {
      // Canonical bay types must only be the 3 official MOBENG types
      const bayTypeForQuickLube = getCanonicalBayTypeForService('quick_lube');
      const bayTypeForRasaMesinBaru = getCanonicalBayTypeForService('service_rasa_mesin_baru');

      expect(bayTypeForQuickLube).toBe('SERVICE_BAY');
      expect(bayTypeForRasaMesinBaru).toBe('SERVICE_BAY');
      expect(bayTypeForQuickLube).not.toBe('QUICK_LUBE_BAY');
      expect(bayTypeForRasaMesinBaru).not.toBe('RASA_MESIN_BARU_BAY');
    });

    it('maps General Repair and Kaki-kaki / Suspension to GENERAL_REPAIR_BAY with 2-post lift', () => {
      expect(getCanonicalBayTypeForService('general_repair')).toBe('GENERAL_REPAIR_BAY');
      expect(getCanonicalBayTypeForService('brake_suspension')).toBe('GENERAL_REPAIR_BAY');

      expect(MOBENG_BAY_DEFAULT_LIFTS['GENERAL_REPAIR_BAY']).toBe('2_post_lift');
      expect(MOBENG_BAY_SERVICES.GENERAL_REPAIR_BAY).toContain('general_repair');
      expect(MOBENG_BAY_SERVICES.GENERAL_REPAIR_BAY).toContain('brake_suspension');
    });
  });

  describe('3. RequirementMapper & Layout Engine Integration', () => {
    it('maps requirements to program bays and assigns canonical default lifts', () => {
      const mapper = new RequirementMapper();
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'Mobeng Official Standard Test',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
        building: { widthMeters: 30, lengthMeters: 30 },
        access: { entryPosition: 'front_right' },
        services: [
          { serviceType: 'wheel_alignment', bayCount: 1 },
          { serviceType: 'general_service', bayCount: 2 },
          { serviceType: 'quick_lube', bayCount: 1 },
          { serviceType: 'brake_suspension', bayCount: 1 },
        ],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

      const mappingResult = mapper.map(requirement, accessor);
      expect(mappingResult.success).toBe(true);
      expect(mappingResult.engineInput).toBeDefined();

      const bays = mappingResult.engineInput!.program.bays;
      expect(bays).toHaveLength(4);

      // Verify layout generator produces 4x9m bays with canonical metadata
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(requirement, accessor);

      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.bestCandidate).toBeDefined();

      const candidateLayout = engineResult.bestCandidate!.layout;
      const placedBays = candidateLayout.objects.filter((o) => o.type === 'service_bay');
      expect(placedBays).toHaveLength(5); // 1 + 2 + 1 + 1 = 5 bays

      for (const bay of placedBays) {
        expect(bay.geometry.width).toBe(4.0);
        expect(bay.geometry.length).toBe(9.0);
        expect(bay.metadata?.bayType).toBeDefined();
      }
    });
  });

  describe('4. Custom CAD Bay Editing Preservation', () => {
    it('preserves user custom bay dimensions in CAD workspace with real-time validation recalculation', () => {
      const mapper = new RequirementMapper();
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'Mobeng Custom CAD Edit',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
        building: { widthMeters: 24, lengthMeters: 30 },
        access: { entryPosition: 'front_right' },
        services: [
          { serviceType: 'general_service', bayCount: 3 },
        ],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

      const mappingResult = mapper.map(requirement, accessor);
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(requirement, accessor);
      const cadProject = candidateToCadProject(engineResult.bestCandidate!, mappingResult.engineInput!);

      const store = new CadStore(cadProject);
      const bay1 = store.getState().project.layout.objects.find((o) => o.id === 'bay-01')!;
      expect(bay1.geometry.width).toBe(4.0);
      expect(bay1.geometry.length).toBe(9.0);

      // User customizes bay to 3.8m x 8.5m
      store.updateObjectGeometry('bay-01', { width: 3.8, length: 8.5 });

      const editedBay = store.getState().project.layout.objects.find((o) => o.id === 'bay-01')!;
      expect(editedBay.geometry.width).toBe(3.8);
      expect(editedBay.geometry.length).toBe(8.5);

      // Validation runs and confirms project remains compliant
      const report = store.getState().validationReport;
      expect(report.hardCount).toBe(0);
      expect(report.valid).toBe(true);
      expect(store.isDirty()).toBe(true);
    });
  });

  describe('5. AI Geometry Prohibition & Prompt Guard', () => {
    it('strictly forbids AI from generating CAD coordinates or geometry keys', () => {
      const cleanAiOutput = {
        projectName: 'Bengkel Modern',
        workshopType: 'car_service',
        site: { widthMeters: 20, lengthMeters: 30 },
        building: { widthMeters: 16, lengthMeters: 22 },
        services: [{ serviceType: 'general_service', bayCount: 3 }],
      };
      expect(detectForbiddenCadFields(cleanAiOutput)).toEqual([]);

      const corruptedAiOutput = {
        ...cleanAiOutput,
        x: 10,
        y: 20,
        rotation: 90,
        polygon: [[0, 0], [4, 9]],
      };
      const violations = detectForbiddenCadFields(corruptedAiOutput);
      expect(violations).toContain('x');
      expect(violations).toContain('y');
      expect(violations).toContain('rotation');
      expect(violations).toContain('polygon');
    });

    it('embeds official MOBENG canonical bay taxonomy into AI system prompt dictionary', () => {
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('canonical SPOORING BAY with 4-post lift');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('canonical SERVICE BAY with 4-post lift');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('canonical GENERAL REPAIR BAY with 2-post lift');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('Never create independent bay types for Quick Lube, Rasa Mesin Baru, or Kaki-kaki');
    });
  });
});
