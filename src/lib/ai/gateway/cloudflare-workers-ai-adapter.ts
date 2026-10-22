import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
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

/**
 * Cloudflare Workers AI through the Worker's `AI` binding: no API key and no extra account,
 * billed against the account's daily free neuron allowance.
 */
export interface WorkersAiRunInput {
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_schema"; json_schema: Record<string, unknown> };
}

export interface WorkersAiBinding {
  run(model: string, input: WorkersAiRunInput): Promise<unknown>;
}

const workersAiResponseSchema = z.object({
  // JSON mode may hand back the parsed object instead of a string.
  response: z.union([z.string().max(2_000_000), z.record(z.string(), z.unknown())]),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const WORKERS_AI_TIMEOUT_MS = 60_000;

function bindingFromContext(): WorkersAiBinding | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { AI?: WorkersAiBinding }).AI ?? null;
  } catch {
    return null;
  }
}

function normalizeUsage(usage: z.infer<typeof workersAiResponseSchema>["usage"]): AiUsageMetadata {
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

/** Workers AI reports failures as errors whose message starts with a numeric code. */
function classifyWorkersAiError(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const message = error instanceof Error ? error.message : String(error);
  // 3036: daily free neurons used up; 3040 / capacity: no capacity for the model right now.
  if (/\b3036\b|neurons|daily limit|rate limit/i.test(message)) {
    return new AiGatewayError("AI_PROVIDER_RATE_LIMITED", "Workers AI daily allowance is used up.");
  }
  if (/\b3040\b|capacity|temporarily unavailable/i.test(message)) {
    return new AiGatewayError("AI_PROVIDER_UNAVAILABLE", "Workers AI is out of capacity.");
  }
  if (/\b(5006|5007|5018)\b|model not found|no such model|invalid input/i.test(message)) {
    return new AiGatewayError("AI_PROVIDER_RESPONSE_INVALID", "Workers AI model is not available.");
  }
  return new AiGatewayError(
    "AI_PROVIDER_OUTCOME_UNKNOWN",
    "Workers AI request outcome is unknown.",
    true
  );
}

export class CloudflareWorkersAiAdapter implements AiProviderAdapter {
  readonly providerKey = "cloudflare";

  constructor(
    private readonly resolveBinding: () => WorkersAiBinding | null = bindingFromContext
  ) {}

  async healthCheck(): Promise<AiHealthCheckResult> {
    return this.resolveBinding()
      ? { ok: true, status: "HEALTHY" }
      : { ok: false, status: "UNHEALTHY", message: "The Worker has no AI binding." };
  }

  async generateText(
    _apiKey: string,
    input: AiGenerationInput,
    options: AiExecutionOptions
  ): Promise<AiTextGenerationResult> {
    const result = await this.execute(input, options);
    return {
      text: typeof result.response === "string" ? result.response : JSON.stringify(result.response),
      providerRequestId: null,
      usage: normalizeUsage(result.usage),
    };
  }

  async generateStructured(
    _apiKey: string,
    input: AiGenerationInput,
    jsonSchema: Record<string, unknown>,
    options: AiExecutionOptions
  ): Promise<AiStructuredGenerationResult> {
    const result = await this.execute(input, options, jsonSchema);
    let data: unknown = result.response;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        throw new AiGatewayError(
          "AI_PROVIDER_RESPONSE_INVALID",
          "Workers AI returned invalid structured output."
        );
      }
    }
    return { data, providerRequestId: null, usage: normalizeUsage(result.usage) };
  }

  private async execute(
    input: AiGenerationInput,
    options: AiExecutionOptions,
    jsonSchema?: Record<string, unknown>
  ): Promise<z.infer<typeof workersAiResponseSchema>> {
    const binding = this.resolveBinding();
    if (!binding) {
      throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", "The Worker has no AI binding.");
    }
    options.signal?.throwIfAborted();
    const request: WorkersAiRunInput = {
      messages: [
        { role: "system", content: input.systemInstruction },
        { role: "user", content: input.input },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      ...(jsonSchema
        ? { response_format: { type: "json_schema" as const, json_schema: jsonSchema } }
        : {}),
    };

    let raw: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The binding takes no AbortSignal; a timeout or abort stops waiting for it.
      raw = await Promise.race([
        binding.run(options.modelId, request),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AiGatewayError(
                  "AI_PROVIDER_OUTCOME_UNKNOWN",
                  "Workers AI did not answer in time.",
                  true
                )
              ),
            WORKERS_AI_TIMEOUT_MS
          );
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          });
        }),
      ]);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw classifyWorkersAiError(error);
    } finally {
      clearTimeout(timer);
    }

    const parsed = workersAiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiGatewayError(
        "AI_PROVIDER_RESPONSE_INVALID",
        "Workers AI returned an invalid response."
      );
    }
    return parsed.data;
  }
}

export const cloudflareWorkersAiAdapter = new CloudflareWorkersAiAdapter();
