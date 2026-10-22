import "server-only";

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

/** Groq exposes an OpenAI-compatible API; its free tier is the fallback when Gemini runs out. */
export const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";

export interface GroqChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_completion_tokens: number;
  stream: false;
  response_format?: { type: "json_object" };
}

export interface GroqTransport {
  createChatCompletion(
    apiKey: string,
    request: GroqChatRequest,
    signal: AbortSignal
  ): Promise<{ status: number; body: unknown }>;
  listModels(apiKey: string): Promise<{ status: number }>;
}

const groqResponseSchema = z.object({
  id: z.string().min(1).max(128),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().max(2_000_000).nullable() }),
        finish_reason: z.string().nullable(),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const GROQ_TIMEOUT_MS = 60_000;

function createFetchTransport(): GroqTransport {
  return {
    async createChatCompletion(apiKey, request, signal) {
      const response = await fetch(`${GROQ_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      const body: unknown = response.ok ? await response.json() : null;
      return { status: response.status, body };
    },
    async listModels(apiKey) {
      const response = await fetch(`${GROQ_API_BASE_URL}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      return { status: response.status };
    },
  };
}

function normalizeUsage(usage: z.infer<typeof groqResponseSchema>["usage"]): AiUsageMetadata {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
    costMicros: null,
    currency: null,
    costSource: "UNAVAILABLE",
  };
}

function errorForStatus(status: number): AiGatewayError {
  if (status === 401 || status === 403) {
    return new AiGatewayError("AI_PROVIDER_AUTH_FAILED", "Groq authentication failed.");
  }
  if (status === 429) {
    return new AiGatewayError("AI_PROVIDER_RATE_LIMITED", "Groq rate limited the request.");
  }
  // 498: Groq flex tier out of capacity.
  if (status === 498 || status >= 500) {
    return new AiGatewayError("AI_PROVIDER_UNAVAILABLE", "Groq is unavailable.");
  }
  return new AiGatewayError("AI_PROVIDER_RESPONSE_INVALID", "Groq rejected the request.");
}

export class GroqAdapter implements AiProviderAdapter {
  readonly providerKey = "groq";

  constructor(private readonly transport: GroqTransport = createFetchTransport()) {}

  async healthCheck(apiKey: string): Promise<AiHealthCheckResult> {
    if (!apiKey.trim()) return { ok: false, status: "UNHEALTHY" };
    try {
      const { status } = await this.transport.listModels(apiKey);
      return status === 200 ? { ok: true, status: "HEALTHY" } : { ok: false, status: "UNHEALTHY" };
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
      text: result.choices[0]!.message.content ?? "",
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
      data = JSON.parse(result.choices[0]!.message.content ?? "") as unknown;
    } catch {
      throw new AiGatewayError(
        "AI_PROVIDER_RESPONSE_INVALID",
        "Groq returned invalid structured output."
      );
    }
    return { data, providerRequestId: result.id, usage: normalizeUsage(result.usage) };
  }

  private async execute(
    apiKey: string,
    input: AiGenerationInput,
    options: AiExecutionOptions,
    jsonSchema?: Record<string, unknown>
  ): Promise<z.infer<typeof groqResponseSchema>> {
    if (!apiKey.trim()) {
      throw new AiGatewayError("AI_PROVIDER_AUTH_FAILED", "Groq credential is missing.");
    }
    options.signal?.throwIfAborted();
    const timeoutSignal = AbortSignal.timeout(GROQ_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    // JSON mode needs the schema spelled out in the prompt; the caller still validates the result.
    const systemContent = jsonSchema
      ? `${input.systemInstruction}\n\nRespond only with a JSON object that matches this JSON Schema:\n${JSON.stringify(jsonSchema)}`
      : input.systemInstruction;
    const request: GroqChatRequest = {
      model: options.modelId,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: input.input },
      ],
      temperature: options.temperature,
      max_completion_tokens: options.maxTokens,
      stream: false,
      ...(jsonSchema ? { response_format: { type: "json_object" as const } } : {}),
    };

    let response: { status: number; body: unknown };
    try {
      response = await this.transport.createChatCompletion(apiKey, request, signal);
    } catch {
      throw new AiGatewayError(
        "AI_PROVIDER_OUTCOME_UNKNOWN",
        "Groq request outcome is unknown.",
        true
      );
    }
    if (response.status !== 200) throw errorForStatus(response.status);
    const parsed = groqResponseSchema.safeParse(response.body);
    if (!parsed.success || parsed.data.choices[0]!.finish_reason === "length") {
      throw new AiGatewayError(
        "AI_PROVIDER_RESPONSE_INVALID",
        "Groq returned an invalid chat completion."
      );
    }
    return parsed.data;
  }
}

export const groqAdapter = new GroqAdapter();
