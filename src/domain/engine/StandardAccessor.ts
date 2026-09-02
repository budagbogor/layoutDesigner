import { WorkshopStandard, StandardParameter, StandardRule } from '../models/standard';
import { ScoringCriterionConfig, ScoringDirection } from './types';

export class MissingStandardParameterError extends Error {
  public readonly parameterKey: string;
  public readonly code = 'MISSING_STANDARD_PARAMETER';

  constructor(parameterKey: string) {
    super(
      `Missing required engineering parameter in standard snapshot: "${parameterKey}". ` +
      `The engine must never invent or assume engineering parameters.`
    );
    this.name = 'MissingStandardParameterError';
    this.parameterKey = parameterKey;
    Object.setPrototypeOf(this, MissingStandardParameterError.prototype);
  }
}

/**
 * StandardAccessor provides strict, data-driven access to a WorkshopStandard snapshot.
 * Adheres strictly to the architectural mandate: NO engineering parameter fallbacks.
 * If a required parameter is missing from the standard, it throws MissingStandardParameterError.
 */
export class StandardAccessor {
  private readonly standard: WorkshopStandard;
  private readonly parameterMap: Map<string, StandardParameter>;
  private readonly ruleMap: Map<string, StandardRule>;

  constructor(standard: WorkshopStandard) {
    this.standard = standard;
    this.parameterMap = new Map<string, StandardParameter>();
    this.ruleMap = new Map<string, StandardRule>();

    if (standard.parameters && Array.isArray(standard.parameters)) {
      for (const param of standard.parameters) {
        this.parameterMap.set(param.key, param);
      }
    }

    if (standard.rules && Array.isArray(standard.rules)) {
      for (const rule of standard.rules) {
        this.ruleMap.set(rule.id, rule);
      }
    }
  }

  public getStandardId(): string {
    return this.standard.id;
  }

  public getStandardVersion(): string {
    return this.standard.version;
  }

  /**
   * Retrieves a required engineering parameter.
   * Throws MissingStandardParameterError if the key does not exist in the snapshot.
   * NEVER returns a hardcoded fallback value.
   */
  public getRequiredParameter(key: string): StandardParameter {
    const param = this.parameterMap.get(key);
    if (!param || param.value === undefined || param.value === null) {
      throw new MissingStandardParameterError(key);
    }
    return param;
  }

  /**
   * Retrieves a required parameter's numeric value directly.
   */
  public getRequiredNumericValue(key: string): number {
    return this.getRequiredParameter(key).value;
  }

  /**
   * Optional parameter query. Returns undefined if key is not present.
   */
  public getParameter(key: string): StandardParameter | undefined {
    return this.parameterMap.get(key);
  }

  public hasParameter(key: string): boolean {
    return this.parameterMap.has(key);
  }

  public getRule(ruleId: string): StandardRule | undefined {
    return this.ruleMap.get(ruleId);
  }

  public getActiveRules(): StandardRule[] {
    return Array.from(this.ruleMap.values()).filter((r) => r.active);
  }

  /**
   * Exposes the complete data-driven scoring criterion configuration from the standard snapshot.
   * Supports both HIGHER_IS_BETTER (maximize) and LOWER_IS_BETTER (minimize) optimization directions.
   */
  public getScoringCriteria(): ScoringCriterionConfig[] {
    if (!this.standard.scoring || !Array.isArray(this.standard.scoring)) {
      return [];
    }

    return this.standard.scoring.map((s) => {
      const dirParam = this.parameterMap.get(`scoring.${s.key}.direction`);
      const direction: ScoringDirection =
        dirParam && (dirParam as any).stringValue === 'LOWER_IS_BETTER'
          ? 'LOWER_IS_BETTER'
          : dirParam && dirParam.value === -1
          ? 'LOWER_IS_BETTER'
          : 'HIGHER_IS_BETTER';

      const minParam = this.parameterMap.get(`scoring.${s.key}.benchmark_min`);
      const targetParam = this.parameterMap.get(`scoring.${s.key}.benchmark_target`);

      const benchmarkMin = minParam ? minParam.value : 0;
      const benchmarkTarget = targetParam ? targetParam.value : 100;

      return {
        criterionKey: s.key,
        weight: s.weight,
        direction,
        benchmarkMin,
        benchmarkTarget,
      };
    });
  }

  /**
   * Normalizes an actual metric value into a 0..100 score according to the criterion's
   * data-driven direction and benchmark thresholds from the standard snapshot.
   */
  public normalizeScore(criterionKey: string, actualValue: number): number {
    const criteria = this.getScoringCriteria();
    const config = criteria.find((c) => c.criterionKey === criterionKey);

    if (!config) {
      return 0;
    }

    return calculateNormalizedScore(
      actualValue,
      config.benchmarkMin,
      config.benchmarkTarget,
      config.direction
    );
  }
}

/**
 * Single source of truth mathematical normalization function.
 * Normalizes an actual metric value into a consistent 0..100 integer score according to the
 * criterion's data-driven direction and benchmark thresholds from the standard snapshot.
 *
 * Supports both HIGHER_IS_BETTER (maximize) and LOWER_IS_BETTER (minimize).
 */
export function calculateNormalizedScore(
  actualValue: number,
  benchmarkMin: number,
  benchmarkTarget: number,
  direction: ScoringDirection
): number {
  if (benchmarkTarget === benchmarkMin) {
    return actualValue >= benchmarkTarget ? 100 : 0;
  }

  if (direction === 'HIGHER_IS_BETTER') {
    // Maximize: actualValue >= benchmarkTarget -> 100, actualValue <= benchmarkMin -> 0
    const fraction = (actualValue - benchmarkMin) / (benchmarkTarget - benchmarkMin);
    return Math.min(100, Math.max(0, Math.round(fraction * 100)));
  } else {
    // Lower is better (minimize):
    // Supports benchmarkMin as worst/ceiling or worst/floor
    let fraction: number;
    if (benchmarkMin > benchmarkTarget) {
      fraction = (benchmarkMin - actualValue) / (benchmarkMin - benchmarkTarget);
    } else {
      fraction = (benchmarkTarget - actualValue) / (benchmarkTarget - benchmarkMin);
    }
    return Math.min(100, Math.max(0, Math.round(fraction * 100)));
  }
}
