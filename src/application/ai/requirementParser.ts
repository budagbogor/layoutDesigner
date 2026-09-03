// ---------------------------------------------------------------------------
// FASE 3.3 — AI Requirement Assistant: Provider Boundary & Result Contracts
//
// This module defines the abstract boundary between the application layer
// and any AI/LLM provider. The domain engine NEVER imports or knows about
// this module or any AI SDK.
//
// Architecture:
//   Natural Language Prompt
//         ↓
//   IAIProvider.parseRequirement(prompt)     ← Abstract provider boundary
//         ↓
//   AIProviderRawResponse                    ← Raw structured JSON from LLM
//         ↓
//   AIRequirementParser.parse(prompt)        ← Validates & classifies
//         ↓
//   AIParseResult (COMPLETE | NEEDS_CLARIFICATION | INVALID)
//         ↓
//   WorkshopLayoutRequirement (if COMPLETE)
//
// Rules:
//   - No AI SDK imports in this file. Provider is an interface.
//   - AI must never produce X/Y coordinates, rotation, clearance, or geometry.
//   - AI must never invent information the user did not provide.
//   - If the user's input is incomplete, result must be NEEDS_CLARIFICATION.
//   - Provider implementations live in separate adapter files (not here).
// ---------------------------------------------------------------------------

import {
  WorkshopLayoutRequirement,
  validateRequirement,
  RequirementValidationResult,
} from '../../domain/requirements/requirementTypes';

// ---------------------------------------------------------------------------
// 1. AI Provider Raw Response Contract
// ---------------------------------------------------------------------------

/**
 * The raw structured output that any AI provider must return.
 * This is the LLM's attempt at extracting a WorkshopLayoutRequirement.
 * It may be partial, incorrect, or complete — the parser validates it.
 */
export interface AIProviderRawResponse {
  /** The AI's confidence that it fully understood the user's intent (0.0 - 1.0). */
  readonly confidence: number;

  /** Partial or complete requirement extracted by the AI. */
  readonly extractedRequirement: Partial<WorkshopLayoutRequirement>;

  /** Questions the AI wants to ask the user if information is missing. */
  readonly clarificationQuestions?: readonly string[];

  /** AI's reasoning about what it understood and what it could not determine. */
  readonly reasoning?: string;
}

// ---------------------------------------------------------------------------
// 2. AI Provider Interface (Abstract Boundary)
// ---------------------------------------------------------------------------

/**
 * Abstract interface for any AI/LLM provider.
 * Implementations will wrap OpenAI, Gemini, Claude, local models, etc.
 * Domain engine code must NEVER import or depend on this interface.
 */
export interface IAIProvider {
  readonly providerName: string;

  /**
   * Sends a natural language prompt to the AI and receives a structured response.
   * The provider is responsible for system prompting, JSON extraction, and retry logic.
   */
  parseRequirement(userPrompt: string): Promise<AIProviderRawResponse>;
}

// ---------------------------------------------------------------------------
// 3. AI Parse Result Discriminated Union
// ---------------------------------------------------------------------------

export type AIParseStatus = 'COMPLETE' | 'NEEDS_CLARIFICATION' | 'INVALID';

export interface AIParseResultComplete {
  readonly status: 'COMPLETE';
  readonly requirement: WorkshopLayoutRequirement;
  readonly confidence: number;
  readonly reasoning?: string;
  readonly validationResult: RequirementValidationResult;
}

export interface ClarificationQuestion {
  readonly field: string;
  readonly question: string;
  readonly suggestedOptions?: readonly string[];
}

export interface AIParseResultNeedsClarification {
  readonly status: 'NEEDS_CLARIFICATION';
  readonly partialRequirement: Partial<WorkshopLayoutRequirement>;
  readonly questions: readonly ClarificationQuestion[];
  readonly confidence: number;
  readonly reasoning?: string;
}

export interface AIParseResultInvalid {
  readonly status: 'INVALID';
  readonly reason: string;
  readonly rawResponse?: AIProviderRawResponse;
}

export type AIParseResult =
  | AIParseResultComplete
  | AIParseResultNeedsClarification
  | AIParseResultInvalid;

// ---------------------------------------------------------------------------
// 4. Geometry Guard — Ensures AI never produces CAD data
// ---------------------------------------------------------------------------

const CAD_GEOMETRY_KEYS = [
  'x', 'y', 'rotation', 'width', 'length',
  'offsetMeters', 'widthMeters_cad', 'polygon', 'vertices',
  'envelope', 'clearance', 'wallThickness',
] as const;

