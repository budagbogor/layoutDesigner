import { WorkshopProject, LayoutObject } from '../models/project';
import { LayerState } from '@/application/state/types';
import { getOrientedCorners } from '../geometry/primitives';
import { roundMillimeter } from '../geometry/precision';

export interface DxfExportOptions {
  project: WorkshopProject;
  layers?: LayerState[];
  includeLabels?: boolean;
  includeDimensions?: boolean;
}

const LAYER_COLOR_MAP: Record<string, number> = {
  '00-BUILDING': 7, // White
  '01-WALL': 8, // Dark Gray
  '02-COLUMN': 9, // Light Gray
  '03-DOOR': 4, // Cyan
  '04-WINDOW': 4, // Cyan
  '05-VEHICLE': 5, // Blue
  '06-LIFT': 2, // Yellow
  '07-EQUIPMENT': 30, // Orange
  '08-SERVICE-BAY': 140, // Light Blue
  '09-DIMENSION': 3, // Green
  '10-TEXT': 7, // White
  '11-CIRCULATION': 3, // Green
  '12-SAFETY': 1, // Red
  '13-UTILITY': 6, // Magenta
  '14-REFERENCE': 8, // Gray
};

/**
 * Pure, deterministic native 2D ASCII DXF exporter.
 * Conforms to AutoCAD Release 2000 (AC1015) ASCII DXF standard without third-party dependencies.
 *
 * Uses existing parametric geometry and getOrientedCorners to generate:
 * - HEADER with $INSUNITS = 6 (meters) and spatial extents
 * - TABLES section with full layer definitions and standard ACI colors
 * - ENTITIES section with closed LWPOLYLINE polygons and centered TEXT labels
 * - EOF
 */
