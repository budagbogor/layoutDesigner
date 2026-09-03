// ---------------------------------------------------------------------------
// FASE 3.7 — AI Analysis Result Panel
//
// Displays:
// - Status Badges (COMPLETE / NEEDS_CLARIFICATION / INVALID)
// - Confidence score
// - AI Reasoning summary
// - Structured Semantic Requirement Cards (Zero CAD coordinates)
// - Clarification Questions when missing/ambiguous
// - Purely semantic: NO x, y, rotation, polygon, clearance, or envelope geometry
// ---------------------------------------------------------------------------

import React from 'react';
import {
  AIParseResult,
  ClarificationQuestion,
} from '../../../application/ai/requirementParser';
import { WorkshopLayoutRequirement } from '../../../domain/requirements/requirementTypes';

export interface AiAnalysisResultPanelProps {
  readonly result: AIParseResult | null;
  readonly isAnalyzing: boolean;
  readonly onAppendOptionToPrompt?: (text: string) => void;
}

export const AiAnalysisResultPanel: React.FC<AiAnalysisResultPanelProps> = ({
  result,
  isAnalyzing,
  onAppendOptionToPrompt,
}) => {
  return (
    <div className="ai-studio-card" data-testid="ai-analysis-result-panel">
      <div className="ai-studio-card-header">
        <div className="ai-studio-card-title">
          <span>📊</span>
          <span>Hasil Analisis Kebutuhan AI</span>
        </div>

        {result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              data-testid="analysis-status-badge"
              className={`status-badge ${
                result.status === 'COMPLETE'
                  ? 'status-badge-complete'
                  : result.status === 'NEEDS_CLARIFICATION'
                  ? 'status-badge-clarification'
                  : 'status-badge-invalid'
              }`}
            >
              {result.status.replace('_', ' ')}
            </span>

            {'confidence' in result && typeof result.confidence === 'number' && (
              <span
                data-testid="analysis-confidence-badge"
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-primary)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                }}
              >
                {Math.round(result.confidence * 100)}% Confidence
              </span>
            )}
          </div>
        )}
      </div>

      <div className="ai-studio-card-body">
        {/* State 1: Loading */}
        {isAnalyzing && (
          <div
            data-testid="analysis-loading-state"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '320px',
              gap: '16px',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: '32px', animation: 'spin 1.5s linear infinite' }}>⚙️</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                Sedang Menganalisis Kebutuhan Bengkel...
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
                SumoPod AI sedang mengekstrak program servis, dimensi lahan, akses, dan ruang penunjang.
              </div>
            </div>
          </div>
        )}

        {/* State 2: Idle (No Result Yet) */}
        {!isAnalyzing && !result && (
          <div
            data-testid="analysis-idle-state"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '320px',
              gap: '12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ fontSize: '36px', opacity: 0.6 }}>🤖</div>
            <div style={{ maxWidth: '360px' }}>
              <strong style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '13px' }}>
                Belum Ada Analisis Kebutuhan
              </strong>
              <span style={{ fontSize: '12px', lineHeight: 1.5 }}>
                Pilih salah satu contoh kebutuhan di sebelah kiri atau tuliskan spesifikasi bengkel Anda, lalu klik{' '}
                <span style={{ color: 'var(--accent-cyan)' }}>Analyze Requirement</span>.
              </span>
            </div>
          </div>
        )}

        {/* State 3: COMPLETE Result */}
        {!isAnalyzing && result?.status === 'COMPLETE' && (
          <div data-testid="analysis-complete-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Reasoning banner if provided */}
            {result.reasoning && (
              <div
                style={{
                  background: 'rgba(0, 210, 255, 0.05)',
                  border: '1px solid rgba(0, 210, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--accent-cyan)' }}>Insight AI: </strong>
                {result.reasoning}
              </div>
            )}

            {/* Render Semantic Requirements */}
            <SemanticRequirementView req={result.requirement} />

            {/* Next Step Guidance */}
            <div
              style={{
                background: 'rgba(35, 134, 54, 0.1)',
                border: '1px solid rgba(35, 134, 54, 0.3)',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#7ee787',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✅</span>
              <span>
                <strong>Spesifikasi Kebutuhan Lengkap & Valid:</strong> Kontrak semantik siap diterjemahkan ke engine input layout pada fase berikutnya.
              </span>
            </div>
          </div>
        )}

        {/* State 4: NEEDS_CLARIFICATION Result */}
        {!isAnalyzing && result?.status === 'NEEDS_CLARIFICATION' && (
          <div
            data-testid="analysis-clarification-view"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div
              style={{
                background: 'rgba(210, 153, 34, 0.1)',
                border: '1px solid rgba(210, 153, 34, 0.35)',
                borderRadius: '6px',
                padding: '12px 14px',
                color: '#f0c674',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              <strong>⚠️ Informasi Belum Lengkap:</strong> AI membutuhkan rincian tambahan sebelum dapat menyusun kebutuhan layout bengkel secara akurat:
            </div>

            {/* Questions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.questions.map((q, idx) => (
                <div key={idx} className="clarification-question-box" data-testid="clarification-question-item">
                  <div className="clarification-question-text">
                    {idx + 1}. {q.question}
                  </div>
                  {q.suggestedOptions && q.suggestedOptions.length > 0 && (
                    <div className="clarification-options-list">
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Pilihan Jawaban:
                      </span>
                      {q.suggestedOptions.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          type="button"
                          className="clarification-option-btn"
                          onClick={() => onAppendOptionToPrompt?.(` [${q.field}: ${opt}]`)}
                          title="Klik untuk menambahkan opsi ini ke deskripsi kebutuhan"
                        >
                          + {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Partial Extracted Data */}
            {result.partialRequirement && Object.keys(result.partialRequirement).length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.5px',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                >
                  Data Parsial yang Berhasil Teridentifikasi:
                </span>
                <PartialRequirementView partial={result.partialRequirement} />
              </div>
            )}
          </div>
        )}

        {/* State 5: INVALID Result */}
        {!isAnalyzing && result?.status === 'INVALID' && (
          <div
            data-testid="analysis-invalid-view"
            style={{
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.35)',
              borderRadius: '6px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              color: '#ff7b72',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700 }}>
              <span>🛑</span>
              <span>Kebutuhan Tidak Dapat Diproses</span>
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {result.reason}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              💡 Silakan periksa kembali API Key, koneksi jaringan ke SumoPod, atau lengkapi deskripsi bengkel Anda secara lebih deskriptif.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Semantic Requirement Sub-Views (No CAD Geometry)
// ---------------------------------------------------------------------------

const SemanticRequirementView: React.FC<{ req: WorkshopLayoutRequirement }> = ({ req }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 1. Identity & Profile */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🏷️</span>
          <span>Identitas & Profil Workshop</span>
        </div>
        <div className="spec-items-grid">
          <div className="spec-item-box">
            <div className="spec-item-label">Nama Proyek</div>
            <div className="spec-item-value">{req.projectName}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Tipe Workshop</div>
            <div className="spec-item-value">{req.workshopType}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Kategori Kendaraan</div>
            <div className="spec-item-value">{req.vehicleCategory}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Prioritas Bisnis</div>
            <div className="spec-item-value">{req.priority}</div>
          </div>
        </div>
      </div>

      {/* 2. Site & Building */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>📐</span>
          <span>Dimensi Lahan & Bangunan (Semantik)</span>
        </div>
        <div className="spec-items-grid">
          <div className="spec-item-box">
            <div className="spec-item-label">Ukuran Lahan</div>
            <div className="spec-item-value">
              {req.site.widthMeters}m × {req.site.lengthMeters}m
              {req.site.roadOrientation && ` (${req.site.roadOrientation})`}
            </div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Ukuran Bangunan</div>
            <div className="spec-item-value">
              {req.building.widthMeters}m × {req.building.lengthMeters}m
              {req.building.frontSetbackMeters !== undefined &&
                ` (Setback ${req.building.frontSetbackMeters}m)`}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Access */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🚪</span>
          <span>Akses & Sirkulasi</span>
        </div>
        <div className="spec-items-grid">
          <div className="spec-item-box">
            <div className="spec-item-label">Pintu Masuk Kendaraan</div>
            <div className="spec-item-value">{req.access.entryPosition}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Pintu Keluar Kendaraan</div>
            <div className="spec-item-value">
              {req.access.exitPosition ?? '(Tidak dispesifikasikan)'}
              {req.access.preferDriveThrough ? ' · Preferensi: Drive-Through' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Service Program */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🔧</span>
          <span>Program Layanan & Bay Servis</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {req.services.map((svc, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                background: 'rgba(28, 36, 51, 0.6)',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>{svc.serviceType}</strong>
                {svc.requiredLifts && svc.requiredLifts.length > 0 && (
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    ({svc.requiredLifts.join(', ')})
                  </span>
                )}
              </div>
              <span
                style={{
                  background: 'var(--accent-cyan)',
                  color: '#050a10',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {svc.bayCount} Bay
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Ancillary Spaces */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🛋️</span>
          <span>Fasilitas Penunjang</span>
        </div>
        <div className="spec-tag-list">
          {req.ancillarySpaces.customerLounge && <span className="spec-tag">✓ Ruang Tunggu</span>}
          {req.ancillarySpaces.loungeWithBayView && <span className="spec-tag">✓ Kaca Tembus Bay</span>}
          {req.ancillarySpaces.cashierOffice && <span className="spec-tag">✓ Kantor Kasir</span>}
          {req.ancillarySpaces.partsWarehouse && <span className="spec-tag">✓ Gudang Sparepart</span>}
          {req.ancillarySpaces.restroom && <span className="spec-tag">✓ Toilet</span>}
          {req.ancillarySpaces.compressorRoom && <span className="spec-tag">✓ Ruang Kompresor</span>}
          {req.ancillarySpaces.oilWasteStorage && <span className="spec-tag">✓ Penyimpanan Oli</span>}
          {req.ancillarySpaces.staffRoom && <span className="spec-tag">✓ Ruang Staf</span>}
        </div>
      </div>
    </div>
  );
};

const PartialRequirementView: React.FC<{ partial: Partial<WorkshopLayoutRequirement> }> = ({
  partial,
}) => {
  return (
    <div
      style={{
        background: 'rgba(15, 20, 28, 0.4)',
        border: '1px solid var(--border-color)',
        borderRadius: '5px',
        padding: '10px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {partial.projectName && <div>Nama: {partial.projectName}</div>}
        {partial.workshopType && <div>Tipe: {partial.workshopType}</div>}
        {partial.vehicleCategory && <div>Kendaraan: {partial.vehicleCategory}</div>}
        {partial.site?.widthMeters && (
          <div>Lahan: {partial.site.widthMeters}×{partial.site.lengthMeters}m</div>
        )}
        {partial.building?.widthMeters && (
          <div>Bangunan: {partial.building.widthMeters}×{partial.building.lengthMeters}m</div>
        )}
      </div>
    </div>
  );
};
