/**
 * Mobeng Workshop CAD Designer — Domain Project Models
 * Conforms to schemas/layout.schema.json
 * 
 * Pure TypeScript. Zero dependencies on React, Next.js, DOM, or backend SDKs.
 */

export type Unit = 'meter';

export type RoadSide = 'north' | 'south' | 'east' | 'west';

export type LayoutStatus = 'draft' | 'generated' | 'validated' | 'approved';

export type CadLayerId =
  | '00-GRID'
  | '01-WALL'
  | '02-COLUMN'
  | '03-DOOR'
  | '04-WINDOW'
  | '05-VEHICLE'
  | '06-LIFT'
  | '07-EQUIPMENT'
  | '08-SERVICE-BAY'
  | '09-DIMENSION'
  | '10-TEXT'
  | '11-CIRCULATION'
  | '12-SAFETY'
  | '13-UTILITY'
  | '14-REFERENCE'
  | (string & {});

export type CadObjectType =
  | 'site'
  | 'building'
  | 'wall'
  | 'column'
  | 'door'
  | 'window'
  | 'service_bay'
  | 'equipment'
  | 'vehicle'
  | 'zone'
  | 'circulation_path'
  | 'safety_area'
  | 'dimension'
  | 'text'
  | (string & {});

/**
 * 2D Parametric Geometry (in meters)
 * Coordinate system: Origin bottom-left of building.
 * X: horizontal (+X right), Y: vertical (+Y up).
 * Rotation: degrees counter-clockwise.
 */
export interface Geometry {
  x: number;
  y: number;
  width: number;
  length: number;
  rotation: number;
}

/**
 * Layout Object representing an element inside the CAD model
 */
export interface LayoutObject {
  id: string;
  type: CadObjectType;
  layer: CadLayerId;
  geometry: Geometry;
  metadata?: Record<string, unknown>;
}

export interface ProjectMeta {
  id: string;
  name: string;
  unit: Unit;
  standard_version_id: string;
}

export interface SiteDefinition {
  width: number;
  length: number;
  road_side?: RoadSide;
  road_width?: number;
}

export interface BuildingDefinition {
  width: number;
  length: number;
}

export interface ServiceRequirement {
  type: string;
  quantity: number;
}

export interface EquipmentRequirement {
  type: string;
  quantity: number;
}

export interface LayoutContainer {
  status: LayoutStatus;
  score: number | null;
  objects: LayoutObject[];
}

/**
 * Root Workshop Project Document matching schemas/layout.schema.json
 */
export interface WorkshopProject {
  project: ProjectMeta;
  site: SiteDefinition;
  building: BuildingDefinition;
  services?: ServiceRequirement[];
  equipment?: EquipmentRequirement[];
  layout: LayoutContainer;
}
