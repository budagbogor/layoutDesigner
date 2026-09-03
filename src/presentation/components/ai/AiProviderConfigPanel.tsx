// ---------------------------------------------------------------------------
// FASE 3.7 — AI Provider Configuration Panel (SumoPod)
//
// Renders:
// - Provider Selector (SumoPod AI)
// - API Key input (type="password")
// - Model Selector with categorized SumoPod catalog presets
// - "Load Models" & "Test Connection" actions
// - Real-time connection health banner with latency and model count
// ---------------------------------------------------------------------------

import React, { useState, useMemo } from 'react';
import {
  ConnectionTestResult,
  SUMOPOD_CATALOG_MODELS,
} from '../../../application/ai/providerConfig';

export interface AiProviderConfigPanelProps {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly availableModels: readonly string[];
  readonly isTestingConnection: boolean;
  readonly isLoadingModels: boolean;
  readonly connectionResult: ConnectionTestResult | null;
  readonly initialCustomModel?: boolean;
  readonly onApiKeyChange: (key: string) => void;
  readonly onModelChange: (model: string) => void;
  readonly onBaseUrlChange?: (url: string) => void;
  readonly onTestConnection: () => void;
  readonly onLoadModels: () => void;
}

export const AiProviderConfigPanel: React.FC<AiProviderConfigPanelProps> = ({
  baseUrl,
  apiKey,
  model,
  availableModels,
  isTestingConnection,
  isLoadingModels,
  connectionResult,
  initialCustomModel,
  onApiKeyChange,
  onModelChange,
  onTestConnection,
  onLoadModels,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(initialCustomModel ?? false);

  // Group catalog models by category
  const categories = useMemo(() => {
    const map = new Map<string, typeof SUMOPOD_CATALOG_MODELS[number][]>();
    for (const item of SUMOPOD_CATALOG_MODELS) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div className="ai-config-bar" data-testid="ai-provider-config-panel">
      <div className="ai-config-row" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              background: 'linear-gradient(135deg, #00d2ff 0%, #2f81f7 100%)',
              color: '#050a10',
              fontWeight: 800,
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '4px',
            }}
          >
            AI PROVIDER
          </span>
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
            SumoPod AI (OpenAI-Compatible)
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {baseUrl}
          </span>
        </div>

        {/* Live Status Pill */}
        {connectionResult && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              background: connectionResult.success
                ? 'rgba(35, 134, 54, 0.2)'
                : 'rgba(248, 81, 73, 0.2)',
              border: `1px solid ${
                connectionResult.success ? 'rgba(35, 134, 54, 0.4)' : 'rgba(248, 81, 73, 0.4)'
              }`,
              color: connectionResult.success ? '#3fb950' : '#f85149',
            }}
          >
            <span>{connectionResult.success ? '●' : '▲'}</span>
            <span>{connectionResult.status}</span>
            {connectionResult.latencyMs !== undefined && (
              <span>({connectionResult.latencyMs}ms)</span>
            )}
          </div>
        )}
      </div>

      <div className="ai-config-row">
        {/* API Key Input */}
        <div className="ai-field-group" style={{ flex: '1.2', minWidth: '240px' }}>
          <label className="ai-field-label" htmlFor="sumopod-api-key">
            SumoPod API Key (Secret)
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              id="sumopod-api-key"
              data-testid="sumopod-api-key-input"
              type={showPassword ? 'text' : 'password'}
              className="ai-input-text"
              style={{ flex: 1 }}
              placeholder="Masukkan API Key SumoPod..."
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="ai-btn ai-btn-secondary"
              style={{ padding: '7px 10px', fontSize: '12px' }}
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* Model Selection */}
        <div className="ai-field-group" style={{ flex: '1.4', minWidth: '260px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="ai-field-label" htmlFor="sumopod-model-select">
              Model SumoPod
            </label>
            <button
              type="button"
              onClick={() => setIsCustomModel(!isCustomModel)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {isCustomModel ? 'Pilih dari Katalog' : 'Ketik Manual'}
            </button>
          </div>

          {isCustomModel ? (
            <input
              id="sumopod-model-input"
              data-testid="sumopod-model-input"
              type="text"
              className="ai-input-text"
              placeholder="Contoh: claude-sonnet-4-6 atau gpt-4o-mini"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            />
          ) : (
            <select
              id="sumopod-model-select"
              data-testid="sumopod-model-select"
              className="ai-input-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {availableModels.length > 0 && (
                <optgroup label="🌐 Live Discovered Models (dari SumoPod /models)">
                  {availableModels.map((m) => (
                    <option key={`live-${m}`} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              )}

              {categories.map(([catName, models]) => (
                <optgroup key={catName} label={`⚡ ${catName}`}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingTop: '16px' }}>
          <button
            type="button"
            data-testid="btn-load-models"
            className="ai-btn ai-btn-secondary"
            onClick={onLoadModels}
            disabled={isLoadingModels || !apiKey.trim()}
          >
            {isLoadingModels ? '⏳ Memuat...' : '📋 Load Models'}
          </button>

          <button
            type="button"
            data-testid="btn-test-connection"
            className="ai-btn ai-btn-secondary"
            onClick={onTestConnection}
            disabled={isTestingConnection || !apiKey.trim()}
          >
            {isTestingConnection ? '🔄 Menghubungkan...' : '🔌 Test Connection'}
          </button>
        </div>
      </div>

      {/* Connection Result Diagnostic Banner */}
      {connectionResult && (
        <div
          data-testid="connection-result-banner"
          style={{
            padding: '8px 12px',
            borderRadius: '5px',
            fontSize: '12px',
            lineHeight: 1.5,
            background: connectionResult.success ? 'rgba(35, 134, 54, 0.1)' : 'rgba(248, 81, 73, 0.1)',
            border: `1px solid ${
              connectionResult.success ? 'rgba(35, 134, 54, 0.3)' : 'rgba(248, 81, 73, 0.3)'
            }`,
            color: connectionResult.success ? '#7ee787' : '#ff7b72',
          }}
        >
          <strong style={{ marginRight: '6px' }}>
            {connectionResult.success ? '✓ Terhubung ke SumoPod:' : '✗ Gagal Menghubungi SumoPod:'}
          </strong>
          {connectionResult.message}
          {connectionResult.availableModels && connectionResult.availableModels.length > 0 && (
            <span style={{ marginLeft: '6px', color: 'var(--text-secondary)' }}>
              ({connectionResult.availableModels.length} model tersedia)
            </span>
          )}
        </div>
      )}
    </div>
  );
};
