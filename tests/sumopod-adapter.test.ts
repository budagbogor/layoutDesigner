import { describe, it, expect, vi } from 'vitest';
import {
  SumoPodAdapter,
  SumoPodConfigError,
  SumoPodAuthError,
  SumoPodNetworkError,
  SumoPodInvalidResponseError,
} from '@/infrastructure/ai/sumopodAdapter';
import {
  maskApiKey,
  getSumoPodEnvConfig,
  IConfigurableAIProvider,
  SUMOPOD_DEFAULT_BASE_URL,
} from '@/application/ai/providerConfig';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockFetch(options: {
  status?: number;
  statusText?: string;
  json?: unknown;
  jsonError?: Error;
  networkError?: Error;
}): typeof fetch {
  return vi.fn().mockImplementation(async () => {
    if (options.networkError) {
      throw options.networkError;
    }
    return {
      ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
      status: options.status ?? 200,
      statusText: options.statusText ?? 'OK',
      json: async () => {
        if (options.jsonError) {
          throw options.jsonError;
        }
        return options.json;
      },
    } as unknown as Response;
  });
}

const sampleOpenAIModelsResponse = {
  object: 'list',
  data: [
    { id: 'gpt-4o', object: 'model', created: 1715368132, owned_by: 'system' },
    { id: 'gpt-4o-mini', object: 'model', created: 1721172741, owned_by: 'system' },
    { id: 'claude-3-5-sonnet', object: 'model', created: 1718841600, owned_by: 'anthropic' },
    { id: 'qwen-2.5-72b', object: 'model', created: 1726650000, owned_by: 'qwen' },
  ],
};

