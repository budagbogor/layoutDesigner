'use client';

import React, { useState, useMemo } from 'react';
import { WorkshopProject, Geometry, LayoutObject } from '@/domain/models/project';
import { CadStore } from '@/application/state/CadStore';
import { CadCanvas } from '../canvas/CadCanvas';
import { CadToolbar } from '../toolbar/CadToolbar';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { LayersPanel } from '../panels/LayersPanel';
import { ValidationPanel } from '../panels/ValidationPanel';
import { exportLayoutToSvg } from '@/domain/export/svgExporter';

interface CadWorkspaceProps {
  initialProject: WorkshopProject;
}

type SidebarTab = 'properties' | 'layers' | 'validation';

export const CadWorkspace: React.FC<CadWorkspaceProps> = ({ initialProject }) => {
  const store = useMemo(() => new CadStore(initialProject), [initialProject]);
  const [editorState, setEditorState] = useState(() => store.getState());
  const [cursorCad, setCursorCad] = useState<{ x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('properties');

  React.useEffect(() => {
    return store.subscribe((newState) => {
      setEditorState(newState);
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
  } = editorState;

  const selectedObjects = project.layout.objects.filter((o) => selectedIds.includes(o.id));
  const primarySelected = selectedObjects[0] ?? null;

  const handleExportSvg = () => {
    const svgString = exportLayoutToSvg({ project, layers });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.project.id}-layout.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  return (
    <div className="cad-shell">
      {/* CAD Header */}
      <header className="cad-header">
        <div className="brand-section">
          <span className="brand-badge">CAD</span>
          <span className="brand-title">Mobeng Workshop Designer</span>
          <span className="header-status-badge">Phase 1.8 — CAD Core</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '6px' }}>
            Project: <strong style={{ color: 'var(--text-primary)' }}>{project.project.name}</strong> ({project.project.standard_version_id})
          </span>

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

          {/* Export SVG Button */}
          <button
            onClick={handleExportSvg}
            title="Export Current CAD Layout as Vector SVG"
            style={{
              background: 'rgba(0, 210, 255, 0.15)',
              border: '1px solid rgba(0, 210, 255, 0.4)',
              color: 'var(--accent-cyan)',
              borderRadius: '4px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📥 Export SVG
          </button>

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
              onClick={() => setActiveTab('properties')}
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
            {activeTab === 'properties' && (
              <PropertiesPanel
                selectedObject={primarySelected}
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
    </div>
  );
};
