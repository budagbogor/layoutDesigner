import React from 'react';
import { CadTool } from '@/application/state/types';
import { CadStore } from '@/application/state/CadStore';
import { LayoutObject } from '@/domain/models/project';

interface CadToolbarProps {
  store: CadStore;
  activeTool: CadTool;
  snapEnabled: boolean;
  gridSize: number;
}

export const CadToolbar: React.FC<CadToolbarProps> = ({
  store,
  activeTool,
  snapEnabled,
  gridSize,
}) => {
  const handleAddObject = (type: 'service_bay' | 'equipment' | 'vehicle' | 'wall' | 'column') => {
    const timestamp = Date.now().toString().slice(-4);
    let newObj: LayoutObject;

    switch (type) {
      case 'service_bay':
        newObj = {
          id: `bay-${timestamp}`,
          type: 'service_bay',
          layer: '08-SERVICE-BAY',
          geometry: { x: 5.0, y: 5.0, width: 4.0, length: 7.0, rotation: 0 },
          metadata: { name: `Bay ${timestamp}` },
        };
        break;
      case 'equipment':
        newObj = {
          id: `lift-${timestamp}`,
          type: 'equipment',
          layer: '06-LIFT',
          geometry: { x: 6.0, y: 6.5, width: 2.0, length: 4.0, rotation: 0 },
          metadata: { equipmentType: '2_post_lift', name: `Lift ${timestamp}` },
        };
        break;
      case 'vehicle':
        newObj = {
          id: `veh-${timestamp}`,
          type: 'vehicle',
          layer: '05-VEHICLE',
          geometry: { x: 6.1, y: 6.2, width: 1.8, length: 4.7, rotation: 0 },
          metadata: { vehicleType: 'MPV' },
        };
        break;
      case 'wall':
        newObj = {
          id: `wall-${timestamp}`,
          type: 'wall',
          layer: '01-WALL',
          geometry: { x: 2.0, y: 15.0, width: 0.2, length: 6.0, rotation: 0 },
        };
        break;
      case 'column':
        newObj = {
          id: `col-${timestamp}`,
          type: 'column',
          layer: '02-COLUMN',
          geometry: { x: 6.0, y: 15.0, width: 0.6, length: 0.6, rotation: 0 },
        };
        break;
    }

    store.addObject(newObj);
    store.select(newObj.id);
  };

  const btnStyle = (isActive: boolean): React.CSSProperties => ({
    width: '36px',
    height: '36px',
    borderRadius: '4px',
    background: isActive ? 'var(--bg-panel)' : 'transparent',
    border: isActive ? '1px solid var(--accent-cyan)' : '1px solid transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 'bold',
    transition: 'all 0.15s',
  });

  return (
    <aside className="cad-toolbar" style={{ width: '56px', gap: '6px', padding: '10px 0' }}>
      {/* Navigation Tools */}
      <button
        title="Select &amp; Transform Tool (SEL)"
        onClick={() => store.setActiveTool('select')}
        style={btnStyle(activeTool === 'select')}
      >
        <span>↖</span>
        <span style={{ fontSize: '8px' }}>SEL</span>
      </button>

      <button
        title="Pan Canvas Tool (PAN / Spacebar)"
        onClick={() => store.setActiveTool('pan')}
        style={btnStyle(activeTool === 'pan')}
      >
        <span>✋</span>
        <span style={{ fontSize: '8px' }}>PAN</span>
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

      {/* Quick Add CAD Objects */}
      <button
        title="Add Service Bay (4.0m × 7.0m)"
        onClick={() => handleAddObject('service_bay')}
        style={btnStyle(false)}
      >
        <span>🅿</span>
        <span style={{ fontSize: '8px' }}>+BAY</span>
      </button>

      <button
        title="Add 2-Post Lift / Equipment (2.0m × 4.0m)"
        onClick={() => handleAddObject('equipment')}
        style={btnStyle(false)}
      >
        <span>⚙</span>
        <span style={{ fontSize: '8px' }}>+LIFT</span>
      </button>

      <button
        title="Add Vehicle (1.8m × 4.7m)"
        onClick={() => handleAddObject('vehicle')}
        style={btnStyle(false)}
      >
        <span>🚗</span>
        <span style={{ fontSize: '8px' }}>+VEH</span>
      </button>

      <button
        title="Add Wall (0.2m × 6.0m)"
        onClick={() => handleAddObject('wall')}
        style={btnStyle(false)}
      >
        <span>🧱</span>
        <span style={{ fontSize: '8px' }}>+WALL</span>
      </button>

      <button
        title="Add Column (0.6m × 0.6m)"
        onClick={() => handleAddObject('column')}
        style={btnStyle(false)}
      >
        <span>🏛</span>
        <span style={{ fontSize: '8px' }}>+COL</span>
      </button>

      <div style={{ width: '32px', height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

      {/* Snap Toggle */}
      <button
        title={snapEnabled ? 'Grid Snap ON (Click to toggle)' : 'Grid Snap OFF (Click to toggle)'}
        onClick={() => store.setSnapEnabled(!snapEnabled)}
        style={{
          ...btnStyle(snapEnabled),
          color: snapEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)',
        }}
      >
        <span>🧲</span>
        <span style={{ fontSize: '7px' }}>{snapEnabled ? 'SNAP' : 'OFF'}</span>
      </button>

      {/* Grid Size Cycle */}
      <button
        title={`Grid Size: ${gridSize}m (Click to cycle)`}
        onClick={() => {
          const nextSizes = [0.1, 0.25, 0.5, 1.0];
          const currIdx = nextSizes.indexOf(gridSize);
          const nextSize = nextSizes[(currIdx + 1) % nextSizes.length];
          store.setGridSize(nextSize);
        }}
        style={{
          ...btnStyle(false),
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{gridSize}m</span>
      </button>
    </aside>
  );
};
