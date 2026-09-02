import React, { useState, useRef } from 'react';
import { LayoutObject, Geometry } from '@/domain/models/project';
import { getOrientedCorners, normalizeAngle } from '@/domain/geometry/primitives';
import { roundMillimeter } from '@/domain/geometry/precision';
import { ViewportTransformConfig, cadToScreen, screenToCad } from '../../canvas/coordinateTransform';
import { snapValue } from '@/domain/geometry/primitives';

interface SelectionOverlayProps {
  selectedObjects: LayoutObject[];
  config: ViewportTransformConfig;
  gridSize: number;
  snapEnabled: boolean;
  onCommitMove: (ids: string[], deltaCadX: number, deltaCadY: number) => void;
  onCommitResize: (id: string, width: number, length: number, newX?: number, newY?: number) => void;
  onCommitRotate: (id: string, rotation: number) => void;
}

type DragMode = 'move' | 'rotate' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw';

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectedObjects,
  config,
  gridSize,
  snapEnabled,
  onCommitMove,
  onCommitResize,
  onCommitRotate,
}) => {
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [transientOffset, setTransientOffset] = useState<{ dxPixels: number; dyPixels: number } | null>(null);

  const startPointerRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const initialGeometriesRef = useRef<Map<string, Geometry>>(new Map());

  if (selectedObjects.length === 0) {
    return null;
  }

  const isSingle = selectedObjects.length === 1;
  const primary = selectedObjects[0];

  // Calculate screen corners of primary object
  const corners = getOrientedCorners(primary.geometry);
  const screenCorners = corners.map((c) => cadToScreen(c, config));

  // Compute 8 handle positions on screen for primary object
  // screenCorners: 0: BL, 1: BR, 2: TR, 3: TL
  const pBL = screenCorners[0];
  const pBR = screenCorners[1];
  const pTR = screenCorners[2];
  const pTL = screenCorners[3];

  const midN = { x: (pTL.x + pTR.x) / 2, y: (pTL.y + pTR.y) / 2 };
  const midS = { x: (pBL.x + pBR.x) / 2, y: (pBL.y + pBR.y) / 2 };
  const midE = { x: (pBR.x + pTR.x) / 2, y: (pBR.y + pTR.y) / 2 };
  const midW = { x: (pBL.x + pTL.x) / 2, y: (pBL.y + pTL.y) / 2 };

  // Rotation handle stem: 25px offset outward along top normal
  const rotStemLength = 24;
  const rotAngleRad = (-primary.geometry.rotation * Math.PI) / 180;
  const rotHandle = {
    x: midN.x - rotStemLength * Math.sin(rotAngleRad),
    y: midN.y - rotStemLength * Math.cos(rotAngleRad),
  };

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();

    setDragMode(mode);
    startPointerRef.current = { screenX: e.clientX, screenY: e.clientY };

    const map = new Map<string, Geometry>();
    for (const obj of selectedObjects) {
      map.set(obj.id, { ...obj.geometry });
    }
    initialGeometriesRef.current = map;

    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !startPointerRef.current) return;

    const dx = e.clientX - startPointerRef.current.screenX;
    const dy = e.clientY - startPointerRef.current.screenY;
    setTransientOffset({ dxPixels: dx, dyPixels: dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragMode || !startPointerRef.current) return;

    const dxPixels = e.clientX - startPointerRef.current.screenX;
    const dyPixels = e.clientY - startPointerRef.current.screenY;
    const scale = config.pixelsPerMeter * config.zoom;

    // Convert pixel deltas to CAD meters (Y inverted!)
    let deltaCadX = dxPixels / scale;
    let deltaCadY = -dyPixels / scale;

    const initialGeo = initialGeometriesRef.current.get(primary.id);

    if (initialGeo) {
      if (dragMode === 'move') {
        if (snapEnabled) {
          const targetX = snapValue(initialGeo.x + deltaCadX, gridSize);
          const targetY = snapValue(initialGeo.y + deltaCadY, gridSize);
          deltaCadX = targetX - initialGeo.x;
          deltaCadY = targetY - initialGeo.y;
        } else {
          deltaCadX = roundMillimeter(deltaCadX);
          deltaCadY = roundMillimeter(deltaCadY);
        }

        if (deltaCadX !== 0 || deltaCadY !== 0) {
          const ids = selectedObjects.map((o) => o.id);
          onCommitMove(ids, deltaCadX, deltaCadY);
        }
      } else if (dragMode.startsWith('resize')) {
        let newW = initialGeo.width;
        let newL = initialGeo.length;
        let newX = initialGeo.x;
        let newY = initialGeo.y;

        if (dragMode === 'resize-e' || dragMode === 'resize-ne' || dragMode === 'resize-se') {
          newW += deltaCadX;
        }
        if (dragMode === 'resize-w' || dragMode === 'resize-nw' || dragMode === 'resize-sw') {
          newW -= deltaCadX;
          newX += deltaCadX;
        }
        if (dragMode === 'resize-n' || dragMode === 'resize-ne' || dragMode === 'resize-nw') {
          newL += deltaCadY;
        }
        if (dragMode === 'resize-s' || dragMode === 'resize-se' || dragMode === 'resize-sw') {
          newL -= deltaCadY;
          newY += deltaCadY;
        }

        newW = Math.max(newW, 0.1);
        newL = Math.max(newL, 0.1);

        if (snapEnabled) {
          newW = snapValue(newW, gridSize);
          newL = snapValue(newL, gridSize);
          newX = snapValue(newX, gridSize);
          newY = snapValue(newY, gridSize);
        } else {
          newW = roundMillimeter(newW);
          newL = roundMillimeter(newL);
          newX = roundMillimeter(newX);
          newY = roundMillimeter(newY);
        }

        onCommitResize(primary.id, newW, newL, newX, newY);
      } else if (dragMode === 'rotate') {
        const centerCad = {
          x: initialGeo.x + initialGeo.width / 2,
          y: initialGeo.y + initialGeo.length / 2,
        };
        const centerScreen = cadToScreen(centerCad, config);

        const currentCadAngle = Math.atan2(
          centerScreen.y - e.clientY,
          e.clientX - centerScreen.x
        );
        let degrees = (currentCadAngle * 180) / Math.PI - 90;

        if (e.shiftKey) {
          // Snap rotation to 15-degree increments when Shift is held
          degrees = Math.round(degrees / 15) * 15;
        }

        const finalRotation = normalizeAngle(roundMillimeter(degrees));
        onCommitRotate(primary.id, finalRotation);
      }
    }

    setDragMode(null);
    setTransientOffset(null);
    startPointerRef.current = null;

    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Safe fallback
    }
  };

  const handleSize = 8;

  return (
    <g
      id="cad-selection-overlay"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Selection Bounding Polygon */}
      <polygon
        points={screenCorners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="rgba(0, 210, 255, 0.08)"
        stroke="#00d2ff"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      />

      {isSingle && (
        <>
          {/* Rotation Stem & Handle */}
          <line
            x1={midN.x}
            y1={midN.y}
            x2={rotHandle.x}
            y2={rotHandle.y}
            stroke="#00d2ff"
            strokeWidth="1.5"
          />
          <circle
            cx={rotHandle.x}
            cy={rotHandle.y}
            r="5.5"
            fill="#00d2ff"
            stroke="#0f141c"
            strokeWidth="1.5"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => handlePointerDown(e, 'rotate')}
          />

          {/* 8 Resize Handles */}
          {/* NW (Top-Left on screen) */}
          <rect
            x={pTL.x - handleSize / 2}
            y={pTL.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-nw')}
          />
          {/* N (Top-Mid on screen) */}
          <rect
            x={midN.x - handleSize / 2}
            y={midN.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'ns-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-n')}
          />
          {/* NE (Top-Right on screen) */}
          <rect
            x={pTR.x - handleSize / 2}
            y={pTR.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'nesw-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-ne')}
          />
          {/* E (Mid-Right on screen) */}
          <rect
            x={midE.x - handleSize / 2}
            y={midE.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-e')}
          />
          {/* SE (Bottom-Right on screen) */}
          <rect
            x={pBR.x - handleSize / 2}
            y={pBR.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-se')}
          />
          {/* S (Bottom-Mid on screen) */}
          <rect
            x={midS.x - handleSize / 2}
            y={midS.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'ns-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-s')}
          />
          {/* SW (Bottom-Left on screen) */}
          <rect
            x={pBL.x - handleSize / 2}
            y={pBL.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'nesw-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-sw')}
          />
          {/* W (Mid-Left on screen) */}
          <rect
            x={midW.x - handleSize / 2}
            y={midW.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#00d2ff"
            strokeWidth="1.5"
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'resize-w')}
          />
        </>
      )}
    </g>
  );
};
