import { BuildingDefinition, LayoutObject } from '../models/project';
import { ValidationIssue, ValidationReport } from './types';
import { getGeometryAABB } from '../geometry/primitives';
import { roundMillimeter } from '../geometry/precision';
import { CAD_EPSILON } from '../geometry/precision';

export const BOUNDARY_RULE_ID = 'BOUNDARY-001';
export const BOUNDARY_RULE_NAME = 'Object must remain inside building';

/**
 * Validates whether layout objects remain completely inside the building boundary.
 * Origin of building is at (0, 0), with bounds [0..building.width] on X and [0..building.length] on Y.
 */
export function validateBuildingBoundary(
  building: BuildingDefinition,
  objects: LayoutObject[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const obj of objects) {
    // Skip site and building boundary objects themselves
    if (obj.type === 'site' || obj.type === 'building') {
      continue;
    }

    const box = getGeometryAABB(obj.geometry);
    const overflowAxes: string[] = [];
    const overflows: number[] = [];

    if (box.minX < -CAD_EPSILON) {
      const diff = roundMillimeter(-box.minX);
      overflows.push(diff);
      overflowAxes.push(`left (-X by ${diff}m)`);
    }

    if (box.maxX > building.width + CAD_EPSILON) {
      const diff = roundMillimeter(box.maxX - building.width);
      overflows.push(diff);
      overflowAxes.push(`right (+X by ${diff}m)`);
    }

    if (box.minY < -CAD_EPSILON) {
      const diff = roundMillimeter(-box.minY);
      overflows.push(diff);
      overflowAxes.push(`bottom (-Y by ${diff}m)`);
    }

    if (box.maxY > building.length + CAD_EPSILON) {
      const diff = roundMillimeter(box.maxY - building.length);
      overflows.push(diff);
      overflowAxes.push(`top (+Y by ${diff}m)`);
    }

    if (overflows.length > 0) {
      const maxOverflow = roundMillimeter(Math.max(...overflows));

      issues.push({
        id: `boundary-${obj.id}`,
        ruleId: BOUNDARY_RULE_ID,
        ruleName: BOUNDARY_RULE_NAME,
        severity: 'HARD',
        objectId: obj.id,
        objectType: obj.type,
        message: `Object "${obj.id}" extends ${maxOverflow} m outside the building boundary (${overflowAxes.join(', ')}).`,
        difference: maxOverflow,
        details: {
          minX: box.minX,
          minY: box.minY,
          maxX: box.maxX,
          maxY: box.maxY,
          buildingWidth: building.width,
          buildingLength: building.length,
          overflowAxes,
        },
        suggestedAction: `Move or resize object "${obj.id}" within building limits (0..${building.width} m X, 0..${building.length} m Y).`,
      });
    }
  }

  return issues;
}

/**
 * Generate a complete validation report for the layout.
 */
export function generateValidationReport(
  building: BuildingDefinition,
  objects: LayoutObject[]
): ValidationReport {
  const issues = validateBuildingBoundary(building, objects);

  const hardCount = issues.filter((i) => i.severity === 'HARD').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
  const infoCount = issues.filter((i) => i.severity === 'INFO').length;

  return {
    valid: hardCount === 0,
    hardCount,
    warningCount,
    infoCount,
    issues,
  };
}
