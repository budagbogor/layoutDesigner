import { WorkshopProject, LayoutObject } from '../models/project';
import { LayerState } from '@/application/state/types';
import { getOrientedCorners } from '../geometry/primitives';
import { roundMillimeter } from '../geometry/precision';

export interface SvgExportOptions {
  project: WorkshopProject;
  layers?: LayerState[];
  pixelsPerMeter?: number; // scale: pixels per meter (default 40)
  marginMeters?: number; // margin in meters around building (default 2)
  includeDimensions?: boolean;
  includeMetadata?: boolean;
}

export const DEFAULT_EXPORT_PIXELS_PER_METER = 40;
export const DEFAULT_EXPORT_MARGIN = 2.0;

/**
 * Pure, deterministic vector SVG exporter.
 * Converts CAD project layout JSON into standalone, layered, resolution-independent SVG.
 * Does not mutate the project or store state.
 */
export function exportLayoutToSvg(options: SvgExportOptions): string {
  const {
    project,
    layers,
    pixelsPerMeter = DEFAULT_EXPORT_PIXELS_PER_METER,
    marginMeters = DEFAULT_EXPORT_MARGIN,
    includeDimensions = true,
    includeMetadata = true,
  } = options;

  const { building, layout } = project;
  const scale = pixelsPerMeter;

  // Compute viewBox extents factoring in margin around building
  const totalWidthM = building.width + 2 * marginMeters;
  const totalLengthM = building.length + 2 * marginMeters;

  const viewBoxW = roundMillimeter(totalWidthM * scale);
  const viewBoxH = roundMillimeter(totalLengthM * scale);

  // Origin (0,0) in SVG pixels: margin from left, margin from bottom (since SVG Y is downward)
  const originX = roundMillimeter(marginMeters * scale);
  const originY = roundMillimeter(viewBoxH - marginMeters * scale);

  const cadToSvg = (x: number, y: number) => ({
    x: roundMillimeter(originX + x * scale),
    y: roundMillimeter(originY - y * scale),
  });

  // Building screen rect
  const bldgTL = cadToSvg(0, building.length);
  const bldgWidthPx = roundMillimeter(building.width * scale);
  const bldgLengthPx = roundMillimeter(building.length * scale);

  // Filter objects by layer visibility (if provided)
  const hiddenLayerIds = new Set<string>();
  if (layers) {
    for (const l of layers) {
      if (!l.visible) {
        hiddenLayerIds.add(l.id);
      }
    }
  }

  const visibleObjects = layout.objects
    .filter((obj) => !hiddenLayerIds.has(obj.layer))
    // Deterministic sort by layer then ID
    .sort((a, b) => (a.layer === b.layer ? a.id.localeCompare(b.id) : a.layer.localeCompare(b.layer)));

  // Group objects by layer
  const objectsByLayer = new Map<string, LayoutObject[]>();
  for (const obj of visibleObjects) {
    const list = objectsByLayer.get(obj.layer) ?? [];
    list.push(obj);
    objectsByLayer.set(obj.layer, list);
  }

  // Sorted layer keys for determinism
  const sortedLayers = Array.from(objectsByLayer.keys()).sort();

  const lines: string[] = [];

  // 1. XML & SVG Header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 0 ${viewBoxW} ${viewBoxH}" ` +
      `width="${viewBoxW}px" height="${viewBoxH}px" ` +
      `style="background-color: #0b0f15; font-family: ui-monospace, SFMono-Regular, monospace;">`
  );

  // 2. Metadata
  if (includeMetadata) {
    lines.push('  <metadata>');
    lines.push(`    <project-id>${escapeXml(project.project.id)}</project-id>`);
    lines.push(`    <project-name>${escapeXml(project.project.name)}</project-name>`);
    lines.push(`    <unit>${escapeXml(project.project.unit)}</unit>`);
    lines.push(`    <standard-version>${escapeXml(project.project.standard_version_id)}</standard-version>`);
    lines.push(`    <building-width>${building.width}</building-width>`);
    lines.push(`    <building-length>${building.length}</building-length>`);
    lines.push('  </metadata>');
  }

  // 3. Building Boundary Layer
  lines.push('  <g id="building-boundary" data-layer-name="Building Perimeter">');
  lines.push(
    `    <rect x="${bldgTL.x}" y="${bldgTL.y}" width="${bldgWidthPx}" height="${bldgLengthPx}" ` +
      `fill="#121924" stroke="#3a4d6b" stroke-width="2.5" />`
  );
  lines.push(
    `    <rect x="${roundMillimeter(bldgTL.x - 3)}" y="${roundMillimeter(bldgTL.y - 3)}" ` +
      `width="${roundMillimeter(bldgWidthPx + 6)}" height="${roundMillimeter(bldgLengthPx + 6)}" ` +
      `fill="none" stroke="#202e42" stroke-width="1" stroke-dasharray="4 4" />`
  );

  if (includeDimensions) {
    // Dimension text along bottom width
    const dimBottomY = roundMillimeter(originY + 22);
    const dimCenterX = roundMillimeter(bldgTL.x + bldgWidthPx / 2);
    lines.push(
      `    <text x="${dimCenterX}" y="${dimBottomY}" fill="#79c0ff" font-size="12" font-weight="bold" text-anchor="middle">` +
        `← ${building.width.toFixed(2)} m →` +
        `</text>`
    );

    // Dimension text along left length
    const dimLeftX = roundMillimeter(bldgTL.x - 18);
    const dimCenterY = roundMillimeter(bldgTL.y + bldgLengthPx / 2);
    lines.push(
      `    <text x="${dimLeftX}" y="${dimCenterY}" fill="#79c0ff" font-size="12" font-weight="bold" text-anchor="middle" ` +
        `transform="rotate(-90, ${dimLeftX}, ${dimCenterY})">` +
        `← ${building.length.toFixed(2)} m →` +
        `</text>`
    );

    // Origin marker (0, 0)
    lines.push(`    <circle cx="${originX}" cy="${originY}" r="4" fill="#00d2ff" />`);
    lines.push(
      `    <text x="${roundMillimeter(originX + 6)}" y="${roundMillimeter(originY - 6)}" ` +
        `fill="#00d2ff" font-size="10" font-weight="bold">(0.00, 0.00)</text>`
    );
  }
  lines.push('  </g>');

  // 4. CAD Layers & Objects
  for (const layerId of sortedLayers) {
    const layerObjects = objectsByLayer.get(layerId)!;
    lines.push(`  <g id="layer-${layerId}" data-layer-id="${layerId}">`);

    for (const obj of layerObjects) {
      const corners = getOrientedCorners(obj.geometry);
      const pts = corners.map((c) => cadToSvg(c.x, c.y));
      const ptsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');

      const center = {
        x: roundMillimeter(pts.reduce((sum, p) => sum + p.x, 0) / 4),
        y: roundMillimeter(pts.reduce((sum, p) => sum + p.y, 0) / 4),
      };

      lines.push(
        `    <g id="obj-${obj.id}" data-object-type="${obj.type}" data-width="${obj.geometry.width}" data-length="${obj.geometry.length}" data-rotation="${obj.geometry.rotation}">`
      );

      const style = getObjectSvgStyle(obj.type);
      lines.push(`      <polygon points="${ptsAttr}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''} />`);

      const label = (obj.metadata?.name as string) ?? obj.id;
      lines.push(
        `      <text x="${center.x}" y="${roundMillimeter(center.y + 3)}" fill="${style.textColor}" font-size="9" text-anchor="middle" font-weight="600">${escapeXml(label)}</text>`
      );

      lines.push('    </g>');
    }

    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

function getObjectSvgStyle(type: string): { fill: string; stroke: string; strokeWidth: number; dash?: string; textColor: string } {
  switch (type) {
    case 'service_bay':
      return { fill: 'rgba(47, 129, 247, 0.1)', stroke: '#2f81f7', strokeWidth: 1.5, dash: '4 2', textColor: '#79c0ff' };
    case 'equipment':
      return { fill: 'rgba(210, 153, 34, 0.2)', stroke: '#d29922', strokeWidth: 1.5, textColor: '#e3b341' };
    case 'vehicle':
      return { fill: 'rgba(56, 139, 253, 0.25)', stroke: '#58a6ff', strokeWidth: 1.5, textColor: '#79c0ff' };
    case 'wall':
      return { fill: '#30363d', stroke: '#8b949e', strokeWidth: 1.5, textColor: '#c9d1d9' };
    case 'column':
      return { fill: '#484f58', stroke: '#8b949e', strokeWidth: 1.5, textColor: '#c9d1d9' };
    case 'door':
    case 'window':
      return { fill: 'rgba(56, 189, 248, 0.2)', stroke: '#38bdf8', strokeWidth: 1.5, textColor: '#38bdf8' };
    case 'circulation_path':
      return { fill: 'rgba(34, 197, 94, 0.08)', stroke: '#22c55e', strokeWidth: 1.2, dash: '6 3', textColor: '#4ade80' };
    case 'zone':
    case 'custom':
      return { fill: 'rgba(168, 85, 247, 0.12)', stroke: '#a855f7', strokeWidth: 1.2, textColor: '#c084fc' };
    default:
      return { fill: 'rgba(255, 255, 255, 0.08)', stroke: '#8b949e', strokeWidth: 1.0, textColor: '#8b9bb4' };
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}
