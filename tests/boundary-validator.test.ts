import { describe, it, expect } from 'vitest';
import {
  validateBuildingBoundary,
  generateValidationReport,
  BOUNDARY_RULE_ID,
  BOUNDARY_RULE_NAME,
} from '@/domain/validation/boundaryValidator';
import type { BuildingDefinition, LayoutObject } from '@/domain/models/project';

describe('Boundary Validation Engine (BOUNDARY-001)', () => {
  const building: BuildingDefinition = {
    width: 18.0,
    length: 25.0,
  };

  it('validates layout with objects completely inside building boundary', () => {
    const objects: LayoutObject[] = [
      {
        id: 'bay-1',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 2.0, y: 2.0, width: 4.0, length: 7.0, rotation: 0 },
      },
      {
        id: 'lift-1',
        type: 'equipment',
        layer: '06-LIFT',
        geometry: { x: 3.0, y: 3.5, width: 2.0, length: 4.0, rotation: 0 },
      },
      {
        id: 'bay-2',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 10.0, y: 15.0, width: 4.0, length: 7.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(0);

    const report = generateValidationReport(building, objects);
    expect(report.valid).toBe(true);
    expect(report.hardCount).toBe(0);
  });

  it('detects object crossing left boundary (-X)', () => {
    const objects: LayoutObject[] = [
      {
        id: 'wall-left-out',
        type: 'wall',
        layer: '01-WALL',
        geometry: { x: -0.75, y: 5.0, width: 1.0, length: 10.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe(BOUNDARY_RULE_ID);
    expect(issues[0].ruleName).toBe(BOUNDARY_RULE_NAME);
    expect(issues[0].severity).toBe('HARD');
    expect(issues[0].objectId).toBe('wall-left-out');
    expect(issues[0].difference).toBe(0.75);
    expect(issues[0].message).toContain('extends 0.75 m outside the building boundary');
    expect(issues[0].suggestedAction).toContain('Move or resize object "wall-left-out"');

    const report = generateValidationReport(building, objects);
    expect(report.valid).toBe(false);
    expect(report.hardCount).toBe(1);
  });

  it('detects object extending past right boundary (+X)', () => {
    const objects: LayoutObject[] = [
      {
        id: 'bay-right-out',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        // Starts at x=16, width=4 -> extends to x=20 (building width is 18 -> 2.0m overflow)
        geometry: { x: 16.0, y: 5.0, width: 4.0, length: 7.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBe(2.0);
    expect(issues[0].details?.maxX).toBe(20.0);
    expect(issues[0].details?.buildingWidth).toBe(18.0);
  });

  it('detects object extending below bottom boundary (-Y)', () => {
    const objects: LayoutObject[] = [
      {
        id: 'equipment-bottom-out',
        type: 'equipment',
        layer: '07-EQUIPMENT',
        geometry: { x: 5.0, y: -1.25, width: 2.0, length: 3.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBe(1.25);
  });

  it('detects object extending past top boundary (+Y)', () => {
    const objects: LayoutObject[] = [
      {
        id: 'bay-top-out',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        // Starts at y=20, length=7 -> extends to y=27 (building length is 25 -> 2.0m overflow)
        geometry: { x: 2.0, y: 20.0, width: 4.0, length: 7.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBe(2.0);
  });

  it('handles edge case: object exactly on building perimeter walls without exceeding bounds', () => {
    const objects: LayoutObject[] = [
      // Perfectly spans 0..18 on X and 0..25 on Y
      {
        id: 'outer-shell',
        type: 'wall',
        layer: '01-WALL',
        geometry: { x: 0, y: 0, width: 18.0, length: 25.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(0);
  });

  it('handles edge case: object inside initially, but rotation causes it to cross boundary', () => {
    // Width 4, length 2, at (1, 1). Unrotated: x in [1, 5], y in [1, 3] -> safely inside.
    // Rotated 90 degrees around bottom-left:
    // Corners are (1,1), (1,5), (-1,5), (-1,1) -> minX becomes -1 (1.0m outside left boundary!)
    const objects: LayoutObject[] = [
      {
        id: 'rotated-cross-boundary',
        type: 'vehicle',
        layer: '05-VEHICLE',
        geometry: { x: 1.0, y: 1.0, width: 4.0, length: 2.0, rotation: 90 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].difference).toBe(1.0);
    expect(issues[0].details?.minX).toBe(-1.0);
  });

  it('ignores site and building types so boundary is not validated against itself', () => {
    const objects: LayoutObject[] = [
      {
        id: 'site-boundary',
        type: 'site',
        layer: '14-REFERENCE',
        geometry: { x: -2.0, y: -2.0, width: 22.0, length: 29.0, rotation: 0 },
      },
      {
        id: 'building-boundary',
        type: 'building',
        layer: '01-WALL',
        geometry: { x: 0, y: 0, width: 18.0, length: 25.0, rotation: 0 },
      },
    ];

    const issues = validateBuildingBoundary(building, objects);
    expect(issues).toHaveLength(0);
  });
});
