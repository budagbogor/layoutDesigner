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
import { WorkshopLayoutRequirement } from '../../../domain/requirements/requirementTypes';
import { StandardAccessor } from '../../../domain/engine/StandardAccessor';
import { LayoutOrchestrator } from '../../../domain/engine/orchestrator/layoutOrchestrator';
import { RequirementMapper } from '../../../application/requirements/requirementMapper';
import { layoutEngineResultToCadProject } from '../../../domain/export/cadRepresentation';
import { WorkshopStandard } from '../../../domain/models/standard';
import demoStandardFixture from '../../../../data/demo-standard.json';
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
  const [currentProject, setCurrentProject] = useState<WorkshopProject>(initialProject);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleGenerateLayout = (requirement: WorkshopLayoutRequirement) => {
    setIsGeneratingLayout(true);
    setGenerationError(null);

    try {
      const defaultStandard = demoStandardFixture as unknown as WorkshopStandard;
      const accessor = new StandardAccessor(defaultStandard);
      const orchestrator = new LayoutOrchestrator();
      const engineResult = orchestrator.generateFromRequirement(requirement, accessor);

      if (
        engineResult.status === 'DISQUALIFIED' ||
        !engineResult.bestCandidate ||
        !engineResult.bestCandidate.isValid
      ) {
        const reason =
          engineResult.engineeringSummary.primaryDisqualificationReason ||
          'Layout tidak memenuhi standar HARD constraints bangunan dan sirkulasi.';
        setGenerationError(reason);
        return;
      }

      const mapper = new RequirementMapper();
      const mappingResult = mapper.map(requirement, accessor);
      if (!mappingResult.engineInput) {
        setGenerationError('Gagal memetakan requirement ke engine input.');
        return;
      }

      const cadProject = layoutEngineResultToCadProject(engineResult, mappingResult.engineInput, {
        projectId: `proj-${Date.now()}`,
        projectName: requirement.projectName || `${currentProject.project.name} (Generated)`,
      });

      if (!cadProject) {
        setGenerationError('Gagal mengonversi hasil layout ke dokumen CAD.');
        return;
      }

      setCurrentProject(cadProject);
      setViewMode('cad');
    } catch (err) {
      setGenerationError(
        (err as Error).message || 'Terjadi kesalahan saat memproses layout CAD.'
      );
    } finally {
      setIsGeneratingLayout(false);
    }
  };

  return (
    <div className="cad-shell" data-testid="app-shell">
      {/* Top Application Header */}
      <header className="cad-header">
        <div className="brand-section">
          <span
            className="brand-badge"
            style={{
              background:
                viewMode === 'ai'
                  ? 'linear-gradient(135deg, #00d2ff 0%, #2f81f7 100%)'
                  : 'var(--accent-cyan)',
              color: '#050a10',
            }}
          >
            {viewMode === 'ai' ? 'AI DESIGN' : 'CAD CORE'}
          </span>
          <span className="brand-title">Mobeng Workshop Studio</span>
          <span className="header-status-badge">Phase 4.5 — Golden Path</span>
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
            Project: <strong style={{ color: 'var(--text-primary)' }}>{currentProject.project.name}</strong>
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
            onGenerateLayout={handleGenerateLayout}
            isGeneratingLayout={isGeneratingLayout}
            generationError={generationError}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <CadWorkspace key={currentProject.project.id} initialProject={currentProject} />
          </div>
        )}
      </main>
    </div>
  );
};
