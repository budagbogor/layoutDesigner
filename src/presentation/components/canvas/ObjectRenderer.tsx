import React from 'react';
import { LayoutObject } from '@/domain/models/project';
import { getOrientedCorners } from '@/domain/geometry/primitives';
import { ViewportTransformConfig, cadToScreen } from '../../canvas/coordinateTransform';
import {
  deriveFunctionalZone,
  FUNCTIONAL_ZONE_COLORS,
  getHumanObjectLabel,
  getObjectServicesList,
} from '@/domain/models/functionalZone';

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

  const zone = deriveFunctionalZone(object);
  const zoneColors = FUNCTIONAL_ZONE_COLORS[zone];
  const humanLabel = getHumanObjectLabel(object);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(e, id);
  };

  const renderContent = () => {
    switch (type) {
      case 'service_bay': {
        const services = getObjectServicesList(object);
        const serviceLabel =
          services.length === 0
            ? null
            : services.length <= 2
              ? services.join(' · ')
              : `${services.length} fungsi servis`;

        const labelY = topMidY + 16;
        const widthPx = Math.max(humanLabel.length * 7 + 60, 130);
        const serviceLabelWidthPx = serviceLabel
          ? Math.max((serviceLabel.length * 6) + 20, 110)
          : 0;
        const totalBadgeWidth = Math.max(widthPx, serviceLabelWidthPx);

        return (
          <>
            {/* Zone Fill & Border */}
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(0, 210, 255, 0.2)' : zoneColors.fill}
              stroke={isSelected ? '#00d2ff' : zoneColors.stroke}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray="5 3"
            />
            {/* Bay Label Badge */}
            <g pointerEvents="none">
              <rect
                x={topMidX - totalBadgeWidth / 2}
                y={labelY - 10}
                width={totalBadgeWidth}
                height={serviceLabel ? 36 : 20}
                rx={4}
                fill="rgba(15, 20, 28, 0.92)"
                stroke={isSelected ? '#00d2ff' : zoneColors.stroke}
                strokeWidth={1}
              />
              <text
                x={topMidX}
                y={labelY + 4}
                fill={isSelected ? '#00d2ff' : zoneColors.text}
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                textAnchor="middle"
              >
                {humanLabel}
              </text>
              {serviceLabel && (
                <text
                  x={topMidX}
                  y={labelY + 20}
                  fill={isSelected ? 'rgba(0, 210, 255, 0.75)' : 'rgba(255,255,255,0.45)'}
                  fontSize="8.5"
                  fontFamily="var(--font-sans)"
                  fontWeight="500"
                  textAnchor="middle"
                >
                  {serviceLabel}
                </text>
              )}
            </g>
          </>
        );
      }

      case 'equipment': {
        const isLift = (metadata?.equipmentType as string)?.includes('lift') || id.includes('lift');
        const equipName = (metadata?.name as string) ?? id;
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
                <circle cx={pBL.x} cy={pBL.y} r="4" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pBR.x} cy={pBR.y} r="4" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pTL.x} cy={pTL.y} r="3" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
                <circle cx={pTR.x} cy={pTR.y} r="3" fill="#e3b341" stroke="#161d28" strokeWidth="1" />
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
            <g pointerEvents="none">
              <rect
                x={bottomMidX - 50}
                y={labelY - 8}
                width={100}
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
                ⚙ {equipName.toUpperCase()}
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
            <line
              x1={pTL.x * 0.7 + pBL.x * 0.3}
              y1={pTL.y * 0.7 + pBL.y * 0.3}
              x2={pTR.x * 0.7 + pBR.x * 0.3}
              y2={pTR.y * 0.7 + pBR.y * 0.3}
              stroke="#79c0ff"
              strokeWidth="1.5"
            />
            <g pointerEvents="none">
              <rect
                x={centerX - 45}
                y={centerY - 9}
                width={90}
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

      default: {
        // Spaces / Rooms / Functional Areas
        const widthPx = Math.max(humanLabel.length * 7 + 40, 110);

        return (
          <>
            <polygon
              points={pointsString}
              fill={isSelected ? 'rgba(0, 210, 255, 0.25)' : zoneColors.fill}
              stroke={isSelected ? '#00d2ff' : zoneColors.stroke}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <g pointerEvents="none">
              <rect
                x={centerX - widthPx / 2}
                y={centerY - 10}
                width={widthPx}
                height={20}
                rx={4}
                fill="rgba(15, 20, 28, 0.92)"
                stroke={zoneColors.stroke}
                strokeWidth={1}
              />
              <text
                x={centerX}
                y={centerY + 4}
                fill={isSelected ? '#00d2ff' : zoneColors.text}
                fontSize="10"
                fontFamily="var(--font-sans)"
                fontWeight="bold"
                textAnchor="middle"
              >
                {humanLabel}
              </text>
            </g>
          </>
        );
      }
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