describe('FASE 3.5 — SumoPod AI Provider Adapter', () => {
  // -------------------------------------------------------------------------
  // 1. Connection Health & Model Listing (Happy Path)
  // -------------------------------------------------------------------------

  describe('1. testConnection() — Success', () => {
    it('returns CONNECTED status when /models responds with valid payload', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: sampleOpenAIModelsResponse,
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_live_key_abcdef123456' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.status).toBe('CONNECTED');
      expect(result.availableModels).toHaveLength(4);
      expect(result.availableModels).toContain('gpt-4o-mini');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.testedAt).toBeDefined();

      // Verify request headers
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = (mockFetch as any).mock.calls[0];
      expect(url).toBe('https://ai.sumopod.com/v1/models');
      expect(init.headers['Authorization']).toBe('Bearer sumo_live_key_abcdef123456');
    });

    it('verifies that configured model exists on provider', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: sampleOpenAIModelsResponse,
      });

      const adapter = new SumoPodAdapter(
        {
          apiKey: 'sumo_key_valid',
          model: 'gpt-4o-mini',
        },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.status).toBe('CONNECTED');
      expect(result.testedModel).toBe('gpt-4o-mini');
      expect(result.message).toContain('gpt-4o-mini');
    });

    it('returns MODEL_NOT_FOUND when configured model does not exist on provider', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: sampleOpenAIModelsResponse,
      });

      const adapter = new SumoPodAdapter(
        {
          apiKey: 'sumo_key_valid',
          model: 'non-existent-custom-model-v99',
        },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('MODEL_NOT_FOUND');
      expect(result.message).toContain('non-existent-custom-model-v99');
      expect(result.availableModels).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Error Handling & Edge Cases
  // -------------------------------------------------------------------------

  describe('2. Error Handling in testConnection()', () => {
    it('returns CONFIG_ERROR when API key is empty or missing without making HTTP calls', async () => {
      const mockFetch = vi.fn();
      const adapter = new SumoPodAdapter(
        { apiKey: '   ' },
        { fetchFn: mockFetch as unknown as typeof fetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('CONFIG_ERROR');
      expect(result.message).toContain('API key');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns UNAUTHORIZED on HTTP 401', async () => {
      const mockFetch = createMockFetch({
        status: 401,
        statusText: 'Unauthorized',
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'invalid_sumopod_key_12345' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.message).toContain('401');
      // Secret masking verification: full API key must NOT appear in message
      expect(result.message).not.toContain('invalid_sumopod_key_12345');
      expect(result.message).toContain('inva...2345');
    });

    it('returns UNAUTHORIZED on HTTP 403', async () => {
      const mockFetch = createMockFetch({
        status: 403,
        statusText: 'Forbidden',
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_forbidden_key' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.message).toContain('403');
    });

    it('returns NETWORK_ERROR on endpoint failure (e.g. 500 or DNS failure)', async () => {
      const mockFetch = createMockFetch({
        networkError: new Error('getaddrinfo ENOTFOUND ai.sumopod.com'),
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_valid_key' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('NETWORK_ERROR');
      expect(result.message).toContain('Failed to reach SumoPod endpoint');
    });

    it('returns INVALID_RESPONSE when response cannot be parsed as JSON', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        jsonError: new SyntaxError('Unexpected token < in JSON at position 0'),
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_valid_key' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('INVALID_RESPONSE');
      expect(result.message).toContain('could not be parsed as JSON');
    });

    it('returns INVALID_RESPONSE when response does not match OpenAI models format', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: { error: 'Unknown format', results: [] }, // missing 'data' array
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_valid_key' },
        { fetchFn: mockFetch }
      );

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.status).toBe('INVALID_RESPONSE');
      expect(result.message).toContain('Invalid response format');
    });
  });

  // -------------------------------------------------------------------------
  // 3. fetchModels() Direct Method
  // -------------------------------------------------------------------------

  describe('3. fetchModels() Method', () => {
    it('returns formatted AIModelInfo array on success', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: sampleOpenAIModelsResponse,
      });

      const adapter = new SumoPodAdapter(
        { apiKey: 'sumo_valid_key' },
        { fetchFn: mockFetch }
      );

      const models = await adapter.fetchModels();

      expect(models).toHaveLength(4);
      expect(models[0]).toEqual({
        id: 'gpt-4o',
        created: 1715368132,
        ownedBy: 'system',
      });
      expect(Object.isFrozen(models)).toBe(true);
      expect(Object.isFrozen(models[0])).toBe(true);
    });

    it('throws SumoPodConfigError if API key is missing', async () => {
      const adapter = new SumoPodAdapter({ apiKey: '' });
      await expect(adapter.fetchModels()).rejects.toThrow(SumoPodConfigError);
    });

    it('throws SumoPodAuthError on 401', async () => {
      const mockFetch = createMockFetch({ status: 401 });
      const adapter = new SumoPodAdapter(
        { apiKey: 'bad_key' },
        { fetchFn: mockFetch }
      );
      await expect(adapter.fetchModels()).rejects.toThrow(SumoPodAuthError);
    });

    it('throws SumoPodNetworkError on 502 Bad Gateway', async () => {
      const mockFetch = createMockFetch({ status: 502, statusText: 'Bad Gateway' });
      const adapter = new SumoPodAdapter(
        { apiKey: 'valid_key' },
        { fetchFn: mockFetch }
      );
      await expect(adapter.fetchModels()).rejects.toThrow(SumoPodNetworkError);
    });

    it('throws SumoPodInvalidResponseError on malformed JSON payload', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        json: { not_data: 123 },
      });
      const adapter = new SumoPodAdapter(
        { apiKey: 'valid_key' },
        { fetchFn: mockFetch }
      );
      await expect(adapter.fetchModels()).rejects.toThrow(SumoPodInvalidResponseError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. API Key Secret Masking
  // -------------------------------------------------------------------------

  describe('4. Secret Masking Utility', () => {
    it('masks undefined or empty keys as (not set)', () => {
      expect(maskApiKey(undefined)).toBe('(not set)');
      expect(maskApiKey('')).toBe('(not set)');
      expect(maskApiKey('   ')).toBe('(not set)');
    });

    it('masks short keys as ***', () => {
      expect(maskApiKey('12345')).toBe('***');
      expect(maskApiKey('12345678')).toBe('***');
    });

    it('preserves first 4 and last 4 characters for longer keys', () => {
      expect(maskApiKey('sumo_live_key_9988776655')).toBe('sumo...6655');
      expect(maskApiKey('sk-ant-1234567890abcdef')).toBe('sk-a...cdef');
    });
  });

  // -------------------------------------------------------------------------
  // 5. URL and Environment Configuration
  // -------------------------------------------------------------------------

  describe('5. URL & Environment Configuration', () => {
    it('normalizes trailing slashes on base URL', () => {
      const adapter = new SumoPodAdapter({
        baseUrl: 'https://ai.sumopod.com/v1///',
        apiKey: 'key',
      });
      expect(adapter.config.baseUrl).toBe('https://ai.sumopod.com/v1');
    });

    it('uses default SumoPod base URL if not provided', () => {
      const adapter = new SumoPodAdapter({ apiKey: 'key' });
      expect(adapter.config.baseUrl).toBe(SUMOPOD_DEFAULT_BASE_URL);
      expect(adapter.config.providerId).toBe('sumopod');
      expect(adapter.config.displayName).toBe('SumoPod AI');
    });

    it('reads environment variables via getSumoPodEnvConfig', () => {
      const origApiKey = process.env.SUMOPOD_API_KEY;
      const origBaseUrl = process.env.SUMOPOD_BASE_URL;
      const origModel = process.env.SUMOPOD_MODEL;

      try {
        process.env.SUMOPOD_API_KEY = 'test-env-key-999';
        process.env.SUMOPOD_BASE_URL = 'https://custom.sumopod.com/v1';
        process.env.SUMOPOD_MODEL = 'custom-model';

        const config = getSumoPodEnvConfig();
        expect(config.apiKey).toBe('test-env-key-999');
        expect(config.baseUrl).toBe('https://custom.sumopod.com/v1');
        expect(config.model).toBe('custom-model');
      } finally {
        process.env.SUMOPOD_API_KEY = origApiKey;
        process.env.SUMOPOD_BASE_URL = origBaseUrl;
        process.env.SUMOPOD_MODEL = origModel;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Provider Abstraction / Swappability
  // -------------------------------------------------------------------------

  describe('6. Provider Abstraction Swappability', () => {
    it('allows another provider implementation to satisfy IConfigurableAIProvider', async () => {
      class MockAlternativeProvider implements IConfigurableAIProvider {
        public readonly config = {
          providerId: 'alternative-ai',
          displayName: 'Alternative AI',
          baseUrl: 'https://api.alternative.com/v1',
          apiKey: 'mock-key',
        };

        async testConnection() {
          return {
            success: true,
            status: 'CONNECTED' as const,
            message: 'Alternative provider connected',
            testedAt: new Date().toISOString(),
          };
        }

        async fetchModels() {
          return [{ id: 'alt-model-v1' }];
        }
      }

      const altProvider: IConfigurableAIProvider = new MockAlternativeProvider();
      const testResult = await altProvider.testConnection();
      const models = await altProvider.fetchModels();

      expect(altProvider.config.providerId).toBe('alternative-ai');
      expect(testResult.status).toBe('CONNECTED');
      expect(models[0].id).toBe('alt-model-v1');
    });
  });
});
