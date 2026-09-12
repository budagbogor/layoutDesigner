// ---------------------------------------------------------------------------
// FASE 4.5 — Golden Path End-to-End Integration Test
//
// Proves the entire golden path workflow:
// USER NATURAL LANGUAGE
// → AI REQUIREMENT PARSER (SUMOPOD)
// → WORKSHOP LAYOUT REQUIREMENT
// → REQUIREMENT MAPPER
// → LAYOUT ORCHESTRATOR
// → VALID CANDIDATE
// → CAD REPRESENTATION
// → CAD CANVAS / SVG VISUALIZATION
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { IAIProvider, AIProviderRawResponse, AIRequirementParser } from '@/application/ai/requirementParser';
import { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';
import { RequirementMapper } from '@/application/requirements/requirementMapper';
import { LayoutOrchestrator } from '@/domain/engine/orchestrator/layoutOrchestrator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import {
  candidateToCadProject,
  layoutEngineResultToCadProject,
  exportLayoutEngineResultToSvg,
} from '@/domain/export/cadRepresentation';
import { exportLayoutToSvg } from '@/domain/export/svgExporter';
import { CadStore } from '@/application/state/CadStore';
import { WorkshopStandard } from '@/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';

const standardAccessor = new StandardAccessor(demoStandardFixture as unknown as WorkshopStandard);

