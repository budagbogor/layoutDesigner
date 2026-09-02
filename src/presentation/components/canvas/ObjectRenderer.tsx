import React from 'react';
import { LayoutObject } from '@/domain/models/project';
import { getOrientedCorners } from '@/domain/geometry/primitives';
import { ViewportTransformConfig, cadToScreen } from '../../canvas/coordinateTransform';

interface ObjectRendererProps {
  object: LayoutObject;
  isSelected: boolean;
  config: ViewportTransformConfig;
  onSelect: (e: React.PointerEvent, id: string) => void;
}

export const ObjectRenderer: React.FC<ObjectRendererProps> = ({
  object,
  isSelected,
  config,
  onSelect,
}) => {
  const { id, type, geometry, metadata } = object;
  const corners = getOrientedCorners(geometry);
  const screenCorners = corners.map((c) => cadToScreen(c, config));

  const pointsString = screenCorners.map((p) => `${p.x},${p.y}`).join(' ');

  // Corners: 0: BL, 1: BR, 2: TR, 3: TL
  const pBL = screenCorners[0];
  const pBR = screenCorners[1];
  const pTR = screenCorners[2];
  const pTL = screenCorners[3];

  // Center point on screen
  const centerX = screenCorners.reduce((sum, p) => sum + p.x, 0) / 4;
  const centerY = screenCorners.reduce((sum, p) => sum + p.y, 0) / 4;

  // Top edge midpoint (near TL and TR)
  const topMidX = (pTL.x + pTR.x) / 2;
  const topMidY = (pTL.y + pTR.y) / 2;

  // Bottom edge midpoint (near BL and BR)
  const bottomMidX = (pBL.x + pBR.x) / 2;
  const bottomMidY = (pBL.y + pBR.y) / 2;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(e, id);
  };

  const renderContent = () => {
    switch (type) {
      case 'service_bay': {
        const bayName = (metadata?.name as string) ?? id.toUpperCase();
        // Position bay label near the top edge of the bay
        const labelY = topMidY + 16;

        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(0, 210, 255, 0.15)' : 'rgba(47, 129, 247, 0.08)'}
              stroke={isSelected ? '#00d2ff' : '#2f81f7'}
              strokeWidth={isSelected ? 2 : 1.5}
              strokeDasharray="4 2"
            />
            {/* Bay Name Header Badge (Top zone of bay) */}
            <g pointerEvents="none">
              <rect
                x={topMidX - 60}
                y={labelY - 10}
                width={120}
                height={20}
                rx={4}
                fill="rgba(15, 20, 28, 0.9)"
                stroke="#2f81f7"
                strokeWidth={1}
              />
              <text
                x={topMidX}
                y={labelY + 4}
                fill={isSelected ? '#00d2ff' : '#79c0ff'}
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                textAnchor="middle"
              >
                {bayName} ({geometry.width.toFixed(1)}×{geometry.length.toFixed(1)}m)
              </text>
            </g>
          </>
        );
      }

      case 'equipment': {
        const isLift = (metadata?.equipmentType as string)?.includes('lift') || id.includes('lift');
        const equipName = (metadata?.name as string) ?? id;
        // Position lift/equipment label near the bottom edge
        const labelY = bottomMidY - 14;

        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(210, 153, 34, 0.25)' : 'rgba(210, 153, 34, 0.15)'}
              stroke={isSelected ? '#00d2ff' : '#d29922'}
              strokeWidth={isSelected ? 2 : 1.5}
            />
            {isLift && (
              <>
                {/* 2-Post Lift Columns / Posts */}
                <circle cx={pBL.x} cy={pBL.y} r="4" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pBR.x} cy={pBR.y} r="4" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pTL.x} cy={pTL.y} r="3" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pTR.x} cy={pTR.y} r="3" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                {/* Lift Arms cross */}
                <line
                  x1={pBL.x}
                  y1={pBL.y}
                  x2={pTR.x}
                  y2={pTR.y}
                  stroke="#e3b341"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
                <line
                  x1={pBR.x}
                  y1={pBR.y}
                  x2={pTL.x}
                  y2={pTL.y}
                  stroke="#e3b341"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
              </>
            )}
            {/* Lift Label Badge (Bottom zone) */}
            <g pointerEvents="none">
              <rect
                x={bottomMidX - 45}
                y={labelY - 8}
                width={90}
                height={16}
                rx={3}
                fill="rgba(28, 22, 12, 0.9)"
                stroke="#d29922"
                strokeWidth={1}
              />
              <text
                x={bottomMidX}
                y={labelY + 4}
                fill="#e3b341"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                textAnchor="middle"
              >
                ⚙ {equipName}
              </text>
            </g>
          </>
        );
      }

      case 'vehicle': {
        const vehName = (metadata?.vehicleType as string) ?? 'MPV';

        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(56, 139, 253, 0.35)' : 'rgba(56, 139, 253, 0.22)'}
              stroke={isSelected ? '#00d2ff' : '#58a6ff'}
              strokeWidth={isSelected ? 2 : 1.5}
            />
            {/* Windshield line indicator */}
            <line
              x1={pTL.x * 0.7 + pBL.x * 0.3}
              y1={pTL.y * 0.7 + pBL.y * 0.3}
              x2={pTR.x * 0.7 + pBR.x * 0.3}
              y2={pTR.y * 0.7 + pBR.y * 0.3}
              stroke="#79c0ff"
              strokeWidth="1.5"
            />
            {/* Vehicle Label Badge (Center zone) */}
            <g pointerEvents="none">
              <rect
                x={centerX - 42}
                y={centerY - 9}
                width={84}
                height={18}
                rx={3}
                fill="rgba(13, 27, 42, 0.92)"
                stroke="#58a6ff"
                strokeWidth={1}
              />
              <text
                x={centerX}
                y={centerY + 4}
                fill="#79c0ff"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                textAnchor="middle"
              >
                🚗 {vehName}
              </text>
            </g>
          </>
        );
      }

      case 'wall':
        return (
          <polygon
            points={pointsString}
            fill={isSelected ? '#388bfd' : '#30363d'}
            stroke={isSelected ? '#00d2ff' : '#8b949e'}
            strokeWidth={isSelected ? 2 : 1.5}
          />
        );

      case 'column':
        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? '#1f6feb' : '#484f58'}
              stroke={isSelected ? '#00d2ff' : '#8b949e'}
              strokeWidth={isSelected ? 2 : 1.5}
            />
            {/* Column cross diagonals */}
            <line
              x1={pBL.x}
              y1={pBL.y}
              x2={pTR.x}
              y2={pTR.y}
              stroke="#8b949e"
              strokeWidth="1"
            />
            <line
              x1={pBR.x}
              y1={pBR.y}
              x2={pTL.x}
              y2={pTL.y}
              stroke="#8b949e"
              strokeWidth="1"
            />
          </>
        );

      case 'door':
      case 'window':
        return (
          <polygon
            points={pointsString}
            fill={isSelected ? 'rgba(0, 210, 255, 0.3)' : 'rgba(56, 189, 248, 0.15)'}
            stroke={isSelected ? '#00d2ff' : '#38bdf8'}
            strokeWidth={isSelected ? 2 : 1.5}
          />
        );

      default:
        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(0, 210, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)'}
              stroke={isSelected ? '#00d2ff' : 'var(--border-light)'}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text
              x={centerX}
              y={centerY + 3}
              fill="var(--text-secondary)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              pointerEvents="none"
            >
              {id}
            </text>
          </>
        );
    }
  };

  return (
    <g
      id={`cad-obj-${id}`}
      onPointerDown={handlePointerDown}
      style={{ cursor: 'pointer' }}
    >
      {renderContent()}
    </g>
  );
};
