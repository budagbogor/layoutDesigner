// ---------------------------------------------------------------------------
// M1 — Project Manager Modal Component
//
// Allows user to:
// 1. View all saved projects from LocalProjectRepository
// 2. Open an existing project into CAD Canvas
// 3. Create a new clean blank project
// 4. Rename an existing project
// 5. Delete a project with confirmation
// ---------------------------------------------------------------------------

'use client';

import React, { useState, useEffect } from 'react';
import { WorkshopProject } from '@/domain/models/project';
import { IProjectRepository } from '@/application/ports/IProjectRepository';
import { listSavedProjects } from '@/application/services/projectPersistenceService';

export interface ProjectManagerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activeProjectId: string;
  readonly onOpenProject: (projectId: string) => void;
  readonly onNewProject: () => void;
  readonly onRenameProject: (projectId: string, newName: string) => Promise<boolean>;
  readonly onDeleteProject: (projectId: string) => Promise<boolean>;
  readonly projectRepository?: IProjectRepository;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  activeProjectId,
  onOpenProject,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  projectRepository,
}) => {
  const [projects, setProjects] = useState<WorkshopProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-line rename state: projectId -> newName
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refreshProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await listSavedProjects(projectRepository);
      setProjects(list);
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to load project list.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshProjects();
      setEditingId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartRename = (proj: WorkshopProject) => {
    setEditingId(proj.project.id);
    setEditingName(proj.project.name);
  };

  const handleSaveRename = async (projectId: string) => {
    if (!editingName.trim()) return;
    const success = await onRenameProject(projectId, editingName.trim());
    if (success) {
      setEditingId(null);
      await refreshProjects();
    } else {
      setErrorMessage('Failed to rename project.');
    }
  };

  const handleConfirmDelete = async (projectId: string) => {
    const success = await onDeleteProject(projectId);
    if (success) {
      setConfirmDeleteId(null);
      await refreshProjects();
    } else {
      setErrorMessage('Failed to delete project.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      data-testid="project-manager-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 16, 0.8)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          width: '680px',
          maxWidth: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📂</span>
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>
              Project Manager
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              ({projects.length} Saved {projects.length === 1 ? 'Project' : 'Projects'})
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                onNewProject();
                onClose();
              }}
              data-testid="modal-btn-new-project"
              style={{
                background: 'rgba(0, 210, 255, 0.15)',
                border: '1px solid rgba(0, 210, 255, 0.4)',
                color: 'var(--accent-cyan)',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              + New Blank Project
            </button>

            <button
              type="button"
              onClick={onClose}
              data-testid="modal-btn-close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '4px',
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Error Banner */}
        {errorMessage && (
          <div
            data-testid="project-manager-error"
            style={{
              background: 'rgba(248, 81, 73, 0.15)',
              borderBottom: '1px solid rgba(248, 81, 73, 0.4)',
              color: '#f85149',
              padding: '10px 20px',
              fontSize: '12px',
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Project List Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No saved projects found in local storage.
            </div>
          ) : (
            projects.map((proj) => {
              const isActive = proj.project.id === activeProjectId;
              const isEditing = editingId === proj.project.id;
              const isConfirmingDelete = confirmDeleteId === proj.project.id;
              const objectCount = proj.layout?.objects?.length ?? 0;

              return (
                <div
                  key={proj.project.id}
                  data-testid={`project-item-${proj.project.id}`}
                  style={{
                    background: isActive ? 'rgba(0, 210, 255, 0.06)' : 'var(--bg-panel)',
                    border: isActive ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Project Name & Edit input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1, maxWidth: '360px' }}>
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            data-testid={`input-rename-${proj.project.id}`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(proj.project.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            style={{
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--accent-cyan)',
                              color: 'var(--text-primary)',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '13px',
                              fontWeight: '600',
                              flex: 1,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(proj.project.id)}
                            data-testid={`btn-save-rename-${proj.project.id}`}
                            style={{
                              background: 'var(--accent-cyan)',
                              color: '#050a10',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            style={{
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                            {proj.project.name}
                          </strong>
                          <button
                            type="button"
                            title="Rename Project"
                            onClick={() => handleStartRename(proj)}
                            data-testid={`btn-rename-${proj.project.id}`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              padding: '2px 4px',
                            }}
                          >
                            ✏️
                          </button>
                        </div>
                      )}

                      {isActive && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 'bold',
                            color: '#3fb950',
                            background: 'rgba(63, 185, 80, 0.15)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            textTransform: 'uppercase',
                          }}
                          data-testid="active-project-badge"
                        >
                          Active
                        </span>
                      )}
                    </div>

                    {/* Actions: Open & Delete */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#f85149', fontWeight: 'bold' }}>
                            Delete?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(proj.project.id)}
                            data-testid={`btn-confirm-delete-${proj.project.id}`}
                            style={{
                              background: '#f85149',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                            }}
                          >
                            Yes, Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isActive}
                            onClick={() => {
                              onOpenProject(proj.project.id);
                              onClose();
                            }}
                            data-testid={`btn-open-${proj.project.id}`}
                            style={{
                              background: isActive ? 'transparent' : 'var(--bg-secondary)',
                              border: isActive ? '1px solid transparent' : '1px solid var(--border-color)',
                              color: isActive ? 'var(--text-muted)' : 'var(--text-primary)',
                              borderRadius: '4px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: isActive ? 'default' : 'pointer',
                            }}
                          >
                            {isActive ? 'Current' : 'Open'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(proj.project.id)}
                            data-testid={`btn-delete-${proj.project.id}`}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(248, 81, 73, 0.3)',
                              color: '#f85149',
                              borderRadius: '4px',
                              padding: '5px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                            title="Delete Project"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metadata line */}
                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>
                      ID: <code style={{ color: 'var(--text-secondary)' }}>{proj.project.id}</code>
                    </span>
                    <span>
                      Building: <strong style={{ color: 'var(--text-secondary)' }}>{proj.building.width} × {proj.building.length} m</strong>
                    </span>
                    <span>
                      Objects: <strong style={{ color: 'var(--text-secondary)' }}>{objectCount}</strong>
                    </span>
                    <span>
                      Status: <span style={{ textTransform: 'capitalize' }}>{proj.layout?.status || 'draft'}</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
