'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { CadStore } from '@/application/state/CadStore';
import {
  ViewportTransformConfig,
  DEFAULT_PIXELS_PER_METER,
  cadToScreen,
  screenToCad,
  calculateGridLines,
} from '../../canvas/coordinateTransform';
import { CadRulers } from './CadRulers';
import { ObjectRenderer } from './ObjectRenderer';
import { SelectionOverlay } from './SelectionOverlay';
import { snapPoint } from '@/domain/geometry/primitives';

interface CadCanvasProps {
  store: CadStore;
  onCursorMove?: (cadPoint: { x: number; y: number } | null) => void;
}

export const CadCanvas: React.FC<CadCanvasProps> = ({ store, onCursorMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [editorState, setEditorState] = useState(() => store.getState());
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ screenX: number; screenY: number; initPanX: number; initPanY: number } | null>(null);

  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [cursorCad, setCursorCad] = useState<{ x: number; y: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Subscribe to store updates
  useEffect(() => {
    return store.subscribe((newState) => {
      setEditorState(newState);
    });
  }, [store]);

  // ResizeObserver for viewport dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasAutoFittedRef = useRef(false);

  // Auto-fit viewport framing on initial measurement so the building and all dimension labels are comfortably visible
  useEffect(() => {
    if (dimensions.width > 200 && dimensions.height > 200 && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      const { building } = editorState.project;
      const margin = 140; // generous space for rulers and technical dimension labels
      const availW = Math.max(dimensions.width - margin, 200);
      const availH = Math.max(dimensions.height - margin, 200);

      const bldgW = building.width * DEFAULT_PIXELS_PER_METER;
      const bldgH = building.length * DEFAULT_PIXELS_PER_METER;

      const fitZoom = Math.min(availW / bldgW, availH / bldgH);
      const clamped = Math.max(0.2, Math.min(fitZoom, 1.2));
      store.setZoom(clamped);
      store.setPan(0, 0);
    }
  }, [dimensions, editorState.project, store]);

  // Keyboard navigation and shortcuts (Spacebar for pan, Delete/Backspace to delete selected, Escape to clear)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (isInput) return;

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
      } else if (e.key === 'Escape') {
        store.clearSelection();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        store.redo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [store]);

  const { building, layout } = editorState.project;
  const { panX, panY, zoom, gridSize, snapEnabled } = editorState.viewport;

  const transformConfig: ViewportTransformConfig = {
    viewportWidth: dimensions.width,
    viewportHeight: dimensions.height,
    panX,
    panY,
    zoom,
    pixelsPerMeter: DEFAULT_PIXELS_PER_METER,
    buildingWidth: building.width,
    buildingLength: building.length,
  };

  const gridData = calculateGridLines(transformConfig, gridSize);

  // Building screen rect vertices
  const blScreen = cadToScreen({ x: 0, y: 0 }, transformConfig);
  const tlScreen = cadToScreen({ x: 0, y: building.length }, transformConfig);
  const buildingScreenW = building.width * DEFAULT_PIXELS_PER_METER * zoom;
  const buildingScreenH = building.length * DEFAULT_PIXELS_PER_METER * zoom;

  // Selected objects
  const selectedObjects = layout.objects.filter((o) =>
    editorState.selectedIds.includes(o.id)
  );

  // -----------------------------------------------------------------
  // Pointer & Panning Event Handlers
  // -----------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent) => {
    const isMiddleClick = e.button === 1;
    const isPanAction =
      (e.button === 0 && (isSpacePressed || editorState.activeTool === 'pan')) ||
      isMiddleClick;

    if (isPanAction) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        initPanX: panX,
        initPanY: panY,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    } else if (e.button === 0) {
      // Clicked on empty canvas background -> clear selection
      store.clearSelection();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setCursorScreen(screenPos);

    let rawCad = screenToCad(screenPos, transformConfig);
    if (snapEnabled) {
      rawCad = snapPoint(rawCad, gridSize);
    }

    setCursorCad(rawCad);
    onCursorMove?.(rawCad);

    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.screenX;
      const dy = e.clientY - panStartRef.current.screenY;
      store.setPan(panStartRef.current.initPanX + dx, panStartRef.current.initPanY + dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    }
  };

  const handlePointerLeave = () => {
    setCursorScreen(null);
    setCursorCad(null);
    onCursorMove?.(null);
  };

  // -----------------------------------------------------------------
  // Zoom on Wheel (centered on cursor)
  // -----------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      const cadAtMouse = screenToCad({ x: mouseScreenX, y: mouseScreenY }, transformConfig);

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 10.0);

      const newScale = DEFAULT_PIXELS_PER_METER * newZoom;
      const newOriginX = mouseScreenX - cadAtMouse.x * newScale;
      const newOriginY = mouseScreenY + cadAtMouse.y * newScale;

      const baseOriginX = (dimensions.width - building.width * newScale) / 2;
      const baseOriginY = (dimensions.height + building.length * newScale) / 2;

      const newPanX = newOriginX - baseOriginX;
      const newPanY = newOriginY - baseOriginY;

      store.setPan(newPanX, newPanY);
      store.setZoom(newZoom);
    },
    [zoom, transformConfig, dimensions, building, store]
  );

  // -----------------------------------------------------------------
  // Object Selection & Manipulation Commit Handlers
  // -----------------------------------------------------------------

  const handleObjectSelect = (e: React.PointerEvent, id: string) => {
    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    if (isMulti) {
      store.toggleSelect(id);
    } else {
      store.select(id);
    }
  };

  const handleCommitMove = (ids: string[], deltaX: number, deltaY: number) => {
    store.moveObjects(ids, deltaX, deltaY);
  };

  const handleCommitResize = (
    id: string,
    width: number,
    length: number,
    newX?: number,
    newY?: number
  ) => {
    store.updateObjectGeometry(id, {
      width,
      length,
      ...(newX !== undefined ? { x: newX } : {}),
      ...(newY !== undefined ? { y: newY } : {}),
    });
  };

  const handleCommitRotate = (id: string, rotation: number) => {
    store.rotateObject(id, rotation);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning || editorState.activeTool === 'pan' ? 'grab' : 'crosshair',
        backgroundColor: 'var(--bg-canvas)',
      }}
    >
      {/* Dynamic CAD Rulers */}
      <CadRulers
        config={transformConfig}
        gridLines={gridData}
        cursorCad={cursorCad}
        cursorScreen={cursorScreen}
      />

      {/* Main SVG CAD Canvas Viewport */}
      <svg
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      >
        {/* Layer 00: Dynamic Grid Lines */}
        {(() => {
          const gridLayer = editorState.layers.find((l) => l.id === '00-GRID');
          if (gridLayer && !gridLayer.visible) return null;

          return (
            <g id="layer-00-grid">
              {gridData.verticalLines.map((line, idx) => (
                <line
                  key={`grid-v-${idx}-${line.meterValue}`}
                  x1={line.position}
                  y1={0}
                  x2={line.position}
                  y2={dimensions.height}
                  stroke={line.isMajor ? 'var(--cad-grid-major)' : 'var(--cad-grid-minor)'}
                  strokeWidth={line.isMajor ? 1.0 : 0.5}
                />
              ))}

              {gridData.horizontalLines.map((line, idx) => (
                <line
                  key={`grid-h-${idx}-${line.meterValue}`}
                  x1={0}
                  y1={line.position}
                  x2={dimensions.width}
                  y2={line.position}
                  stroke={line.isMajor ? 'var(--cad-grid-major)' : 'var(--cad-grid-minor)'}
                  strokeWidth={line.isMajor ? 1.0 : 0.5}
                />
              ))}

              {/* Coordinate Axes at CAD (0, 0) */}
              <line
                x1={blScreen.x}
                y1={0}
                x2={blScreen.x}
                y2={dimensions.height}
                stroke="#2f81f7"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.6"
              />
              <line
                x1={0}
                y1={blScreen.y}
                x2={dimensions.width}
                y2={blScreen.y}
                stroke="#f85149"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.6"
              />
            </g>
          );
        })()}

        {/* Layer 01: Building Boundary */}
        <g id="layer-01-building">
          <rect
            x={tlScreen.x}
            y={tlScreen.y}
            width={buildingScreenW}
            height={buildingScreenH}
            fill="#121924"
            fillOpacity="0.85"
            stroke="#3a4d6b"
            strokeWidth="2.5"
          />

          <rect
            x={tlScreen.x - 3}
            y={tlScreen.y - 3}
            width={buildingScreenW + 6}
            height={buildingScreenH + 6}
            fill="none"
            stroke="#202e42"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Building Dimension Labels */}
          {/* Top Width Dimension Line (← 18.00 m →) */}
          <g id="dim-top-width" pointerEvents="none">
            {/* Left extension line */}
            <line
              x1={tlScreen.x}
              y1={tlScreen.y}
              x2={tlScreen.x}
              y2={tlScreen.y - 28}
              stroke="#2f81f7"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            {/* Right extension line */}
            <line
              x1={tlScreen.x + buildingScreenW}
              y1={tlScreen.y}
              x2={tlScreen.x + buildingScreenW}
              y2={tlScreen.y - 28}
              stroke="#2f81f7"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            {/* Dimension line */}
            <line
              x1={tlScreen.x}
              y1={tlScreen.y - 20}
              x2={tlScreen.x + buildingScreenW}
              y2={tlScreen.y - 20}
              stroke="#2f81f7"
              strokeWidth="1.2"
            />
            {/* End ticks */}
            <line
              x1={tlScreen.x - 4}
              y1={tlScreen.y - 24}
              x2={tlScreen.x + 4}
              y2={tlScreen.y - 16}
              stroke="#2f81f7"
              strokeWidth="1.5"
            />
            <line
              x1={tlScreen.x + buildingScreenW - 4}
              y1={tlScreen.y - 24}
              x2={tlScreen.x + buildingScreenW + 4}
              y2={tlScreen.y - 16}
              stroke="#2f81f7"
              strokeWidth="1.5"
            />
            {/* Background pill badge for Top 18.00m text */}
            <rect
              x={tlScreen.x + buildingScreenW / 2 - 50}
              y={tlScreen.y - 30}
              width={100}
              height={20}
              rx={3}
              fill="rgba(15, 20, 28, 0.95)"
              stroke="#2f81f7"
              strokeWidth="1"
            />
            <text
              x={tlScreen.x + buildingScreenW / 2}
              y={tlScreen.y - 16}
              fill="#79c0ff"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fontWeight="bold"
              textAnchor="middle"
            >
              ← {building.width.toFixed(2)} m →
            </text>
          </g>

          {/* Left Length Dimension Line (← 25.00 m →) */}
          <g id="dim-left-length" pointerEvents="none">
            {/* Top extension line */}
            <line
              x1={tlScreen.x}
              y1={tlScreen.y}
              x2={tlScreen.x - 32}
              y2={tlScreen.y}
              stroke="#2f81f7"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            {/* Bottom extension line */}
            <line
              x1={blScreen.x}
              y1={blScreen.y}
              x2={blScreen.x - 32}
              y2={blScreen.y}
              stroke="#2f81f7"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            {/* Vertical dimension line */}
            <line
              x1={tlScreen.x - 24}
              y1={tlScreen.y}
              x2={tlScreen.x - 24}
              y2={blScreen.y}
              stroke="#2f81f7"
              strokeWidth="1.2"
            />
            {/* End ticks */}
            <line
              x1={tlScreen.x - 28}
              y1={tlScreen.y - 4}
              x2={tlScreen.x - 20}
              y2={tlScreen.y + 4}
              stroke="#2f81f7"
              strokeWidth="1.5"
            />
            <line
              x1={tlScreen.x - 28}
              y1={blScreen.y - 4}
              x2={tlScreen.x - 20}
              y2={blScreen.y + 4}
              stroke="#2f81f7"
              strokeWidth="1.5"
            />
            {/* Background pill badge for Left 25.00m text */}
            <g
              transform={`rotate(-90, ${tlScreen.x - 24}, ${tlScreen.y + buildingScreenH / 2})`}
            >
              <rect
                x={tlScreen.x - 24 - 50}
                y={tlScreen.y + buildingScreenH / 2 - 10}
                width={100}
                height={20}
                rx={3}
                fill="rgba(15, 20, 28, 0.95)"
                stroke="#2f81f7"
                strokeWidth="1"
              />
              <text
                x={tlScreen.x - 24}
                y={tlScreen.y + buildingScreenH / 2 + 4}
                fill="#79c0ff"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                textAnchor="middle"
              >
                ← {building.length.toFixed(2)} m →
              </text>
            </g>
          </g>

          {/* Building Title Header */}
          <text
            x={tlScreen.x + 12}
            y={tlScreen.y + 22}
            fill="#8b9bb4"
            fontSize="12"
            fontFamily="var(--font-sans)"
            fontWeight="600"
            letterSpacing="0.5"
          >
            BUILDING PERIMETER ({building.width}m × {building.length}m)
          </text>

          {/* Origin (0,0) Marker */}
          <circle cx={blScreen.x} cy={blScreen.y} r="5" fill="var(--accent-cyan)" />
          <text
            x={blScreen.x + 8}
            y={blScreen.y - 8}
            fill="var(--accent-cyan)"
            fontSize="11"
            fontFamily="var(--font-mono)"
            fontWeight="bold"
          >
            (0.00, 0.00)
          </text>
        </g>

        {/* Layout Objects Rendering Layer */}
        <g id="layer-layout-objects">
          {layout.objects
            .filter((obj) => {
              const layer = editorState.layers.find((l) => l.id === obj.layer);
              return layer ? layer.visible : true;
            })
            .map((obj) => (
              <ObjectRenderer
                key={obj.id}
                object={obj}
                isSelected={editorState.selectedIds.includes(obj.id)}
                config={transformConfig}
                onSelect={handleObjectSelect}
              />
            ))}
        </g>

        {/* Interactive Selection Bounding Box & 8 Resize Handles */}
        <SelectionOverlay
          selectedObjects={selectedObjects}
          config={transformConfig}
          gridSize={gridSize}
          snapEnabled={snapEnabled}
          onCommitMove={handleCommitMove}
          onCommitResize={handleCommitResize}
          onCommitRotate={handleCommitRotate}
        />

        {/* Snap Indicator under cursor */}
        {cursorCad && snapEnabled && cursorScreen && (
          <g id="snap-indicator" pointerEvents="none">
            {(() => {
              const snappedScreen = cadToScreen(cursorCad, transformConfig);
              return (
                <>
                  <circle
                    cx={snappedScreen.x}
                    cy={snappedScreen.y}
                    r="4"
                    fill="none"
                    stroke="var(--accent-cyan)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={snappedScreen.x - 8}
                    y1={snappedScreen.y}
                    x2={snappedScreen.x + 8}
                    y2={snappedScreen.y}
                    stroke="var(--accent-cyan)"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                  <line
                    x1={snappedScreen.x}
                    y1={snappedScreen.y - 8}
                    x2={snappedScreen.x}
                    y2={snappedScreen.y + 8}
                    stroke="var(--accent-cyan)"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                </>
              );
            })()}
          </g>
        )}
      </svg>

      {/* Functional Zoning Legend Overlay */}
      <div
        className="cad-zone-legend"
        data-testid="cad-zone-legend"
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 10,
          background: 'rgba(22, 29, 40, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '8px 12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          fontSize: '11px',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Zonasi:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(0, 210, 255, 0.8)' }} />
          <span style={{ color: '#79c0ff', fontWeight: 600 }}>AREA PELANGGAN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(46, 160, 67, 0.8)' }} />
          <span style={{ color: '#3fb950', fontWeight: 600 }}>AREA SERVIS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(163, 113, 247, 0.8)' }} />
          <span style={{ color: '#d2a8ff', fontWeight: 600 }}>AREA KARYAWAN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(210, 153, 34, 0.8)' }} />
          <span style={{ color: '#e3b341', fontWeight: 600 }}>AREA PENYIMPANAN &amp; LOGISTIK</span>
        </div>
      </div>
    </div>
  );
};