export function exportLayoutToDxf(options: DxfExportOptions): string {
  const {
    project,
    layers,
    includeLabels = true,
    includeDimensions = true,
  } = options;

  const { building, layout } = project;
  const lines: string[] = [];
  let handleCounter = 100;

  const nextHandle = (): string => {
    handleCounter++;
    return handleCounter.toString(16).toUpperCase();
  };

  // 1. Filter visible objects
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
    .sort((a, b) => (a.layer === b.layer ? a.id.localeCompare(b.id) : a.layer.localeCompare(b.layer)));

  // Collect all unique layers present in layout + standard layers
  const activeLayerSet = new Set<string>(['00-BUILDING']);
  for (const obj of visibleObjects) {
    activeLayerSet.add(obj.layer);
  }
  if (includeDimensions) {
    activeLayerSet.add('09-DIMENSION');
  }
  if (includeLabels) {
    activeLayerSet.add('10-TEXT');
  }

  const sortedLayerList = Array.from(activeLayerSet).sort();

  // -------------------------------------------------------------
  // SECTION: HEADER
  // -------------------------------------------------------------
  lines.push('0', 'SECTION');
  lines.push('2', 'HEADER');

  // AutoCAD Version: AC1015 (AutoCAD 2000 / standard modern CAD readable)
  lines.push('9', '$ACADVER');
  lines.push('1', 'AC1015');

  // Drawing Units: 6 = Meters
  lines.push('9', '$INSUNITS');
  lines.push('70', '6');

  // Spatial Extents
  lines.push('9', '$EXTMIN');
  lines.push('10', '0.0');
  lines.push('20', '0.0');
  lines.push('30', '0.0');

  lines.push('9', '$EXTMAX');
  lines.push('10', building.width.toFixed(3));
  lines.push('20', building.length.toFixed(3));
  lines.push('30', '0.0');

  lines.push('0', 'ENDSEC');

  // -------------------------------------------------------------
  // SECTION: TABLES (Layers)
  // -------------------------------------------------------------
  lines.push('0', 'SECTION');
  lines.push('2', 'TABLES');

  lines.push('0', 'TABLE');
  lines.push('2', 'LAYER');
  lines.push('5', nextHandle());
  lines.push('100', 'AcDbSymbolTable');
  lines.push('70', sortedLayerList.length.toString());

  for (const layerName of sortedLayerList) {
    const colorCode = LAYER_COLOR_MAP[layerName] ?? 7;
    lines.push('0', 'LAYER');
    lines.push('5', nextHandle());
    lines.push('100', 'AcDbSymbolTableRecord');
    lines.push('100', 'AcDbLayerTableRecord');
    lines.push('2', layerName);
    lines.push('70', '0'); // Standard flags (0 = active/visible)
    lines.push('62', colorCode.toString()); // Color index
    lines.push('6', 'CONTINUOUS'); // Linetype
  }

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // -------------------------------------------------------------
  // SECTION: ENTITIES
  // -------------------------------------------------------------
  lines.push('0', 'SECTION');
  lines.push('2', 'ENTITIES');

  // 1. Building Boundary as closed LWPOLYLINE
  const bldgHandle = nextHandle();
  lines.push('0', 'LWPOLYLINE');
  lines.push('5', bldgHandle);
  lines.push('100', 'AcDbEntity');
  lines.push('8', '00-BUILDING');
  lines.push('100', 'AcDbPolyline');
  lines.push('90', '4'); // 4 vertices
  lines.push('70', '1'); // 1 = closed polyline
  lines.push('43', '0.0'); // constant width

  // Vertex 0: (0, 0)
  lines.push('10', '0.000', '20', '0.000');
  // Vertex 1: (width, 0)
  lines.push('10', building.width.toFixed(3), '20', '0.000');
  // Vertex 2: (width, length)
  lines.push('10', building.width.toFixed(3), '20', building.length.toFixed(3));
  // Vertex 3: (0, length)
  lines.push('10', '0.000', '20', building.length.toFixed(3));

  // 2. CAD Objects
  for (const obj of visibleObjects) {
    const corners = getOrientedCorners(obj.geometry);
    const objHandle = nextHandle();

    lines.push('0', 'LWPOLYLINE');
    lines.push('5', objHandle);
    lines.push('100', 'AcDbEntity');
    lines.push('8', obj.layer);
    lines.push('100', 'AcDbPolyline');
    lines.push('90', '4');
    lines.push('70', '1'); // Closed polygon

    for (const c of corners) {
      lines.push('10', roundMillimeter(c.x).toFixed(3));
      lines.push('20', roundMillimeter(c.y).toFixed(3));
    }

    // Centered Object Label Text
    if (includeLabels) {
      const label = (obj.metadata?.name as string) ?? obj.id;
      const centerX = roundMillimeter(corners.reduce((sum, c) => sum + c.x, 0) / 4);
      const centerY = roundMillimeter(corners.reduce((sum, c) => sum + c.y, 0) / 4);
      const textHeight = Math.min(0.35, Math.max(0.18, Math.min(obj.geometry.width, obj.geometry.length) * 0.15));

      const textHandle = nextHandle();
      lines.push('0', 'TEXT');
      lines.push('5', textHandle);
      lines.push('100', 'AcDbEntity');
      lines.push('8', obj.layer);
      lines.push('100', 'AcDbText');
      lines.push('10', centerX.toFixed(3));
      lines.push('20', centerY.toFixed(3));
      lines.push('30', '0.000');
      lines.push('40', textHeight.toFixed(3)); // Text height in meters
      lines.push('1', label);
      lines.push('50', '0.0'); // Rotation angle degrees
      lines.push('72', '1'); // Center aligned
      lines.push('11', centerX.toFixed(3));
      lines.push('21', centerY.toFixed(3));
      lines.push('31', '0.000');
      lines.push('100', 'AcDbText');
      lines.push('73', '2'); // Middle aligned
    }
  }

  // 3. Building Dimensions (as text annotations along outer walls)
  if (includeDimensions) {
    // Width annotation at bottom
    const dimBottomHandle = nextHandle();
    const dimWidthText = `${building.width.toFixed(2)}m`;
    const bottomMidX = (building.width / 2).toFixed(3);
    lines.push('0', 'TEXT');
    lines.push('5', dimBottomHandle);
    lines.push('100', 'AcDbEntity');
    lines.push('8', '09-DIMENSION');
    lines.push('100', 'AcDbText');
    lines.push('10', bottomMidX);
    lines.push('20', '-0.600');
    lines.push('30', '0.000');
    lines.push('40', '0.400');
    lines.push('1', dimWidthText);
    lines.push('72', '1');
    lines.push('11', bottomMidX);
    lines.push('21', '-0.600');
    lines.push('31', '0.000');
    lines.push('100', 'AcDbText');
    lines.push('73', '2');

    // Length annotation on left
    const dimLeftHandle = nextHandle();
    const dimLengthText = `${building.length.toFixed(2)}m`;
    const leftMidY = (building.length / 2).toFixed(3);
    lines.push('0', 'TEXT');
    lines.push('5', dimLeftHandle);
    lines.push('100', 'AcDbEntity');
    lines.push('8', '09-DIMENSION');
    lines.push('100', 'AcDbText');
    lines.push('10', '-0.600');
    lines.push('20', leftMidY);
    lines.push('30', '0.000');
    lines.push('40', '0.400');
    lines.push('1', dimLengthText);
    lines.push('50', '90.0'); // 90 degree rotation for vertical length
    lines.push('72', '1');
    lines.push('11', '-0.600');
    lines.push('21', leftMidY);
    lines.push('31', '0.000');
    lines.push('100', 'AcDbText');
    lines.push('73', '2');
  }

  lines.push('0', 'ENDSEC');

  // -------------------------------------------------------------
  // SECTION: EOF
  // -------------------------------------------------------------
  lines.push('0', 'EOF');

  return lines.join('\n') + '\n';
}
