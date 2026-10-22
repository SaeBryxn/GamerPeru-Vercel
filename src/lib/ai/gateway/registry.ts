import { cloudflareWorkersAiAdapter } from "./cloudflare-workers-ai-adapter";
import { googleGeminiAdapter } from "./google-gemini-adapter";
import { groqAdapter } from "./groq-adapter";
import { mockAiAdapter } from "./mock-adapter";
import type { AiProviderAdapter } from "./types";

export class UnsupportedAiProviderError extends Error {
  readonly code = "UNSUPPORTED_AI_PROVIDER" as const;
  constructor(providerKey: string) {
    super(`UNSUPPORTED_AI_PROVIDER: AI provider "${providerKey}" is not supported.`);
    this.name = "UnsupportedAiProviderError";
  }
}

/**
 * Strict AI Provider Adapter Registry
 *
 * Enforces explicit registration only.
 * In CHK1, only "mock" is registered.
 * Unregistered providers (including google, openai, anthropic) FAIL CLOSED.
 * Zero automatic fallback to mock.
 */
const registry = new Map<string, AiProviderAdapter>();

/** Providers that can run product research (structured JSON output). */
export const RESEARCH_PROVIDER_KEYS = ["google", "groq", "cloudflare"] as const;

registry.set("mock", mockAiAdapter);
registry.set("google", googleGeminiAdapter);
registry.set("groq", groqAdapter);
registry.set("cloudflare", cloudflareWorkersAiAdapter);

/**
 * Resolves an AI provider adapter by providerKey.
 * Fails closed with UnsupportedAiProviderError if provider is not registered.
 */
export function getAiAdapter(providerKey: string): AiProviderAdapter {
  const normalizedKey = providerKey.trim().toLowerCase();
  const adapter = registry.get(normalizedKey);
  if (!adapter) {
    throw new UnsupportedAiProviderError(providerKey);
  }
  return adapter;
}

/**
 * Returns list of currently registered provider keys.
 */
export function getRegisteredProviderKeys(): string[] {
  return Array.from(registry.keys());
}
