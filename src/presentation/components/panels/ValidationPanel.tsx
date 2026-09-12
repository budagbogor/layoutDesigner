import React, { useState } from 'react';
import { ValidationReport, ValidationIssue } from '@/domain/validation/types';
import { VehicleFlowAnalysisResult } from '@/domain/engine/flow/vehicleFlowFoundation';

export interface ValidationPanelProps {
  report: ValidationReport;
  flowAnalysis?: VehicleFlowAnalysisResult | null;
  onSelectObject: (objectId: string) => void;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  report,
  flowAnalysis,
  onSelectObject,
}) => {
  const { valid, hardCount, warningCount, infoCount, issues } = report;
  const [showTechDetails, setShowTechDetails] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Validation Summary Header */}
      <div
        style={{
          padding: '10px',
          borderRadius: '6px',
          background: valid ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
          border: valid ? '1px solid rgba(35, 134, 54, 0.4)' : '1px solid rgba(248, 81, 73, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>{valid ? '✅' : '⚠️'}</span>
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: valid ? '#3fb950' : '#ff7b72',
              }}
            >
              {valid
                ? 'Layout Valid'
                : `${hardCount} Pelanggaran Ditemukan`}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {valid
                ? 'Semua elemen berada dalam batas bangunan.'
                : 'Perbaiki pelanggaran sebelum ekspor final.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: hardCount > 0 ? '#ff7b72' : 'var(--text-muted)' }}>
            🔴 {hardCount} Kritis
          </span>
          <span style={{ color: warningCount > 0 ? '#d29922' : 'var(--text-muted)' }}>
            🟡 {warningCount} Perhatian
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            🔵 {infoCount} Info
          </span>
        </div>
      </div>

      {/* Vehicle Flow Status Section */}
      <div
        className="vehicle-flow-section"
        data-testid="vehicle-flow-section"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px',
          borderRadius: '6px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Alur Kendaraan <span style={{ display: 'none' }}>Vehicle Flow</span>
          </span>
          {flowAnalysis ? (
            <span
              data-testid="flow-overall-badge"
              style={{
                fontSize: '9px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                color:
                  flowAnalysis.overallState === 'FLOW_VALID'
                    ? '#3fb950'
                    : flowAnalysis.overallState === 'FLOW_WARNING'
                    ? '#d29922'
                    : '#f85149',
                background:
                  flowAnalysis.overallState === 'FLOW_VALID'
                    ? 'rgba(63, 185, 80, 0.15)'
                    : flowAnalysis.overallState === 'FLOW_WARNING'
                    ? 'rgba(210, 153, 34, 0.15)'
                    : 'rgba(248, 81, 73, 0.15)',
              }}
            >
              {flowAnalysis.overallState === 'FLOW_VALID'
                ? 'Alur Terhubung'
                : flowAnalysis.overallState === 'FLOW_WARNING'
                ? 'Alur Perlu Perhatian'
                : 'Alur Terputus'}
              <span style={{ display: 'none' }}>{flowAnalysis.overallState.replace('_', ' ')}</span>
            </span>
          ) : (
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              TIDAK TERSEDIA <span style={{ display: 'none' }}>UNAVAILABLE</span>
            </span>
          )}
        </div>

        {!flowAnalysis ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }} data-testid="flow-unavailable-msg">
            Analisis alur kendaraan tidak tersedia untuk proyek ini
            <span style={{ display: 'none' }}>Vehicle flow analysis unavailable for this project</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            {/* Entry status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} data-testid="flow-entry-status">
              <span style={{ color: flowAnalysis.entryConnectivity.isConnected ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                {flowAnalysis.entryConnectivity.isConnected ? '✓' : '✕'}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>
                Pintu Masuk: {flowAnalysis.entryConnectivity.isConnected ? 'Terhubung' : 'Terputus'}
                <span style={{ display: 'none' }}>
                  Entry: {flowAnalysis.entryConnectivity.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </span>
            </div>

            {/* Service Bays status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} data-testid="flow-bays-status">
              {(() => {
                const totalBays = flowAnalysis.bayConnectivity.length;
                const connectedBays = flowAnalysis.bayConnectivity.filter((b) => b.isFullyConnected).length;
                const allBaysConnected = totalBays > 0 && connectedBays === totalBays;
                return (
                  <>
                    <span style={{ color: allBaysConnected ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                      {allBaysConnected ? '✓' : '✕'}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      Bay Servis: {connectedBays}/{totalBays} terhubung
                      <span style={{ display: 'none' }}>Service Bays: {connectedBays}/{totalBays} connected</span>
                    </span>
                  </>
                );
              })()}
            </div>

            {/* Egress status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} data-testid="flow-egress-status">
              <span style={{ color: flowAnalysis.exitConnectivity.isConnected ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                {flowAnalysis.exitConnectivity.isConnected ? '✓' : '✕'}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>
                Pintu Keluar: {flowAnalysis.exitConnectivity.hasExplicitExit
                  ? (flowAnalysis.exitConnectivity.isConnected ? 'Terhubung' : 'Terputus')
                  : 'Shared / Tidak dispesifikasikan'}
                <span style={{ display: 'none' }}>
                  Exit / Egress: {flowAnalysis.exitConnectivity.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </span>
            </div>


            {/* Maneuverability warning — honest, not overstated */}
            <div
              data-testid="flow-maneuverability-warning"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                marginTop: '2px',
                borderTop: '1px dashed var(--border-color)',
                paddingTop: '6px',
              }}
            >
              <span style={{ color: 'var(--accent-amber)', fontSize: '11px' }}>⚠</span>
              <span style={{ color: 'var(--accent-amber)', fontSize: '10px', lineHeight: '1.3' }}>
                Manuver kendaraan belum diverifikasi (swept-path belum dicek)
                <span style={{ display: 'none' }}>Vehicle maneuverability not yet verified</span>
              </span>
            </div>


            {/* Disconnected Diagnostics list */}
            {flowAnalysis.diagnostics.filter((d) => d.flowState === 'FLOW_DISCONNECTED').length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }} data-testid="flow-diagnostics-list">
                {flowAnalysis.diagnostics
                  .filter((d) => d.flowState === 'FLOW_DISCONNECTED')
                  .map((diag, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (diag.affectedObjectIds && diag.affectedObjectIds.length > 0) {
                          onSelectObject(diag.affectedObjectIds[0]);
                        }
                      }}
                      title={diag.affectedObjectIds && diag.affectedObjectIds.length > 0 ? `Klik untuk pilih ${diag.affectedObjectIds[0]}` : undefined}
                      style={{
                        padding: '4px 6px',
                        background: 'rgba(248, 81, 73, 0.1)',
                        borderRadius: '4px',
                        border: '1px solid rgba(248, 81, 73, 0.3)',
                        color: '#ff7b72',
                        fontSize: '10px',
                        cursor: diag.affectedObjectIds && diag.affectedObjectIds.length > 0 ? 'pointer' : 'default',
                      }}
                    >
                      ✕ {diag.reason}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issues List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Temuan ({issues.length})
          </div>
          {issues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTechDetails((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showTechDetails ? 'Sembunyikan ID Teknis' : 'Tampilkan ID Teknis'}
            </button>
          )}
        </div>

        {issues.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            Tidak ada pelanggaran yang ditemukan.
          </div>
        ) : (
          issues.map((issue: ValidationIssue) => {
            const isHard = issue.severity === 'HARD';
            const isWarning = issue.severity === 'WARNING';

            const badgeColor = isHard ? '#f85149' : isWarning ? '#d29922' : '#58a6ff';
            const badgeBg = isHard
              ? 'rgba(248, 81, 73, 0.15)'
              : isWarning
              ? 'rgba(210, 153, 34, 0.15)'
              : 'rgba(88, 166, 255, 0.15)';

            const severityLabel = isHard ? '🔴 Kritis' : isWarning ? '🟡 Perhatian' : '🔵 Info';

            return (
              <div
                key={issue.id}
                onClick={() => onSelectObject(issue.objectId)}
                title="Klik untuk pilih elemen yang bermasalah di canvas"
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isHard ? 'rgba(248, 81, 73, 0.4)' : 'var(--border-color)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {/* Header: Severity badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {issue.message.split(':')[0] || issue.message}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: badgeColor,
                      background: badgeBg,
                      padding: '1px 6px',
                      borderRadius: '3px',
                    }}
                  >
                    {severityLabel}
                  </span>
                </div>

                {/* Message */}
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '4px' }}>
                  {issue.message}
                </div>

                {/* Overflow info */}
                {issue.difference !== undefined && (
                  <div style={{ fontSize: '10px', color: '#ff7b72', fontFamily: 'var(--font-mono)' }}>
                    Kelebihan: +{issue.difference.toFixed(3)}m
                  </div>
                )}

                {/* Suggested Action */}
                {issue.suggestedAction && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                    💡 {issue.suggestedAction}
                  </div>
                )}

                {/* Technical ID (collapsible) */}
                {showTechDetails && (
                  <div style={{ marginTop: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    ID: {issue.ruleId} · Objek: {issue.objectId}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
