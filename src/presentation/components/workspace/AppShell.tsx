// ---------------------------------------------------------------------------
// FASE 3.7 — Unified Application Shell
//
// Hosts:
// 1. AI Workshop Assistant (Primary Default Entry Point)
// 2. CAD Workspace (Preserved existing CAD Canvas & Tools)
// ---------------------------------------------------------------------------

'use client';

import React, { useState } from 'react';
import { WorkshopProject } from '../../../domain/models/project';
import { AiWorkshopAssistant } from '../ai/AiWorkshopAssistant';
import { CadWorkspace } from './CadWorkspace';

export type AppViewMode = 'ai' | 'cad';

export interface AppShellProps {
  readonly initialProject: WorkshopProject;
  readonly initialMode?: AppViewMode;
  readonly initialApiKey?: string;
  readonly initialBaseUrl?: string;
  readonly initialModel?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  initialProject,
  initialMode = 'ai',
  initialApiKey,
  initialBaseUrl,
  initialModel,
}) => {
  const [viewMode, setViewMode] = useState<AppViewMode>(initialMode);

  return (
    <div className="cad-shell" data-testid="app-shell">
      {/* Top Application Header */}
      <header className="cad-header">
        <div className="brand-section">
          <span
            className="brand-badge"
            style={{
              background: viewMode === 'ai'
                ? 'linear-gradient(135deg, #00d2ff 0%, #2f81f7 100%)'
                : 'var(--accent-cyan)',
              color: '#050a10',
            }}
          >
            {viewMode === 'ai' ? 'AI DESIGN' : 'CAD CORE'}
          </span>
          <span className="brand-title">Mobeng Workshop Studio</span>
          <span className="header-status-badge">Phase 3.7 — AI Assistant</span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="app-mode-switcher" data-testid="app-mode-switcher">
          <button
            type="button"
            className={`app-mode-tab ${viewMode === 'ai' ? 'active' : ''}`}
            onClick={() => setViewMode('ai')}
            data-testid="tab-ai-assistant"
          >
            <span>✨</span>
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            className={`app-mode-tab ${viewMode === 'cad' ? 'active' : ''}`}
            onClick={() => setViewMode('cad')}
            data-testid="tab-cad-canvas"
          >
            <span>📐</span>
            <span>CAD Canvas</span>
          </button>
        </div>

        {/* Right Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Project: <strong style={{ color: 'var(--text-primary)' }}>{initialProject.project.name}</strong>
          </span>
        </div>
      </header>

      {/* Main View Container */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {viewMode === 'ai' ? (
          <AiWorkshopAssistant
            initialApiKey={initialApiKey}
            initialBaseUrl={initialBaseUrl}
            initialModel={initialModel}
            onOpenCadWorkspace={() => setViewMode('cad')}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <CadWorkspace initialProject={initialProject} />
          </div>
        )}
      </main>
    </div>
  );
};
