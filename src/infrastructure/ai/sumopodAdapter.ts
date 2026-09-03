// ---------------------------------------------------------------------------
// FASE 3.5 — SumoPod AI Provider Adapter
//
// Concrete adapter connecting to SumoPod via its OpenAI-compatible REST API.
// Base URL default: https://ai.sumopod.com/v1
// Auth: Bearer token in Authorization header.
//
// Rules:
//   - Zero SDK dependencies; uses native fetch.
//   - API key is treated strictly as a secret (never logged or put into messages).
//   - Supports fetch injection for testability and mocked environments.
//   - Domain engine remains completely isolated from this adapter.
// ---------------------------------------------------------------------------

import {
  AIProviderConfig,
  AIModelInfo,
  ConnectionTestResult,
  IConfigurableAIProvider,
  SUMOPOD_DEFAULT_BASE_URL,
  SUMOPOD_PROVIDER_ID,
  SUMOPOD_DISPLAY_NAME,
  maskApiKey,
} from '../../application/ai/providerConfig';

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class SumoPodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SumoPodError';
    Object.setPrototypeOf(this, SumoPodError.prototype);
  }
}

export class SumoPodConfigError extends SumoPodError {
  constructor(message: string) {
    super(message);
    this.name = 'SumoPodConfigError';
    Object.setPrototypeOf(this, SumoPodConfigError.prototype);
  }
}

export class SumoPodAuthError extends SumoPodError {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'SumoPodAuthError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, SumoPodAuthError.prototype);
  }
}

export class SumoPodNetworkError extends SumoPodError {
  public readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'SumoPodNetworkError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, SumoPodNetworkError.prototype);
  }
}

export class SumoPodInvalidResponseError extends SumoPodError {
  constructor(message: string) {
    super(message);
    this.name = 'SumoPodInvalidResponseError';
    Object.setPrototypeOf(this, SumoPodInvalidResponseError.prototype);
  }
}

// ---------------------------------------------------------------------------
// SumoPod Adapter Implementation
// ---------------------------------------------------------------------------

export interface SumoPodAdapterOptions {
  /** Optional custom fetch implementation (useful for unit testing or custom proxies). */
  readonly fetchFn?: typeof fetch;
}

export class SumoPodAdapter implements IConfigurableAIProvider {
  public readonly config: Readonly<AIProviderConfig>;
  private readonly options: SumoPodAdapterOptions;
  private readonly fetch: typeof fetch;

