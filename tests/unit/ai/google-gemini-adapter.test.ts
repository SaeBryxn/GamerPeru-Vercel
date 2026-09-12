import { describe, expect, it, vi } from "vitest";
import {
  GoogleGeminiAdapter,
  type GeminiInteractionRequest,
  type GeminiInteractionTransport,
} from "@/lib/ai/gateway/google-gemini-adapter";

function createTransport(
  implementation?: (request: GeminiInteractionRequest, signal?: AbortSignal) => Promise<unknown>
): GeminiInteractionTransport & { create: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(
      async (_apiKey: string, request: GeminiInteractionRequest, signal?: AbortSignal) =>
        implementation
          ? await implementation(request, signal)
          : {
              id: "interaction-123",
              status: "completed",
              output_text: '{"value":"ok"}',
              usage: {
                total_input_tokens: 12,
                total_output_tokens: 8,
                total_tokens: 20,
              },
            }
    ),
    healthCheck: vi.fn(async () => undefined),
  };
}

const execution = { modelId: "gemini-2.5-flash", temperature: 0.2, maxTokens: 2048 };

describe("Google Gemini Interactions adapter", () => {
  it("uses stateless structured Interactions with the exact frozen options and zero tools", async () => {
    const transport = createTransport();
    const adapter = new GoogleGeminiAdapter(transport);
    const controller = new AbortController();
    const result = await adapter.generateStructured(
      "test-api-key",
      { systemInstruction: "Trusted instruction", input: "Untrusted evidence" },
      { type: "object", additionalProperties: false },
      { ...execution, signal: controller.signal }
    );

    const request = transport.create.mock.calls[0]![1] as GeminiInteractionRequest;
    expect(request).toEqual({
      model: "gemini-2.5-flash",
      input: "Untrusted evidence",
      system_instruction: "Trusted instruction",
      store: false,
      stream: false,
      background: false,
      generation_config: { temperature: 0.2, max_output_tokens: 2048 },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: { type: "object", additionalProperties: false },
      },
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("previous_interaction_id");
    expect(JSON.stringify(request)).not.toMatch(/google_search|url_context|grounding/i);
    const forwardedSignal = transport.create.mock.calls[0]![2] as AbortSignal;
    expect(forwardedSignal.aborted).toBe(false);
    controller.abort();
    expect(forwardedSignal.aborted).toBe(true);
    expect(result).toEqual({
      data: { value: "ok" },
      providerRequestId: "interaction-123",
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        costMicros: null,
        currency: null,
        costSource: "UNAVAILABLE",
      },
    });
  });

  it("normalizes text request IDs and absent usage without retaining the interaction", async () => {
    const transport = createTransport(async () => ({
      id: "interaction-text",
      status: "completed",
      output_text: "answer",
    }));
    const result = await new GoogleGeminiAdapter(transport).generateText(
      "test-key",
      { systemInstruction: "System", input: "Input" },
      execution
    );
    expect(result.providerRequestId).toBe("interaction-text");
    expect(result.usage.totalTokens).toBe(0);
  });

  it.each([
    [401, "AI_PROVIDER_AUTH_FAILED"],
    [403, "AI_PROVIDER_AUTH_FAILED"],
    [429, "AI_PROVIDER_RATE_LIMITED"],
    [503, "AI_PROVIDER_UNAVAILABLE"],
  ])("maps provider status %s to %s", async (status, code) => {
    const transport = createTransport(async () => Promise.reject({ status }));
    const promise = new GoogleGeminiAdapter(transport).generateText(
      "test-key",
      { systemInstruction: "System", input: "Input" },
      execution
    );
    await expect(promise).rejects.toMatchObject({ code });
  });

  it("maps the SDK statusCode field without treating explicit rejection as ambiguous", async () => {
    const promise = new GoogleGeminiAdapter(
      createTransport(async () => Promise.reject({ statusCode: 429 }))
    ).generateText("test-key", { systemInstruction: "System", input: "Input" }, execution);
    await expect(promise).rejects.toMatchObject({
      code: "AI_PROVIDER_RATE_LIMITED",
      outcomeAmbiguous: false,
    });
  });

  it("treats unknown network completion as ambiguous and rejects malformed JSON", async () => {
    const failed = new GoogleGeminiAdapter(
      createTransport(async () => Promise.reject(new Error("socket reset")))
    ).generateText("test-key", { systemInstruction: "System", input: "Input" }, execution);
    await expect(failed).rejects.toMatchObject({
      code: "AI_PROVIDER_OUTCOME_UNKNOWN",
      outcomeAmbiguous: true,
    });

    const malformed = new GoogleGeminiAdapter(
      createTransport(async () => ({
        id: "interaction-malformed",
        status: "completed",
        output_text: "not-json",
      }))
    ).generateStructured(
      "test-key",
      { systemInstruction: "System", input: "Input" },
      { type: "object" },
      execution
    );
    await expect(malformed).rejects.toMatchObject({ code: "AI_PROVIDER_RESPONSE_INVALID" });
  });

  it("honors an already-aborted AbortSignal without calling the transport", async () => {
    const transport = createTransport();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new GoogleGeminiAdapter(transport).generateText(
        "test-key",
        { systemInstruction: "System", input: "Input" },
        { ...execution, signal: controller.signal }
      )
    ).rejects.toThrow();
    expect(transport.create).not.toHaveBeenCalled();
  });
});
