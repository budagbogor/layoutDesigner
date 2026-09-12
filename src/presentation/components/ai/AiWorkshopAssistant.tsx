// ---------------------------------------------------------------------------
// Productization Phase 1 — AI Workshop Assistant (Primary Experience Container)
//
// Renders:
// - Hero header: App identity + workflow steps
// - Collapsible AI Provider Settings (advanced, hidden by default)
// - Left column: Natural Language Input & Presets
// - Right column: AI Analysis Result & Generate Layout
// ---------------------------------------------------------------------------

'use client';

import React, { useState } from 'react';
import { UseAiWorkshopAssistantReturn } from './useAiWorkshopAssistant';
import { AiProviderConfigPanel } from './AiProviderConfigPanel';
import { AiRequirementInputPanel } from './AiRequirementInputPanel';
import { AiAnalysisResultPanel } from './AiAnalysisResultPanel';

import { WorkshopLayoutRequirement } from '../../../domain/requirements/requirementTypes';

export interface AiWorkshopAssistantProps extends UseAiWorkshopAssistantReturn {
  readonly onOpenCadWorkspace?: () => void;
  readonly onGenerateLayout?: (requirement: WorkshopLayoutRequirement) => void;
  readonly isGeneratingLayout?: boolean;
  readonly generationError?: string | null;
}

export const AiWorkshopAssistant: React.FC<AiWorkshopAssistantProps> = (props) => {
  const {
    onGenerateLayout, isGeneratingLayout, generationError,
    baseUrl, apiKey, model, availableModels, isTestingConnection, isLoadingModels,
    connectionResult, prompt, isAnalyzing, analysisResult, analysisError,
    setApiKey, setModel, setPrompt, selectExamplePrompt, testConnection, loadModels, analyzeRequirement
  } = props;

  return (
    <div className="ai-experience-root" data-testid="ai-workshop-assistant-root">

      {/* ================================================================
          HERO SECTION — App Identity + Workflow Steps
      ================================================================ */}
      <div className="ai-hero-section" data-testid="user-workflow-banner">
        <div className="ai-hero-identity">
          <div className="ai-hero-brand">
            <span className="ai-hero-logo">🔧</span>
            <div>
              <div className="ai-hero-title">Mobeng Workshop Studio</div>
              <div className="ai-hero-subtitle">AI Workshop Layout Generator — Bengkel Mobil Penumpang 4 Roda</div>
            </div>
          </div>

          {/* Compact settings toggle (right side of hero) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Connection status pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: connectionResult?.success ? 'var(--accent-green)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(0,0,0,0.15)',
                padding: '3px 10px',
                borderRadius: '10px',
                border: `1px solid ${connectionResult?.success ? 'rgba(22,163,74,0.4)' : 'rgba(255,255,255,0.2)'}`,
              }}
            >
              <span style={{ fontSize: '8px' }}>{connectionResult?.success ? '●' : '○'}</span>
              <span>{model || 'demo'}</span>
              {apiKey === 'demo' && (
                <span style={{ color: 'var(--accent-amber)', marginLeft: '4px' }}>demo</span>
              )}
            </div>

          </div>
        </div>

        {/* Workflow steps bar */}
        <div className="ai-workflow-steps">
          {[
            { n: '1', icon: '💬', label: 'Deskripsikan Bengkel', sub: 'Pilih skala atau tulis kebutuhan' },
            { n: '2', icon: '🤖', label: 'Analisis AI', sub: 'AI mengekstrak program ruang' },
            { n: '3', icon: '📐', label: 'Generate Layout', sub: 'Tata letak dihitung otomatis' },
            { n: '4', icon: '✏️', label: 'Edit & Ekspor', sub: 'Sesuaikan, validasi, simpan' },
          ].map((step) => (
            <div key={step.n} className="ai-workflow-step">
              <span className="ai-workflow-step-icon">{step.icon}</span>
              <div>
                <div className="ai-workflow-step-label">{step.label}</div>
                <div className="ai-workflow-step-sub">{step.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================
          MAIN STUDIO — 2-COLUMN GRID
      ================================================================ */}
      <div className="ai-studio-grid">
        {/* Left Column: Natural Language Input & Presets */}
        <AiRequirementInputPanel
          prompt={prompt}
          isAnalyzing={isAnalyzing}
          analysisError={analysisError}
          onPromptChange={setPrompt}
          onSelectExample={selectExamplePrompt}
          onAnalyze={() => analyzeRequirement()}
        />

        {/* Right Column: AI Analysis Result */}
        <AiAnalysisResultPanel
          result={analysisResult}
          isAnalyzing={isAnalyzing}
          isGeneratingLayout={isGeneratingLayout}
          generationError={generationError}
          onAppendOptionToPrompt={(option) => setPrompt(prompt ? `${prompt} ${option}` : option)}
          onGenerateLayout={onGenerateLayout}
        />
      </div>
    </div>
  );
};