/**
 * Recursively scans an object for keys that look like CAD geometry data.
 * Returns the list of forbidden keys found, if any.
 */
export function detectCadGeometryInResponse(obj: unknown, path: string = ''): string[] {
  const violations: string[] = [];

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return violations;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key;

    // Check if the key itself is a forbidden CAD geometry key
    if (CAD_GEOMETRY_KEYS.includes(key as any)) {
      // Allow 'width' and 'length' only inside site/building semantic contexts
      if (
        (key === 'width' || key === 'length') &&
        (path.endsWith('site') || path.endsWith('building'))
      ) {
        // These are legitimate semantic dimensions, not CAD coordinates
        continue;
      }
      violations.push(fullPath);
    }

    // Recurse into nested objects and arrays
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          violations.push(...detectCadGeometryInResponse(value[i], `${fullPath}[${i}]`));
        }
      } else {
        violations.push(...detectCadGeometryInResponse(value, fullPath));
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 5. AI Requirement Parser (Uses Provider + Validates)
// ---------------------------------------------------------------------------

/** Confidence threshold below which the parser requests clarification. */
const CLARIFICATION_CONFIDENCE_THRESHOLD = 0.7;

export class AIRequirementParser {
  constructor(private readonly provider: IAIProvider) {}

  /**
   * Parses a natural language prompt into a WorkshopLayoutRequirement.
   *
   * Flow:
   * 1. Sends prompt to AI provider.
   * 2. Checks for forbidden CAD geometry in response.
   * 3. Validates extracted requirement.
   * 4. Returns COMPLETE, NEEDS_CLARIFICATION, or INVALID.
   */
  async parse(userPrompt: string): Promise<AIParseResult> {
    if (!userPrompt || userPrompt.trim().length === 0) {
      return Object.freeze({
        status: 'INVALID' as const,
        reason: 'User prompt is empty. Please describe your workshop requirements.',
      });
    }

    let rawResponse: AIProviderRawResponse;
    try {
      rawResponse = await this.provider.parseRequirement(userPrompt);
    } catch (error) {
      return Object.freeze({
        status: 'INVALID' as const,
        reason: `AI provider error: ${(error as Error).message}`,
      });
    }

    // Guard: reject any response containing CAD geometry
    const geometryViolations = detectCadGeometryInResponse(rawResponse.extractedRequirement);
    if (geometryViolations.length > 0) {
      return Object.freeze({
        status: 'INVALID' as const,
        reason: `AI response contains forbidden CAD geometry fields: ${geometryViolations.join(', ')}. AI must only produce semantic requirements, not coordinates or engineering parameters.`,
        rawResponse,
      });
    }

    const extracted = rawResponse.extractedRequirement;

    // If AI itself reported clarification questions, or confidence is low
    if (
      (rawResponse.clarificationQuestions && rawResponse.clarificationQuestions.length > 0) ||
      rawResponse.confidence < CLARIFICATION_CONFIDENCE_THRESHOLD
    ) {
      const questions = buildClarificationQuestions(extracted, rawResponse.clarificationQuestions);

      return Object.freeze({
        status: 'NEEDS_CLARIFICATION' as const,
        partialRequirement: Object.freeze({ ...extracted }),
        questions: Object.freeze(questions),
        confidence: rawResponse.confidence,
        reasoning: rawResponse.reasoning,
      });
    }

    // Attempt to treat extracted data as a complete requirement
    const candidate = extracted as WorkshopLayoutRequirement;
    const validation = validateRequirement(candidate);

    if (!validation.isValid) {
      // Missing mandatory fields → needs clarification, not outright invalid
      const questions = buildClarificationQuestionsFromMissing(validation.missingFields);

      return Object.freeze({
        status: 'NEEDS_CLARIFICATION' as const,
        partialRequirement: Object.freeze({ ...extracted }),
        questions: Object.freeze(questions),
        confidence: rawResponse.confidence,
        reasoning: rawResponse.reasoning,
      });
    }

    // All mandatory fields present and valid
    return Object.freeze({
      status: 'COMPLETE' as const,
      requirement: Object.freeze({ ...candidate }),
      confidence: rawResponse.confidence,
      reasoning: rawResponse.reasoning,
      validationResult: validation,
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Clarification Question Builders
// ---------------------------------------------------------------------------

function buildClarificationQuestions(
  partial: Partial<WorkshopLayoutRequirement>,
  aiQuestions?: readonly string[]
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  // Add AI-generated questions
  if (aiQuestions) {
    for (const q of aiQuestions) {
      questions.push(Object.freeze({ field: 'ai_generated', question: q }));
    }
  }

  // Add questions for missing mandatory semantic fields
  if (!partial.site?.widthMeters || !partial.site?.lengthMeters) {
    questions.push(
      Object.freeze({
        field: 'site',
        question: 'Berapa ukuran lahan Anda (lebar × panjang dalam meter)?',
      })
    );
  }

  if (!partial.building?.widthMeters || !partial.building?.lengthMeters) {
    questions.push(
      Object.freeze({
        field: 'building',
        question: 'Berapa ukuran bangunan bengkel Anda (lebar × panjang dalam meter)?',
      })
    );
  }

  if (!partial.services || partial.services.length === 0) {
    questions.push(
      Object.freeze({
        field: 'services',
        question: 'Layanan apa saja yang ingin Anda sediakan, dan berapa bay untuk masing-masing?',
        suggestedOptions: Object.freeze(['Servis Umum', 'Quick Lube', 'Ban & Spooring', 'AC', 'Body Repair']),
      })
    );
  }

  if (!partial.workshopType) {
    questions.push(
      Object.freeze({
        field: 'workshopType',
        question: 'Jenis bengkel apa yang ingin Anda bangun?',
        suggestedOptions: Object.freeze(['Bengkel Mobil', 'Bengkel Motor', 'Quick Lube', 'Ban Center']),
      })
    );
  }

  if (!partial.vehicleCategory) {
    questions.push(
      Object.freeze({
        field: 'vehicleCategory',
        question: 'Kategori kendaraan apa yang akan dilayani?',
        suggestedOptions: Object.freeze(['MPV', 'Sedan', 'SUV', 'City Car', 'Motor']),
      })
    );
  }

  if (!partial.access?.entryPosition) {
    questions.push(
      Object.freeze({
        field: 'access.entryPosition',
        question: 'Di sisi mana pintu masuk kendaraan akan ditempatkan?',
        suggestedOptions: Object.freeze(['Depan Kiri', 'Depan Tengah', 'Depan Kanan', 'Samping']),
      })
    );
  }

  return questions;
}

function buildClarificationQuestionsFromMissing(
  missingFields: readonly string[]
): ClarificationQuestion[] {
  const fieldQuestionMap: Record<string, { question: string; suggestedOptions?: readonly string[] }> = {
    'projectName': { question: 'Apa nama proyek bengkel Anda?' },
    'workshopType': {
      question: 'Jenis bengkel apa yang ingin Anda bangun?',
      suggestedOptions: ['Bengkel Mobil', 'Bengkel Motor', 'Quick Lube'],
    },
    'vehicleCategory': {
      question: 'Kategori kendaraan apa yang akan dilayani?',
      suggestedOptions: ['MPV', 'Sedan', 'SUV', 'City Car', 'Motor'],
    },
    'priority': {
      question: 'Apa prioritas utama layout bengkel Anda?',
      suggestedOptions: ['Kapasitas Maksimal', 'Seimbang', 'Pengalaman Premium'],
    },
    'site.widthMeters': { question: 'Berapa lebar lahan Anda (dalam meter)?' },
    'site.lengthMeters': { question: 'Berapa panjang lahan Anda (dalam meter)?' },
    'building.widthMeters': { question: 'Berapa lebar bangunan bengkel (dalam meter)?' },
    'building.lengthMeters': { question: 'Berapa panjang bangunan bengkel (dalam meter)?' },
    'access.entryPosition': {
      question: 'Di sisi mana pintu masuk kendaraan akan ditempatkan?',
      suggestedOptions: ['Depan Kiri', 'Depan Tengah', 'Depan Kanan'],
    },
    'ancillarySpaces': { question: 'Fasilitas penunjang apa yang dibutuhkan (ruang tunggu, kasir, gudang, toilet)?' },
  };

  return missingFields.map((field) => {
    // Find by exact match or by prefix
    const mapped = fieldQuestionMap[field] ??
      Object.entries(fieldQuestionMap).find(([k]) => field.startsWith(k))?.[1];

    return Object.freeze({
      field,
      question: mapped?.question ?? `Mohon lengkapi informasi untuk: ${field}`,
      suggestedOptions: mapped?.suggestedOptions ? Object.freeze([...mapped.suggestedOptions]) : undefined,
    });
  });
}
