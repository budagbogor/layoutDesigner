// ---------------------------------------------------------------------------
// FASE 3.7 — Hook / State Controller for AI Workshop Assistant
//
// Manages reactive state for:
// - SumoPod provider configuration (apiKey held strictly in React memory)
// - Model list and selection
// - Connection health check
// - Natural language prompt and example presets
// - Requirement analysis orchestration via SumoPodRequirementProvider + AIRequirementParser
//
// Security guarantees:
// - Never stores apiKey in localStorage / sessionStorage
// - Never logs apiKey
// - Never exposes raw apiKey in error messages
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef } from 'react';
import {
  AIProviderConfig,
  ConnectionTestResult,
  SUMOPOD_DEFAULT_BASE_URL,
  SUMOPOD_PROVIDER_ID,
  maskApiKey,
} from '../../../application/ai/providerConfig';
import {
  AIParseResult,
  AIRequirementParser,
} from '../../../application/ai/requirementParser';
import { SumoPodAdapter } from '../../../infrastructure/ai/sumopodAdapter';
import { SumoPodRequirementProvider } from '../../../infrastructure/ai/sumopodRequirementProvider';

export interface UseAiWorkshopAssistantOptions {
  readonly initialBaseUrl?: string;
  readonly initialModel?: string;
  readonly initialApiKey?: string;
  readonly initialPrompt?: string;
  readonly customFetch?: typeof fetch;
}

export interface UseAiWorkshopAssistantReturn {
  // Provider config state
  readonly providerId: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly availableModels: readonly string[];
  readonly isTestingConnection: boolean;
  readonly isLoadingModels: boolean;
  readonly connectionResult: ConnectionTestResult | null;

  // Requirement input state
  readonly prompt: string;
  readonly isAnalyzing: boolean;
  readonly analysisResult: AIParseResult | null;
  readonly analysisError: string | null;

  // Actions
  readonly setApiKey: (key: string) => void;
  readonly setModel: (model: string) => void;
  readonly setBaseUrl: (url: string) => void;
  readonly setPrompt: (prompt: string) => void;
  readonly selectExamplePrompt: (exampleText: string) => void;
  readonly testConnection: (overrideFetch?: typeof fetch) => Promise<ConnectionTestResult>;
  readonly loadModels: (overrideFetch?: typeof fetch) => Promise<readonly string[]>;
  readonly analyzeRequirement: (overrideFetch?: typeof fetch) => Promise<AIParseResult | null>;
  readonly resetAnalysis: () => void;
}

