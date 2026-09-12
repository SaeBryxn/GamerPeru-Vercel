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

export interface AiTextGenerationResult {
  text: string;
  usage: AiUsageMetadata;
}

export interface AiStructuredGenerationResult<T = unknown> {
  data: T;
  usage: AiUsageMetadata;
}

export interface AiProviderAdapter {
  readonly providerKey: string;
  healthCheck(apiKey: string): Promise<AiHealthCheckResult>;
  generateText(apiKey: string, prompt: string): Promise<AiTextGenerationResult>;
  generateStructured<T = unknown>(
    apiKey: string,
    prompt: string,
    schema?: unknown
  ): Promise<AiStructuredGenerationResult<T>>;
}
