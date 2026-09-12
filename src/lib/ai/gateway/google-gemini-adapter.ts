import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  AiExecutionOptions,
  AiGenerationInput,
  AiHealthCheckResult,
  AiProviderAdapter,
  AiStructuredGenerationResult,
  AiTextGenerationResult,
  AiUsageMetadata,
} from "./types";
import { AiGatewayError } from "./types";

export interface GeminiInteractionRequest {
  model: string;
  input: string;
  system_instruction: string;
  store: false;
  stream: false;
  background: false;
  generation_config: {
    temperature: number;
    max_output_tokens: number;
  };
  response_format?: {
    type: "text";
    mime_type: "application/json";
    schema: Record<string, unknown>;
  };
}

export interface GeminiInteractionTransport {
  create(apiKey: string, request: GeminiInteractionRequest, signal?: AbortSignal): Promise<unknown>;
  healthCheck(apiKey: string): Promise<void>;
}

interface GeminiSdkClient {
  interactions: {
    create(
      request: GeminiInteractionRequest,
      options: {
        timeout_ms: number;
        retries: { strategy: "none" };
        fetch_options?: { signal: AbortSignal };
      }
    ): Promise<unknown>;
  };
  models: {
    list(input: { config: { pageSize: number } }): Promise<unknown>;
  };
}

const geminiResponseSchema = z.object({
  id: z.string().min(1).max(128),
  status: z.string(),
  output_text: z.string().max(2_000_000),
  usage: z
    .object({
      total_input_tokens: z.number().int().nonnegative().optional(),
      total_output_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const GEMINI_INTERACTION_TIMEOUT_MS = 60_000;

function createSdkTransport(): GeminiInteractionTransport {
  return {
    async create(apiKey, request, signal) {
      // The 2.22.0 generated type omits temperature although the official
      // Interactions API accepts it; its runtime forwards this trusted body unchanged.
      const client = new GoogleGenAI({ apiKey, vertexai: false }) as unknown as GeminiSdkClient;
      return await client.interactions.create(request, {
        timeout_ms: GEMINI_INTERACTION_TIMEOUT_MS,
        retries: { strategy: "none" },
        ...(signal ? { fetch_options: { signal } } : {}),
      });
    },
    async healthCheck(apiKey) {
      const client = new GoogleGenAI({ apiKey, vertexai: false }) as unknown as GeminiSdkClient;
      await client.models.list({ config: { pageSize: 1 } });
    },
  };
}

function normalizeUsage(usage: z.infer<typeof geminiResponseSchema>["usage"]): AiUsageMetadata {
  const inputTokens = usage?.total_input_tokens ?? 0;
  const outputTokens = usage?.total_output_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
    costMicros: null,
    currency: null,
    costSource: "UNAVAILABLE",
  };
}

function classifyGeminiError(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const status =
    typeof error === "object" && error !== null
      ? Number(
          "statusCode" in error
            ? (error as { statusCode?: unknown }).statusCode
            : "status" in error
              ? (error as { status?: unknown }).status
              : Number.NaN
        )
      : Number.NaN;
  if (status === 401 || status === 403) {
    return new AiGatewayError("AI_PROVIDER_AUTH_FAILED", "Gemini authentication failed.");
  }
  if (status === 429) {
    return new AiGatewayError("AI_PROVIDER_RATE_LIMITED", "Gemini rate limited the request.");
  }
  if (status >= 500) {
    return new AiGatewayError("AI_PROVIDER_UNAVAILABLE", "Gemini is unavailable.");
  }
  return new AiGatewayError(
    "AI_PROVIDER_OUTCOME_UNKNOWN",
    "Gemini request outcome is unknown.",
    true
  );
}

export class GoogleGeminiAdapter implements AiProviderAdapter {
  readonly providerKey = "google";

  constructor(private readonly transport: GeminiInteractionTransport = createSdkTransport()) {}

  async healthCheck(apiKey: string): Promise<AiHealthCheckResult> {
    if (!apiKey.trim()) return { ok: false, status: "UNHEALTHY" };
    try {
      await this.transport.healthCheck(apiKey);
      return { ok: true, status: "HEALTHY" };
    } catch {
      return { ok: false, status: "UNHEALTHY" };
    }
  }

  async generateText(
    apiKey: string,
    input: AiGenerationInput,
    options: AiExecutionOptions
  ): Promise<AiTextGenerationResult> {
    const result = await this.execute(apiKey, input, options);
    return {
      text: result.output_text,
      providerRequestId: result.id,
      usage: normalizeUsage(result.usage),
    };
  }

  async generateStructured(
    apiKey: string,
    input: AiGenerationInput,
    jsonSchema: Record<string, unknown>,
    options: AiExecutionOptions
  ): Promise<AiStructuredGenerationResult> {
    const result = await this.execute(apiKey, input, options, jsonSchema);
    let data: unknown;
    try {
      data = JSON.parse(result.output_text) as unknown;
    } catch {
      throw new AiGatewayError(
        "AI_PROVIDER_RESPONSE_INVALID",
        "Gemini returned invalid structured output."
      );
    }
    return { data, providerRequestId: result.id, usage: normalizeUsage(result.usage) };
  }

  private async execute(
    apiKey: string,
    input: AiGenerationInput,
    options: AiExecutionOptions,
    jsonSchema?: Record<string, unknown>
  ): Promise<z.infer<typeof geminiResponseSchema>> {
    if (!apiKey.trim()) {
      throw new AiGatewayError("AI_PROVIDER_AUTH_FAILED", "Gemini credential is missing.");
    }
    options.signal?.throwIfAborted();
    const timeoutSignal = AbortSignal.timeout(GEMINI_INTERACTION_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const request: GeminiInteractionRequest = {
      model: options.modelId,
      input: input.input,
      system_instruction: input.systemInstruction,
      store: false,
      stream: false,
      background: false,
      generation_config: {
        temperature: options.temperature,
        max_output_tokens: options.maxTokens,
      },
      ...(jsonSchema
        ? {
            response_format: {
              type: "text" as const,
              mime_type: "application/json" as const,
              schema: jsonSchema,
            },
          }
        : {}),
    };

    try {
      const raw = await this.transport.create(apiKey, request, signal);
      const parsed = geminiResponseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.status !== "completed") {
        throw new AiGatewayError(
          "AI_PROVIDER_RESPONSE_INVALID",
          "Gemini returned an invalid interaction response."
        );
      }
      return parsed.data;
    } catch (error) {
      throw classifyGeminiError(error);
    }
  }
}

export const googleGeminiAdapter = new GoogleGeminiAdapter();
