// ---------------------------------------------------------------------------
// FASE 3.6 — SumoPod AI Requirement Provider
//
// Bridges SumoPodAdapter with AIRequirementParser.
// Implements IAIProvider to extract semantic WorkshopLayoutRequirement
// from natural language prompts using OpenAI-compatible /chat/completions.
//
// Rules:
//   - Uses SumoPodAdapter for connection, authentication, and HTTP transport.
//   - Role: "Workshop requirement analyst", NOT CAD designer.
//   - Strictly semantic: NEVER produces CAD geometry (x, y, rotation, polygon,
//     envelope, clearance, offsetMeters, wallThickness, coordinates).
//   - Strictly honest: NEVER hallucinates or invents data. If missing, requests clarification.
//   - API key is secret and never logged or exposed.
// ---------------------------------------------------------------------------

import {
  IAIProvider,
  AIProviderRawResponse,
} from '../../application/ai/requirementParser';
import {
  AIProviderConfig,
  maskApiKey,
} from '../../application/ai/providerConfig';
import {
  SumoPodAdapter,
  SumoPodAdapterOptions,
  SumoPodConfigError,
  SumoPodAuthError,
  SumoPodNetworkError,
  SumoPodInvalidResponseError,
} from './sumopodAdapter';
import { WorkshopLayoutRequirement } from '../../domain/requirements/requirementTypes';

// ---------------------------------------------------------------------------
// 1. Forbidden CAD & Engineering Keys Guard
// ---------------------------------------------------------------------------

export const FORBIDDEN_CAD_AND_ENGINEERING_KEYS = [
  'x',
  'y',
  'rotation',
  'polygon',
  'vertices',
  'envelope',
  'clearance',
  'offsetMeters',
  'wallThickness',
  'coordinates',
  'coordinate',
] as const;

/**
 * Scans an arbitrary JSON structure recursively for forbidden CAD / engineering keys.
 * Allows 'width' and 'length' only in semantic contexts (site and building).
 */
