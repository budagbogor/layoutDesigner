// ---------------------------------------------------------------------------
// FASE 3.5 / 3.7 — AI Provider Configuration & Connection Contracts
//
// Defines:
// - Provider configuration interfaces
// - Curated SumoPod Models Catalog
// - Connection testing & model listing contracts
// - Secret masking utility
// ---------------------------------------------------------------------------

export interface AIProviderConfig {
  readonly providerId: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model?: string;
}

export interface AIModelInfo {
  readonly id: string;
  readonly created?: number;
  readonly ownedBy?: string;
}

export type ConnectionStatus =
  | 'CONNECTED'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'MODEL_NOT_FOUND'
  | 'CONFIG_ERROR';

export interface ConnectionTestResult {
  readonly success: boolean;
  readonly status: ConnectionStatus;
  readonly message: string;
  readonly latencyMs?: number;
  readonly availableModels?: readonly string[];
  readonly testedModel?: string;
  readonly testedAt: string;
}

export interface IConfigurableAIProvider {
  readonly config: Readonly<AIProviderConfig>;
  testConnection(): Promise<ConnectionTestResult>;
  fetchModels(): Promise<readonly AIModelInfo[]>;
}

// ---------------------------------------------------------------------------
// Secret Sanitization Utility
// ---------------------------------------------------------------------------

