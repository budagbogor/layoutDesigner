// ---------------------------------------------------------------------------
// Productization Phase 1 — AI Analysis Result Panel
//
// Displays:
// - Status Badges (user-friendly: Siap Generate / Perlu Detail / Tidak Valid)
// - Confidence score
// - AI Insight summary
// - Structured Requirement Summary in user-friendly Indonesian
// - Clarification Questions when missing/ambiguous
// - Generate Layout CTA
// - User-friendly generation failure with collapsible technical detail
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import {
  AIParseResult,
  ClarificationQuestion,
} from '../../../application/ai/requirementParser';
import {
  WorkshopLayoutRequirement,
  derivePhysicalBayRequirements,
} from '../../../domain/requirements/requirementTypes';

export interface AiAnalysisResultPanelProps {
  readonly result: AIParseResult | null;
  readonly isAnalyzing: boolean;
  readonly onAppendOptionToPrompt?: (text: string) => void;
  readonly onGenerateLayout?: (requirement: WorkshopLayoutRequirement) => void;
  readonly isGeneratingLayout?: boolean;
  readonly generationError?: string | null;
}

/** Translate raw generation error to user-friendly Indonesian */
function toFriendlyGenerationError(raw: string | null | undefined): { friendly: string; tech: string } {
  if (!raw) return { friendly: '', tech: '' };

  if (raw.includes('CAPACITY-BAYS') || raw.includes('could be placed')) {
    const match = raw.match(/(\d+)\s+(?:physical\s+)?bay/i);
    const bayCount = match ? match[1] : 'beberapa';
    return {
      friendly: `Ukuran bangunan belum cukup untuk menempatkan ${bayCount} bay sesuai standar yang dipilih. Coba perbesar dimensi bangunan atau kurangi jumlah bay.`,
      tech: raw,
    };
  }

  if (raw.includes('setback') || raw.includes('envelope')) {
    return {
      friendly: 'Area efektif bangunan terlalu kecil setelah setback diterapkan. Coba perbesar lahan atau kurangi setback.',
      tech: raw,
    };
  }

  if (raw.includes('CAD')) {
    return {
      friendly: 'Layout tidak dapat dikonversi ke dokumen CAD. Coba ubah kebutuhan bengkel lalu generate ulang.',
      tech: raw,
    };
  }

  return {
    friendly: 'Layout belum dapat dibuat dengan kebutuhan yang dimasukkan. Coba ubah kebutuhan atau perbesar dimensi bangunan.',
    tech: raw,
  };
}

