'use client';

/**
 * Mobeng Workshop Studio — Layout Summary Panel (Phase 3.3)
 *
 * Displays:
 * 1. Physical Bay Count (by canonical bay type)
 * 2. Service / Function list (from requirement)
 * 3. Space Program grouped by Functional Zone
 * 4. Requirement Traceability (requirement vs generated vs status)
 *
 * Data source: deriveLayoutSummary() — pure domain function.
 * Properties Panel is NOT modified.
 */

import React, { useState } from 'react';
import {
  deriveLayoutSummary,
  LayoutSummaryResult,
  TraceabilityStatus,
  SpaceGroupSummary,
  TraceabilityItem,
} from '@/domain/summary/layoutSummaryEngine';
import {
  WorkshopLayoutRequirement,
} from '@/domain/requirements/requirementTypes';
import { LayoutObject } from '@/domain/models/project';
import { FUNCTIONAL_ZONE_COLORS, FunctionalZone } from '@/domain/models/functionalZone';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TraceabilityStatus, { icon: string; label: string; color: string; bg: string }> = {
  FULFILLED: {
    icon: '✓',
    label: 'TERPENUHI',
    color: '#3fb950',
    bg: 'rgba(46, 160, 67, 0.10)',
  },
  FULFILLED_AS_FUNCTION: {
    icon: '✓',
    label: 'FUNGSI',
    color: '#79c0ff',
    bg: 'rgba(0, 210, 255, 0.08)',
  },
  NOT_GENERATED: {
    icon: '—',
    label: 'BELUM DIBUAT',
    color: '#8b949e',
    bg: 'rgba(139, 148, 158, 0.08)',
  },
  NOT_FULFILLED: {
    icon: '✕',
    label: 'TIDAK TERPENUHI',
    color: '#f85149',
    bg: 'rgba(248, 81, 73, 0.10)',
  },
};

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; icon: string }> = ({ title, icon }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border-color)',
  }}>
    <span style={{ fontSize: '13px' }}>{icon}</span>
    <span style={{
      fontSize: '10px',
      fontWeight: 700,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
    }}>
      {title}
    </span>
  </div>
);

// ─── Physical Bay Count Card ──────────────────────────────────────────────────

const PhysicalBayCard: React.FC<{ summary: LayoutSummaryResult }> = ({ summary }) => {
  const { physicalBays, hasGeneratedLayout } = summary;

  const rows = [
    { label: 'Service Bay', count: physicalBays.serviceBayCount },
    { label: 'Spooring Bay', count: physicalBays.spooringBayCount },
    { label: 'General Repair Bay', count: physicalBays.generalRepairBayCount },
  ].filter((r) => hasGeneratedLayout ? r.count > 0 : true);

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <SectionHeader title="Physical Bays" icon="🔧" />

      {!hasGeneratedLayout ? (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Layout belum terbentuk
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rows.map((row) => (
            <div key={row.label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: '#3fb950',
                background: 'rgba(46, 160, 67, 0.12)',
                padding: '1px 8px',
                borderRadius: '10px',
                fontSize: '11px',
              }}>
                {row.count}
              </span>
            </div>
          ))}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            borderTop: '1px solid var(--border-color)',
            marginTop: '4px',
            paddingTop: '4px',
          }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Total Physical Bays</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              color: 'var(--accent-cyan)',
              background: 'rgba(0, 210, 255, 0.12)',
              padding: '1px 10px',
              borderRadius: '10px',
              fontSize: '12px',
            }}>
              {physicalBays.totalPhysicalBays}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Services / Functions Card ────────────────────────────────────────────────

