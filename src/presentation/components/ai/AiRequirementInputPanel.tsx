// ---------------------------------------------------------------------------
// Productization Phase 1 — AI Requirement Input Panel
//
// Renders:
// - Scale preset pills (Compact / Medium / Big) with consistent labels
// - Large natural-language requirement textarea
// - Primary "Analisis Kebutuhan" action button with loading state
// - Input character count & validation error banner
// ---------------------------------------------------------------------------

import React from 'react';

export interface PromptPreset {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly text: string;
}

export const EXAMPLE_PROMPT_PRESETS: readonly PromptPreset[] = [
  {
    id: 'compact',
    label: '🏎️ Compact (12×18m, 2 Bay)',
    sublabel: 'Lahan 12×18m (Bangunan 10×15m) · 2 Bay Servis',
    text: 'Saya punya tanah 12x18 meter, ingin membangun bengkel mobil cepat ukuran 10x15 meter. Butuh 2 bay servis (1 servis umum, 1 Servis Rasa Mesin Baru). Fasilitas penunjang ruang tunggu pelanggan kecil, kasir, dan toilet. Pintu masuk di depan tengah.',
  },
  {
    id: 'medium',
    label: '🔧 Medium (15×25m, 3 Bay)',
    sublabel: 'Lahan 15×25m (Bangunan 15×20m) · 3 Bay Servis',
    text: 'Saya ingin bengkel mobil modern di lahan 15x25 meter, bangunan 15x20 meter dengan setback depan 4 meter. Layanan: 2 bay servis umum, 1 Servis Rasa Mesin Baru, 1 spooring. Ruang tunggu pelanggan dengan kaca tembus pandang ke area servis, kasir, gudang part, ruang kompresor, dan toilet. Akses masuk depan kiri.',
  },
  {
    id: 'big',
    label: '🏢 Big (25×40m, 6 Bay)',
    sublabel: 'Lahan 25×40m (Bangunan 20×32m) · 6 Bay Servis',
    text: 'Ingin bengkel kapasitas maksimal di lahan 25x40 meter, ukuran bangunan 20x32 meter. Butuh 6 bay servis: 4 servis umum dengan lift, 1 Servis Rasa Mesin Baru, 1 spooring & ban. Alur masuk dari depan kiri dan keluar belakang tengah (drive-through). Parkir pelanggan 6 mobil, gudang part besar, ruang tunggu, dan toilet.',
  },
];



export interface AiRequirementInputPanelProps {
  readonly prompt: string;
  readonly isAnalyzing: boolean;
  readonly analysisError: string | null;
  readonly onPromptChange: (prompt: string) => void;
  readonly onSelectExample: (promptText: string) => void;
  readonly onAnalyze: () => void;
}

export const AiRequirementInputPanel: React.FC<AiRequirementInputPanelProps> = ({
  prompt,
  isAnalyzing,
  analysisError,
  onPromptChange,
  onSelectExample,
  onAnalyze,
}) => {
  return (
    <div className="ai-studio-card" data-testid="ai-requirement-input-panel">
      <div className="ai-studio-card-header">
        <div className="ai-studio-card-title">
          <span>💬</span>
          <span>Deskripsikan Bengkel Anda</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {prompt.length} karakter
        </span>
      </div>

      <div className="ai-studio-card-body">
        {/* Scale Presets */}
        <div className="prompt-chips-container">
          <span className="prompt-chips-label">Pilih skala bengkel atau ketik sendiri di bawah:</span>
          <div className="prompt-chips-list">
            {EXAMPLE_PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="prompt-chip"
                onClick={() => onSelectExample(preset.text)}
                data-testid={`preset-btn-${preset.id}`}
                disabled={isAnalyzing}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '8px 12px' }}
              >
                <span style={{ fontWeight: 700, fontSize: '12px' }}>{preset.label}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>{preset.sublabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          data-testid="ai-prompt-textarea"
          className="ai-prompt-textarea"
          placeholder="Contoh: Saya ingin bengkel mobil di lahan 20×35 meter, bangunan 16×28 meter. Butuh 2 bay servis umum, 1 Servis Rasa Mesin Baru, 1 spooring. Ruang tunggu, kasir, gudang, dan toilet. Pintu masuk depan kiri, keluar belakang..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isAnalyzing}
          rows={8}
        />

        {/* Error message banner if any */}
        {analysisError && (
          <div
            data-testid="analysis-error-banner"
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              lineHeight: 1.5,
              background: 'rgba(248, 81, 73, 0.15)',
              border: '1px solid rgba(248, 81, 73, 0.4)',
              color: '#ff7b72',
            }}
          >
            <strong>⚠️ Perhatian:</strong> {analysisError}
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '10px' }}>
          <button
            type="button"
            data-testid="btn-analyze-requirement"
            className="ai-btn ai-btn-primary"
            style={{ minWidth: '240px', padding: '11px 20px', fontSize: '13px', fontWeight: 700 }}
            onClick={onAnalyze}
            disabled={isAnalyzing || prompt.trim().length === 0}
          >
            {isAnalyzing ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙️</span>
                <span>Menganalisis...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Analisis Kebutuhan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
