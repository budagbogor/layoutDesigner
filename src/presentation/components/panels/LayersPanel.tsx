import React from 'react';
import { LayerState } from '@/application/state/types';
import { LayoutObject } from '@/domain/models/project';

interface LayersPanelProps {
  layers: LayerState[];
  objects: LayoutObject[];
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  objects,
  onToggleVisibility,
  onToggleLock,
}) => {
  // Compute object counts per layer
  const countsByLayer = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const obj of objects) {
      map.set(obj.layer, (map.get(obj.layer) ?? 0) + 1);
    }
    return map;
  }, [objects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
        Standard CAD Layers ({layers.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {layers.map((layer) => {
          const count = countsByLayer.get(layer.id) ?? 0;

          return (
            <div
              key={layer.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                opacity: layer.visible ? 1 : 0.5,
              }}
            >
              {/* Layer ID and Name */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', marginRight: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {layer.id}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {layer.name} {count > 0 && `(${count})`}
                </span>
              </div>

              {/* Action Buttons: Visibility and Lock */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {/* Visibility Toggle */}
                <button
                  onClick={() => onToggleVisibility(layer.id)}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                  style={{
                    background: layer.visible ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: layer.visible ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  {layer.visible ? '👁' : '✕'}
                </button>

                {/* Lock Toggle */}
                <button
                  onClick={() => onToggleLock(layer.id)}
                  title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                  style={{
                    background: layer.locked ? 'rgba(210, 153, 34, 0.15)' : 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '3px',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: layer.locked ? '#e3b341' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
