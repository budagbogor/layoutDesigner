import { describe, it, expect } from 'vitest';
import {
  AIRequirementParser,
  IAIProvider,
  AIProviderRawResponse,
  AIParseResult,
  detectCadGeometryInResponse,
} from '@/application/ai/requirementParser';
import type { WorkshopLayoutRequirement } from '@/domain/requirements/requirementTypes';

// ---------------------------------------------------------------------------
// Mock AI Provider (Test-Only Fake — NOT a production AI)
// ---------------------------------------------------------------------------

function createMockProvider(response: AIProviderRawResponse): IAIProvider {
  return {
    providerName: 'test-mock-provider',
    async parseRequirement(_userPrompt: string): Promise<AIProviderRawResponse> {
      return response;
    },
  };
}

function createErrorProvider(error: Error): IAIProvider {
  return {
    providerName: 'test-error-provider',
    async parseRequirement(_userPrompt: string): Promise<AIProviderRawResponse> {
      throw error;
    },
  };
}

// ---------------------------------------------------------------------------
// Complete Requirement Fixture (as AI would extract it)
// ---------------------------------------------------------------------------

const completeExtracted: WorkshopLayoutRequirement = {
  projectName: 'Bengkel Mobeng Cibinong',
  workshopType: 'car_service',
  vehicleCategory: 'mpv',
  priority: 'BALANCED_EFFICIENCY',
  site: { widthMeters: 15, lengthMeters: 25 },
  building: { widthMeters: 12, lengthMeters: 20 },
  access: { entryPosition: 'front_center' },
  services: [{ serviceType: 'general_service', bayCount: 3 }],
  ancillarySpaces: {
    customerLounge: true,
    cashierOffice: true,
    partsWarehouse: true,
    restroom: true,
  },
};