export function maskApiKey(apiKey: string | undefined | null): string {
  if (!apiKey || apiKey.trim().length === 0) {
    return '(not set)';
  }
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '***';
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// SumoPod Defaults & Curated Catalog
// ---------------------------------------------------------------------------

export const SUMOPOD_DEFAULT_BASE_URL = 'https://ai.sumopod.com/v1';
export const SUMOPOD_PROVIDER_ID = 'sumopod';
export const SUMOPOD_DISPLAY_NAME = 'SumoPod AI';

export interface SumoPodModelPreset {
  readonly id: string;
  readonly category: string;
  readonly provider: string;
  readonly label: string;
  readonly isRecommended?: boolean;
}

/**
 * Curated list of suggested SumoPod AI models for the UI quick-selection dropdown.
 *
 * NOTE (SSOT Boundary):
 * - This catalog serves as UI hints/suggestions and preset shortcuts for user convenience.
 * - It is NOT an authoritative guarantee that every model is available on a specific SumoPod account/tier.
 * - The runtime source of truth for available models is `provider.fetchModels()` or direct API response.
 */
export const SUMOPOD_CATALOG_MODELS: readonly SumoPodModelPreset[] = [
  // Anthropic Claude
  { id: 'claude-sonnet-4-6', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Sonnet 4.6 (Recommended - Highly Accurate)', isRecommended: true },
  { id: 'claude-haiku-4-5', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Haiku 4.5 (Fast & Efficient)', isRecommended: true },
  { id: 'claude-sonnet-5', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-4-7', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Opus 4.7' },
  { id: 'claude-opus-4-8', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Opus 4.8' },
  { id: 'claude-fable-5', category: 'Anthropic Claude', provider: 'anthropic', label: 'Claude Fable 5' },

  // OpenAI GPT
  { id: 'gpt-4o-mini', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-4o Mini (Recommended - Fast & Structured)', isRecommended: true },
  { id: 'gpt-4o', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4.1-mini', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-4.1' },
  { id: 'gpt-4.1-nano', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-4.1 Nano' },
  { id: 'gpt-5-mini', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5 Mini' },
  { id: 'gpt-5', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5' },
  { id: 'gpt-5-nano', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5 Nano' },
  { id: 'gpt-5.4-mini', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.4 Mini' },
  { id: 'gpt-5.4', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.4' },
  { id: 'gpt-5.4-nano', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.4 Nano' },
  { id: 'gpt-5.6-luna', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.6-sol', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-terra', category: 'OpenAI GPT', provider: 'openai', label: 'GPT-5.6 Terra' },

  // Google Gemini
  { id: 'gemini/gemini-3.5-flash', category: 'Google Gemini', provider: 'gemini', label: 'Gemini 3.5 Flash (Recommended)', isRecommended: true },
  { id: 'gemini/gemini-3.5-flash-lite', category: 'Google Gemini', provider: 'gemini', label: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini/gemini-3.1-flash-lite', category: 'Google Gemini', provider: 'gemini', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini/gemini-3.1-pro-preview', category: 'Google Gemini', provider: 'gemini', label: 'Gemini 3.1 Pro Preview' },
  { id: 'gemini/gemini-3-flash-preview', category: 'Google Gemini', provider: 'gemini', label: 'Gemini 3 Flash Preview' },

  // DeepSeek
  { id: 'deepseek-v4-flash', category: 'DeepSeek', provider: 'deepseek', label: 'DeepSeek V4 Flash (Recommended - Economical)', isRecommended: true },
  { id: 'deepseek-v4-pro', category: 'DeepSeek', provider: 'deepseek', label: 'DeepSeek V4 Pro' },
  { id: 'deepseek-v4-flash-vision-exp', category: 'DeepSeek', provider: 'deepseek', label: 'DeepSeek V4 Flash Vision Exp' },

  // Alibaba Qwen
  { id: 'qwen3.8-flash', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.8 Flash (Recommended)', isRecommended: true },
  { id: 'qwen3.8-max', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.8 Max' },
  { id: 'qwen3.7-plus', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.7 Plus' },
  { id: 'qwen3.7-max', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.7 Max' },
  { id: 'qwen3.7-flash-2026-07-15', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.7 Flash' },
  { id: 'qwen3.6-plus', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.6 Plus' },
  { id: 'qwen3.6-flash', category: 'Alibaba Qwen', provider: 'alibaba', label: 'Qwen 3.6 Flash' },

  // Zhipu GLM
  { id: 'glm-5.2', category: 'Zhipu GLM', provider: 'z.ai', label: 'GLM 5.2' },
  { id: 'glm-5.1', category: 'Zhipu GLM', provider: 'z.ai', label: 'GLM 5.1' },
  { id: 'glm-5', category: 'Zhipu GLM', provider: 'z.ai', label: 'GLM 5' },
  { id: 'glm-5-turbo', category: 'Zhipu GLM', provider: 'z.ai', label: 'GLM 5 Turbo' },
  { id: 'glm-5v-turbo', category: 'Zhipu GLM', provider: 'z.ai', label: 'GLM 5V Turbo' },

  // Kimi / Moonshot
  { id: 'kimi-k2.7', category: 'Kimi / Moonshot', provider: 'sumopod', label: 'Kimi K2.7' },
  { id: 'kimi-k2.6', category: 'Kimi / Moonshot', provider: 'moonshot', label: 'Kimi K2.6' },
  { id: 'kimi-k3', category: 'Kimi / Moonshot', provider: 'sumopod', label: 'Kimi K3' },

  // MiniMax / Mimo / Tencent / BytePlus
  { id: 'MiniMax-M2.7-highspeed', category: 'MiniMax & Mimo', provider: 'sumopod', label: 'MiniMax M2.7 Highspeed' },
  { id: 'MiniMax-M3', category: 'MiniMax & Mimo', provider: 'minimax', label: 'MiniMax M3' },
  { id: 'mimo-v2.5', category: 'MiniMax & Mimo', provider: 'mimo', label: 'Mimo V2.5' },
  { id: 'mimo-v2.5-pro', category: 'MiniMax & Mimo', provider: 'mimo', label: 'Mimo V2.5 Pro' },
  { id: 'hy3', category: 'Tencent', provider: 'tencent', label: 'HY3' },
  { id: 'seed-2-0-pro', category: 'BytePlus Seed', provider: 'byteplus', label: 'Seed 2.0 Pro' },
  { id: 'seed-2-0-code', category: 'BytePlus Seed', provider: 'byteplus', label: 'Seed 2.0 Code' },
  { id: 'seed-2-0-lite', category: 'BytePlus Seed', provider: 'byteplus', label: 'Seed 2.0 Lite' },
  { id: 'seed-2-0-mini', category: 'BytePlus Seed', provider: 'byteplus', label: 'Seed 2.0 Mini' },
];

/**
 * Reads SumoPod configuration from process.env if available in Node / SSR environment.
 */
export function getSumoPodEnvConfig(): Partial<AIProviderConfig> {
  const envApiKey = typeof process !== 'undefined' ? process.env?.SUMOPOD_API_KEY : undefined;
  const envBaseUrl = typeof process !== 'undefined' ? process.env?.SUMOPOD_BASE_URL : undefined;
  const envModel = typeof process !== 'undefined' ? process.env?.SUMOPOD_MODEL : undefined;

  return {
    providerId: SUMOPOD_PROVIDER_ID,
    displayName: SUMOPOD_DISPLAY_NAME,
    baseUrl: envBaseUrl?.trim() || SUMOPOD_DEFAULT_BASE_URL,
    apiKey: envApiKey?.trim() || '',
    model: envModel?.trim() || 'gpt-4o-mini',
  };
}
