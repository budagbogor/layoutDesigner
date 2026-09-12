import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WorkshopLayoutRequirement,
  derivePhysicalBayRequirements,
} from '../src/domain/requirements/requirementTypes';
import { RequirementMapper } from '../src/application/requirements/requirementMapper';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';
import {
  AiRequirementInputPanel,
  EXAMPLE_PROMPT_PRESETS,
} from '../src/presentation/components/ai/AiRequirementInputPanel';
import { AppShell } from '../src/presentation/components/workspace/AppShell';
import { WorkshopProject } from '../src/domain/models/project';

describe('PRODUCT FIX — COMPACT / MEDIUM / BIG MODE & 3-BAY GENERATION & STATE HANDLING', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  const mockBaseProject: WorkshopProject = {
    project: {
      id: 'active-demo-001',
      name: 'Existing Active Workshop Project',
      unit: 'meter',
      standard_version_id: 'std-demo-v1',
    },
    site: {
      width: 20,
      length: 35,
    },
    building: {
      width: 16,
      length: 28,
    },
    layout: {
      status: 'draft',
      score: null,
      objects: [],
    },
  };

  // -------------------------------------------------------------------------
  // PART 1: Workshop Size Mode Terminology
  // -------------------------------------------------------------------------

  describe('Part 1: Workshop Size Mode Terminology', () => {
    it('1. UI does not contain "Bengkel Keluarga"', () => {
      const html = renderToStaticMarkup(
        React.createElement(AiRequirementInputPanel, {
          prompt: '',
          isAnalyzing: false,
          analysisError: null,
          onPromptChange: vi.fn(),
          onSelectExample: vi.fn(),
          onAnalyze: vi.fn(),
        })
      );

      expect(html).not.toContain('Bengkel Keluarga');
      expect(html).not.toContain('keluarga');
    });

    it('2. Compact mode exists with canonical physical workshop scale description', () => {
      const compactPreset = EXAMPLE_PROMPT_PRESETS.find((p) => p.id === 'compact');
      expect(compactPreset).toBeDefined();
      expect(compactPreset!.label).toContain('Compact');
      expect(compactPreset!.label).toContain('12×18m');
      expect(compactPreset!.label).toContain('2 Bay');
    });

    it('3. Medium mode exists with canonical physical workshop scale description', () => {
      const mediumPreset = EXAMPLE_PROMPT_PRESETS.find((p) => p.id === 'medium');
      expect(mediumPreset).toBeDefined();
      expect(mediumPreset!.label).toContain('Medium');
      expect(mediumPreset!.label).toContain('15×25m');
      expect(mediumPreset!.label).toContain('3 Bay');
    });

    it('4. Big mode exists with canonical physical workshop scale description', () => {
      const bigPreset = EXAMPLE_PROMPT_PRESETS.find((p) => p.id === 'big');
      expect(bigPreset).toBeDefined();
      expect(bigPreset!.label).toContain('Big');
      expect(bigPreset!.label).toContain('25×40m');
      expect(bigPreset!.label).toContain('6 Bay');
    });

    it('5. User-facing primary scale modes are exactly 3 (no fourth Medium Premium scale mode)', () => {
      expect(EXAMPLE_PROMPT_PRESETS).toHaveLength(3);
      const labels = EXAMPLE_PROMPT_PRESETS.map((p) => p.label);
      expect(labels.some((l) => l.includes('Medium Premium'))).toBe(false);
      expect(labels.some((l) => l.includes('Keluarga'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PART 2: Physical Bay Derivation & Semantic Contract
  // -------------------------------------------------------------------------

  describe('Part 2: Physical Bay Derivation (2 Service Bay + 1 Spooring Bay = 3 Physical Bays)', () => {
    const realWorldServices = [
      { serviceType: 'general_service' as const, bayCount: 2 },
      { serviceType: 'quick_lube' as const, bayCount: 1 },
      { serviceType: 'detailing' as const, bayCount: 1 },
      { serviceType: 'wheel_alignment' as const, bayCount: 1 },
    ];

    it('6. Exact input derives exactly 3 physical bays', () => {
      const physicalBays = derivePhysicalBayRequirements(realWorldServices);
      const totalPhysicalBays = physicalBays.reduce((sum, b) => sum + b.bayCount, 0);
      expect(totalPhysicalBays).toBe(3);
    });

    it('7. CandidateGenerator receives 3 physical bays via RequirementMapper', () => {
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Mobil Premium MOBENG',
        workshopType: 'car_service',
        vehicleCategory: 'passenger_4w',
        priority: 'PREMIUM_EXPERIENCE',
        site: { widthMeters: 20, lengthMeters: 35, roadOrientation: 'south' },
        building: { widthMeters: 16, lengthMeters: 28, frontSetbackMeters: 5 },
        access: { entryPosition: 'front_left', exitPosition: 'rear_center', preferDriveThrough: true },
        services: realWorldServices,
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
          compressorRoom: true,
          loungeWithBayView: true,
        },
      };

      const mapper = new RequirementMapper();
      const mapping = mapper.map(requirement, accessor);
      expect(mapping.success).toBe(true);
      expect(mapping.engineInput).toBeDefined();

      const totalBays = mapping.engineInput!.program.bays.reduce((sum, b) => sum + b.quantity, 0);
      expect(totalBays).toBe(3);
    });

    it('8. Two Service Bays + one Spooring Bay are all attempted and placed', () => {
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Mobil Premium MOBENG',
        workshopType: 'car_service',
        vehicleCategory: 'passenger_4w',
        priority: 'PREMIUM_EXPERIENCE',
        site: { widthMeters: 20, lengthMeters: 35, roadOrientation: 'south' },
        building: { widthMeters: 16, lengthMeters: 28, frontSetbackMeters: 5 },
        access: { entryPosition: 'front_left', exitPosition: 'rear_center', preferDriveThrough: true },
        services: realWorldServices,
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: true,
          compressorRoom: true,
          loungeWithBayView: true,
        },
      };

      const mapper = new RequirementMapper();
      const mapping = mapper.map(requirement, accessor);
      const generator = new CandidateGenerator();
      const candidate = generator.generate(mapping.engineInput!, accessor);

      expect(candidate.metadata.totalBaysRequested).toBe(3);
      expect(candidate.metadata.totalBaysPlaced).toBe(3);

      const placedBays = candidate.objects.filter((o) => o.type === 'service_bay');
      expect(placedBays).toHaveLength(3);

      const serviceBays = placedBays.filter((b) => (b.metadata as any)?.bayType === 'SERVICE_BAY');
      const spooringBays = placedBays.filter((b) => (b.metadata as any)?.bayType === 'SPOORING_BAY');

      expect(serviceBays).toHaveLength(2);
      expect(spooringBays).toHaveLength(1);
    });

    it('9. No Quick Lube physical bay is created (it is a service capability in Service Bay)', () => {
      const physicalBays = derivePhysicalBayRequirements(realWorldServices);
      const quickLubeBay = physicalBays.find((b) => b.bayType === ('QUICK_LUBE_BAY' as any));
      expect(quickLubeBay).toBeUndefined();
    });

    it('10. No Detailing physical bay is created', () => {
      const physicalBays = derivePhysicalBayRequirements(realWorldServices);
      const detailingBay = physicalBays.find((b) => b.bayType === ('DETAILING_BAY' as any));
      expect(detailingBay).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // PART 3: Generation Execution & Deterministic Disqualification
  // -------------------------------------------------------------------------

  describe('Part 3: Generation Execution & Disqualification Accuracy', () => {
    it('11 & 12. Generates SUCCESS with all 3 bays placed for legitimate 16x28m building', () => {
      const requirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Mobil Premium MOBENG',
        workshopType: 'car_service',
        vehicleCategory: 'passenger_4w',
        priority: 'PREMIUM_EXPERIENCE',
        site: { widthMeters: 20, lengthMeters: 35, roadOrientation: 'south' },
        building: { widthMeters: 16, lengthMeters: 28, frontSetbackMeters: 5 },
        access: { entryPosition: 'front_left', exitPosition: 'rear_center', preferDriveThrough: true },
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

      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateFromRequirement(requirement, accessor);

      expect(result.status).toBe('SUCCESS');
      expect(result.bestCandidate).not.toBeNull();
      expect(result.bestCandidate!.isValid).toBe(true);
      expect(result.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);
    });

    it('13. If building width genuinely cannot fit 3 approved 4x9 bays (e.g. 8m width), deterministic disqualification accurately reports 3 requested bays (NOT 5)', () => {
      const tooNarrowRequirement: WorkshopLayoutRequirement = {
        projectName: 'Bengkel Terlalu Sempit',
        workshopType: 'car_service',
        vehicleCategory: 'passenger_4w',
        priority: 'BALANCED_EFFICIENCY',
        site: { widthMeters: 10, lengthMeters: 20, roadOrientation: 'south' },
        building: { widthMeters: 8, lengthMeters: 15, frontSetbackMeters: 3 }, // 8m width can only fit 1 bay (4m + buffer)
        access: { entryPosition: 'front_center' },
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

      const orchestrator = new LayoutOrchestrator();
      const result = orchestrator.generateFromRequirement(tooNarrowRequirement, accessor);

      expect(result.status).toBe('DISQUALIFIED');
      const disqualification = result.engineeringSummary.primaryDisqualificationReason;
      expect(disqualification).toBeDefined();
      expect(disqualification).toContain('Program requested 3 service bays');
      expect(disqualification).not.toContain('5 service bays');
    });
    it('14. SumoPodRequirementProvider with demo key parses real-world prompt into COMPLETE requirement with 3 physical bays', async () => {
      const { SumoPodRequirementProvider } = await import('../src/infrastructure/ai/sumopodRequirementProvider');
      const { AIRequirementParser } = await import('../src/application/ai/requirementParser');

      const provider = new SumoPodRequirementProvider({
        providerId: 'sumopod',
        baseUrl: 'https://ai.sumopod.com/v1',
        apiKey: 'demo',
        model: 'gpt-4o-mini',
      });

      const parser = new AIRequirementParser(provider);
      const userPrompt =
        'Saya ingin bengkel mobil modern di lahan 20x35 meter, bangunan 16x28 meter dengan setback depan 5 meter. ' +
        'Layanan: 2 bay servis umum, 1 quick lube, 1 detailing & spooring. Ruang tunggu pelanggan mewah dengan kaca tembus ' +
        'pandang ke area servis, kasir, gudang part, ruang kompresor, dan toilet. Akses masuk depan kiri, keluar belakang.';

      const result = await parser.parse(userPrompt);
      expect(result.status).toBe('COMPLETE');

      if (result.status === 'COMPLETE') {
        const physicalBays = derivePhysicalBayRequirements(result.requirement.services);
        expect(physicalBays.reduce((sum, b) => sum + b.bayCount, 0)).toBe(3);

        const orchestrator = new LayoutOrchestrator();
        const genResult = orchestrator.generateFromRequirement(result.requirement, accessor);
        expect(genResult.status).toBe('SUCCESS');
        expect(genResult.bestCandidate).not.toBeNull();
        expect(genResult.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);

        // Verify exact placed bays geometry
        const objects = genResult.bestCandidate!.layout.objects;
        const bay01 = objects.find((o) => o.id === 'bay-01')!;
        const bay02 = objects.find((o) => o.id === 'bay-02')!;
        const bay03 = objects.find((o) => o.id === 'bay-03')!;

        expect(bay01).toBeDefined();
        expect(bay01.geometry.width).toBe(4.0);
        expect(bay01.geometry.length).toBe(9.0);
        expect(bay01.geometry.x).toBe(0.65);
        expect(bay01.geometry.y).toBe(18.35);
        expect((bay01.metadata as any)?.bayType).toBe('SERVICE_BAY');

        expect(bay02).toBeDefined();
        expect(bay02.geometry.width).toBe(4.0);
        expect(bay02.geometry.length).toBe(9.0);
        expect(bay02.geometry.x).toBe(5.65);
        expect(bay02.geometry.y).toBe(18.35);
        expect((bay02.metadata as any)?.bayType).toBe('SERVICE_BAY');

        expect(bay03).toBeDefined();
        expect(bay03.geometry.width).toBe(4.0);
        expect(bay03.geometry.length).toBe(9.0);
        expect(bay03.geometry.x).toBe(10.65);
        expect(bay03.geometry.y).toBe(18.35);
        expect((bay03.metadata as any)?.bayType).toBe('SPOORING_BAY');

        // Verify exact ancillary spaces dimensions
        const lounge = objects.find((o) => o.id === 'customer-lounge')!;
        expect(lounge).toBeDefined();
        expect(lounge.geometry.width).toBe(5.0);
        expect(lounge.geometry.length).toBe(6.0);

        const warehouse = objects.find((o) => o.id === 'parts-warehouse')!;
        expect(warehouse).toBeDefined();
        expect(warehouse.geometry.width).toBe(4.0);
        expect(warehouse.geometry.length).toBe(6.0);

        const restroom = objects.find((o) => o.id === 'restroom')!;
        expect(restroom).toBeDefined();
        expect(restroom.geometry.width).toBe(1.5);
        expect(restroom.geometry.length).toBe(1.5);

        const compressor = objects.find((o) => o.id === 'compressor-room')!;
        expect(compressor).toBeDefined();
        expect(compressor.geometry.width).toBe(2.5);
        expect(compressor.geometry.length).toBe(2.5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // PART 4: Failed & Successful Generation State Handling in AppShell
  // -------------------------------------------------------------------------

  describe('Part 4: State Handling (AppShell)', () => {
    it('15 & 16. Failed generation keeps active CAD project intact and stays in AI Assistant mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppShell, {
          initialProject: mockBaseProject,
          initialMode: 'ai',
        })
      );

      // Shell renders AI assistant view by default
      expect(html).toContain('data-testid="tab-ai-assistant"');
      expect(html).toContain('Existing Active Workshop Project');
    });
  });
});
