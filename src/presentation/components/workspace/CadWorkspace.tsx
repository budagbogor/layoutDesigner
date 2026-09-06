'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { WorkshopProject, Geometry, LayoutObject } from '@/domain/models/project';
import { CadStore } from '@/application/state/CadStore';
import { LayoutEngineResult, OrchestratedCandidate } from '@/domain/engine/orchestrator/orchestratorTypes';
import { LayoutEngineInput } from '@/domain/engine/types';
import { candidateToCadProject } from '@/domain/export/cadRepresentation';
import { IProjectRepository } from '@/application/ports/IProjectRepository';
import {
  createNewBlankProject,
  openSavedProject,
  saveCurrentProject,
  renameSavedProject,
  deleteSavedProject,
  exportProjectAsJson,
  exportProjectAsSvg,
  exportProjectAsDxf,
  importProjectFromJsonString,
} from '@/application/services/projectPersistenceService';
import { ProjectManagerModal } from '../modals/ProjectManagerModal';
import { CadCanvas } from '../canvas/CadCanvas';
import { CadToolbar } from '../toolbar/CadToolbar';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { ValidationPanel } from '../panels/ValidationPanel';
import { AlternativeLayoutPanel } from '../panels/AlternativeLayoutPanel';

export interface CadWorkspaceProps {
  initialProject: WorkshopProject;
  layoutEngineResult?: LayoutEngineResult | null;
  engineInput?: LayoutEngineInput | null;
  activeCandidateId?: string | null;
  onActiveCandidateChange?: (candidateId: string) => void;
  projectRepository?: IProjectRepository;
}

export type SidebarTab = 'alternatives' | 'properties' | 'layers' | 'validation';

