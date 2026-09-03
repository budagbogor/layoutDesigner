// ---------------------------------------------------------------------------
// FASE 3.7 — AI Requirement Input Panel
//
// Renders:
// - Example Prompt Pills (Bengkel kecil, keluarga, banyak bay, premium)
// - Large natural-language requirement textarea
// - Primary "Analyze Requirement" action button with loading state
// - Input character count & validation error banner
// ---------------------------------------------------------------------------

import React from 'react';

export interface PromptPreset {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

export const EXAMPLE_PROMPT_PRESETS: readonly PromptPreset[] = [
  {
    id: 'small',
    label: '🏎️ Bengkel Kecil (12×18m, 2 Bay)',
    text: 'Saya punya tanah 12x18 meter, ingin membangun bengkel mobil cepat ukuran 10x15 meter. Butuh 2 bay servis (1 servis umum, 1 quick lube). Fasilitas penunjang ruang tunggu pelanggan kecil, kasir, dan toilet. Pintu masuk di depan tengah.',
  },
  {
    id: 'family',
    label: '👨‍👩‍👧 Bengkel Keluarga (15×25m, 3 Bay)',
    text: 'Bengkel mobil keluarga di lahan 15x25 meter, bangunan 12x20 meter. Butuh 3 bay servis umum dengan lift 2-post, area ruang tunggu ber-AC yang nyaman, kasir, gudang sparepart, dan toilet. Pintu masuk depan tengah, prioritaskan flow yang seimbang dan nyaman.',
  },
  {
    id: 'high-capacity',
    label: '🏢 Banyak Bay (25×40m, 6 Bay)',
    text: 'Ingin bengkel kapasitas maksimal di lahan 25x40 meter, ukuran bangunan 20x32 meter. Butuh 6 bay servis: 4 servis umum dengan lift, 1 quick lube, 1 spooring & ban. Alur masuk dari depan kiri dan keluar belakang tengah (drive-through). Parkir pelanggan 6 mobil, gudang part besar, ruang tunggu, dan toilet.',
  },
  {
    id: 'premium',
    label: '✨ Bengkel Premium (20×35m, 4 Bay + Lounge)',
    text: 'Saya ingin bengkel mobil premium di lahan 20x35 meter, bangunan 16x28 meter dengan setback depan 5 meter. Layanan: 2 bay servis umum, 1 quick lube, 1 detailing & spooring. Ruang tunggu pelanggan mewah dengan kaca tembus pandang ke area servis, kasir, gudang part, ruang kompresor, dan toilet. Akses masuk depan kiri, keluar belakang.',
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
          <span>📝</span>
          <span>Deskripsi Kebutuhan Bengkel (Bahasa Alami)</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {prompt.length} karakter
        </span>
      </div>

      <div className="ai-studio-card-body">
        {/* Example Presets */}
        <div className="prompt-chips-container">
          <span className="prompt-chips-label">Pilih Contoh Kebutuhan (Klik untuk Mengisi):</span>
          <div className="prompt-chips-list">
            {EXAMPLE_PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="prompt-chip"
                onClick={() => onSelectExample(preset.text)}
                data-testid={`preset-btn-${preset.id}`}
                disabled={isAnalyzing}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          data-testid="ai-prompt-textarea"
          className="ai-prompt-textarea"
          placeholder="Saya ingin membuat bengkel mobil di lahan 20 x 30 meter dengan ukuran bangunan 15 x 22 meter. Memerlukan 3 bay servis umum, 1 bay quick lube, ruang tunggu ber-AC, kasir, gudang suku cadang, dan toilet. Pintu masuk di depan tengah..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isAnalyzing}
          rows={7}
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
            style={{ minWidth: '220px', padding: '10px 20px', fontSize: '13px' }}
            onClick={onAnalyze}
            disabled={isAnalyzing || prompt.trim().length === 0}
          >
            {isAnalyzing ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙️</span>
                <span>Menganalisis Kebutuhan...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Analyze Requirement</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
