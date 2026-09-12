import { describe, it, expect, vi } from 'vitest';
import { SumoPodRequirementProvider } from '@/infrastructure/ai/sumopodRequirementProvider';
import { AIRequirementParser } from '@/application/ai/requirementParser';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

describe('Regression & Semantic Accuracy Tests — Real World Prompt Audit', () => {
  const baseConfig = {
    apiKey: 'sumo_test_key_12345',
    model: 'claude-sonnet-4-6',
  };

  // -------------------------------------------------------------------------
  // 1. Real User Prompt: Accurate Spooring & No Hallucinated Exit
  // -------------------------------------------------------------------------

  describe('1. Real User Prompt Extraction Accuracy', () => {
    const realUserPrompt =
      'Saya ingin membuat bengkel mobil modern di lahan 20 x 30 meter. Bangunan bengkel berukuran 18 x 25 meter. Saya membutuhkan 6 bay servis umum, 2 bay kaki-kaki, 1 bay untuk ban, dan 1 bay spooring. Sediakan ruang tunggu pelanggan, kasir, gudang sparepart, dan toilet. Kendaraan masuk dari bagian depan tengah. Saya ingin layout yang efisien tetapi tetap nyaman untuk pelanggan dan teknisi. Kategori kendaraan MPV.';

    it('maps spooring to wheel_alignment (NOT inspection) and leaves exitPosition omitted', async () => {
      // Mock LLM correctly returning the semantic extraction according to improved system prompt
      const mockLlmResponse = {
        confidence: 0.95,
        extractedRequirement: {
          projectName: 'Bengkel Mobil Modern',
          workshopType: 'car_service',
          vehicleCategory: 'mpv',
          priority: 'BALANCED_EFFICIENCY',
          site: { widthMeters: 20, lengthMeters: 30 },
          building: { widthMeters: 18, lengthMeters: 25 },
          access: {
            entryPosition: 'front_center',
            // exitPosition MUST be omitted / undefined!
          },
          services: [
            { serviceType: 'general_service', bayCount: 6 },
            { serviceType: 'brake_suspension', bayCount: 2 },
            { serviceType: 'tire_service', bayCount: 1 },
            { serviceType: 'wheel_alignment', bayCount: 1 }, // Spooring mapped to wheel_alignment!
          ],
          ancillarySpaces: {
            customerLounge: true,
            cashierOffice: true,
            partsWarehouse: true,
            restroom: true,
          },
        },
        reasoning: 'Extracted all operational specifications accurately.',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockLlmResponse) } }],
        }),
      } as Response);

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse(realUserPrompt);

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        const req = result.requirement;

        // 1. Spooring is wheel_alignment, NOT inspection!
        const alignmentService = req.services.find((s) => s.serviceType === 'wheel_alignment');
        const inspectionService = req.services.find((s) => s.serviceType === 'inspection');
        expect(alignmentService).toBeDefined();
        expect(alignmentService?.bayCount).toBe(1);
        expect(inspectionService).toBeUndefined();

        // Verify all 4 service categories and bay counts: 6, 2, 1, 1
        expect(req.services.find((s) => s.serviceType === 'general_service')?.bayCount).toBe(6);
        expect(req.services.find((s) => s.serviceType === 'brake_suspension')?.bayCount).toBe(2);
        expect(req.services.find((s) => s.serviceType === 'tire_service')?.bayCount).toBe(1);
        expect(req.services.find((s) => s.serviceType === 'wheel_alignment')?.bayCount).toBe(1);

        // 2. Exit position is NOT invented (undefined / omitted)
        expect(req.access.entryPosition).toBe('front_center');
        expect(req.access.exitPosition).toBeUndefined();
        expect(req.access.preferDriveThrough).toBeFalsy();

        // 3. Vehicle category is exact MPV (not arbitrarily converted to sedan)
        expect(req.vehicleCategory).toBe('mpv');

        // 4. Dimensions & Ancillaries
        expect(req.site.widthMeters).toBe(20);
        expect(req.site.lengthMeters).toBe(30);
        expect(req.building.widthMeters).toBe(18);
        expect(req.building.lengthMeters).toBe(25);
        expect(req.ancillarySpaces.customerLounge).toBe(true);
        expect(req.ancillarySpaces.cashierOffice).toBe(true);
        expect(req.ancillarySpaces.partsWarehouse).toBe(true);
        expect(req.ancillarySpaces.restroom).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Negative Prompt: Unknown Must Remain Unknown
  // -------------------------------------------------------------------------

  describe('2. Negative Prompt (Incomplete Input → NEEDS_CLARIFICATION)', () => {
    const incompletePrompt = 'Saya ingin membuat bengkel mobil di lahan 20x30 meter.';

    it('does not invent vehicle category, exit position, service bays, or parking', async () => {
      // Mock LLM returning partial extraction without hallucinating missing fields
      const mockPartialLlmResponse = {
        confidence: 0.35,
        extractedRequirement: {
          projectName: 'Bengkel Mobil',
          workshopType: 'car_service',
          site: { widthMeters: 20, lengthMeters: 30 },
          // vehicleCategory: UNDEFINED (not invented!)
          // building: UNDEFINED (not invented!)
          // access: UNDEFINED (not invented!)
          // services: UNDEFINED (not invented!)
        },
        clarificationQuestions: [
          'Kategori kendaraan apa yang akan dilayani (MPV, Sedan, SUV)?',
          'Berapa ukuran bangunan bengkel?',
          'Layanan apa saja yang ingin disediakan dan berapa jumlah baynya?',
          'Di mana posisi pintu masuk kendaraan?',
        ],
        reasoning: 'Hanya tipe bengkel dan ukuran lahan yang diberikan user.',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockPartialLlmResponse) } }],
        }),
      } as Response);

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse(incompletePrompt);

      expect(result.status).toBe('NEEDS_CLARIFICATION');
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(result.confidence).toBeLessThan(0.7);
        // Default 4-wheel passenger car category is assigned deterministically as passenger_4w
        expect(result.partialRequirement.vehicleCategory).toBe('passenger_4w');
        expect(result.partialRequirement.services).toBeUndefined();
        expect(result.partialRequirement.access?.exitPosition).toBeUndefined();
        expect(result.partialRequirement.parking).toBeUndefined();
        expect(result.questions.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
