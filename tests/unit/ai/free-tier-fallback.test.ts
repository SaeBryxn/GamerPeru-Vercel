import { describe, expect, it, vi } from "vitest";
import { GroqAdapter, type GroqTransport } from "@/lib/ai/gateway/groq-adapter";
import { AiGatewayError } from "@/lib/ai/gateway/types";
import {
  SERPER_SEARCH_ENDPOINT,
  TAVILY_SEARCH_ENDPOINT,
  searchWeb,
} from "@/lib/ai/research/search-acquisition";
import { ResearchExecutionError } from "@/lib/ai/research/types";

const userAgent = "GamerPeruResearchBot/1.0 (operations-contact=test)";
const options = { modelId: "llama-3.3-70b-versatile", temperature: 0.2, maxTokens: 1024 };
const input = { systemInstruction: "Return JSON.", input: "{}" };

function groqWith(response: { status: number; body: unknown }) {
  const transport: GroqTransport = {
    createChatCompletion: vi.fn(async () => response),
    listModels: vi.fn(async () => ({ status: 200 })),
  };
  return { adapter: new GroqAdapter(transport), transport };
}

describe("Groq adapter", () => {
  it("asks for JSON mode with the schema in the system prompt and parses the answer", async () => {
    const { adapter, transport } = groqWith({
      status: 200,
      body: {
        id: "chatcmpl-1",
        choices: [{ message: { content: '{"name":"G Pro X"}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    });
    const result = await adapter.generateStructured("gsk_test", input, { type: "object" }, options);

    expect(result.data).toEqual({ name: "G Pro X" });
    expect(result.usage.totalTokens).toBe(15);
    const request = vi.mocked(transport.createChatCompletion).mock.calls[0]![1];
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[0]!.content).toContain('{"type":"object"}');
  });

  it("maps quota and outages to errors the research chain can fall back from", async () => {
    for (const [status, code] of [
      [429, "AI_PROVIDER_RATE_LIMITED"],
      [498, "AI_PROVIDER_UNAVAILABLE"],
      [503, "AI_PROVIDER_UNAVAILABLE"],
      [401, "AI_PROVIDER_AUTH_FAILED"],
    ] as const) {
      const { adapter } = groqWith({ status, body: null });
      await expect(
        adapter.generateStructured("gsk_test", input, {}, options)
      ).rejects.toMatchObject({ code, outcomeAmbiguous: false });
    }
  });

  it("treats a cut-off answer as invalid instead of half-parsed JSON", async () => {
    const { adapter } = groqWith({
      status: 200,
      body: { id: "x", choices: [{ message: { content: '{"name":' }, finish_reason: "length" }] },
    });
    await expect(adapter.generateStructured("gsk_test", input, {}, options)).rejects.toBeInstanceOf(
      AiGatewayError
    );
  });
});

describe("free search chain", () => {
  const serperBody = {
    organic: [
      { link: "https://example.com/a", title: "A", position: 1 },
      { link: "https://example.com/b", title: "B", position: 2 },
    ],
  };

  it("moves to Serper when Tavily's monthly credits are exhausted (432)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url) === TAVILY_SEARCH_ENDPOINT
        ? new Response("{}", { status: 432 })
        : new Response(JSON.stringify(serperBody), { status: 200 })
    );
    const candidates = await searchWeb({
      query: "Logitech G Pro X",
      canonicalHost: "logitechg.com",
      runtimeConfig: {
        tavilyApiKey: "tvly-test",
        serperApiKey: "serper-test",
        fetchUserAgent: userAgent,
      },
      fetchImpl,
    });

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    const serperCall = fetchImpl.mock.calls.find(
      ([url]) => String(url) === SERPER_SEARCH_ENDPOINT
    )!;
    const init = serperCall[1] as RequestInit;
    expect(JSON.parse(String(init.body)).q).toBe("site:logitechg.com Logitech G Pro X");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("serper-test");
  });

  it("uses Serper alone when only Serper is configured", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(serperBody), { status: 200 })
    );
    await searchWeb({
      query: "Razer Viper",
      runtimeConfig: { tavilyApiKey: "", serperApiKey: "serper-test", fetchUserAgent: userAgent },
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(SERPER_SEARCH_ENDPOINT);
  });

  it("does not hide a Tavily rejection that another provider would not fix", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response("{}", { status: 400 })
    );
    await expect(
      searchWeb({
        query: "Razer Viper",
        runtimeConfig: {
          tavilyApiKey: "tvly-test",
          serperApiKey: "serper-test",
          fetchUserAgent: userAgent,
        },
        fetchImpl,
      })
    ).rejects.toBeInstanceOf(ResearchExecutionError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
