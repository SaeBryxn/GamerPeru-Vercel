import { describe, expect, it } from "vitest";
import {
  getAiAdapter,
  getRegisteredProviderKeys,
  UnsupportedAiProviderError,
} from "@/lib/ai/gateway/registry";
import { MockAiAdapter, mockAiAdapter } from "@/lib/ai/gateway/mock-adapter";
import { createProfileSnapshot } from "@/lib/ai/profile-service";

describe("Strict AI Gateway & Deterministic Mock Adapter", () => {
  describe("Provider Registry Invariants", () => {
    it("resolves the mock adapter explicitly", () => {
      const adapter = getAiAdapter("mock");
      expect(adapter).toBeDefined();
      expect(adapter.providerKey).toBe("mock");
    });

    it("registers the CHK2 Google adapter and deterministic mock explicitly", () => {
      const keys = getRegisteredProviderKeys();
      expect(keys).toEqual(["mock", "google"]);
    });

    it("fails closed for unknown or arbitrary provider keys", () => {
      expect(() => getAiAdapter("unknown_provider")).toThrow(UnsupportedAiProviderError);
      expect(() => getAiAdapter("azure")).toThrow(UnsupportedAiProviderError);
    });

    it("fails closed with NO mock fallback for commercial providers", () => {
      const commercialProviders = ["openai", "anthropic"];
      for (const provider of commercialProviders) {
        expect(() => getAiAdapter(provider)).toThrow(UnsupportedAiProviderError);
        expect(() => getAiAdapter(provider)).toThrow("UNSUPPORTED_AI_PROVIDER");
      }
    });
  });

  describe("Deterministic Mock Capabilities", () => {
    it("returns deterministic text response with exact integer micro-cent cost accounting", async () => {
      const prompt = "Wireless gaming mouse with 8K polling rate";
      const result = await mockAiAdapter.generateText(
        "dummy-key",
        { systemInstruction: "Test", input: prompt },
        { modelId: "mock-v1", temperature: 0.2, maxTokens: 512 }
      );

      expect(result.text).toContain("[MOCK_OUTPUT]");
      expect(result.text).toContain("Wireless gaming mouse");

      // Verify exact integer micro-units (bigint)
      expect(typeof result.usage.costMicros).toBe("bigint");
      expect(result.usage.costMicros).toBe(2500n);
      expect(result.usage.currency).toBe("USD");
      expect(result.usage.costSource).toBe("ESTIMATED");
      expect(result.usage.inputTokens).toBe(120);
      expect(result.usage.outputTokens).toBe(65);
      expect(result.usage.totalTokens).toBe(185);
    });

    it("returns deterministic structured response with exact integer micro-cent cost accounting", async () => {
      const prompt = "Extract technical specifications for WLMouse Beast X";
      const result = await mockAiAdapter.generateStructured(
        "dummy-key",
        { systemInstruction: "Test", input: prompt },
        { type: "object" },
        { modelId: "mock-v1", temperature: 0.2, maxTokens: 512 }
      );
      const data = result.data as { mock: boolean; promptPreview: string };

      expect(data.mock).toBe(true);
      expect(data.promptPreview).toContain("Extract technical");

      // Verify exact integer micro-units (bigint)
      expect(typeof result.usage.costMicros).toBe("bigint");
      expect(result.usage.costMicros).toBe(2500n);
      expect(result.usage.currency).toBe("USD");
    });

    it("handles health check success and configurable health check failure", async () => {
      const adapter = new MockAiAdapter();

      // Normal health check
      const healthy = await adapter.healthCheck("valid-test-key");
      expect(healthy.ok).toBe(true);
      expect(healthy.status).toBe("HEALTHY");

      // Health check with empty key fails
      const emptyKey = await adapter.healthCheck("");
      expect(emptyKey.ok).toBe(false);
      expect(emptyKey.status).toBe("UNHEALTHY");

      // Configurable failure simulation
      adapter.setHealthFailure(true, "Simulated upstream rate limit");
      const failed = await adapter.healthCheck("valid-test-key");
      expect(failed.ok).toBe(false);
      expect(failed.status).toBe("UNHEALTHY");
      expect(failed.message).toBe("Simulated upstream rate limit");
    });
  });

  describe("Profile Execution Snapshot", () => {
    it("constructs immutable execution snapshot preserving all profile settings with numeric temperature", () => {
      const now = new Date();
      const mockProfile = {
        id: "018f3a5e-3333-7000-8000-000000000003",
        profileKey: "PRODUCT_RESEARCH_FAST",
        providerId: "018f3a5e-2222-7000-8000-000000000002",
        modelId: "gemini-1.5-flash",
        temperature: "0.20",
        maxTokens: 4096,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      };

      const snapshot = createProfileSnapshot(mockProfile);

      expect(snapshot).toEqual({
        profileKey: "PRODUCT_RESEARCH_FAST",
        providerId: "018f3a5e-2222-7000-8000-000000000002",
        modelId: "gemini-1.5-flash",
        temperature: 0.2,
        maxTokens: 4096,
      });
      expect(typeof snapshot.temperature).toBe("number");
    });

    it("rejects malformed, out-of-range, or non-finite temperature values", () => {
      const base = {
        id: "018f3a5e-3333-7000-8000-000000000003",
        profileKey: "PRODUCT_RESEARCH_FAST",
        providerId: "018f3a5e-2222-7000-8000-000000000002",
        modelId: "gemini-1.5-flash",
        maxTokens: 4096,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => createProfileSnapshot({ ...base, temperature: "abc" })).toThrow(
        "INVALID_PROFILE_TEMPERATURE"
      );
      expect(() => createProfileSnapshot({ ...base, temperature: "-0.01" })).toThrow(
        "INVALID_PROFILE_TEMPERATURE"
      );
      expect(() => createProfileSnapshot({ ...base, temperature: "2.01" })).toThrow(
        "INVALID_PROFILE_TEMPERATURE"
      );
      expect(() => createProfileSnapshot({ ...base, temperature: "NaN" })).toThrow(
        "INVALID_PROFILE_TEMPERATURE"
      );
    });
  });
});