const ServiceFunctionsCard: React.FC<{ summary: LayoutSummaryResult }> = ({ summary }) => {
  const { serviceFunctions } = summary;

  if (serviceFunctions.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <SectionHeader title="Layanan & Fungsi" icon="⚙️" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {serviceFunctions.map((svc) => (
          <div key={svc.serviceType} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: svc.isPhysicalBay ? '#3fb950' : '#79c0ff',
              flexShrink: 0,
            }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {svc.displayLabel}
            </span>
            {svc.bayCount > 1 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>×{svc.bayCount}</span>
            )}
            {!svc.isPhysicalBay && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '9px',
                color: '#79c0ff',
                background: 'rgba(0, 210, 255, 0.10)',
                padding: '1px 5px',
                borderRadius: '8px',
              }}>
                fungsi
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Space Program Card ───────────────────────────────────────────────────────

const ZONE_ICONS: Record<FunctionalZone, string> = {
  CUSTOMER: '👥',
  WORKSHOP: '🔧',
  BACK_OF_HOUSE: '🏠',
  STORAGE_LOGISTICS: '📦',
};

const SpaceProgramCard: React.FC<{ summary: LayoutSummaryResult }> = ({ summary }) => {
  const { spaceProgram, hasGeneratedLayout } = summary;
  const [expanded, setExpanded] = useState(true);

  if (!hasGeneratedLayout) {
    return null;
  }

  if (spaceProgram.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: expanded ? '8px' : '0',
        paddingBottom: expanded ? '6px' : '0',
        borderBottom: expanded ? '1px solid var(--border-color)' : 'none',
        cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🗺️</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
          }}>
            Program Ruang
          </span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {spaceProgram.map((group: SpaceGroupSummary) => {
            const zoneColors = FUNCTIONAL_ZONE_COLORS[group.zone];
            const icon = ZONE_ICONS[group.zone] ?? '📍';
            return (
              <div key={group.zone}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginBottom: '4px',
                }}>
                  <span>{icon}</span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: zoneColors.text,
                    textTransform: 'uppercase',
                  }}>
                    {group.zoneLabel}
                  </span>
                </div>
                <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {group.spaces.map((space) => (
                    <div key={space.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}>
                      <span style={{ color: zoneColors.text, fontSize: '10px' }}>✓</span>
                      <span>{space.humanLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Traceability Card ────────────────────────────────────────────────────────

const TraceabilityCard: React.FC<{ summary: LayoutSummaryResult }> = ({ summary }) => {
  const { traceability } = summary;
  const [expanded, setExpanded] = useState(true);

  if (traceability.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: expanded ? '8px' : '0',
        paddingBottom: expanded ? '6px' : '0',
        borderBottom: expanded ? '1px solid var(--border-color)' : 'none',
        cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>📋</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
          }}>
            Kebutuhan vs Hasil
          </span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {traceability.map((item: TraceabilityItem, idx: number) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <div key={`${item.label}-${idx}`} style={{
                background: cfg.bg,
                border: `1px solid ${cfg.color}22`,
                borderRadius: '4px',
                padding: '6px 8px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '2px',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: cfg.color,
                    background: `${cfg.color}20`,
                    padding: '1px 6px',
                    borderRadius: '8px',
                  }}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                }}>
                  <span>Req: <strong style={{ color: 'var(--text-secondary)' }}>{item.requirementCount}</strong></span>
                  {item.generatedCount !== null && (
                    <span>Generated: <strong style={{ color: cfg.color }}>{item.generatedCount}</strong></span>
                  )}
                  {item.notes && (
                    <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>{item.notes}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface LayoutSummaryPanelProps {
  /** The original requirement from user input — source of truth for services */
  readonly requirement: WorkshopLayoutRequirement | null;
  /** Layout objects from the ACTIVE candidate — may be null if no generation */
  readonly activeLayoutObjects: readonly LayoutObject[] | null;
  /** True if a valid layout was successfully generated */
  readonly hasGeneratedLayout: boolean;
}

export const LayoutSummaryPanel: React.FC<LayoutSummaryPanelProps> = ({
  requirement,
  activeLayoutObjects,
  hasGeneratedLayout,
}) => {
  if (!requirement) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        gap: '8px',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}
        data-testid="layout-summary-empty"
      >
        <span style={{ fontSize: '24px' }}>📋</span>
        <span style={{ fontSize: '12px', fontWeight: 600 }}>Belum Ada Requirement</span>
        <span style={{ fontSize: '11px', lineHeight: 1.5 }}>
          Buat layout baru melalui Workshop Baru untuk melihat summary.
        </span>
      </div>
    );
  }

  const summary = deriveLayoutSummary(
    requirement,
    activeLayoutObjects,
    hasGeneratedLayout
  );

  return (
    <div
      data-testid="layout-summary-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '0' }}
    >
      {/* Failed Generation Notice */}
      {!hasGeneratedLayout && (
        <div style={{
          background: 'rgba(210, 153, 34, 0.10)',
          border: '1px solid rgba(210, 153, 34, 0.35)',
          borderRadius: '6px',
          padding: '8px 12px',
          marginBottom: '12px',
          fontSize: '11px',
          color: '#e3b341',
          display: 'flex',
          gap: '6px',
          alignItems: 'flex-start',
        }}
          data-testid="layout-not-generated-notice"
        >
          <span>⚠️</span>
          <span>
            <strong>LAYOUT BELUM TERBENTUK.</strong> Summary requirement ditampilkan sebagai referensi.
            Hasil layout tidak tersedia.
          </span>
        </div>
      )}

      <PhysicalBayCard summary={summary} />
      <ServiceFunctionsCard summary={summary} />
      <SpaceProgramCard summary={summary} />
      <TraceabilityCard summary={summary} />
    </div>
  );
};
