import React from 'react';
import { LayoutObject, Geometry, CadObjectType, CadLayerId } from '@/domain/models/project';
import { roundMillimeter } from '@/domain/geometry/precision';
import { normalizeAngle, getGeometryAABB } from '@/domain/geometry/primitives';
import { STANDARD_CAD_LAYERS } from '@/application/state/CadStore';

interface PropertiesPanelProps {
  selectedObject: LayoutObject | null;
  onUpdateGeometry: (id: string, partial: Partial<Geometry>) => void;
  onUpdateObject: (id: string, updates: Partial<Omit<LayoutObject, 'id'>>) => void;
  onDelete: (id: string) => void;
}

const OBJECT_TYPES: { value: CadObjectType; label: string }[] = [
  { value: 'service_bay', label: 'Service Bay' },
  { value: 'equipment', label: 'Equipment / Lift' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'wall', label: 'Wall' },
  { value: 'column', label: 'Structural Column' },
  { value: 'door', label: 'Door Opening' },
  { value: 'window', label: 'Window Opening' },
  { value: 'zone', label: 'Workshop Zone' },
  { value: 'circulation_path', label: 'Circulation Path' },
  { value: 'safety_area', label: 'Safety Area' },
  { value: 'dimension', label: 'Dimension Marker' },
  { value: 'text', label: 'Text Annotation' },
];

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObject,
  onUpdateGeometry,
  onUpdateObject,
  onDelete,
}) => {
  if (!selectedObject) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📐</div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
          No Object Selected
        </div>
        <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.5' }}>
          Click an object on the CAD canvas to view and edit its parametric dimensions.
        </div>
      </div>
    );
  }

  const { id, type, layer, geometry } = selectedObject;
  const aabb = getGeometryAABB(geometry);

  const handleNumberChange = (field: keyof Geometry, valueStr: string) => {
    const val = parseFloat(valueStr);
    if (isNaN(val)) return;

    if (field === 'rotation') {
      onUpdateGeometry(id, { rotation: normalizeAngle(roundMillimeter(val)) });
    } else if (field === 'width' || field === 'length') {
      onUpdateGeometry(id, { [field]: Math.max(roundMillimeter(val), 0.1) });
    } else {
      onUpdateGeometry(id, { [field]: roundMillimeter(val) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: keyof Geometry) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNumberChange(field, e.currentTarget.value);
      e.currentTarget.blur();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Object Header & Delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Object ID</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {id}
          </div>
        </div>
        <button
          onClick={() => onDelete(id)}
          title="Delete Object"
          style={{
            background: 'rgba(248, 81, 73, 0.15)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            color: '#f85149',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          🗑 Delete
        </button>
      </div>

      {/* Object Type & Layer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Object Type
          </label>
          <select
            value={type}
            onChange={(e) => onUpdateObject(id, { type: e.target.value as CadObjectType })}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {OBJECT_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            CAD Layer
          </label>
          <select
            value={layer}
            onChange={(e) => onUpdateObject(id, { layer: e.target.value as CadLayerId })}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {STANDARD_CAD_LAYERS.map((lay) => (
              <option key={lay.id} value={lay.id}>
                {lay.id} — {lay.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Parametric Position & Dimensions (in meters) */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
          Geometry (Meters)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {/* Position X */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              X (m)
            </label>
            <input
              type="number"
              step="0.1"
              data-testid="prop-input-x"
              value={geometry.x}
              onChange={(e) => handleNumberChange('x', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'x')}
              onBlur={(e) => handleNumberChange('x', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Position Y */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              Y (m)
            </label>
            <input
              type="number"
              step="0.1"
              data-testid="prop-input-y"
              value={geometry.y}
              onChange={(e) => handleNumberChange('y', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'y')}
              onBlur={(e) => handleNumberChange('y', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Width */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              Width (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              data-testid="prop-input-width"
              value={geometry.width}
              onChange={(e) => handleNumberChange('width', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'width')}
              onBlur={(e) => handleNumberChange('width', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Length */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              Length (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              data-testid="prop-input-length"
              value={geometry.length}
              onChange={(e) => handleNumberChange('length', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'length')}
              onBlur={(e) => handleNumberChange('length', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Rotation */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              Rotation (Degrees 0..360°)
            </label>
            <input
              type="number"
              step="1"
              data-testid="prop-input-rotation"
              value={geometry.rotation}
              onChange={(e) => handleNumberChange('rotation', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'rotation')}
              onBlur={(e) => handleNumberChange('rotation', e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '5px 8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Computed Extents (AABB) */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
          Computed Bounding Box (AABB)
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          <div>X: [{aabb.minX.toFixed(2)}m → {aabb.maxX.toFixed(2)}m]</div>
          <div>Y: [{aabb.minY.toFixed(2)}m → {aabb.maxY.toFixed(2)}m]</div>
        </div>
      </div>
    </div>
  );
};
