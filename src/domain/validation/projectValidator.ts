// ---------------------------------------------------------------------------
// FASE 4.7B — Project Structural Validation Boundary
//
// Validates runtime integrity of WorkshopProject documents before persistence.
// Conforms to schemas/layout.schema.json without adding heavy external dependencies.
// ---------------------------------------------------------------------------

import { WorkshopProject, LayoutObject } from '../models/project';

export class ProjectValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'ProjectValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

export class ProjectPersistenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'PersistenceError') {
    super(message);
    this.name = 'ProjectPersistenceError';
    this.code = code;
  }
}

/**
 * Validates that an arbitrary object is a structurally sound WorkshopProject.
 * Throws ProjectValidationError with structured issues if invalid.
 */
export function validateWorkshopProject(data: unknown): asserts data is WorkshopProject {
  const issues: string[] = [];

  if (!data || typeof data !== 'object') {
    throw new ProjectValidationError('Project data must be a non-null object.', [
      'Root project data is null or not an object',
    ]);
  }

  const p = data as Partial<WorkshopProject>;

  // 1. Project metadata
  if (!p.project || typeof p.project !== 'object') {
    issues.push("Missing or invalid 'project' metadata object.");
  } else {
    if (typeof p.project.id !== 'string' || p.project.id.trim().length === 0) {
      issues.push("Project must have a valid non-empty 'project.id'.");
    }
    if (typeof p.project.name !== 'string' || p.project.name.trim().length === 0) {
      issues.push("Project must have a valid non-empty 'project.name'.");
    }
    if (p.project.unit !== 'meter') {
      issues.push("Project unit must be 'meter'.");
    }
    if (
      typeof p.project.standard_version_id !== 'string' ||
      p.project.standard_version_id.trim().length === 0
    ) {
      issues.push("Project must have a valid non-empty 'project.standard_version_id'.");
    }
  }

  // 2. Site definition
  if (!p.site || typeof p.site !== 'object') {
    issues.push("Missing or invalid 'site' definition object.");
  } else {
    if (typeof p.site.width !== 'number' || isNaN(p.site.width) || p.site.width <= 0) {
      issues.push("Site width must be a positive number greater than 0.");
    }
    if (typeof p.site.length !== 'number' || isNaN(p.site.length) || p.site.length <= 0) {
      issues.push("Site length must be a positive number greater than 0.");
    }
  }

  // 3. Building definition
  if (!p.building || typeof p.building !== 'object') {
    issues.push("Missing or invalid 'building' definition object.");
  } else {
    if (
      typeof p.building.width !== 'number' ||
      isNaN(p.building.width) ||
      p.building.width <= 0
    ) {
      issues.push("Building width must be a positive number greater than 0.");
    }
    if (
      typeof p.building.length !== 'number' ||
      isNaN(p.building.length) ||
      p.building.length <= 0
    ) {
      issues.push("Building length must be a positive number greater than 0.");
    }
  }

  // 4. Layout container & objects
  if (!p.layout || typeof p.layout !== 'object') {
    issues.push("Missing or invalid 'layout' container object.");
  } else {
    const validStatuses = ['draft', 'generated', 'validated', 'approved'];
    if (!validStatuses.includes(p.layout.status as string)) {
      issues.push(
        `Layout status '${p.layout.status}' is invalid. Allowed: ${validStatuses.join(', ')}.`
      );
    }

    if (!Array.isArray(p.layout.objects)) {
      issues.push("Layout 'objects' must be an array.");
    } else {
      p.layout.objects.forEach((obj: LayoutObject, idx: number) => {
        if (!obj || typeof obj !== 'object') {
          issues.push(`Layout object at index ${idx} is not an object.`);
          return;
        }
        if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
          issues.push(`Layout object at index ${idx} is missing a valid 'id'.`);
        }
        if (typeof obj.type !== 'string' || obj.type.trim().length === 0) {
          issues.push(`Layout object '${obj.id || idx}' is missing a valid 'type'.`);
        }
        if (typeof obj.layer !== 'string' || obj.layer.trim().length === 0) {
          issues.push(`Layout object '${obj.id || idx}' is missing a valid 'layer'.`);
        }
        if (!obj.geometry || typeof obj.geometry !== 'object') {
          issues.push(`Layout object '${obj.id || idx}' is missing a 'geometry' object.`);
        } else {
          const { x, y, width, length, rotation } = obj.geometry;
          if (typeof x !== 'number' || isNaN(x)) {
            issues.push(`Layout object '${obj.id}' has invalid geometry.x (${x}).`);
          }
          if (typeof y !== 'number' || isNaN(y)) {
            issues.push(`Layout object '${obj.id}' has invalid geometry.y (${y}).`);
          }
          if (typeof width !== 'number' || isNaN(width) || width <= 0) {
            issues.push(`Layout object '${obj.id}' has invalid geometry.width (${width}).`);
          }
          if (typeof length !== 'number' || isNaN(length) || length <= 0) {
            issues.push(`Layout object '${obj.id}' has invalid geometry.length (${length}).`);
          }
          if (typeof rotation !== 'number' || isNaN(rotation)) {
            issues.push(`Layout object '${obj.id}' has invalid geometry.rotation (${rotation}).`);
          }
        }
      });
    }
  }

  // 5. Serialization safety
  try {
    JSON.stringify(data);
  } catch (err) {
    issues.push(`Project cannot be serialized to JSON: ${(err as Error).message}`);
  }

  if (issues.length > 0) {
    throw new ProjectValidationError(
      `Project validation failed: ${issues.join('; ')}`,
      issues
    );
  }
}