  constructor(
    config: Partial<AIProviderConfig> & { apiKey: string },
    options: SumoPodAdapterOptions = {}
  ) {
    const rawBaseUrl = config.baseUrl?.trim() || SUMOPOD_DEFAULT_BASE_URL;
    // Strip trailing slashes for clean URL concatenation
    const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');

    this.config = Object.freeze({
      providerId: config.providerId?.trim() || SUMOPOD_PROVIDER_ID,
      displayName: config.displayName?.trim() || SUMOPOD_DISPLAY_NAME,
      baseUrl: cleanBaseUrl,
      apiKey: config.apiKey?.trim() || '',
      model: config.model?.trim() || undefined,
    });

    this.options = options;
    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Executes an HTTP request to SumoPod. In browser environments (when no custom fetch
   * is injected), it transparently proxies through Next.js server route to bypass CORS.
   */
  public async executeRawRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<Response> {
    const isBrowser = typeof window !== 'undefined';
    const useProxy = isBrowser && !this.options.fetchFn;

    if (useProxy) {
      return fetch('/api/ai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          baseUrl: this.config.baseUrl,
          apiKey: this.config.apiKey,
          method,
          body,
        }),
      });
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${this.config.baseUrl}${cleanEndpoint}`;
    return this.fetch(targetUrl, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Fetches the list of available models from the SumoPod OpenAI-compatible `/models` endpoint.
   * Throws typed errors on failure (config, auth, network, invalid response).
   */
  async fetchModels(): Promise<readonly AIModelInfo[]> {
    if (!this.config.apiKey) {
      throw new SumoPodConfigError(
        'SumoPod API key is empty. Please provide a valid API key in configuration.'
      );
    }

    let response: Response;

    try {
      response = await this.executeRawRequest('/models', 'GET');
    } catch (networkErr) {
      throw new SumoPodNetworkError(
        `Failed to reach SumoPod endpoint at ${this.config.baseUrl}: ${(networkErr as Error).message}`
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new SumoPodAuthError(
        `Authentication failed (HTTP ${response.status}). Please verify your SumoPod API key. Key used: ${maskApiKey(this.config.apiKey)}.`,
        response.status
      );
    }

    if (!response.ok) {
      throw new SumoPodNetworkError(
        `SumoPod endpoint responded with HTTP ${response.status} ${response.statusText}`,
        response.status
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (jsonErr) {
      throw new SumoPodInvalidResponseError(
        `SumoPod response could not be parsed as JSON: ${(jsonErr as Error).message}`
      );
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('data' in payload) ||
      !Array.isArray((payload as { data: unknown }).data)
    ) {
      throw new SumoPodInvalidResponseError(
        'Invalid response format from SumoPod: expected an object with a "data" array conforming to OpenAI /models schema.'
      );
    }

    const rawList = (payload as { data: Array<Record<string, unknown>> }).data;
    const models: AIModelInfo[] = rawList
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => ({
        id: String(item.id),
        created: typeof item.created === 'number' ? item.created : undefined,
        ownedBy: typeof item.owned_by === 'string' ? item.owned_by : undefined,
      }));

    return Object.freeze(models.map((m) => Object.freeze(m)));
  }

  /**
   * Tests connection to SumoPod by querying `/models` and optionally validating
   * that the configured model exists.
   * Never throws — always returns a structured ConnectionTestResult.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const testedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Config validation: empty API key check
    if (!this.config.apiKey) {
      return Object.freeze({
        success: false,
        status: 'CONFIG_ERROR',
        message: 'SumoPod API key is not configured. Please supply an API key.',
        testedModel: this.config.model,
        testedAt,
      });
    }

    try {
      const models = await this.fetchModels();
      const latencyMs = Date.now() - startTime;
      const modelIds = models.map((m) => m.id);

      // 2. If a specific model was configured, check if it's available in SumoPod
      if (this.config.model) {
        const found = modelIds.includes(this.config.model);
        if (!found) {
          return Object.freeze({
            success: false,
            status: 'MODEL_NOT_FOUND',
            message: `Connected to SumoPod successfully (${latencyMs}ms), but configured model "${this.config.model}" was not found among the ${models.length} available models.`,
            latencyMs,
            availableModels: Object.freeze(modelIds),
            testedModel: this.config.model,
            testedAt,
          });
        }

        return Object.freeze({
          success: true,
          status: 'CONNECTED',
          message: `Successfully connected to SumoPod (${latencyMs}ms). Model "${this.config.model}" is verified and ready.`,
          latencyMs,
          availableModels: Object.freeze(modelIds),
          testedModel: this.config.model,
          testedAt,
        });
      }

      // 3. No specific model configured, but connection succeeded
      return Object.freeze({
        success: true,
        status: 'CONNECTED',
        message: `Successfully connected to SumoPod (${latencyMs}ms). Found ${models.length} available models.`,
        latencyMs,
        availableModels: Object.freeze(modelIds),
        testedAt,
      });
    } catch (err) {
      const latencyMs = Date.now() - startTime;

      if (err instanceof SumoPodAuthError) {
        return Object.freeze({
          success: false,
          status: 'UNAUTHORIZED',
          message: err.message,
          latencyMs,
          testedModel: this.config.model,
          testedAt,
        });
      }

      if (err instanceof SumoPodInvalidResponseError) {
        return Object.freeze({
          success: false,
          status: 'INVALID_RESPONSE',
          message: err.message,
          latencyMs,
          testedModel: this.config.model,
          testedAt,
        });
      }

      if (err instanceof SumoPodNetworkError) {
        return Object.freeze({
          success: false,
          status: 'NETWORK_ERROR',
          message: err.message,
          latencyMs,
          testedModel: this.config.model,
          testedAt,
        });
      }

      return Object.freeze({
        success: false,
        status: 'NETWORK_ERROR',
        message: `Unexpected error during connection test: ${(err as Error).message}`,
        latencyMs,
        testedModel: this.config.model,
        testedAt,
      });
    }
  }
}