export function detectForbiddenCadFields(obj: unknown, path: string = ''): string[] {
  const violations: string[] = [];

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return violations;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_CAD_AND_ENGINEERING_KEYS.includes(key as any)) {
      violations.push(fullPath);
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          violations.push(...detectForbiddenCadFields(value[i], `${fullPath}[${i}]`));
        }
      } else {
        violations.push(...detectForbiddenCadFields(value, fullPath));
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 2. System Prompt for Workshop Requirement Analyst
// ---------------------------------------------------------------------------

export const WORKSHOP_ANALYST_SYSTEM_PROMPT = `
You are a senior Workshop Requirement Analyst for automotive service centers.
Your task is to analyze the user's natural language request and extract business and functional requirements into a structured JSON response.

CRITICAL ROLE BOUNDARY:
You are a REQUIREMENT ANALYST, NOT a CAD designer or civil engineer.
You must NEVER generate CAD coordinates, angles, polygon vertices, clearance buffers, wall thicknesses, or CAD primitives.

YOU MAY ONLY EXTRACT THE FOLLOWING SEMANTIC FIELDS:
- projectName: string (e.g. "Bengkel Mobil Modern")
- workshopType: "car_service" | "motorcycle_service" | "quick_lube" | "tire_center" | "body_paint" | "fleet_maintenance"
- vehicleCategory: "motorcycle" | "city_car" | "sedan" | "mpv" | "suv" | "pickup_truck" | "van" | "light_truck"
- priority: "MAXIMIZE_CAPACITY" | "BALANCED_EFFICIENCY" | "PREMIUM_EXPERIENCE"
- site: {
    widthMeters: number (must be > 0),
    lengthMeters: number (must be > 0),
    roadOrientation?: "north" | "south" | "east" | "west"
  }
- building: {
    widthMeters: number (must be > 0),
    lengthMeters: number (must be > 0),
    frontSetbackMeters?: number
  }
- access: {
    entryPosition: "front_left" | "front_center" | "front_right" | "rear_left" | "rear_center" | "rear_right" | "left_side" | "right_side",
    exitPosition?: "front_left" | "front_center" | "front_right" | "rear_left" | "rear_center" | "rear_right" | "left_side" | "right_side",
    pedestrianEntryPosition?: "front_left" | "front_center" | "front_right" | "rear_left" | "rear_center" | "rear_right" | "left_side" | "right_side",
    preferDriveThrough?: boolean
  }
- services: Array<{
    serviceType: "general_service" | "quick_lube" | "tire_service" | "wheel_alignment" | "brake_suspension" | "engine_overhaul" | "ac_service" | "body_repair" | "paint" | "inspection" | "detailing" | "electrical",
    bayCount: number,
    requiredLifts?: Array<"2_post_lift" | "4_post_lift" | "scissor_lift" | "pit" | "motorcycle_lift">
  }>
- equipmentPreferences?: string[] (e.g. ["tire_changer", "wheel_balancer", "compressor", "alignment_sensor"])
- ancillarySpaces: {
    customerLounge: boolean,
    cashierOffice: boolean,
    partsWarehouse: boolean,
    restroom: boolean,
    compressorRoom?: boolean,
    oilWasteStorage?: boolean,
    staffRoom?: boolean,
    loungeWithBayView?: boolean
  }
- parking?: {
    customerParkingSpaces?: number,
    staffParkingSpaces?: number,
    vehicleStagingSpaces?: number
  }
- futureExpansionBays?: number
- specialInstructions?: string[]

INDONESIAN WORKSHOP SERVICE MAPPING DICTIONARY:
- "servis umum" / "perawatan berkala" / "tune up" -> "general_service"
- "ganti oli" / "quick lube" / "lube" -> "quick_lube"
- "ban" / "ganti ban" / "tire" -> "tire_service"
- "spooring" / "alignment" / "penyelarasan roda" -> "wheel_alignment" (NEVER MAP TO "inspection"!)
- "kaki-kaki" / "rem" / "suspensi" / "understeel" -> "brake_suspension"
- "turun mesin" / "overhaul" -> "engine_overhaul"
- "ac" / "servis ac" -> "ac_service"
- "ketok magic" / "body repair" / "perbaikan bodi" -> "body_repair"
- "cat" / "pengecatan" / "oven" -> "paint"
- "uji emisi" / "inspeksi" / "kir" -> "inspection"
- "salon mobil" / "poles" / "detailing" / "coating" -> "detailing"
- "kelistrikan" / "audio" / "kabel" -> "electrical"

STRICT ANTI-HALLUCINATION & EXTRACTION RULES:
1. UNKNOWN MUST REMAIN UNKNOWN. If the user did not explicitly state information, DO NOT invent, assume, or default it.
   - If user only mentions entry (e.g. "masuk dari depan tengah"), leave exitPosition and preferDriveThrough OMITTED/UNDEFINED. Do NOT assume back-out, one-way, rear exit, or drive-through.
   - If user does not specify vehicle category (e.g. only says "bengkel mobil"), do NOT guess "sedan" or "mpv". Leave vehicleCategory UNDEFINED and ask in clarificationQuestions.
   - If user does not mention parking, do NOT invent parking slot counts.
   - If user does not mention expansion, do NOT invent expansion bays.
2. SPOORING IS ALWAYS "wheel_alignment", NEVER "inspection".
3. If mandatory fields (dimensions, vehicle category, entry position, services) are missing from the prompt, list them in "clarificationQuestions" and set confidence < 0.7.
4. FORBIDDEN KEYS: Do NOT output x, y, rotation, polygon, vertices, envelope, clearance, offsetMeters, wallThickness, or coordinates.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "confidence": number (between 0.0 and 1.0),
  "extractedRequirement": { ... partial or complete fields above ... },
  "clarificationQuestions": [ "Pertanyaan 1...", "Pertanyaan 2..." ],
  "reasoning": "Brief explanation of what was extracted and what is still needed"
}
`.trim();

// ---------------------------------------------------------------------------
// 3. Provider Implementation
// ---------------------------------------------------------------------------

export class SumoPodRequirementProvider implements IAIProvider {
  public readonly providerName = 'sumopod';
  private readonly adapter: SumoPodAdapter;
  private readonly fetch: typeof fetch;

  constructor(
    adapterOrConfig: SumoPodAdapter | (Partial<AIProviderConfig> & { apiKey: string }),
    options: SumoPodAdapterOptions = {}
  ) {
    if (adapterOrConfig instanceof SumoPodAdapter) {
      this.adapter = adapterOrConfig;
    } else {
      this.adapter = new SumoPodAdapter(adapterOrConfig, options);
    }

    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Calls SumoPod's OpenAI-compatible `/chat/completions` endpoint to extract
   * semantic workshop requirements from user prompt.
   */
  async parseRequirement(userPrompt: string): Promise<AIProviderRawResponse> {
    const config = this.adapter.config;

    // 1. Guard configuration: API key
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new SumoPodConfigError(
        'SumoPod API key is empty. Please provide a valid API key in configuration.'
      );
    }

    // 2. Guard configuration: Model selection (must not assume a default)
    if (!config.model || config.model.trim().length === 0) {
      throw new SumoPodConfigError(
        'No AI model configured for SumoPod AI provider. Please specify a model in AIProviderConfig.'
      );
    }

    // 3. Prepare Chat Completions payload
    const requestPayload = {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: WORKSHOP_ANALYST_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    let response: Response;
    try {
      response = await this.adapter.executeRawRequest('/chat/completions', 'POST', requestPayload);
    } catch (networkErr) {
      throw new SumoPodNetworkError(
        `Failed to reach SumoPod endpoint at ${config.baseUrl}: ${(networkErr as Error).message}`
      );
    }

    // 4. Handle HTTP Status codes
    if (response.status === 401 || response.status === 403) {
      throw new SumoPodAuthError(
        `Authentication failed (HTTP ${response.status}). Please verify your SumoPod API key. Key used: ${maskApiKey(config.apiKey)}.`,
        response.status
      );
    }

    if (!response.ok) {
      throw new SumoPodNetworkError(
        `SumoPod endpoint responded with HTTP ${response.status} ${response.statusText}`,
        response.status
      );
    }

    // 5. Parse Chat Completions JSON envelope
    let envelope: any;
    try {
      envelope = await response.json();
    } catch (jsonErr) {
      throw new SumoPodInvalidResponseError(
        `SumoPod response could not be parsed as JSON: ${(jsonErr as Error).message}`
      );
    }

    const messageContent = envelope?.choices?.[0]?.message?.content;
    if (typeof messageContent !== 'string' || messageContent.trim().length === 0) {
      throw new SumoPodInvalidResponseError(
        'SumoPod chat completion response missing message content in choices[0].message.content'
      );
    }

    // 6. Parse inner JSON string produced by model
    let parsedContent: any;
    try {
      parsedContent = JSON.parse(messageContent);
    } catch (innerJsonErr) {
      throw new SumoPodInvalidResponseError(
        `AI generated malformed JSON: ${(innerJsonErr as Error).message}`
      );
    }

    if (!parsedContent || typeof parsedContent !== 'object') {
      throw new SumoPodInvalidResponseError(
        'AI response is not a valid JSON object.'
      );
    }

    // 7. Guard against CAD & Engineering leakage
    const forbiddenViolations = detectForbiddenCadFields(parsedContent);
    if (forbiddenViolations.length > 0) {
      throw new SumoPodInvalidResponseError(
        `AI response contains forbidden CAD/engineering fields: ${forbiddenViolations.join(', ')}. AI must only produce semantic requirements.`
      );
    }

    // 8. Format as AIProviderRawResponse
    const rawResponse: AIProviderRawResponse = {
      confidence: typeof parsedContent.confidence === 'number'
        ? Math.max(0, Math.min(1, parsedContent.confidence))
        : 0.5,
      extractedRequirement: (parsedContent.extractedRequirement as Partial<WorkshopLayoutRequirement>) || {},
      clarificationQuestions: Array.isArray(parsedContent.clarificationQuestions)
        ? parsedContent.clarificationQuestions.map((q: any) => String(q))
        : undefined,
      reasoning: typeof parsedContent.reasoning === 'string'
        ? parsedContent.reasoning
        : undefined,
    };

    return Object.freeze(rawResponse);
  }
}
