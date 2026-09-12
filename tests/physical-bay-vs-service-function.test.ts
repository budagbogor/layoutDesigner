import { describe, it, expect } from 'vitest';
import {
  WorkshopLayoutRequirement,
  derivePhysicalBayRequirements,
  getCanonicalBayTypeForService,
  MOBENG_BAY_SERVICES,
  MOBENG_BAY_DEFAULT_LIFTS,
} from '../src/domain/requirements/requirementTypes';
import { RequirementMapper } from '../src/application/requirements/requirementMapper';
import { LayoutOrchestrator } from '../src/domain/engine/orchestrator/layoutOrchestrator';
import { CandidateGenerator } from '../src/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';
import { AIRequirementParser, IAIProvider, AIProviderRawResponse } from '../src/application/ai/requirementParser';

describe('PRODUCT FIX: SERVICE FUNCTION ≠ PHYSICAL BAY & EXACT REAL-WORLD 3-BAY VERIFICATION', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  // -------------------------------------------------------------------------
  // 1. Semantic Function vs Physical Bay Derivation (Domain Level)
  // -------------------------------------------------------------------------

  describe('1. derivePhysicalBayRequirements() Domain Foundation', () => {
    it('1.1: maps "2 bay servis umum" alone to 2 SERVICE_BAY', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'general_service', bayCount: 2 },
      ]);
      expect(physicalBays).toHaveLength(1);
      expect(physicalBays[0].bayType).toBe('SERVICE_BAY');
      expect(physicalBays[0].bayCount).toBe(2);
      expect(physicalBays[0].requiredLifts).toContain('4_post_lift');
    });

    it('1.2: does NOT add extra physical bays for "1 quick lube" when 2 service bays exist', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'general_service', bayCount: 2 },
        { serviceType: 'quick_lube', bayCount: 1 },
      ]);
      expect(physicalBays).toHaveLength(1);
      expect(physicalBays[0].bayType).toBe('SERVICE_BAY');
      expect(physicalBays[0].bayCount).toBe(2); // max(2, 1) = 2, NOT 2 + 1 = 3
      expect(physicalBays[0].supportedServices).toContain('general_service');
      expect(physicalBays[0].supportedServices).toContain('quick_lube');
    });

    it('1.3: does NOT add extra physical bays for "1 Rasa Mesin Baru"', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'general_service', bayCount: 2 },
        { serviceType: 'service_rasa_mesin_baru', bayCount: 1 },
      ]);
      expect(physicalBays).toHaveLength(1);
      expect(physicalBays[0].bayType).toBe('SERVICE_BAY');
      expect(physicalBays[0].bayCount).toBe(2);
    });

    it('1.4: maps "spooring" / "wheel alignment" to 1 SPOORING_BAY (4x9m, 4-post lift)', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'wheel_alignment', bayCount: 1 },
      ]);
      expect(physicalBays).toHaveLength(1);
      expect(physicalBays[0].bayType).toBe('SPOORING_BAY');
      expect(physicalBays[0].bayCount).toBe(1);
      expect(physicalBays[0].requiredLifts).toContain('4_post_lift');
    });

    it('1.5: maps "kaki-kaki" and "general repair" to GENERAL_REPAIR_BAY (4x9m, 2-post lift)', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'general_repair', bayCount: 1 },
        { serviceType: 'brake_suspension', bayCount: 1 },
      ]);
      expect(physicalBays).toHaveLength(1);
      expect(physicalBays[0].bayType).toBe('GENERAL_REPAIR_BAY');
      expect(physicalBays[0].bayCount).toBe(1); // max(1, 1) = 1
      expect(physicalBays[0].requiredLifts).toContain('2_post_lift');
    });

    it('1.6: treats "detailing" as service/function only (physical bay increment = 0)', () => {
      const physicalBays = derivePhysicalBayRequirements([
        { serviceType: 'detailing', bayCount: 1 },
      ]);
      expect(physicalBays).toHaveLength(0); // Detailing has no physical bay type in MOBENG
    });

    it('1.7: EXACT REAL-WORLD COMBINATION: "2 bay servis umum, 1 quick lube, 1 detailing & spooring" produces exactly 3 physical bays', () => {
      const services = [
        { serviceType: 'general_service' as const, bayCount: 2 },
        { serviceType: 'quick_lube' as const, bayCount: 1 },
        { serviceType: 'detailing' as const, bayCount: 1 },
        { serviceType: 'wheel_alignment' as const, bayCount: 1 },
      ];

      const physicalBays = derivePhysicalBayRequirements(services);
      expect(physicalBays).toHaveLength(2);

      const serviceBay = physicalBays.find((b) => b.bayType === 'SERVICE_BAY');
      const spooringBay = physicalBays.find((b) => b.bayType === 'SPOORING_BAY');

      expect(serviceBay).toBeDefined();
      expect(serviceBay!.bayCount).toBe(2);

      expect(spooringBay).toBeDefined();
      expect(spooringBay!.bayCount).toBe(1);

      const totalPhysicalBays = physicalBays.reduce((sum, b) => sum + b.bayCount, 0);
      expect(totalPhysicalBays).toBe(3); // 2 + 1 = 3, NEVER 5
    });
  });

  // -------------------------------------------------------------------------
  // 2. RequirementMapper & LayoutEngineInput Pipeline
  // -------------------------------------------------------------------------

  describe('2. RequirementMapper & LayoutEngineInput Integrity', () => {
    const realWorldRequirement: WorkshopLayoutRequirement = {
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

    it('2.1: RequirementMapper produces LayoutEngineInput with exactly 3 physical bays', () => {
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(realWorldRequirement, accessor);

      expect(mappingResult.success).toBe(true);
      expect(mappingResult.engineInput).toBeDefined();

      const engineInput = mappingResult.engineInput!;
      const totalBaysInProgram = engineInput.program.bays.reduce((sum, b) => sum + b.quantity, 0);

      expect(totalBaysInProgram).toBe(3); // MUST BE 3, NOT 5
      expect(engineInput.program.bays).toEqual([
        {
          serviceType: 'SERVICE_BAY',
          quantity: 2,
          requiredEquipment: ['4_post_lift'],
        },
        {
          serviceType: 'SPOORING_BAY',
          quantity: 1,
          requiredEquipment: ['4_post_lift'],
        },
      ]);
    });

    it('2.2: lifts in equipment list match physical bay quantities (no double counting)', () => {
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(realWorldRequirement, accessor);
      const engineInput = mappingResult.engineInput!;

      const fourPostLifts = engineInput.program.equipment.find((e) => e.equipmentType === '4_post_lift');
      expect(fourPostLifts).toBeDefined();
      expect(fourPostLifts!.quantity).toBe(3); // 2 SERVICE_BAY + 1 SPOORING_BAY = 3 lifts
    });
  });

  // -------------------------------------------------------------------------
  // 3. CandidateGenerator & LayoutOrchestrator Execution
  // -------------------------------------------------------------------------

  describe('3. CandidateGenerator & Orchestrator Execution for Real-World Prompt', () => {
    const realWorldRequirement: WorkshopLayoutRequirement = {
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

    it('3.1: CandidateGenerator receives 3 physical bays and places all 3 bays successfully inside 16x28m building', () => {
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(realWorldRequirement, accessor);
      const generator = new CandidateGenerator();

      const candidateLayout = generator.generate(mappingResult.engineInput!, accessor);
      expect(candidateLayout.metadata.totalBaysRequested).toBe(3);
      expect(candidateLayout.metadata.totalBaysPlaced).toBe(3);

      const placedBays = candidateLayout.objects.filter((o) => o.type === 'service_bay');
      expect(placedBays).toHaveLength(3);

      // Verify all bays are standard 4x9m
      for (const bay of placedBays) {
        expect(bay.geometry.width).toBe(4.0);
        expect(bay.geometry.length).toBe(9.0);
      }

      // Verify approved MOBENG Space Standard V1 dimensions for ancillary spaces
      const loungeObj = candidateLayout.objects.find((o) => o.id === 'customer-lounge');
      expect(loungeObj).toBeDefined();
      expect(loungeObj!.geometry.width).toBe(5.0);
      expect(loungeObj!.geometry.length).toBe(6.0);
      expect(loungeObj!.metadata?.includesCashierReception).toBe(true);

      const warehouseObj = candidateLayout.objects.find((o) => o.id === 'parts-warehouse');
      expect(warehouseObj).toBeDefined();
      expect(warehouseObj!.geometry.width).toBe(4.0);
      expect(warehouseObj!.geometry.length).toBe(6.0);

      const restroomObj = candidateLayout.objects.find((o) => o.id === 'restroom');
      expect(restroomObj).toBeDefined();
      expect(restroomObj!.geometry.width).toBe(1.5);
      expect(restroomObj!.geometry.length).toBe(1.5);

      const compressorObj = candidateLayout.objects.find((o) => o.id === 'compressor-room');
      expect(compressorObj).toBeDefined();
      expect(compressorObj!.geometry.width).toBe(2.5);
      expect(compressorObj!.geometry.length).toBe(2.5);
    });

    it('3.2: LayoutOrchestrator generates SUCCESS status with valid candidate layout', () => {
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(realWorldRequirement, accessor);

      if (engineResult.status !== 'SUCCESS') {
        console.log('DISQUALIFICATION SUMMARY:', JSON.stringify(engineResult.engineeringSummary, null, 2));
        console.log('ALL CANDIDATES REJECTIONS:', engineResult.allCandidates.map((c) => ({
          strategy: c.strategy,
          arr: c.arrangement,
          rejections: c.rejectionReasons,
          validity: c.validity,
          isValid: c.isValid,
        })));
      }

      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.bestCandidate).not.toBeNull();
      expect(engineResult.bestCandidate!.isValid).toBe(true);
      expect(engineResult.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);

      const bestObjects = engineResult.bestCandidate!.layout.objects;
      const bestLounge = bestObjects.find((o) => o.id === 'customer-lounge');
      expect(bestLounge).toBeDefined();
      expect(bestLounge!.geometry.width).toBe(5.0);
      expect(bestLounge!.geometry.length).toBe(6.0);

      const bestWarehouse = bestObjects.find((o) => o.id === 'parts-warehouse');
      expect(bestWarehouse).toBeDefined();
      expect(bestWarehouse!.geometry.width).toBe(4.0);
      expect(bestWarehouse!.geometry.length).toBe(6.0);

      const bestRestroom = bestObjects.find((o) => o.id === 'restroom');
      expect(bestRestroom).toBeDefined();
      expect(bestRestroom!.geometry.width).toBe(1.5);
      expect(bestRestroom!.geometry.length).toBe(1.5);

      const bestCompressor = bestObjects.find((o) => o.id === 'compressor-room');
      expect(bestCompressor).toBeDefined();
      expect(bestCompressor!.geometry.width).toBe(2.5);
      expect(bestCompressor!.geometry.length).toBe(2.5);
    });

    it('3.3: error message never reports "Program requested 5 service bays" for this input', () => {
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(realWorldRequirement, accessor);

      const allRejections = engineResult.allCandidates.flatMap((c) => c.rejectionReasons);
      for (const rej of allRejections) {
        expect(rej).not.toContain('Program requested 5 service bays');
      }
    });

    it('3.4: strictly adheres to PO-Approved Space Standards (no room shrinking, no fallback dimensions)', () => {
      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(realWorldRequirement, accessor);
      const generator = new CandidateGenerator();

      const candidateLayout = generator.generate(mappingResult.engineInput!, accessor);
      const objects = candidateLayout.objects;

      // Customer Lounge / Waiting + Reception + Cashier must be >= 5x6
      const lounge = objects.find((o) => o.id === 'customer-lounge')!;
      expect(lounge.geometry.width).toBeGreaterThanOrEqual(5.0);
      expect(lounge.geometry.length).toBeGreaterThanOrEqual(6.0);

      // Warehouse must be >= 4x6
      const warehouse = objects.find((o) => o.id === 'parts-warehouse')!;
      expect(warehouse.geometry.width).toBeGreaterThanOrEqual(4.0);
      expect(warehouse.geometry.length).toBeGreaterThanOrEqual(6.0);

      // Customer Toilet must be >= 1.5x1.5
      const toilet = objects.find((o) => o.id === 'restroom' || o.id === 'customer-restroom')!;
      expect(toilet.geometry.width).toBeGreaterThanOrEqual(1.5);
      expect(toilet.geometry.length).toBeGreaterThanOrEqual(1.5);
    });
  });

  // -------------------------------------------------------------------------
  // 4. End-to-End AI Parser to Generation Pipeline
  // -------------------------------------------------------------------------

  describe('4. Full End-to-End AI Parser → Layout Generation', () => {
    it('4.1: parses exact real-world Indonesian prompt and generates layout with 3 physical bays', async () => {
      const userPrompt =
        'Saya ingin bengkel mobil premium di lahan 20x35 meter, bangunan 16x28 meter dengan setback depan 5 meter. ' +
        'Layanan: 2 bay servis umum, 1 quick lube, 1 detailing & spooring. Ruang tunggu pelanggan mewah dengan kaca tembus ' +
        'pandang ke area servis, kasir, gudang part, ruang kompresor, dan toilet. Akses masuk depan kiri, keluar belakang.';

      const mockProvider: IAIProvider = {
        providerName: 'mock_sumopod',
        async parseRequirement(_prompt: string): Promise<AIProviderRawResponse> {
          return {
            confidence: 0.95,
            extractedRequirement: {
              projectName: 'Bengkel Mobil Premium',
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
            },
            reasoning: 'Extracted 2 general service, 1 quick lube, 1 detailing, 1 spooring into semantic requirement.',
          };
        },
      };

      const parser = new AIRequirementParser(mockProvider);
      const parseResult = await parser.parse(userPrompt);

      expect(parseResult.status).toBe('COMPLETE');
      if (parseResult.status !== 'COMPLETE') return;

      const requirement = parseResult.requirement;
      expect(requirement.services).toHaveLength(4);

      // Generate layout
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(requirement, accessor);

      expect(engineResult.status).toBe('SUCCESS');
      expect(engineResult.bestCandidate).not.toBeNull();
      expect(engineResult.bestCandidate!.layout.metadata.totalBaysPlaced).toBe(3);
    });
  });
});