export function useAiWorkshopAssistant(
  options: UseAiWorkshopAssistantOptions = {}
): UseAiWorkshopAssistantReturn {
  // State: Provider
  const [providerId] = useState(SUMOPOD_PROVIDER_ID);
  const [baseUrl, setBaseUrl] = useState(options.initialBaseUrl || SUMOPOD_DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(options.initialApiKey || '');
  const [model, setModel] = useState(options.initialModel || '');
  const [availableModels, setAvailableModels] = useState<readonly string[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);

  // State: Requirement Input & Analysis
  const [prompt, setPrompt] = useState(options.initialPrompt || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIParseResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // In-flight guard ref to absolutely prevent double-submission even before re-render
  const isAnalyzingRef = useRef(false);

  // Action: Select preset example
  const selectExamplePrompt = useCallback((exampleText: string) => {
    setPrompt(exampleText);
    setAnalysisError(null);
  }, []);

  // Action: Test Connection
  const testConnection = useCallback(
    async (overrideFetch?: typeof fetch): Promise<ConnectionTestResult> => {
      setIsTestingConnection(true);
      setConnectionResult(null);

      const adapter = new SumoPodAdapter(
        {
          providerId,
          baseUrl,
          apiKey,
          model: model || undefined,
        },
        { fetchFn: overrideFetch ?? options.customFetch }
      );

      try {
        const result = await adapter.testConnection();
        setConnectionResult(result);
        if (result.availableModels && result.availableModels.length > 0) {
          setAvailableModels(result.availableModels);
          if (!model && result.availableModels[0]) {
            setModel(result.availableModels[0]);
          }
        }
        return result;
      } finally {
        setIsTestingConnection(false);
      }
    },
    [providerId, baseUrl, apiKey, model, options.customFetch]
  );

  // Action: Load Models
  const loadModels = useCallback(
    async (overrideFetch?: typeof fetch): Promise<readonly string[]> => {
      if (!apiKey || apiKey.trim().length === 0) {
        setConnectionResult({
          success: false,
          status: 'CONFIG_ERROR',
          message: 'Masukkan API Key terlebih dahulu untuk memuat daftar model.',
          testedAt: new Date().toISOString(),
        });
        return [];
      }

      setIsLoadingModels(true);
      const adapter = new SumoPodAdapter(
        { providerId, baseUrl, apiKey },
        { fetchFn: overrideFetch ?? options.customFetch }
      );

      try {
        const modelInfos = await adapter.fetchModels();
        const modelIds = modelInfos.map((m) => m.id);
        setAvailableModels(modelIds);
        if (!model && modelIds.length > 0) {
          setModel(modelIds[0]);
        }
        return modelIds;
      } catch (err) {
        setConnectionResult({
          success: false,
          status: 'NETWORK_ERROR',
          message: `Gagal memuat model: ${(err as Error).message}`,
          testedAt: new Date().toISOString(),
        });
        return [];
      } finally {
        setIsLoadingModels(false);
      }
    },
    [providerId, baseUrl, apiKey, model, options.customFetch]
  );

  // Action: Analyze Requirement
  const analyzeRequirement = useCallback(
    async (overrideFetch?: typeof fetch): Promise<AIParseResult | null> => {
      // Prevent double calls
      if (isAnalyzingRef.current || isAnalyzing) {
        return null;
      }

      setAnalysisError(null);

      // Validation 1: API Key
      if (!apiKey || apiKey.trim().length === 0) {
        const errMessage = 'SumoPod API Key wajib diisi untuk melakukan analisis.';
        setAnalysisError(errMessage);
        const invalidResult: AIParseResult = {
          status: 'INVALID',
          reason: errMessage,
        };
        setAnalysisResult(invalidResult);
        return invalidResult;
      }

      // Validation 2: Model
      if (!model || model.trim().length === 0) {
        const errMessage = 'Model AI belum dipilih. Silakan pilih atau ketik nama model.';
        setAnalysisError(errMessage);
        const invalidResult: AIParseResult = {
          status: 'INVALID',
          reason: errMessage,
        };
        setAnalysisResult(invalidResult);
        return invalidResult;
      }

      // Validation 3: Prompt
      if (!prompt || prompt.trim().length === 0) {
        const errMessage = 'Deskripsi kebutuhan bengkel tidak boleh kosong.';
        setAnalysisError(errMessage);
        const invalidResult: AIParseResult = {
          status: 'INVALID',
          reason: errMessage,
        };
        setAnalysisResult(invalidResult);
        return invalidResult;
      }

      isAnalyzingRef.current = true;
      setIsAnalyzing(true);

      const provider = new SumoPodRequirementProvider(
        {
          providerId,
          baseUrl,
          apiKey,
          model,
        },
        { fetchFn: overrideFetch ?? options.customFetch }
      );

      const parser = new AIRequirementParser(provider);

      try {
        const result = await parser.parse(prompt);
        setAnalysisResult(result);
        if (result.status === 'INVALID') {
          setAnalysisError(result.reason);
        }
        return result;
      } catch (err) {
        const safeReason = `Terjadi kesalahan saat menghubungi SumoPod: ${(err as Error).message}`;
        setAnalysisError(safeReason);
        const errResult: AIParseResult = {
          status: 'INVALID',
          reason: safeReason,
        };
        setAnalysisResult(errResult);
        return errResult;
      } finally {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [isAnalyzing, apiKey, model, prompt, providerId, baseUrl, options.customFetch]
  );

  const resetAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
  }, []);

  return {
    providerId,
    baseUrl,
    apiKey,
    model,
    availableModels,
    isTestingConnection,
    isLoadingModels,
    connectionResult,
    prompt,
    isAnalyzing,
    analysisResult,
    analysisError,
    setApiKey,
    setModel,
    setBaseUrl,
    setPrompt,
    selectExamplePrompt,
    testConnection,
    loadModels,
    analyzeRequirement,
    resetAnalysis,
  };
}