describe('FASE 3.3 — AI Requirement Parser Contract', () => {
  // -------------------------------------------------------------------------
  // 1. Complete Prompt → COMPLETE
  // -------------------------------------------------------------------------

  describe('1. Complete Prompt → COMPLETE Result', () => {
    it('returns COMPLETE when AI extracts a fully valid requirement', async () => {
      const provider = createMockProvider({
        confidence: 0.95,
        extractedRequirement: completeExtracted,
        reasoning: 'All mandatory fields extracted from user prompt.',
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse(
        'Saya punya lahan 15x25m, ingin bengkel mobil 12x20m dengan 3 bay servis umum, ada ruang tunggu, kasir, gudang part, dan toilet. Pintu masuk di depan tengah.'
      );

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.projectName).toBe('Bengkel Mobeng Cibinong');
        expect(result.requirement.workshopType).toBe('car_service');
        expect(result.requirement.site.widthMeters).toBe(15);
        expect(result.requirement.site.lengthMeters).toBe(25);
        expect(result.requirement.services[0].bayCount).toBe(3);
        expect(result.confidence).toBe(0.95);
        expect(result.validationResult.isValid).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Missing Site Dimensions → NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------

  describe('2. Missing Site Dimensions → NEEDS_CLARIFICATION', () => {
    it('returns NEEDS_CLARIFICATION when site dimensions are missing', async () => {
      const partialExtracted: Partial<WorkshopLayoutRequirement> = {
        projectName: 'Bengkel Baru',
        workshopType: 'car_service',
        vehicleCategory: 'mpv',
        priority: 'BALANCED_EFFICIENCY',
        // site deliberately missing
        building: { widthMeters: 12, lengthMeters: 20 },
        access: { entryPosition: 'front_center' },
        services: [{ serviceType: 'general_service', bayCount: 3 }],
        ancillarySpaces: {
          customerLounge: false,
          cashierOffice: false,
          partsWarehouse: false,
          restroom: false,
        },
      };

      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: partialExtracted,
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Saya ingin bengkel mobil 12x20m dengan 3 bay servis');

      expect(result.status).toBe('NEEDS_CLARIFICATION');
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(result.questions.length).toBeGreaterThan(0);
        const siteQuestion = result.questions.find(
          (q) => q.field.includes('site') || q.question.toLowerCase().includes('lahan')
        );
        expect(siteQuestion).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Ambiguous Prompt (Low Confidence) → NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------

  describe('3. Ambiguous Prompt → NEEDS_CLARIFICATION', () => {
    it('returns NEEDS_CLARIFICATION when AI confidence is below threshold', async () => {
      const provider = createMockProvider({
        confidence: 0.4,
        extractedRequirement: {
          projectName: 'Bengkel',
          workshopType: 'car_service',
        },
        clarificationQuestions: [
          'Berapa ukuran lahan yang tersedia?',
          'Layanan apa saja yang ingin disediakan?',
        ],
        reasoning: 'User prompt is too vague to extract specific requirements.',
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Saya ingin buka bengkel');

      expect(result.status).toBe('NEEDS_CLARIFICATION');
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(result.confidence).toBe(0.4);
        expect(result.questions.length).toBeGreaterThanOrEqual(2);
        expect(result.reasoning).toContain('vague');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Invalid Structured Response → INVALID
  // -------------------------------------------------------------------------

  describe('4. Invalid Responses → INVALID', () => {
    it('returns INVALID when provider throws an error', async () => {
      const provider = createErrorProvider(new Error('API rate limit exceeded'));

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel motor 3 bay');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('rate limit');
      }
    });

    it('returns INVALID when prompt is empty', async () => {
      const provider = createMockProvider({
        confidence: 1.0,
        extractedRequirement: completeExtracted,
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('empty');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. AI Result Must Not Contain CAD Geometry
  // -------------------------------------------------------------------------

  describe('5. CAD Geometry Guard', () => {
    it('detects forbidden CAD geometry keys in AI response', () => {
      const withGeometry = {
        projectName: 'Test',
        site: { widthMeters: 15, lengthMeters: 25 },
        services: [
          {
            serviceType: 'general_service',
            bayCount: 3,
            x: 5.0,        // Forbidden!
            y: 10.0,       // Forbidden!
            rotation: 90,  // Forbidden!
          },
        ],
      };

      const violations = detectCadGeometryInResponse(withGeometry);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.includes('x'))).toBe(true);
      expect(violations.some((v) => v.includes('y'))).toBe(true);
      expect(violations.some((v) => v.includes('rotation'))).toBe(true);
    });

    it('allows widthMeters/lengthMeters inside site and building contexts', () => {
      const cleanResponse = {
        site: { widthMeters: 15, lengthMeters: 25 },
        building: { widthMeters: 12, lengthMeters: 20 },
      };

      const violations = detectCadGeometryInResponse(cleanResponse);
      expect(violations).toHaveLength(0);
    });

    it('returns INVALID when AI response contains CAD coordinates', async () => {
      const poisonedResponse: AIProviderRawResponse = {
        confidence: 0.95,
        extractedRequirement: {
          ...completeExtracted,
          // Injecting forbidden CAD data that AI hallucinated
          services: [
            {
              serviceType: 'general_service',
              bayCount: 3,
              x: 5.0,
              y: 10.0,
            } as any,
          ],
        },
      };

      const provider = createMockProvider(poisonedResponse);
      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel 3 bay');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('forbidden CAD geometry');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Provider Swappability (Domain Engine Independence)
  // -------------------------------------------------------------------------

  describe('6. Provider Swappability', () => {
    it('works with any object conforming to IAIProvider interface', async () => {
      // Provider A: Simulates one LLM
      const providerA = createMockProvider({
        confidence: 0.9,
        extractedRequirement: completeExtracted,
      });

      // Provider B: Simulates a different LLM with different name
      const providerB: IAIProvider = {
        providerName: 'alternative-llm',
        async parseRequirement() {
          return {
            confidence: 0.88,
            extractedRequirement: {
              ...completeExtracted,
              projectName: 'From Provider B',
            },
          };
        },
      };

      const parserA = new AIRequirementParser(providerA);
      const parserB = new AIRequirementParser(providerB);

      const resultA = await parserA.parse('Test prompt');
      const resultB = await parserB.parse('Test prompt');

      expect(resultA.status).toBe('COMPLETE');
      expect(resultB.status).toBe('COMPLETE');

      if (resultA.status === 'COMPLETE' && resultB.status === 'COMPLETE') {
        expect(resultA.requirement.projectName).toBe('Bengkel Mobeng Cibinong');
        expect(resultB.requirement.projectName).toBe('From Provider B');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Deterministic Validation
  // -------------------------------------------------------------------------

  describe('7. Deterministic Validation', () => {
    it('produces identical results for identical inputs', async () => {
      const provider = createMockProvider({
        confidence: 0.95,
        extractedRequirement: completeExtracted,
      });

      const parser = new AIRequirementParser(provider);

      const result1 = await parser.parse('Test');
      const result2 = await parser.parse('Test');

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // -------------------------------------------------------------------------
  // 8. Result Immutability
  // -------------------------------------------------------------------------

  describe('8. Result Immutability', () => {
    it('returns deeply frozen COMPLETE result', async () => {
      const provider = createMockProvider({
        confidence: 0.95,
        extractedRequirement: completeExtracted,
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Test');

      expect(Object.isFrozen(result)).toBe(true);
      if (result.status === 'COMPLETE') {
        expect(Object.isFrozen(result.requirement)).toBe(true);
      }
    });

    it('returns deeply frozen NEEDS_CLARIFICATION result', async () => {
      const provider = createMockProvider({
        confidence: 0.3,
        extractedRequirement: { projectName: 'Partial' },
        clarificationQuestions: ['What size?'],
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel');

      expect(Object.isFrozen(result)).toBe(true);
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(Object.isFrozen(result.questions)).toBe(true);
        expect(Object.isFrozen(result.partialRequirement)).toBe(true);
      }
    });

    it('returns deeply frozen INVALID result', async () => {
      const parser = new AIRequirementParser(createMockProvider({
        confidence: 1.0,
        extractedRequirement: completeExtracted,
      }));
      const result = await parser.parse('');

      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Default 4-Wheel Passenger Car & Elimination of Vehicle Clarification
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 9. Default 4-Wheel Passenger Car & Explicit Restriction Preservation
  // -------------------------------------------------------------------------

  describe('9. Default 4-Wheel Passenger Car & Explicit Restriction Preservation', () => {
    const baseExtracted: Partial<WorkshopLayoutRequirement> = {
      site: { widthMeters: 20, lengthMeters: 35 },
      building: { widthMeters: 16, lengthMeters: 28 },
      access: { entryPosition: 'front_left' },
      services: [{ serviceType: 'general_service', bayCount: 2 }],
    };

    it('1. "bengkel mobil" → defaults to passenger_4w scope', async () => {
      const provider = createMockProvider({
        confidence: 0.9,
        extractedRequirement: { ...baseExtracted, projectName: 'Bengkel Mobil' },
        clarificationQuestions: ['Kategori kendaraan apa yang akan dilayani?'],
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Saya ingin bengkel mobil di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('passenger_4w');
      }
    });

    it('2. "bengkel mobil modern" → defaults to passenger_4w scope', async () => {
      const provider = createMockProvider({
        confidence: 0.9,
        extractedRequirement: { ...baseExtracted, projectName: 'Bengkel Mobil Modern' },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel mobil modern di lahan 20x35m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('passenger_4w');
      }
    });

    it('3. no vehicle clarification question for default case', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
        clarificationQuestions: [
          'Kategori kendaraan apa yang akan dilayani? (MPV, Sedan, SUV)',
          'Berapa target kapasitas ruang tunggu?',
        ],
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel mobil 2 bay servis di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
    });

    it('4. preserves explicit MPV restriction ("khusus MPV")', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel mobil khusus MPV di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('mpv');
      }
    });

    it('5. preserves explicit SUV restriction ("khusus SUV")', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel khusus SUV di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('suv');
      }
    });

    it('6. preserves explicit Sedan restriction ("khusus sedan")', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel mobil khusus sedan di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('sedan');
      }
    });

    it('7. preserves explicit City Car restriction ("khusus city car")', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel mobil khusus city car di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('city_car');
      }
    });

    it('8. preserves multiple explicit categories ("khusus MPV dan SUV")', async () => {
      const provider = createMockProvider({
        confidence: 0.85,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Bengkel khusus MPV dan SUV di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).toBe('passenger_4w');
        expect(result.requirement.vehicleCategories).toEqual(expect.arrayContaining(['mpv', 'suv']));
      }
    });

    it('9. ensures NO MPV fallback is used for generic "bengkel mobil"', async () => {
      const provider = createMockProvider({
        confidence: 0.9,
        extractedRequirement: { ...baseExtracted },
      });

      const parser = new AIRequirementParser(provider);
      const result = await parser.parse('Saya ingin membangun bengkel mobil di lahan 20x35m, bangunan 16x28m');

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.vehicleCategory).not.toBe('mpv');
        expect(result.requirement.vehicleCategory).toBe('passenger_4w');
      }
    });
  });
});