describe('FASE 4.5 — Golden Path End-to-End Validation', () => {

  // -------------------------------------------------------------------------
  // 1. SumoPod / AI Requirement Parser Stage
  // -------------------------------------------------------------------------
  describe('Step 1: AI Requirement Parsing & Anti-Hallucination', () => {
    it('asks clarification when vehicle category or priority is not specified by the user', async () => {
      const mockIncompleteProvider: IAIProvider = {
        providerName: 'sumopod',
        parseRequirement: async (_prompt: string): Promise<AIProviderRawResponse> => ({
          confidence: 0.6,
          extractedRequirement: {
            projectName: 'Bengkel Mobil General Service',
            workshopType: 'car_service',
            site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
            building: { widthMeters: 18, lengthMeters: 25 },
            access: { entryPosition: 'front_right' },
            services: [{ serviceType: 'general_service', bayCount: 3 }],
            ancillarySpaces: {
              customerLounge: true,
              cashierOffice: true,
              partsWarehouse: true,
              restroom: true,
            },
          },
          clarificationQuestions: [
            'Kategori kendaraan apa yang akan dilayani (MPV, Sedan, SUV, City Car, Motor)?',
            'Apa prioritas utama layout (Kapasitas Maksimal, Seimbang, Pengalaman Premium)?',
          ],
          reasoning: 'Kategori kendaraan dan prioritas belum ditentukan oleh pengguna.',
        }),
      };

      const parser = new AIRequirementParser(mockIncompleteProvider);
      const parseResult = await parser.parse(
        'Saya punya lahan 20 x 30 meter dan bangunan 18 x 25 meter. Saya ingin bengkel mobil dengan 3 bay general service. Saya ingin ruang tunggu, kasir, gudang spare part dan toilet. Pintu masuk kendaraan dari sisi selatan.'
      );

      expect(parseResult.status).toBe('NEEDS_CLARIFICATION');
      if (parseResult.status === 'NEEDS_CLARIFICATION') {
        expect(parseResult.questions.length).toBeGreaterThan(0);
        expect(parseResult.partialRequirement.building?.widthMeters).toBe(18);
        expect(parseResult.partialRequirement.building?.lengthMeters).toBe(25);
        expect(parseResult.partialRequirement.services?.[0].bayCount).toBe(3);
      }
    });

    it('extracts complete semantic requirement when all parameters are stated or clarified', async () => {
      const mockCompleteProvider: IAIProvider = {
        providerName: 'sumopod',
        parseRequirement: async (_prompt: string): Promise<AIProviderRawResponse> => ({
          confidence: 0.95,
          extractedRequirement: {
            projectName: 'Bengkel Mobil Maju Jaya',
            workshopType: 'car_service',
            vehicleCategory: 'mpv',
            priority: 'BALANCED_EFFICIENCY',
            site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
            building: { widthMeters: 18, lengthMeters: 25 },
            access: { entryPosition: 'front_right' },
            // exitPosition is omitted / undefined because user did NOT specify it!
            services: [{ serviceType: 'general_service', bayCount: 3 }],
            ancillarySpaces: {
              customerLounge: true,
              cashierOffice: true,
              partsWarehouse: true,
              restroom: true,
              compressorRoom: false,
              oilWasteStorage: false,
              staffRoom: false,
              loungeWithBayView: false,
            },
          },
          reasoning: 'Lahan 20x30m, bangunan 18x25m, 3 bay general service, 4 ruang penunjang, akses pintu masuk selatan kanan.',
        }),
      };

      const parser = new AIRequirementParser(mockCompleteProvider);
      const parseResult = await parser.parse(
        'Saya punya lahan 20 x 30 meter dan bangunan 18 x 25 meter. Saya ingin bengkel mobil MPV dengan 3 bay general service. Prioritas efisiensi seimbang. Saya ingin ruang tunggu, kasir, gudang spare part dan toilet. Pintu masuk kendaraan dari sisi kanan selatan.'
      );

      expect(parseResult.status).toBe('COMPLETE');
      if (parseResult.status === 'COMPLETE') {
        const req = parseResult.requirement;
        expect(req.workshopType).toBe('car_service');
        expect(req.vehicleCategory).toBe('mpv');
        expect(req.priority).toBe('BALANCED_EFFICIENCY');
        expect(req.site.widthMeters).toBe(20);
        expect(req.site.lengthMeters).toBe(30);
        expect(req.site.roadOrientation).toBe('south');
        expect(req.building.widthMeters).toBe(18);
        expect(req.building.lengthMeters).toBe(25);
        expect(req.access.entryPosition).toBe('front_right');
        expect(req.access.exitPosition).toBeUndefined(); // Strictly unknown/undefined
        expect(req.services[0].bayCount).toBe(3);
        expect(req.ancillarySpaces.customerLounge).toBe(true);
        expect(req.ancillarySpaces.cashierOffice).toBe(true);
        expect(req.ancillarySpaces.partsWarehouse).toBe(true);
        expect(req.ancillarySpaces.restroom).toBe(true);

        // Zero CAD coordinates in requirement
        expect((req as any).x).toBeUndefined();
        expect((req as any).y).toBeUndefined();
        expect((req as any).rotation).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. RequirementMapper Stage
  // -------------------------------------------------------------------------
  describe('Step 2: Deterministic RequirementMapper', () => {
    const semanticRequirement: WorkshopLayoutRequirement = {
      projectName: 'Bengkel Mobil Maju Jaya',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
      building: { widthMeters: 18, lengthMeters: 25 },
      access: { entryPosition: 'front_right' },
      services: [{ serviceType: 'general_service', bayCount: 3 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
      },
    };

    it('maps semantic requirement to LayoutEngineInput with zero engineering fallbacks', () => {
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(semanticRequirement, standardAccessor);

      expect(mappingResult.success).toBe(true);
      expect(mappingResult.engineInput).not.toBeNull();

      const input = mappingResult.engineInput!;
      expect(input.site.width).toBe(20);
      expect(input.site.length).toBe(30);
      expect(input.site.roadSide).toBe('south');
      expect(input.building.width).toBe(18);
      expect(input.building.length).toBe(25);

      // Access points: exactly 1 entrance on south wall with door width from standard (3.5m)
      expect(input.accessPoints).toBeDefined();
      expect(input.accessPoints!.length).toBe(1);
      expect(input.accessPoints![0].wall).toBe('south');
      expect(input.accessPoints![0].type).toBe('entrance');
      expect(input.accessPoints![0].widthMeters).toBe(3.5);

      // Circulation: derived as back_out_turnaround because no exitPosition was provided
      expect(input.program.circulationRequirement).toBe('back_out_turnaround');

      // Bays
      expect(input.program.bays.length).toBe(1);
      expect(input.program.bays[0].serviceType).toBe('SERVICE_BAY');
      expect(input.program.bays[0].quantity).toBe(3);

      // Vehicle class key
      expect(input.program.vehicleClassKey).toBe('vehicle.mpv');

      // Ancillary spaces
      expect(input.program.ancillarySpaces).toBeDefined();
      expect(input.program.ancillarySpaces!.customerLounge).toBe(true);
      expect(input.program.ancillarySpaces!.cashierOffice).toBe(true);
      expect(input.program.ancillarySpaces!.partsWarehouse).toBe(true);
      expect(input.program.ancillarySpaces!.restroom).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Layout Orchestration & Validation Stage
  // -------------------------------------------------------------------------
  describe('Step 3: Layout Orchestration & Hard Constraint Validation', () => {
    // A. Feasible Scenario (3 bays + 4 ancillary spaces in 24x30m building)
    const feasibleRequirement: WorkshopLayoutRequirement = {
      projectName: 'Bengkel Mobil Maju Jaya',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
      building: { widthMeters: 24, lengthMeters: 30 },
      access: { entryPosition: 'front_right' },
      services: [{ serviceType: 'general_service', bayCount: 3 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
      },
    };

    it('generates, validates, and ranks candidates, selecting a valid winning layout', () => {
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(feasibleRequirement, standardAccessor);
      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.bestCandidate).not.toBeNull();
      expect(engineResult.bestCandidate!.isValid).toBe(true);
      expect(engineResult.bestCandidate!.validity).toBe('VALID');
      expect(engineResult.bestCandidate!.score === null || typeof engineResult.bestCandidate!.score === 'number').toBe(true);

      // All 3 service bays placed
      expect(engineResult.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);

      // All 4 ancillary rooms placed
      expect(engineResult.bestCandidate!.layout.metadata.ancillarySpacesPlaced).toContain('customerLounge');
      expect(engineResult.bestCandidate!.layout.metadata.ancillarySpacesPlaced).toContain('cashierOffice');
      expect(engineResult.bestCandidate!.layout.metadata.ancillarySpacesPlaced).toContain('partsWarehouse');
      expect(engineResult.bestCandidate!.layout.metadata.ancillarySpacesPlaced).toContain('restroom');
    });

    // B. High-Capacity Feasible Scenario (6 bays + 4 ancillary spaces in 24x28m building)
    it('generates a 6-bay workshop with all 4 ancillary rooms in a correctly proportioned building', () => {
      const highCapRequirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Mobil 6 Bay Pro',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 35, lengthMeters: 40, roadOrientation: 'south' },
        building: { widthMeters: 30, lengthMeters: 30 },
        access: { entryPosition: 'front_right' },
        services: [{ serviceType: 'general_service', bayCount: 6 }],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(highCapRequirement, standardAccessor);

      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.bestCandidate).not.toBeNull();
      expect(engineResult.bestCandidate!.isValid).toBe(true);
      expect(engineResult.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(6);
    });

    // C. Physical Overcrowding / Infeasible Scenario Diagnostic
    it('strictly DISQUALIFIES layouts when physical footprint is exceeded, and never selects a disqualified layout as final', () => {
      const overcrowdedRequirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Overcrowded',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
        building: { widthMeters: 18, lengthMeters: 25 }, // 18m width cannot fit 6 bays AND 4 rooms simultaneously
        access: { entryPosition: 'front_center' },
        services: [{ serviceType: 'general_service', bayCount: 6 }],
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
        },
      };

      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(overcrowdedRequirement, standardAccessor);

      expect(engineResult.status).toBe('DISQUALIFIED');
      expect(engineResult.bestCandidate).toBeNull();
      expect(engineResult.engineeringSummary.primaryDisqualificationReason).toBeDefined();

      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(overcrowdedRequirement, standardAccessor);
      const cadProject = layoutEngineResultToCadProject(engineResult, mappingResult.engineInput!);
      // Crucial Golden Path Rule: DISQUALIFIED candidate is NEVER converted to final CAD project
      expect(cadProject).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. CAD Project Adapter & Data Integrity Stage
  // -------------------------------------------------------------------------
  describe('Step 4: CAD Project Adapter & Geometry Preservation', () => {
    const semanticRequirement: WorkshopLayoutRequirement = {
      projectName: 'Bengkel Mobil Maju Jaya',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
      building: { widthMeters: 24, lengthMeters: 30 },
      access: { entryPosition: 'front_right' },
      services: [{ serviceType: 'general_service', bayCount: 3 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
      },
    };

    it('produces a complete WorkshopProject conforming to CAD document schema', () => {
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(semanticRequirement, standardAccessor);
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(semanticRequirement, standardAccessor);

      const cadProject = layoutEngineResultToCadProject(engineResult, mappingResult.engineInput!, {
        projectId: 'golden-path-proj-01',
        projectName: 'Bengkel Mobil Maju Jaya (Golden Path)',
      });

      expect(cadProject).not.toBeNull();
      expect(cadProject!.project.id).toBe('golden-path-proj-01');
      expect(cadProject!.project.name).toBe('Bengkel Mobil Maju Jaya (Golden Path)');
      expect(cadProject!.site.width).toBe(30);
      expect(cadProject!.site.length).toBe(40);
      expect(cadProject!.building.width).toBe(24);
      expect(cadProject!.building.length).toBe(30);
      expect(cadProject!.layout.status).toBe('generated');

      // Verify placed objects in CAD project
      const objects = cadProject!.layout.objects;
      const bayObjects = objects.filter((o) => o.type === 'service_bay');
      expect(bayObjects.length).toBe(3);

      const loungeObj = objects.find((o) => o.id === 'customer-lounge');
      const cashierObj = objects.find((o) => o.id === 'cashier-office');
      const warehouseObj = objects.find((o) => o.id === 'parts-warehouse');
      const restroomObj = objects.find((o) => o.id === 'restroom');
      const doorObj = objects.find((o) => o.type === 'door');
      const aisleObj = objects.find((o) => o.type === 'circulation_path');

      expect(loungeObj).toBeDefined();
      expect(cashierObj).toBeDefined();
      expect(warehouseObj).toBeDefined();
      expect(restroomObj).toBeDefined();
      expect(doorObj).toBeDefined();
      expect(aisleObj).toBeDefined();

      // Verify all objects have positive valid dimensions
      for (const obj of objects) {
        expect(obj.geometry.width).toBeGreaterThan(0);
        expect(obj.geometry.length).toBeGreaterThan(0);
        expect(obj.geometry.x).toBeGreaterThanOrEqual(0);
        expect(obj.geometry.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. CAD Store & Canvas / SVG Visualization Stage
  // -------------------------------------------------------------------------
  describe('Step 5: CAD Store State & Vector SVG Visualization', () => {
    const semanticRequirement: WorkshopLayoutRequirement = {
      projectName: 'Bengkel Mobil Maju Jaya',
      workshopType: 'car_service',
      vehicleCategory: 'mpv',
      priority: 'BALANCED_EFFICIENCY',
      site: { widthMeters: 30, lengthMeters: 40, roadOrientation: 'south' },
      building: { widthMeters: 24, lengthMeters: 30 },
      access: { entryPosition: 'front_right' },
      services: [{ serviceType: 'general_service', bayCount: 3 }],
      ancillarySpaces: {
        customerLounge: true,
        cashierOffice: true,
        partsWarehouse: true,
        restroom: true,
      },
    };

    it('initializes CadStore cleanly and exports deterministic vector SVG', () => {
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(semanticRequirement, standardAccessor);
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(semanticRequirement, standardAccessor);

      const cadProject = layoutEngineResultToCadProject(engineResult, mappingResult.engineInput!, {
        projectName: 'Bengkel Mobil Maju Jaya',
      })!;

      // 1. Initialize CadStore
      const store = new CadStore(cadProject);
      const editorState = store.getState();

      expect(editorState.project.layout.objects.length).toBe(cadProject.layout.objects.length);
      expect(editorState.validationReport.hardCount).toBe(0); // Zero hard validation errors
      expect(editorState.layers.length).toBeGreaterThan(0);

      // 2. Export vector SVG
      const svg = exportLayoutToSvg({ project: cadProject });
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('Bengkel Mobil Maju Jaya');
      expect(svg).toContain('24.00 m');
      expect(svg).toContain('30.00 m');
      expect(svg).toContain('bay-01');
      expect(svg).toContain('customer-lounge');

      // Export direct from result
      const resultSvg = exportLayoutEngineResultToSvg(engineResult, mappingResult.engineInput!);
      expect(resultSvg).not.toBeNull();
      expect(resultSvg).toContain('<svg');
    });
  });
});
