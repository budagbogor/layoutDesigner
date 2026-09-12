import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiProviderConfigPanel } from '@/presentation/components/ai/AiProviderConfigPanel';
import { AiRequirementInputPanel, EXAMPLE_PROMPT_PRESETS } from '@/presentation/components/ai/AiRequirementInputPanel';
import { AiAnalysisResultPanel } from '@/presentation/components/ai/AiAnalysisResultPanel';
import { useAiWorkshopAssistant } from '@/presentation/components/ai/useAiWorkshopAssistant';
import type { AIParseResult } from '@/application/ai/requirementParser';

// ---------------------------------------------------------------------------
// Mock Fetch Factory
// ---------------------------------------------------------------------------

function createMockAiFetch(options: {
  modelsResponse?: any;
  chatResponseContent?: string;
  status?: number;
  networkError?: Error;
}): typeof fetch {
  return vi.fn().mockImplementation(async (url: string) => {
    if (options.networkError) {
      throw options.networkError;
    }

    if (String(url).endsWith('/models')) {
      return {
        ok: (options.status ?? 200) === 200,
        status: options.status ?? 200,
        statusText: (options.status ?? 200) === 200 ? 'OK' : 'Error',
        json: async () =>
          options.modelsResponse ?? {
            object: 'list',
            data: [
              { id: 'gpt-4o-mini', object: 'model' },
              { id: 'claude-3-5-sonnet', object: 'model' },
            ],
          },
      } as unknown as Response;
    }

    if (String(url).endsWith('/chat/completions')) {
      return {
        ok: (options.status ?? 200) === 200,
        status: options.status ?? 200,
        statusText: (options.status ?? 200) === 200 ? 'OK' : 'Error',
        json: async () => ({
          id: 'mock-cmpl',
          choices: [
            {
              message: {
                content: options.chatResponseContent ?? '{}',
              },
            },
          ],
        }),
      } as unknown as Response;
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Test Suite: AI Workshop Design Assistant UI
// ---------------------------------------------------------------------------

describe('FASE 3.7 — AI Workshop Design Assistant UI', () => {
  const sampleSecretKey = 'sumo_live_key_9876543210abcdef';

  // -------------------------------------------------------------------------
  // 1. Provider Configuration Render
  // -------------------------------------------------------------------------

  describe('1. Provider Configuration Render', () => {
    it('renders provider name, base URL, and control buttons', () => {
      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini',
          availableModels: ['gpt-4o-mini', 'claude-3-5-sonnet'],
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: null,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('SumoPod AI');
      expect(html).toContain('https://ai.sumopod.com/v1');
      expect(html).toContain('Load Models');
      expect(html).toContain('Test Connection');
      expect(html).toContain('data-testid="ai-provider-config-panel"');
    });
  });

  // -------------------------------------------------------------------------
  // 2. API Key Password Field
  // -------------------------------------------------------------------------

  describe('2. API Key Password Field Security', () => {
    it('renders input with type="password" by default', () => {
      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: sampleSecretKey,
          model: 'gpt-4o-mini',
          availableModels: [],
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: null,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('type="password"');
      expect(html).toContain('data-testid="sumopod-api-key-input"');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Model Selection
  // -------------------------------------------------------------------------

  describe('3. Model Selection', () => {
    it('renders categorized SumoPod model catalog in select dropdown', () => {
      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: 'key',
          model: 'claude-sonnet-4-6',
          availableModels: ['gpt-4o-mini', 'claude-sonnet-4-6', 'qwen-2.5-72b'],
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: null,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('<select');
      expect(html).toContain('claude-sonnet-4-6');
      expect(html).toContain('gpt-4o-mini');
      expect(html).toContain('gemini/gemini-3.5-flash');
      expect(html).toContain('deepseek-v4-flash');
      expect(html).toContain('qwen3.8-flash');
    });

    it('renders custom text input when manual typing is enabled', () => {
      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: 'key',
          model: 'custom-model',
          availableModels: [],
          initialCustomModel: true,
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: null,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="sumopod-model-input"');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Test Connection Success
  // -------------------------------------------------------------------------

  describe('4. Test Connection Success', () => {
    it('executes testConnection and returns CONNECTED status', async () => {
      const mockFetch = createMockAiFetch({ status: 200 });

      let hookResult: any;
      function TestComponent() {
        hookResult = useAiWorkshopAssistant({
          initialApiKey: 'valid-key',
          initialModel: 'gpt-4o-mini',
          customFetch: mockFetch,
        });
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      const res = await hookResult.testConnection();

      expect(res.success).toBe(true);
      expect(res.status).toBe('CONNECTED');
      expect(res.availableModels).toContain('gpt-4o-mini');

      // Verify connection result banner rendering
      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: 'valid-key',
          model: 'gpt-4o-mini',
          availableModels: res.availableModels,
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: res,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('Terhubung ke SumoPod');
      expect(html).toContain('CONNECTED');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Test Connection Failure
  // -------------------------------------------------------------------------

  describe('5. Test Connection Failure', () => {
    it('handles 401 unauthorized gracefully and displays error banner', async () => {
      const mockFetch = createMockAiFetch({ status: 401 });

      let hookResult: any;
      function TestComponent() {
        hookResult = useAiWorkshopAssistant({
          initialApiKey: 'invalid-key-xyz',
          customFetch: mockFetch,
        });
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      const res = await hookResult.testConnection();

      expect(res.success).toBe(false);
      expect(res.status).toBe('UNAUTHORIZED');

      const html = renderToStaticMarkup(
        React.createElement(AiProviderConfigPanel, {
          baseUrl: 'https://ai.sumopod.com/v1',
          apiKey: 'invalid-key-xyz',
          model: '',
          availableModels: [],
          isTestingConnection: false,
          isLoadingModels: false,
          connectionResult: res,
          onApiKeyChange: vi.fn(),
          onModelChange: vi.fn(),
          onTestConnection: vi.fn(),
          onLoadModels: vi.fn(),
        })
      );

      expect(html).toContain('Gagal Menghubungi SumoPod');
      expect(html).toContain('UNAUTHORIZED');
      // Must not leak raw key in diagnostic message
      expect(res.message).not.toContain('invalid-key-xyz');
      expect(res.message).toContain('inva...-xyz');
      expect(html).toContain('inva...-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Analyze Requirement Success → COMPLETE
  // -------------------------------------------------------------------------

  describe('6. Analyze Requirement Success (COMPLETE View)', () => {
    it('renders full semantic requirement cards upon COMPLETE status', () => {
      const completeResult: AIParseResult = {
        status: 'COMPLETE',
        confidence: 0.95,
        reasoning: 'Spesifikasi lengkap berhasil diekstrak.',
        requirement: {
          projectName: 'Bengkel Mobeng Serpong',
          workshopType: 'car_service',
          vehicleCategory: 'suv',
          priority: 'BALANCED_EFFICIENCY',
          site: { widthMeters: 20, lengthMeters: 30, roadOrientation: 'south' },
          building: { widthMeters: 15, lengthMeters: 22, frontSetbackMeters: 4 },
          access: { entryPosition: 'front_center', exitPosition: 'rear_center', preferDriveThrough: true },
          services: [
            { serviceType: 'general_service', bayCount: 3, requiredLifts: ['2_post_lift'] },
            { serviceType: 'quick_lube', bayCount: 1 },
          ],
          ancillarySpaces: {
            customerLounge: true,
            cashierOffice: true,
            partsWarehouse: true,
            restroom: true,
          },
        },
        validationResult: {
          isValid: true,
          missingFields: [],
          warnings: [],
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(AiAnalysisResultPanel, {
          result: completeResult,
          isAnalyzing: false,
        })
      );

      expect(html).toContain('COMPLETE');
      expect(html).toContain('95% Confidence');
      expect(html).toContain('Bengkel Mobeng Serpong');
      expect(html).toContain('20m × 30m');
      expect(html).toContain('15m × 22m');
      expect(html).toContain('General Service');
      expect(html).toContain('3 Bay');
      expect(html).toContain('Ruang Tunggu');
      expect(html).toContain('Kantor Kasir');
      expect(html).toContain('data-testid="analysis-complete-view"');
    });
  });

  // -------------------------------------------------------------------------
  // 7. NEEDS_CLARIFICATION State
  // -------------------------------------------------------------------------

  describe('7. NEEDS_CLARIFICATION State', () => {
    it('renders questions and suggested options clearly', () => {
      const clarificationResult: AIParseResult = {
        status: 'NEEDS_CLARIFICATION',
        confidence: 0.45,
        questions: [
          {
            field: 'site',
            question: 'Berapa ukuran lahan yang Anda miliki?',
            suggestedOptions: ['15x20m', '20x30m', '25x40m'],
          },
          {
            field: 'services',
            question: 'Layanan apa saja yang ingin disediakan?',
            suggestedOptions: ['Servis Umum', 'Ganti Oli Cepat'],
          },
        ],
        partialRequirement: {
          projectName: 'Bengkel Baru',
          workshopType: 'car_service',
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(AiAnalysisResultPanel, {
          result: clarificationResult,
          isAnalyzing: false,
        })
      );

      expect(html).toContain('NEEDS CLARIFICATION');
      expect(html).toContain('45% Confidence');
      expect(html).toContain('Berapa ukuran lahan yang Anda miliki?');
      expect(html).toContain('15x20m');
      expect(html).toContain('20x30m');
      expect(html).toContain('Layanan apa saja yang ingin disediakan?');
      expect(html).toContain('data-testid="analysis-clarification-view"');
    });
  });

  // -------------------------------------------------------------------------
  // 8. INVALID State
  // -------------------------------------------------------------------------

  describe('8. INVALID State', () => {
    it('renders clear failure message without crashing', () => {
      const invalidResult: AIParseResult = {
        status: 'INVALID',
        reason: 'Deskripsi kebutuhan bengkel terlalu singkat atau tidak jelas.',
      };

      const html = renderToStaticMarkup(
        React.createElement(AiAnalysisResultPanel, {
          result: invalidResult,
          isAnalyzing: false,
        })
      );

      expect(html).toContain('INVALID');
      expect(html).toContain('Kebutuhan Tidak Dapat Diproses');
      expect(html).toContain('Deskripsi kebutuhan bengkel terlalu singkat');
      expect(html).toContain('data-testid="analysis-invalid-view"');
    });
  });

  // -------------------------------------------------------------------------
  // 9. API Key Masking in Error & Output
  // -------------------------------------------------------------------------

  describe('9. API Key Security & Masking', () => {
    it('never exposes raw API key in plaintext in analysis results or errors', async () => {
      const mockFetch = createMockAiFetch({ status: 401 });

      let hookResult: any;
      function TestComponent() {
        hookResult = useAiWorkshopAssistant({
          initialApiKey: sampleSecretKey,
          initialModel: 'gpt-4o-mini',
          initialPrompt: 'Bengkel mobil 3 bay',
          customFetch: mockFetch,
        });
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComponent));
      const res = await hookResult.analyzeRequirement();

      expect(res.status).toBe('INVALID');
      // Secret masking verification
      expect(res.reason).not.toContain(sampleSecretKey);
      expect(res.reason).toContain('sumo...cdef');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Double Submission Protection
  // -------------------------------------------------------------------------

  describe('10. Double Submission Prevention', () => {
    it('prevents concurrent duplicate analyze calls', async () => {
      let fetchResolve: (val: any) => void;
      const slowFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            fetchResolve = resolve;
          })
      );

      let hookResult: any;
      function TestComponent() {
        hookResult = useAiWorkshopAssistant({
          initialApiKey: 'key',
          initialModel: 'gpt-4o-mini',
          initialPrompt: 'Bengkel 3 bay',
          customFetch: slowFetch,
        });
        return null;
      }

      renderToStaticMarkup(React.createElement(TestComponent));

      // Call 1: starts in-flight
      const promise1 = hookResult.analyzeRequirement();

      // Call 2: immediately fired before promise1 finishes
      const promise2 = hookResult.analyzeRequirement();

      // Second call must return null immediately because analysis is in flight
      const res2 = await promise2;
      expect(res2).toBeNull();
      expect(slowFetch).toHaveBeenCalledTimes(1);

      // Complete first call
      fetchResolve!({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"confidence":0.5}' } }],
        }),
      });

      await promise1;
    });
  });

  // -------------------------------------------------------------------------
  // 11. Example Prompts Presets
  // -------------------------------------------------------------------------

  describe('11. Example Prompts Presets (Primary Scale Modes: Compact, Medium, Big)', () => {
    it('provides exactly 3 primary scale presets (Compact, Medium, Big)', () => {
      expect(EXAMPLE_PROMPT_PRESETS).toHaveLength(3);
      const labels = EXAMPLE_PROMPT_PRESETS.map((p) => p.label);
      expect(labels.some((l) => l.includes('Compact'))).toBe(true);
      expect(labels.some((l) => l.includes('Medium'))).toBe(true);
      expect(labels.some((l) => l.includes('Big'))).toBe(true);
      expect(labels.some((l) => l.includes('Keluarga'))).toBe(false);
      expect(labels.some((l) => l.includes('Medium Premium'))).toBe(false);
    });

    it('renders presets in AiRequirementInputPanel with exactly Compact, Medium, Big', () => {
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

      expect(html).toContain('Compact');
      expect(html).toContain('Medium');
      expect(html).toContain('Big');
      expect(html).not.toContain('Bengkel Keluarga');
      expect(html).not.toContain('Medium Premium');
    });
  });
});
