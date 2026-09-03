import { describe, it, expect, vi } from 'vitest';
import {
  SumoPodRequirementProvider,
  detectForbiddenCadFields,
} from '@/infrastructure/ai/sumopodRequirementProvider';
import {
  SumoPodAdapter,
  SumoPodConfigError,
  SumoPodAuthError,
  SumoPodNetworkError,
  SumoPodInvalidResponseError,
} from '@/infrastructure/ai/sumopodAdapter';
import { AIRequirementParser } from '@/application/ai/requirementParser';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockChatFetch(options: {
  status?: number;
  statusText?: string;
  chatContent?: string;
  rawJson?: unknown;
  networkError?: Error;
}): typeof fetch {
  return vi.fn().mockImplementation(async () => {
    if (options.networkError) {
      throw options.networkError;
    }

    const payload = options.rawJson !== undefined
      ? options.rawJson
      : {
          id: 'chatcmpl-mock-123',
          object: 'chat.completion',
          created: 1720000000,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: options.chatContent ?? '{}',
              },
              finish_reason: 'stop',
            },
          ],
        };

    return {
      ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
      status: options.status ?? 200,
      statusText: options.statusText ?? 'OK',
      json: async () => payload,
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Sample AI Chat JSON Payloads
// ---------------------------------------------------------------------------

const completeRequirementAiJson = JSON.stringify({
  confidence: 0.95,
  extractedRequirement: {
    projectName: 'Bengkel Mobeng Depok',
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
  },
  reasoning: 'Extracted all required fields from user prompt.',
});

const incompleteRequirementAiJson = JSON.stringify({
  confidence: 0.4,
  extractedRequirement: {
    projectName: 'Bengkel Baru',
    workshopType: 'car_service',
  },
  clarificationQuestions: [
    'Berapa ukuran lahan dan bangunan yang tersedia?',
    'Berapa bay servis yang ingin disediakan?',
  ],
  reasoning: 'User did not specify site or bay counts.',
});

describe('FASE 3.6 — SumoPod AIRequirementProvider', () => {
  const baseConfig = {
    apiKey: 'sumo_live_key_abcdef123456',
    model: 'gpt-4o-mini',
  };

  // -------------------------------------------------------------------------
  // 1. Valid Requirement Extraction → COMPLETE
  // -------------------------------------------------------------------------

  describe('1. Valid Requirement Extraction', () => {
    it('successfully extracts complete requirement and parser produces COMPLETE result', async () => {
      const mockFetch = createMockChatFetch({
        chatContent: completeRequirementAiJson,
      });

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse(
        'Lahan 15x25m, bangunan 12x20m, bengkel mobil 3 bay servis, ada ruang tunggu dan kasir.'
      );

      expect(result.status).toBe('COMPLETE');
      if (result.status === 'COMPLETE') {
        expect(result.requirement.projectName).toBe('Bengkel Mobeng Depok');
        expect(result.requirement.workshopType).toBe('car_service');
        expect(result.requirement.site.widthMeters).toBe(15);
        expect(result.requirement.building.widthMeters).toBe(12);
        expect(result.requirement.services[0].bayCount).toBe(3);
        expect(result.confidence).toBe(0.95);
      }

      // Verify chat completion request format
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = (mockFetch as any).mock.calls[0];
      expect(url).toBe('https://ai.sumopod.com/v1/chat/completions');
      expect(init.headers['Authorization']).toBe(`Bearer ${baseConfig.apiKey}`);
      const body = JSON.parse(init.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('Workshop Requirement Analyst');
      expect(body.messages[1].content).toContain('Lahan 15x25m');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Incomplete Prompt → Clarification
  // -------------------------------------------------------------------------

  describe('2. Incomplete Prompt → Clarification', () => {
    it('results in NEEDS_CLARIFICATION when AI returns missing data and clarification questions', async () => {
      const mockFetch = createMockChatFetch({
        chatContent: incompleteRequirementAiJson,
      });

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Saya ingin bikin bengkel mobil');

      expect(result.status).toBe('NEEDS_CLARIFICATION');
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(result.confidence).toBe(0.4);
        expect(result.questions.length).toBeGreaterThanOrEqual(2);
        expect(result.questions.some((q) => q.question.includes('ukuran') || q.question.includes('lahan'))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Malformed JSON
  // -------------------------------------------------------------------------

  describe('3. Malformed JSON', () => {
    it('returns INVALID when AI outputs invalid JSON syntax', async () => {
      const mockFetch = createMockChatFetch({
        chatContent: 'Sorry, I cannot provide JSON: { bad json',
      });

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel motor');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('malformed JSON');
      }
    });

    it('returns INVALID when API response is missing choices array', async () => {
      const mockFetch = createMockChatFetch({
        rawJson: { error: 'Unknown response format' },
      });

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('missing message content');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. CAD Geometry Leakage → Rejected
  // -------------------------------------------------------------------------

  describe('4. CAD Geometry Leakage Guard', () => {
    it('detects forbidden CAD geometry keys', () => {
      const poisoned = {
        extractedRequirement: {
          services: [{ bayCount: 3, x: 10, y: 20, rotation: 90 }],
        },
      };
      const violations = detectForbiddenCadFields(poisoned);
      expect(violations).toContain('extractedRequirement.services[0].x');
      expect(violations).toContain('extractedRequirement.services[0].y');
      expect(violations).toContain('extractedRequirement.services[0].rotation');
    });

    it('rejects AI response that leaks CAD coordinates (x, y, rotation)', async () => {
      const poisonedJson = JSON.stringify({
        confidence: 0.9,
        extractedRequirement: {
          projectName: 'Bengkel Test',
          workshopType: 'car_service',
          services: [
            { serviceType: 'general_service', bayCount: 2, x: 5.5, y: 12.0 },
          ],
        },
      });

      const mockFetch = createMockChatFetch({ chatContent: poisonedJson });
      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel 2 bay');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('forbidden CAD/engineering fields');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Hallucinated Engineering Values → Rejected
  // -------------------------------------------------------------------------

  describe('5. Hallucinated Engineering Values Guard', () => {
    it('detects wallThickness, clearance, offsetMeters, envelope, coordinates', () => {
      const engineeringPayload = {
        extractedRequirement: {
          wallThickness: 0.25,
          clearance: 1.5,
          offsetMeters: 4.0,
          envelope: 'working_envelope',
          coordinates: [10, 20],
        },
      };
      const violations = detectForbiddenCadFields(engineeringPayload);
      expect(violations).toContain('extractedRequirement.wallThickness');
      expect(violations).toContain('extractedRequirement.clearance');
      expect(violations).toContain('extractedRequirement.offsetMeters');
      expect(violations).toContain('extractedRequirement.envelope');
      expect(violations).toContain('extractedRequirement.coordinates');
    });

    it('rejects AI response containing hallucinated engineering parameters', async () => {
      const hallucinatedJson = JSON.stringify({
        confidence: 0.9,
        extractedRequirement: {
          projectName: 'Bengkel Test',
          workshopType: 'car_service',
          wallThickness: 0.2, // Hallucinated engineering parameter!
        },
      });

      const mockFetch = createMockChatFetch({ chatContent: hallucinatedJson });
      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel tembok 20cm');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('wallThickness');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. API Unauthorized (HTTP 401)
  // -------------------------------------------------------------------------

  describe('6. API Unauthorized', () => {
    it('handles HTTP 401 error and masks API key in error message', async () => {
      const mockFetch = createMockChatFetch({
        status: 401,
        statusText: 'Unauthorized',
      });

      const provider = new SumoPodRequirementProvider(
        { apiKey: 'sk_secret_1234567890abcdef', model: 'gpt-4o-mini' },
        { fetchFn: mockFetch }
      );
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel mobil');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('401');
        // Secret masking check: raw API key must NOT be revealed
        expect(result.reason).not.toContain('sk_secret_1234567890abcdef');
        expect(result.reason).toContain('sk_s...cdef');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Network Error
  // -------------------------------------------------------------------------

  describe('7. Network Error', () => {
    it('handles network failure and returns INVALID with clear diagnostic', async () => {
      const mockFetch = createMockChatFetch({
        networkError: new Error('getaddrinfo ENOTFOUND ai.sumopod.com'),
      });

      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });
      const parser = new AIRequirementParser(provider);

      const result = await parser.parse('Bengkel');

      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('Failed to reach SumoPod endpoint');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Deterministic Parsing Contract
  // -------------------------------------------------------------------------

  describe('8. Deterministic Parsing Contract', () => {
    it('produces identical output for identical prompts and identical AI responses', async () => {
      const mockFetch1 = createMockChatFetch({ chatContent: completeRequirementAiJson });
      const mockFetch2 = createMockChatFetch({ chatContent: completeRequirementAiJson });

      const provider1 = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch1 });
      const provider2 = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch2 });

      const parser1 = new AIRequirementParser(provider1);
      const parser2 = new AIRequirementParser(provider2);

      const result1 = await parser1.parse('Test prompt');
      const result2 = await parser2.parse('Test prompt');

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // -------------------------------------------------------------------------
  // 9. Provider Does Not Modify Domain Objects Directly
  // -------------------------------------------------------------------------

  describe('9. Domain Object Purity', () => {
    it('returns frozen response and does not pollute domain engine', async () => {
      const mockFetch = createMockChatFetch({ chatContent: completeRequirementAiJson });
      const provider = new SumoPodRequirementProvider(baseConfig, { fetchFn: mockFetch });

      const raw = await provider.parseRequirement('Test prompt');

      expect(Object.isFrozen(raw)).toBe(true);
      expect((raw.extractedRequirement as any).x).toBeUndefined();
      expect((raw.extractedRequirement as any).y).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Model Configuration Requirement (No Hardcoded Model)
  // -------------------------------------------------------------------------

  describe('10. Dynamic Model Configuration', () => {
    it('throws SumoPodConfigError when no model is configured', async () => {
      const provider = new SumoPodRequirementProvider({
        apiKey: 'valid_key',
        model: '', // Empty model!
      });

      await expect(provider.parseRequirement('Test')).rejects.toThrow(SumoPodConfigError);
    });

    it('uses the model specified in AIProviderConfig', async () => {
      const mockFetch = createMockChatFetch({ chatContent: completeRequirementAiJson });
      const provider = new SumoPodRequirementProvider(
        { apiKey: 'valid_key', model: 'claude-3-5-sonnet' },
        { fetchFn: mockFetch }
      );

      await provider.parseRequirement('Test');

      const [, init] = (mockFetch as any).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.model).toBe('claude-3-5-sonnet');
    });

    it('can accept pre-existing SumoPodAdapter instance', async () => {
      const mockFetch = createMockChatFetch({ chatContent: completeRequirementAiJson });
      const adapter = new SumoPodAdapter(
        { apiKey: 'valid_key', model: 'qwen-2.5-72b' },
        { fetchFn: mockFetch }
      );

      const provider = new SumoPodRequirementProvider(adapter, { fetchFn: mockFetch });
      await provider.parseRequirement('Test');

      const [, init] = (mockFetch as any).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.model).toBe('qwen-2.5-72b');
    });
  });
});