export const CadWorkspace: React.FC<CadWorkspaceProps> = ({
  initialProject,
  layoutEngineResult = null,
  engineInput = null,
  activeCandidateId = null,
  onActiveCandidateChange,
  projectRepository,
}) => {
  const store = useMemo(() => new CadStore(initialProject), [initialProject]);
  const [editorState, setEditorState] = useState(() => store.getState());
  const [cursorCad, setCursorCad] = useState<{ x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    layoutEngineResult?.alternativeCandidates && layoutEngineResult.alternativeCandidates.length > 0
      ? 'alternatives'
      : 'properties'
  );
  const [currentCandidateId, setCurrentCandidateId] = useState<string | null>(
    activeCandidateId ?? (layoutEngineResult?.bestCandidate?.candidateId ?? null)
  );

  // M1 & M2 Lifecycle & Export/Import state
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isEditingHeaderName, setIsEditingHeaderName] = useState(false);
  const [headerProjectName, setHeaderProjectName] = useState(initialProject.project.name);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Unsaved Changes Confirmation Modal State
  const [unsavedConfirm, setUnsavedConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (activeCandidateId) {
      setCurrentCandidateId(activeCandidateId);
    }
  }, [activeCandidateId]);

  useEffect(() => {
    return store.subscribe((newState) => {
      setEditorState(newState);
      setHeaderProjectName(newState.project.project.name);
    });
  }, [store]);

  const {
    project,
    viewport,
    layers,
    validationReport,
    activeTool,
    selectedIds,
    canUndo,
    canRedo,
    isDirty,
  } = editorState;

  const selectedObjects = project.layout.objects.filter((o) => selectedIds.includes(o.id));
  const primarySelected = selectedObjects[0] ?? null;

  // M2 JSON Import file selection handler
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const result = importProjectFromJsonString(content);
      if (!result.success || !result.project) {
        const issuesSummary =
          result.issues && result.issues.length > 0
            ? `\nIssues:\n- ${result.issues.join('\n- ')}`
            : '';
        alert(`Failed to import project: ${result.error || 'Invalid project file.'}${issuesSummary}`);
        return;
      }

      const imported = result.project;
      if (store.isDirty()) {
        setUnsavedConfirm({
          isOpen: true,
          title: 'Unsaved Changes',
          message: `Project "${project.project.name}" has unsaved changes. Discard changes and load imported project "${imported.project.name}"?`,
          onConfirm: () => {
            setUnsavedConfirm(null);
            store.loadProject(imported);
            setCurrentCandidateId(null);
          },
        });
      } else {
        store.loadProject(imported);
        setCurrentCandidateId(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Auto-switch to properties tab when an object is selected
  const handleSelectObjectFromValidation = (objectId: string) => {
    store.select(objectId);
    setActiveTab('properties');
  };

  const handleUpdateGeometry = (id: string, partial: Partial<Geometry>) => {
    store.updateObjectGeometry(id, partial);
  };

  const handleUpdateObject = (id: string, updates: Partial<Omit<LayoutObject, 'id'>>) => {
    store.updateObject(id, updates);
  };

  const handleDeleteObject = (id: string) => {
    store.deleteObjects([id]);
  };

  const handleResetView = () => {
    // Center pan and set comfortable overview framing zoom (0.75x)
    store.setPan(0, 0);
    store.setZoom(0.75);
  };

  // Candidate switching handler
  const handleSelectCandidate = (candidateId: string) => {
    if (!layoutEngineResult || !engineInput) return;

    const all = [
      layoutEngineResult.bestCandidate,
      ...(layoutEngineResult.alternativeCandidates || []),
    ].filter((c): c is OrchestratedCandidate => Boolean(c && c.isValid && c.validity === 'VALID'));

    const target = all.find((c) => c.candidateId === candidateId);
    if (!target) return;

    const newProject = candidateToCadProject(target, engineInput, {
      projectId: target.candidateId,
      projectName: `${target.strategy} (${target.arrangement})`,
    });

    store.loadProject(newProject);
    setCurrentCandidateId(candidateId);
    onActiveCandidateChange?.(candidateId);
  };

  // Save current project handler
  const handleSaveProject = async () => {
    setSaveStatus('saving');
    setSaveErrorMessage(null);

    const currentCadProject = store.getState().project;
    const result = await saveCurrentProject(currentCadProject, projectRepository);

    if (result.success) {
      store.markClean();
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } else {
      setSaveStatus('error');
      setSaveErrorMessage(result.error || 'Failed to save project.');
    }
  };

  // M1 Project Lifecycle: Open Project
  const executeOpenProject = async (projectId: string) => {
    const result = await openSavedProject(projectId, projectRepository);
    if (result.success && result.project) {
      store.loadProject(result.project);
      setCurrentCandidateId(null);
      return true;
    } else {
      alert(`Failed to open project: ${result.error || 'Unknown error'}`);
      return false;
    }
  };

  const handleOpenProject = (projectId: string) => {
    if (store.isDirty()) {
      setUnsavedConfirm({
        isOpen: true,
        title: 'Unsaved Changes',
        message: `Project "${project.project.name}" has unsaved changes. Discard changes and open project?`,
        onConfirm: async () => {
          setUnsavedConfirm(null);
          await executeOpenProject(projectId);
        },
      });
    } else {
      executeOpenProject(projectId);
    }
  };

  // M1 Project Lifecycle: New Project
  const executeNewProject = () => {
    const newBlankProject = createNewBlankProject();
    store.loadProject(newBlankProject);
    setCurrentCandidateId(null);
  };

  const handleNewProject = () => {
    if (store.isDirty()) {
      setUnsavedConfirm({
        isOpen: true,
        title: 'Unsaved Changes',
        message: `Project "${project.project.name}" has unsaved changes. Discard changes and create a new project?`,
        onConfirm: () => {
          setUnsavedConfirm(null);
          executeNewProject();
        },
      });
    } else {
      executeNewProject();
    }
  };

  // M1 Project Lifecycle: Rename Project
  const handleRenameProject = async (projectId: string, newName: string): Promise<boolean> => {
    const res = await renameSavedProject(projectId, newName, projectRepository);
    if (projectId === store.getState().project.project.id) {
      store.renameProject(newName);
    }
    return res.success;
  };

  // M1 Project Lifecycle: Delete Project
  const handleDeleteProject = async (projectId: string): Promise<boolean> => {
    const isActive = projectId === store.getState().project.project.id;
    const res = await deleteSavedProject(projectId, projectRepository);
    if (res.success) {
      if (isActive) {
        executeNewProject();
      }
      return true;
    }
    return false;
  };

  // Header quick rename save
  const handleSaveHeaderRename = async () => {
    const trimmed = headerProjectName.trim();
    if (!trimmed) return;
    store.renameProject(trimmed);
    await renameSavedProject(project.project.id, trimmed, projectRepository);
    setIsEditingHeaderName(false);
  };

  const candidateCount =
    (layoutEngineResult?.bestCandidate?.isValid ? 1 : 0) +
    (layoutEngineResult?.alternativeCandidates?.filter((c) => c.isValid && c.validity === 'VALID').length ?? 0);

  return (
    <div className="cad-shell">
      {/* CAD Header */}
      <header className="cad-header">
        <div className="brand-section">
          <span className="brand-badge">CAD</span>
          <span className="brand-title">Mobeng Workshop Designer</span>
          <span className="header-status-badge">M1 — Lifecycle</span>
        </div>

        {/* Project Name & Lifecycle Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Project Manager Modal Trigger */}
          <button
            onClick={() => setIsProjectManagerOpen(true)}
            data-testid="btn-project-manager"
            title="Open Project Manager"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>📂</span>
            <span>Projects</span>
          </button>

          {/* New Project Trigger */}
          <button
            onClick={handleNewProject}
            data-testid="btn-new-project"
            title="Create New Blank Project"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>＋</span>
            <span>New</span>
          </button>

          {/* Active Project Title & Rename */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-secondary)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              fontSize: '12px',
            }}
          >
            {isEditingHeaderName ? (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={headerProjectName}
                  onChange={(e) => setHeaderProjectName(e.target.value)}
                  data-testid="input-header-rename"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveHeaderRename();
                    if (e.key === 'Escape') {
                      setHeaderProjectName(project.project.name);
                      setIsEditingHeaderName(false);
                    }
                  }}
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--accent-cyan)',
                    color: 'var(--text-primary)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: '600',
                    width: '140px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveHeaderRename}
                  data-testid="btn-save-header-rename"
                  style={{
                    background: 'var(--accent-cyan)',
                    color: '#050a10',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeaderProjectName(project.project.name);
                    setIsEditingHeaderName(false);
                  }}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Project:</span>
                <strong
                  data-testid="header-project-name"
                  style={{ color: 'var(--text-primary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {project.project.name}
                </strong>
                <button
                  type="button"
                  title="Rename Project"
                  onClick={() => setIsEditingHeaderName(true)}
                  data-testid="btn-rename-header-name"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '0 2px',
                  }}
                >
                  ✏️
                </button>
              </div>
            )}

            {isDirty && (
              <span
                data-testid="badge-unsaved"
                title="Unsaved changes in workspace"
                style={{
                  fontSize: '9px',
                  color: '#e3b341',
                  background: 'rgba(227, 179, 65, 0.15)',
                  border: '1px solid rgba(227, 179, 65, 0.4)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 'bold',
                }}
              >
                ● Unsaved
              </span>
            )}
          </div>

          {/* Save Current Project */}
          <button
            onClick={handleSaveProject}
            disabled={saveStatus === 'saving'}
            title={
              saveStatus === 'error'
                ? `Save failed: ${saveErrorMessage}`
                : 'Save Current CAD Project to Local Storage'
            }
            data-testid="btn-save-project"
            style={{
              background:
                saveStatus === 'saved'
                  ? 'rgba(63, 185, 80, 0.15)'
                  : saveStatus === 'error'
                  ? 'rgba(248, 81, 73, 0.15)'
                  : 'rgba(0, 210, 255, 0.15)',
              border:
                saveStatus === 'saved'
                  ? '1px solid rgba(63, 185, 80, 0.5)'
                  : saveStatus === 'error'
                  ? '1px solid rgba(248, 81, 73, 0.5)'
                  : '1px solid rgba(0, 210, 255, 0.4)',
              color:
                saveStatus === 'saved'
                  ? '#3fb950'
                  : saveStatus === 'error'
                  ? '#f85149'
                  : 'var(--accent-cyan)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
          >
            <span>
              {saveStatus === 'saving'
                ? '⏳'
                : saveStatus === 'saved'
                ? '✓'
                : saveStatus === 'error'
                ? '⚠️'
                : '💾'}
            </span>
            <span data-testid="save-status-text">
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                ? 'Save Failed'
                : 'Save'}
            </span>
          </button>

          {/* Undo / Redo */}
          <button
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => store.undo()}
            style={{
              background: canUndo ? 'var(--bg-panel)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: canUndo ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              cursor: canUndo ? 'pointer' : 'not-allowed',
            }}
          >
            ↶ Undo
          </button>
          <button
            title="Redo (Ctrl+Y)"
            disabled={!canRedo}
            onClick={() => store.redo()}
            style={{
              background: canRedo ? 'var(--bg-panel)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: canRedo ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              cursor: canRedo ? 'pointer' : 'not-allowed',
            }}
          >
            ↷ Redo
          </button>

          {/* Import JSON Project */}
          <input
            type="file"
            ref={importFileInputRef}
            onChange={handleImportJsonFile}
            accept=".json,application/json"
            style={{ display: 'none' }}
            data-testid="input-import-json"
          />
          <button
            onClick={() => importFileInputRef.current?.click()}
            data-testid="btn-import-project"
            title="Import Project from JSON file"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>📥</span>
            <span>Import</span>
          </button>

          {/* Export Dropdown Menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              data-testid="btn-export-menu"
              title="Export CAD & Project Deliverables"
              style={{
                background: 'rgba(0, 210, 255, 0.15)',
                border: '1px solid rgba(0, 210, 255, 0.4)',
                color: 'var(--accent-cyan)',
                borderRadius: '4px',
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>📤</span>
              <span>Export ▾</span>
            </button>

            {isExportMenuOpen && (
              <div
                data-testid="export-dropdown-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  zIndex: 100,
                  minWidth: '180px',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px',
                  gap: '2px',
                }}
              >
                <button
                  onClick={() => {
                    exportProjectAsJson(store.getState().project);
                    setIsExportMenuOpen(false);
                  }}
                  data-testid="btn-export-json"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: '11px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>📄</span>
                  <span>Export JSON (.json)</span>
                </button>

                <button
                  onClick={() => {
                    exportProjectAsSvg(store.getState().project, layers);
                    setIsExportMenuOpen(false);
                  }}
                  data-testid="btn-export-svg"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: '11px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>🖼️</span>
                  <span>Export Vector SVG (.svg)</span>
                </button>

                <button
                  onClick={() => {
                    exportProjectAsDxf(store.getState().project, layers);
                    setIsExportMenuOpen(false);
                  }}
                  data-testid="btn-export-dxf"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: '11px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>📐</span>
                  <span>Export CAD DXF (.dxf)</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleResetView}
            title="Reset Pan and Zoom to Fit Building"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Reset View
          </button>
        </div>
      </header>

      {/* Main CAD Workspace Layout Shell */}
      <div className="cad-main">
        {/* Left Toolbar */}
        <CadToolbar
          store={store}
          activeTool={activeTool}
          snapEnabled={viewport.snapEnabled}
          gridSize={viewport.gridSize}
        />

        {/* Center Interactive SVG CAD Viewport */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CadCanvas store={store} onCursorMove={setCursorCad} />
        </main>

        {/* Right Tabbed Inspector Sidebar */}
        <aside className="cad-sidebar" style={{ width: '310px' }}>
          {/* Tab Bar */}
          <div
            style={{
              display: 'flex',
              height: '36px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
            }}
          >
            <button
              onClick={() => setActiveTab('alternatives')}
              data-testid="tab-alternatives"
              style={{
                flex: 1,
                background: activeTab === 'alternatives' ? 'var(--bg-panel)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'alternatives' ? '2px solid var(--accent-cyan)' : 'none',
                color: activeTab === 'alternatives' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span>Layouts</span>
              {candidateCount > 0 && (
                <span
                  style={{
                    background: 'rgba(0, 210, 255, 0.2)',
                    color: 'var(--accent-cyan)',
                    borderRadius: '10px',
                    fontSize: '9px',
                    padding: '0 5px',
                    fontWeight: 'bold',
                  }}
                >
                  {candidateCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('properties')}
              data-testid="tab-properties"
              style={{
                flex: 1,
                background: activeTab === 'properties' ? 'var(--bg-panel)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'properties' ? '2px solid var(--accent-cyan)' : 'none',
                color: activeTab === 'properties' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Properties
            </button>

            <button
              onClick={() => setActiveTab('layers')}
              data-testid="tab-layers"
              style={{
                flex: 1,
                background: activeTab === 'layers' ? 'var(--bg-panel)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'layers' ? '2px solid var(--accent-cyan)' : 'none',
                color: activeTab === 'layers' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Layers
            </button>

            <button
              onClick={() => setActiveTab('validation')}
              data-testid="tab-validation"
              style={{
                flex: 1,
                background: activeTab === 'validation' ? 'var(--bg-panel)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'validation' ? '2px solid var(--accent-cyan)' : 'none',
                color: activeTab === 'validation' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span>Validation</span>
              {validationReport.hardCount > 0 && (
                <span
                  style={{
                    background: '#f85149',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontSize: '9px',
                    padding: '0 5px',
                    fontWeight: 'bold',
                  }}
                >
                  {validationReport.hardCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Tab Panel Content */}
          <div className="sidebar-panel-content" style={{ padding: '14px', overflowY: 'auto' }}>
            {activeTab === 'alternatives' && (
              <AlternativeLayoutPanel
                layoutEngineResult={layoutEngineResult}
                activeCandidateId={currentCandidateId}
                onSelectCandidate={handleSelectCandidate}
              />
            )}

            {activeTab === 'properties' && (
              <PropertiesPanel
                selectedObject={primarySelected}
                building={project.building}
                site={project.site}
                onUpdateBuilding={(dim) => store.updateBuilding(dim)}
                onUpdateSite={(dim) => store.updateSite(dim)}
                onUpdateGeometry={handleUpdateGeometry}
                onUpdateObject={handleUpdateObject}
                onDelete={handleDeleteObject}
              />
            )}

            {activeTab === 'layers' && (
              <LayersPanel
                layers={layers}
                objects={project.layout.objects}
                onToggleVisibility={(id) => store.toggleLayerVisibility(id)}
                onToggleLock={(id) => store.toggleLayerLock(id)}
              />
            )}

            {activeTab === 'validation' && (
              <ValidationPanel
                report={validationReport}
                onSelectObject={handleSelectObjectFromValidation}
              />
            )}
          </div>
        </aside>
      </div>

      {/* CAD Status Bar */}
      <footer className="cad-footer">
        <div>
          X: {cursorCad ? cursorCad.x.toFixed(3) : '0.000'} m &nbsp;|&nbsp; Y: {cursorCad ? cursorCad.y.toFixed(3) : '0.000'} m
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Objects: {project.layout.objects.length}</span>
          <span>Selected: {selectedIds.length}</span>
          <span>Grid: {viewport.gridSize.toFixed(2)} m (Snap: {viewport.snapEnabled ? 'ON' : 'OFF'})</span>
          <span>Zoom: {(viewport.zoom * 100).toFixed(0)}%</span>
        </div>
      </footer>

      {/* Project Manager Modal */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        activeProjectId={project.project.id}
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        projectRepository={projectRepository}
      />

      {/* Unsaved Changes Confirmation Modal */}
      {unsavedConfirm && unsavedConfirm.isOpen && (
        <div
          data-testid="modal-unsaved-confirm"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 10, 16, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid #e3b341',
              borderRadius: '8px',
              width: '440px',
              maxWidth: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#e3b341', fontWeight: 'bold' }}>
                {unsavedConfirm.title}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {unsavedConfirm.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setUnsavedConfirm(null)}
                data-testid="btn-cancel-unsaved"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={unsavedConfirm.onConfirm}
                data-testid="btn-discard-unsaved"
                style={{
                  background: '#f85149',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Discard &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
