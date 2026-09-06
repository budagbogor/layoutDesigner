import React, { useState, useEffect } from 'react';
import {
  LayoutObject,
  Geometry,
  CadObjectType,
  CadLayerId,
  BuildingDefinition,
  SiteDefinition,
} from '@/domain/models/project';
import { roundMillimeter } from '@/domain/geometry/precision';
import { normalizeAngle, getGeometryAABB } from '@/domain/geometry/primitives';
import { STANDARD_CAD_LAYERS } from '@/application/state/CadStore';

interface PropertiesPanelProps {
  selectedObject: LayoutObject | null;
  building: BuildingDefinition;
  site: SiteDefinition;
  onUpdateBuilding: (dimensions: { width?: number; length?: number }) => boolean;
  onUpdateSite: (dimensions: { width?: number; length?: number }) => boolean;
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

interface SiteBuildingInspectorProps {
  building: BuildingDefinition;
  site: SiteDefinition;
  onUpdateBuilding: (dimensions: { width?: number; length?: number }) => boolean;
  onUpdateSite: (dimensions: { width?: number; length?: number }) => boolean;
}

export const SiteBuildingInspector: React.FC<SiteBuildingInspectorProps> = ({
  building,
  site,
  onUpdateBuilding,
  onUpdateSite,
}) => {
  const [siteWidthInput, setSiteWidthInput] = useState(site.width.toString());
  const [siteLengthInput, setSiteLengthInput] = useState(site.length.toString());
  const [bldgWidthInput, setBldgWidthInput] = useState(building.width.toString());
  const [bldgLengthInput, setBldgLengthInput] = useState(building.length.toString());
  const [dimError, setDimError] = useState<string | null>(null);

  useEffect(() => {
    setSiteWidthInput(site.width.toString());
    setSiteLengthInput(site.length.toString());
  }, [site.width, site.length]);

  useEffect(() => {
    setBldgWidthInput(building.width.toString());
    setBldgLengthInput(building.length.toString());
  }, [building.width, building.length]);

  const siteArea = roundMillimeter(site.width * site.length);
  const bldgArea = roundMillimeter(building.width * building.length);
  const bcr = siteArea > 0 ? ((bldgArea / siteArea) * 100).toFixed(1) : '0.0';

  const commitSiteChange = (field: 'width' | 'length', valStr: string) => {
    const num = parseFloat(valStr);
    if (isNaN(num) || !isFinite(num) || num <= 0) {
      setDimError('Site dimensions must be a valid number greater than 0 meters.');
      if (field === 'width') setSiteWidthInput(site.width.toString());
      if (field === 'length') setSiteLengthInput(site.length.toString());
      return;
    }
    setDimError(null);
    onUpdateSite({ [field]: num });
  };

  const commitBldgChange = (field: 'width' | 'length', valStr: string) => {
    const num = parseFloat(valStr);
    if (isNaN(num) || !isFinite(num) || num <= 0) {
      setDimError('Building dimensions must be a valid number greater than 0 meters.');
      if (field === 'width') setBldgWidthInput(building.width.toString());
      if (field === 'length') setBldgLengthInput(building.length.toString());
      return;
    }
    setDimError(null);
    onUpdateBuilding({ [field]: num });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} data-testid="site-building-inspector">
      {/* Header Notice */}
      <div
        style={{
          background: 'rgba(0, 210, 255, 0.06)',
          border: '1px solid rgba(0, 210, 255, 0.2)',
          borderRadius: '6px',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px' }}>📐</span>
          <strong style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>Site &amp; Building Parameters</strong>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Adjust physical plot and building perimeter boundaries. All CAD objects preserve their exact coordinates.
        </div>
      </div>

      {/* Dimension Error Banner */}
      {dimError && (
        <div
          data-testid="dimension-error-banner"
          style={{
            background: 'rgba(248, 81, 73, 0.15)',
            border: '1px solid rgba(248, 81, 73, 0.4)',
            borderRadius: '4px',
            padding: '8px 10px',
            color: '#f85149',
            fontSize: '11px',
          }}
        >
          ⚠️ {dimError}
        </div>
      )}

      {/* BUILDING SECTION */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
            🏢 Building Parameters
          </span>
          <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {bldgArea.toFixed(1)} m²
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Width (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={bldgWidthInput}
              onChange={(e) => setBldgWidthInput(e.target.value)}
              onBlur={(e) => commitBldgChange('width', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBldgChange('width', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              data-testid="input-building-width"
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

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Length (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={bldgLengthInput}
              onChange={(e) => setBldgLengthInput(e.target.value)}
              onBlur={(e) => commitBldgChange('length', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBldgChange('length', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              data-testid="input-building-length"
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

      {/* SITE SECTION */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
            🌐 Site / Plot Parameters
          </span>
          <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {siteArea.toFixed(1)} m²
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Width (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={siteWidthInput}
              onChange={(e) => setSiteWidthInput(e.target.value)}
              onBlur={(e) => commitSiteChange('width', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitSiteChange('width', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              data-testid="input-site-width"
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

          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Length (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              value={siteLengthInput}
              onChange={(e) => setSiteLengthInput(e.target.value)}
              onBlur={(e) => commitSiteChange('length', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitSiteChange('length', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              data-testid="input-site-length"
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

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span>Building Coverage Ratio:</span>
          <strong style={{ color: 'var(--text-secondary)' }}>{bcr}%</strong>
        </div>
      </div>
    </div>
  );
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObject,
  building,
  site,
  onUpdateBuilding,
  onUpdateSite,
  onUpdateGeometry,
  onUpdateObject,
  onDelete,
}) => {
  if (!selectedObject) {
    return (
      <SiteBuildingInspector
        building={building}
        site={site}
        onUpdateBuilding={onUpdateBuilding}
        onUpdateSite={onUpdateSite}
      />
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
