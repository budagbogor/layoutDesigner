import { RuleSeverity } from '../models/standard';

/**
 * Structured validation finding
 */
export interface ValidationIssue {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: RuleSeverity;
  objectId: string;
  objectType?: string;
  message: string;
  difference?: number;
  details?: {
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
    buildingWidth?: number;
    buildingLength?: number;
    overflowAxes?: string[];
    [key: string]: unknown;
  };
  suggestedAction?: string;
}

export interface ValidationReport {
  valid: boolean;
  hardCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationIssue[];
}
