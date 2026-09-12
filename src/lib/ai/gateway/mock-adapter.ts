import type {
  AiHealthCheckResult,
  AiProviderAdapter,
  AiStructuredGenerationResult,
  AiTextGenerationResult,
  AiUsageMetadata,
} from "./types";

/**
 * Deterministic Mock AI Provider Adapter
 *
 * Implements full AI adapter capability surface with zero network access.
 * Returns deterministic text and structured payloads with exact integer micro-cent telemetry.
 */
export class MockAiAdapter implements AiProviderAdapter {
  readonly providerKey = "mock";
  private forceHealthFailure = false;
  private healthFailureMessage = "Configured mock health failure";

  /**
   * Allows unit and integration tests to configure health check outcome.
   */
  setHealthFailure(fail: boolean, message = "Configured mock health failure"): void {
    this.forceHealthFailure = fail;
    this.healthFailureMessage = message;
  }

  async healthCheck(apiKey: string): Promise<AiHealthCheckResult> {
    if (!apiKey || apiKey.trim() === "") {
      return {
        ok: false,
        status: "UNHEALTHY",
        message: "API key is missing or empty",
      };
    }
    if (this.forceHealthFailure) {
      return {
        ok: false,
        status: "UNHEALTHY",
        message: this.healthFailureMessage,
      };
    }
    return {
      ok: true,
      status: "HEALTHY",
      message: "Mock provider connection healthy",
    };
  }

  async generateText(apiKey: string, prompt: string): Promise<AiTextGenerationResult> {
    if (!apiKey) {
      throw new Error("MOCK_ADAPTER_ERROR: API key is required.");
    }
    const preview = prompt.slice(0, 40).trim();
    return {
      text: `[MOCK_OUTPUT] Synthesized response for prompt: "${preview}"`,
      usage: this.getDeterministicUsage(),
    };
  }

  async generateStructured<T = unknown>(
    apiKey: string,
    prompt: string,
    _schema?: unknown
  ): Promise<AiStructuredGenerationResult<T>> {
    if (!apiKey) {
      throw new Error("MOCK_ADAPTER_ERROR: API key is required.");
    }
    const preview = prompt.slice(0, 40).trim();
    const data = {
      mock: true,
      promptPreview: preview,
      synthesizedAt: "2026-09-11T00:00:00.000Z",
    } as unknown as T;

    return {
      data,
      usage: this.getDeterministicUsage(),
    };
  }

  private getDeterministicUsage(): AiUsageMetadata {
    return {
      inputTokens: 120,
      outputTokens: 65,
      totalTokens: 185,
      costMicros: 2500n, // Exact integer micro-units ($0.0025)
      currency: "USD",
      costSource: "ESTIMATED",
      pricingVersion: "mock-v1",
      pricingEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  }
}

export const mockAiAdapter = new MockAiAdapter();
