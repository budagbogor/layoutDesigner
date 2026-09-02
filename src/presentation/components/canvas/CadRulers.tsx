import React from 'react';
import { ViewportTransformConfig, GridLine } from '../../canvas/coordinateTransform';

interface CadRulersProps {
  config: ViewportTransformConfig;
  gridLines: {
    verticalLines: GridLine[];
    horizontalLines: GridLine[];
  };
  cursorCad: { x: number; y: number } | null;
  cursorScreen: { x: number; y: number } | null;
  rulerThickness?: number;
}

export const CadRulers: React.FC<CadRulersProps> = ({
  config,
  gridLines,
  cursorCad,
  cursorScreen,
  rulerThickness = 24,
}) => {
  return (
    <>
      {/* Top Horizontal Ruler */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: rulerThickness,
          width: config.viewportWidth - rulerThickness,
          height: rulerThickness,
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {gridLines.verticalLines
          .filter((line) => line.isMajor && line.position >= rulerThickness && line.position <= config.viewportWidth)
          .map((line) => {
            const relX = line.position - rulerThickness;
            return (
              <g key={`ruler-top-${line.meterValue}`}>
                <line
                  x1={relX}
                  y1={rulerThickness - 6}
                  x2={relX}
                  y2={rulerThickness}
                  stroke="var(--text-muted)"
                  strokeWidth="1"
                />
                <text
                  x={relX + 3}
                  y={rulerThickness - 8}
                  fill="var(--text-secondary)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {line.meterValue.toFixed(1)}m
                </text>
              </g>
            );
          })}

        {/* Cursor indicator line on top ruler */}
        {cursorScreen && cursorScreen.x >= rulerThickness && (
          <line
            x1={cursorScreen.x - rulerThickness}
            y1={0}
            x2={cursorScreen.x - rulerThickness}
            y2={rulerThickness}
            stroke="var(--accent-cyan)"
            strokeWidth="1.5"
          />
        )}
      </svg>

      {/* Left Vertical Ruler */}
      <svg
        style={{
          position: 'absolute',
          top: rulerThickness,
          left: 0,
          width: rulerThickness,
          height: config.viewportHeight - rulerThickness,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-color)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {gridLines.horizontalLines
          .filter((line) => line.isMajor && line.position >= rulerThickness && line.position <= config.viewportHeight)
          .map((line) => {
            const relY = line.position - rulerThickness;
            return (
              <g key={`ruler-left-${line.meterValue}`}>
                <line
                  x1={rulerThickness - 6}
                  y1={relY}
                  x2={rulerThickness}
                  y2={relY}
                  stroke="var(--text-muted)"
                  strokeWidth="1"
                />
                <text
                  x={3}
                  y={relY - 3}
                  fill="var(--text-secondary)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {line.meterValue.toFixed(1)}m
                </text>
              </g>
            );
          })}

        {/* Cursor indicator line on left ruler */}
        {cursorScreen && cursorScreen.y >= rulerThickness && (
          <line
            x1={0}
            y1={cursorScreen.y - rulerThickness}
            x2={rulerThickness}
            y2={cursorScreen.y - rulerThickness}
            stroke="var(--accent-cyan)"
            strokeWidth="1.5"
          />
        )}
      </svg>

      {/* Top-Left Corner Origin Block */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: rulerThickness,
          height: rulerThickness,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          color: 'var(--accent-cyan)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 'bold',
          zIndex: 11,
        }}
      >
        m
      </div>
    </>
  );
};