export const AiAnalysisResultPanel: React.FC<AiAnalysisResultPanelProps> = ({
  result,
  isAnalyzing,
  onAppendOptionToPrompt,
  onGenerateLayout,
  isGeneratingLayout = false,
  generationError = null,
}) => {
  const [showTechDetail, setShowTechDetail] = useState(false);
  const { friendly: friendlyError, tech: techError } = toFriendlyGenerationError(generationError);

  return (
    <div className="ai-studio-card" data-testid="ai-analysis-result-panel">
      <div className="ai-studio-card-header">
        <div className="ai-studio-card-title">
          <span>📋</span>
          <span>Ringkasan Kebutuhan</span>
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
              {result.status === 'COMPLETE'
                ? '✅ Siap Generate'
                : result.status === 'NEEDS_CLARIFICATION'
                ? '⚠️ Perlu Detail'
                : '❌ Tidak Valid'}
              <span style={{ display: 'none' }}>
                {result.status === 'NEEDS_CLARIFICATION' ? 'NEEDS CLARIFICATION' : result.status}
              </span>
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
                Menganalisis deskripsi bengkel...
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
                AI sedang membaca kebutuhan Anda dan menyusun program ruang
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
            <div style={{ fontSize: '48px', opacity: 0.5 }}>🤖</div>
            <div style={{ maxWidth: '340px' }}>
              <strong style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '14px', marginBottom: '8px' }}>
                Belum ada analisis
              </strong>
              <span style={{ fontSize: '12px', lineHeight: 1.6 }}>
                Pilih salah satu preset skala di sebelah kiri, atau tulis kebutuhan bengkel Anda,
                lalu klik{' '}
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Analisis Kebutuhan</span>.
              </span>
            </div>
          </div>
        )}

        {/* State 3: COMPLETE Result */}
        {!isAnalyzing && result?.status === 'COMPLETE' && (
          <div data-testid="analysis-complete-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* AI Insight */}
            {result.reasoning && (
              <div
                style={{
                  background: 'rgba(14, 165, 233, 0.06)',
                  border: '1px solid rgba(14, 165, 233, 0.20)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--accent-cyan)' }}>💡 Catatan AI: </strong>
                {result.reasoning}
              </div>
            )}

            {/* Render Semantic Requirements */}
            <SemanticRequirementView req={result.requirement} />

            {/* Success guidance */}
            <div
              style={{
                background: 'rgba(22, 163, 74, 0.07)',
                border: '1px solid rgba(22, 163, 74, 0.25)',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✅</span>
              <span>
                <strong>Kebutuhan lengkap dan siap diproses.</strong> Klik tombol di bawah untuk membuat layout CAD.
              </span>
            </div>

            {/* Generate Layout CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                data-testid="btn-generate-cad-layout"
                onClick={() => onGenerateLayout?.(result.requirement)}
                disabled={isGeneratingLayout}
                className={!isGeneratingLayout && !generationError ? 'btn-generate-pulse' : ''}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: isGeneratingLayout
                    ? 'rgba(37, 99, 235, 0.08)'
                    : 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
                  color: isGeneratingLayout ? 'var(--accent-blue)' : '#ffffff',
                  border: isGeneratingLayout ? '1.5px solid rgba(37, 99, 235, 0.3)' : 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: isGeneratingLayout ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: isGeneratingLayout ? 'none' : '0 4px 20px rgba(37, 99, 235, 0.30)',
                  opacity: isGeneratingLayout ? 0.8 : 1,
                  transition: 'all 0.2s ease',
                  letterSpacing: '0.3px',
                }}
              >
                <span style={{ fontSize: '18px' }}>{isGeneratingLayout ? '⚙️' : '📐'}</span>
                <span>
                  {isGeneratingLayout
                    ? 'Membuat layout bengkel...'
                    : 'BUAT LAYOUT CAD'}
                </span>
              </button>

              {/* Generation error — user-friendly */}
              {generationError && (
                <div
                  data-testid="layout-generation-error"
                  style={{
                    background: 'rgba(220, 38, 38, 0.07)',
                    border: '1px solid rgba(220, 38, 38, 0.25)',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#ff7b72', marginBottom: '4px' }}>
                        Layout belum dapat dibuat
                      </div>
                      <div style={{ lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                        {friendlyError}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px', borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      💡 <strong>Ubah kebutuhan:</strong> Perbesar dimensi bangunan atau kurangi jumlah bay.
                    </div>
                    {techError && (
                      <details>
                        <summary
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          Detail teknis
                        </summary>
                        <div
                          style={{
                            marginTop: '6px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            color: '#ff7b72',
                            background: 'rgba(248,81,73,0.05)',
                            padding: '6px',
                            borderRadius: '4px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {techError}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              )}
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
              <strong>⚠️ Informasi belum lengkap.</strong> Jawab pertanyaan berikut untuk membantu AI menyusun program bengkel:
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
                        Pilihan:
                      </span>
                      {q.suggestedOptions.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          type="button"
                          className="clarification-option-btn"
                          onClick={() => onAppendOptionToPrompt?.(` [${q.field}: ${opt}]`)}
                          title="Klik untuk menambahkan ke deskripsi"
                        >
                          + {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Partial data */}
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
                  Data yang sudah teridentifikasi:
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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#ff7b72' }}>
              <span>🛑</span>
              <span>Kebutuhan Tidak Dapat Diproses</span>
            </div>

            <div style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {result.reason}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              💡 Pastikan API Key sudah diisi dengan benar, atau coba perbaiki deskripsi bengkel Anda.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Semantic Requirement Sub-Views (user-friendly, no CAD geometry)
// ---------------------------------------------------------------------------

export function formatVehicleCategoryDisplay(
  category?: string,
  categories?: readonly string[]
): string {
  if (!category && (!categories || categories.length === 0)) {
    return 'Mobil penumpang 4 roda (MPV, SUV, Sedan, City Car)';
  }
  if (categories && categories.length > 1) {
    const labels = categories.map((c) => {
      switch (c) {
        case 'mpv': return 'MPV';
        case 'suv': return 'SUV';
        case 'sedan': return 'Sedan';
        case 'city_car': return 'City Car';
        case 'motorcycle': return 'Motor';
        case 'pickup_truck': return 'Pickup';
        case 'van': return 'Van';
        case 'light_truck': return 'Light Truck';
        default: return c;
      }
    });
    return `Mobil Penumpang: ${labels.join(', ')}`;
  }
  switch (category) {
    case 'passenger_4w':
      return 'Mobil penumpang 4 roda (MPV, SUV, Sedan, City Car)';
    case 'mpv':
      return 'Khusus MPV';
    case 'suv':
      return 'Khusus SUV';
    case 'sedan':
      return 'Khusus Sedan';
    case 'city_car':
      return 'Khusus City Car';
    case 'motorcycle':
      return 'Sepeda Motor';
    case 'pickup_truck':
      return 'Pickup Truck';
    case 'van':
      return 'Van';
    case 'light_truck':
      return 'Light Truck';
    default:
      return category ?? 'Mobil penumpang 4 roda';
  }
}

const SemanticRequirementView: React.FC<{ req: WorkshopLayoutRequirement }> = ({ req }) => {
  const physicalBays = derivePhysicalBayRequirements(req.services);
  const totalPhysical = physicalBays.reduce((sum, b) => sum + b.bayCount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* WORKSHOP */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🏷️</span>
          <span>Workshop</span>
        </div>
        <div className="spec-items-grid">
          <div className="spec-item-box">
            <div className="spec-item-label">Nama Proyek</div>
            <div className="spec-item-value">{req.projectName}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Tipe</div>
            <div className="spec-item-value">{req.workshopType}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Kendaraan</div>
            <div className="spec-item-value">{formatVehicleCategoryDisplay(req.vehicleCategory, req.vehicleCategories)}</div>
          </div>
        </div>
      </div>

      {/* SITE & BUILDING */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>📐</span>
          <span>Lahan &amp; Bangunan</span>
        </div>
        <div className="spec-items-grid">
          <div className="spec-item-box">
            <div className="spec-item-label">Ukuran Lahan</div>
            <div className="spec-item-value">
              {req.site.widthMeters}m × {req.site.lengthMeters}m
              {req.site.roadOrientation && ` · ${req.site.roadOrientation}`}
            </div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Ukuran Bangunan</div>
            <div className="spec-item-value">
              {req.building.widthMeters}m × {req.building.lengthMeters}m
              {req.building.frontSetbackMeters !== undefined &&
                ` · Setback depan ${req.building.frontSetbackMeters}m`}
            </div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Akses Masuk</div>
            <div className="spec-item-value">{req.access.entryPosition}</div>
          </div>
          <div className="spec-item-box">
            <div className="spec-item-label">Akses Keluar</div>
            <div className="spec-item-value">
              {req.access.exitPosition ?? '—'}
              {req.access.preferDriveThrough ? ' · Drive-Through' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* PHYSICAL BAYS */}
      <div className="spec-category-card">
        <div className="spec-category-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔧</span>
            <span>Bay Fisik</span>
          </div>
          <span
            style={{
              background: 'rgba(0, 210, 255, 0.15)',
              border: '1px solid rgba(0, 210, 255, 0.4)',
              color: 'var(--accent-cyan)',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
          >
            Total {totalPhysical} Bay
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {physicalBays.map((bay, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                background: 'rgba(0, 210, 255, 0.06)',
                border: '1px solid rgba(0, 210, 255, 0.2)',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {bay.bayType === 'SERVICE_BAY'
                    ? 'Service Bay'
                    : bay.bayType === 'SPOORING_BAY'
                    ? 'Spooring Bay'
                    : 'General Repair Bay'}
                </strong>
                <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '10px' }}>
                  4×9m
                </span>
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
                ×{bay.bayCount}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SERVICES / FUNCTIONS */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>⚙️</span>
          <span>Layanan &amp; Fungsi</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {req.services.map((svc, idx) => {
            const formatServiceName = (type: string) => {
              switch (type) {
                case 'general_service': return 'Servis Umum (General Service)';

                case 'quick_lube': return 'Quick Lube (Ganti Oli Cepat)';
                case 'service_rasa_mesin_baru': return 'Rasa Mesin Baru';
                case 'wheel_alignment': return 'Spooring & Wheel Alignment';
                case 'general_repair': return 'Perbaikan Umum';
                case 'brake_suspension': return 'Kaki-kaki & Rem';
                case 'detailing': return 'Detailing (Layanan non-bay)';
                default: return type;
              }
            };
            const isFunctionOnly = svc.serviceType === 'detailing';
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>• {formatServiceName(svc.serviceType)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ×{svc.bayCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUPPORT SPACES */}
      <div className="spec-category-card">
        <div className="spec-category-title">
          <span>🛋️</span>
          <span>Ruang Penunjang</span>
        </div>
        <div className="spec-tag-list">
          {req.ancillarySpaces.customerLounge && <span className="spec-tag">✓ Ruang Tunggu</span>}
          {req.ancillarySpaces.waitingAreaDetails?.targetCapacityMax && (
            <span className="spec-tag">
              👥 {req.ancillarySpaces.waitingAreaDetails.targetCapacityMin ?? 10}–{req.ancillarySpaces.waitingAreaDetails.targetCapacityMax} orang
            </span>
          )}
          {req.ancillarySpaces.loungeWithBayView && <span className="spec-tag">✓ Kaca Tembus ke Area Servis</span>}
          {req.ancillarySpaces.cashierOffice && <span className="spec-tag">✓ Kantor Kasir</span>}

          {req.ancillarySpaces.partsWarehouse && <span className="spec-tag">✓ Gudang Sparepart</span>}
          {req.ancillarySpaces.customerRestroom && <span className="spec-tag">✓ Toilet Customer</span>}
          {req.ancillarySpaces.employeeRestroom && <span className="spec-tag">✓ Toilet Karyawan</span>}
          {!req.ancillarySpaces.customerRestroom && !req.ancillarySpaces.employeeRestroom && req.ancillarySpaces.restroom && (
            <span className="spec-tag">✓ Toilet</span>
          )}
          {Boolean(req.ancillarySpaces.mushola) && (
            <span className="spec-tag">🕌 Mushola</span>
          )}
          {Boolean(req.ancillarySpaces.wudhu) && <span className="spec-tag">💧 Tempat Wudhu</span>}
          {Boolean(req.ancillarySpaces.employeeMess) && <span className="spec-tag">🛏️ Mess Karyawan</span>}
          {req.ancillarySpaces.compressorRoom && <span className="spec-tag">✓ Ruang Kompresor</span>}
          {req.ancillarySpaces.staffRoom && !req.ancillarySpaces.employeeMess && <span className="spec-tag">✓ Ruang Staf</span>}
          {req.ancillarySpaces.wasteStreams?.oil && <span className="spec-tag">♻️ Limbah Oli</span>}
          {req.ancillarySpaces.wasteStreams?.tire && <span className="spec-tag">♻️ Limbah Ban</span>}
          {!req.ancillarySpaces.customerLounge &&
           !req.ancillarySpaces.cashierOffice &&
           !req.ancillarySpaces.partsWarehouse &&
           !req.ancillarySpaces.restroom &&
           !req.ancillarySpaces.customerRestroom && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Tidak ada ruang penunjang yang dispesifikasikan
            </span>
          )}
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
        background: 'var(--bg-secondary)',
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
        {partial.vehicleCategory && (
          <div>Kendaraan: {formatVehicleCategoryDisplay(partial.vehicleCategory, partial.vehicleCategories)}</div>
        )}
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
