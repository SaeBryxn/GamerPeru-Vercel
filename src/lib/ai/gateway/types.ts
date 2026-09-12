/**
 * Provider-Independent AI Gateway Interfaces
 */

export interface AiUsageMetadata {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: bigint | null;
  currency: string | null;
  costSource: "UNAVAILABLE" | "ESTIMATED" | "PROVIDER_REPORTED";
  pricingVersion?: string;
  pricingEffectiveAt?: Date;
}

export interface AiHealthCheckResult {
  ok: boolean;
  status: "HEALTHY" | "UNHEALTHY";
  message?: string;
}

export interface AiGenerationInput {
  systemInstruction: string;
  input: string;
}

export interface AiExecutionOptions {
  modelId: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface AiTextGenerationResult {
  text: string;
  providerRequestId: string | null;
  usage: AiUsageMetadata;
}

export interface AiStructuredGenerationResult {
  data: unknown;
  providerRequestId: string | null;
  usage: AiUsageMetadata;
}

export type AiGatewayErrorCode =
  | "AI_PROVIDER_AUTH_FAILED"
  | "AI_PROVIDER_RATE_LIMITED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_RESPONSE_INVALID"
  | "AI_PROVIDER_OUTCOME_UNKNOWN";

export class AiGatewayError extends Error {
  constructor(
    readonly code: AiGatewayErrorCode,
    message: string,
    readonly outcomeAmbiguous = false
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

export interface AiProviderAdapter {
  readonly providerKey: string;
  healthCheck(apiKey: string): Promise<AiHealthCheckResult>;
  generateText(
    apiKey: string,
    request: AiGenerationInput,
    options: AiExecutionOptions
  ): Promise<AiTextGenerationResult>;
  generateStructured(
    apiKey: string,
    request: AiGenerationInput,
    jsonSchema: Record<string, unknown>,
    options: AiExecutionOptions
  ): Promise<AiStructuredGenerationResult>;
}
