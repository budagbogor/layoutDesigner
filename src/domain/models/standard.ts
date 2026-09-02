/**
 * Mobeng Workshop CAD Designer — Domain Standards Models
 * Conforms to schemas/standard.schema.json
 * 
 * Pure TypeScript. Zero dependencies on React, Next.js, DOM, or backend SDKs.
 */

export type StandardStatus = 'draft' | 'published' | 'archived';

export type ConstraintLevel = 'HARD' | 'SOFT' | 'OPTIMIZATION';

export type RuleSeverity = 'HARD' | 'WARNING' | 'INFO';

export interface StandardParameter {
  key: string;
  value: number;
  unit: string;
  constraint_level: ConstraintLevel;
  minimum?: number | null;
  maximum?: number | null;
  source_type?: string;
  source_reference?: string | null;
  label?: string;
  description?: string;
}

export interface StandardRule {
  id: string;
  name: string;
  severity: RuleSeverity;
  active: boolean;
  description?: string;
}

export interface StandardScoreWeight {
  key: string;
  weight: number;
}

/**
 * Root Workshop Standard Document matching schemas/standard.schema.json
 */
export interface WorkshopStandard {
  id: string;
  name: string;
  version: string;
  status: StandardStatus;
  note?: string;
  parameters: StandardParameter[];
  rules: StandardRule[];
  scoring?: StandardScoreWeight[];
}
