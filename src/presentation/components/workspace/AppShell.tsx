// ---------------------------------------------------------------------------
// Productization Phase 1 — Unified Application Shell
//
// Hosts:
// 1. AI Workshop Assistant (Primary Default Entry Point)
// 2. CAD Workspace (Preserved existing CAD Canvas & Tools)
//
// Additions:
// - Success toast after generation (auto-dismiss 4s)
// - User-friendly generation failure translation passed to AI view
// - Tab labels in user-facing Indonesian
// ---------------------------------------------------------------------------

'use client';

import React, { useState, useEffect } from 'react';
import { WorkshopProject } from '../../../domain/models/project';
import { WorkshopLayoutRequirement } from '../../../domain/requirements/requirementTypes';
import { StandardAccessor } from '../../../domain/engine/StandardAccessor';
import { LayoutOrchestrator } from '../../../domain/engine/orchestrator/layoutOrchestrator';
import { RequirementMapper } from '../../../application/requirements/requirementMapper';
import { layoutEngineResultToCadProject } from '../../../domain/export/cadRepresentation';
import { WorkshopStandard } from '../../../domain/models/standard';
import demoStandardFixture from '../../../../data/demo-standard.json';
import { LayoutEngineResult } from '../../../domain/engine/orchestrator/orchestratorTypes';
import { LayoutEngineInput } from '../../../domain/engine/types';
import { AiWorkshopAssistant } from '../ai/AiWorkshopAssistant';
import { useAiWorkshopAssistant } from '../ai/useAiWorkshopAssistant';
import { AiProviderConfigPanel } from '../ai/AiProviderConfigPanel';
import { CadWorkspace } from './CadWorkspace';

export type AppViewMode = 'ai' | 'cad' | 'settings';

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
  const [layoutEngineResult, setLayoutEngineResult] = useState<LayoutEngineResult | null>(null);
  const [engineInput, setEngineInput] = useState<LayoutEngineInput | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  // Phase 3.3: Store the original requirement for traceability in Summary panel
  const [activeRequirement, setActiveRequirement] = useState<WorkshopLayoutRequirement | null>(null);
  const [generationSucceeded, setGenerationSucceeded] = useState(false);

  const aiState = useAiWorkshopAssistant({
    initialApiKey,
    initialBaseUrl,
    initialModel,
  });

  // Auto-dismiss success toast after 4 seconds
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  const handleGenerateLayout = async (requirement: WorkshopLayoutRequirement) => {
    setIsGeneratingLayout(true);
    setGenerationError(null);
    setActiveRequirement(requirement); // Phase 3.3: preserve requirement for traceability
    setGenerationSucceeded(false);

    // Yield to the browser so React can paint the "Loading..." state and clear previous errors
    await new Promise((resolve) => setTimeout(resolve, 50));

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
        setGenerationSucceeded(false);
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

      // Retain generation result and engine input for alternative candidate exploration
      setLayoutEngineResult(engineResult);
      setEngineInput(mappingResult.engineInput);
      setActiveCandidateId(engineResult.bestCandidate.candidateId);
      setCurrentProject(cadProject);
      setViewMode('cad');
      setSuccessToast('✅ Layout berhasil dibuat');
      setGenerationSucceeded(true); // Phase 3.3
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
                  ? 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)'
                  : 'var(--accent-blue)',
              color: '#ffffff',
            }}
          >
            {viewMode === 'ai' ? 'AI' : 'CAD'}
          </span>
          <span className="brand-title">Mobeng Workshop Studio</span>
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
            <span>Workshop Baru</span>
          </button>
          <button
            type="button"
            className={`app-mode-tab ${viewMode === 'settings' ? 'active' : ''}`}
            onClick={() => setViewMode('settings')}
            data-testid="tab-ai-settings"
          >
            <span>⚙️</span>
            <span>Pengaturan AI</span>
          </button>
          <button
            type="button"
            className={`app-mode-tab ${viewMode === 'cad' ? 'active' : ''}`}
            onClick={() => setViewMode('cad')}
            data-testid="tab-cad-canvas"
          >
            <span>📐</span>
            <span>Layout CAD</span>
            {layoutEngineResult && (
              <span
                style={{
                  fontSize: '9px',
                  background: 'var(--accent-blue)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '1px 5px',
                  fontWeight: 800,
                  marginLeft: '2px',
                }}
              >
                ●
              </span>
            )}
          </button>
        </div>

        {/* Right Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Proyek: <strong style={{ color: 'var(--text-primary)' }}>{currentProject.project.name}</strong>
          </span>
        </div>
      </header>

      {/* Main View Container */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {viewMode === 'settings' ? (
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg-primary)' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'var(--bg-panel)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>Pengaturan Provider AI</h2>
                <AiProviderConfigPanel
                  baseUrl={aiState.baseUrl}
                  apiKey={aiState.apiKey}
                  model={aiState.model}
                  availableModels={aiState.availableModels}
                  isTestingConnection={aiState.isTestingConnection}
                  isLoadingModels={aiState.isLoadingModels}
                  connectionResult={aiState.connectionResult}
                  onApiKeyChange={aiState.setApiKey}
                  onModelChange={aiState.setModel}
                  onTestConnection={() => aiState.testConnection()}
                  onLoadModels={() => aiState.loadModels()}
                  isSavingConfig={aiState.isSavingConfig}
                  onSaveConfig={aiState.saveConfig}
                />
              </div>
            </div>
          </div>
        ) : viewMode === 'ai' ? (
          <AiWorkshopAssistant
            {...aiState}
            onOpenCadWorkspace={() => setViewMode('cad')}
            onGenerateLayout={handleGenerateLayout}
            isGeneratingLayout={isGeneratingLayout}
            generationError={generationError}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <CadWorkspace
              key={currentProject.project.id}
              initialProject={currentProject}
              layoutEngineResult={layoutEngineResult}
              engineInput={engineInput}
              activeCandidateId={activeCandidateId}
              onActiveCandidateChange={setActiveCandidateId}
              successToast={successToast}
              onDismissSuccessToast={() => setSuccessToast(null)}
              requirement={activeRequirement}
              hasGeneratedLayout={generationSucceeded}
            />
          </div>
        )}
      </main>
    </div>
  );
};
