import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("no Cloudflare context in unit tests");
  },
}));

import {
  CloudflareWorkersAiAdapter,
  type WorkersAiBinding,
} from "@/lib/ai/gateway/cloudflare-workers-ai-adapter";

const options = {
  modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  temperature: 0.2,
  maxTokens: 1024,
};
const input = { systemInstruction: "Return JSON.", input: "{}" };

function adapterWith(run: WorkersAiBinding["run"]) {
  const binding: WorkersAiBinding = { run: vi.fn(run) };
  return { adapter: new CloudflareWorkersAiAdapter(() => binding), binding };
}

describe("Cloudflare Workers AI adapter", () => {
  it("runs the profile's model with JSON-schema mode and needs no API key", async () => {
    const { adapter, binding } = adapterWith(async () => ({
      response: '{"name":"Viper V3 Pro"}',
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    }));
    const result = await adapter.generateStructured("", input, { type: "object" }, options);

    expect(result.data).toEqual({ name: "Viper V3 Pro" });
    expect(result.usage.totalTokens).toBe(16);
    const [model, request] = vi.mocked(binding.run).mock.calls[0]!;
    expect(model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(request.response_format).toEqual({
      type: "json_schema",
      json_schema: { type: "object" },
    });
  });

  it("accepts JSON mode answers that arrive already parsed", async () => {
    const { adapter } = adapterWith(async () => ({ response: { name: "Viper" } }));
    const result = await adapter.generateStructured("", input, {}, options);
    expect(result.data).toEqual({ name: "Viper" });
  });

  it("reports the daily free allowance and capacity errors so research can fall back", async () => {
    for (const [message, code] of [
      ["AiError: 3036: Account limit of 10000 daily neurons exceeded", "AI_PROVIDER_RATE_LIMITED"],
      ["AiError: 3040: Capacity temporarily exceeded", "AI_PROVIDER_UNAVAILABLE"],
      ["AiError: 5007: No such model", "AI_PROVIDER_RESPONSE_INVALID"],
    ] as const) {
      const { adapter } = adapterWith(async () => {
        throw new Error(message);
      });
      await expect(adapter.generateStructured("", input, {}, options)).rejects.toMatchObject({
        code,
        outcomeAmbiguous: false,
      });
    }
  });

  it("fails clearly when the Worker has no AI binding", async () => {
    const adapter = new CloudflareWorkersAiAdapter(() => null);
    await expect(adapter.generateStructured("", input, {}, options)).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect((await adapter.healthCheck()).ok).toBe(false);
  });
});
