import { beforeEach, expect, it, vi } from "vitest";
import { createResearchJob } from "@/lib/ai/research/job-service";
import { aiProfiles, aiProviders, aiResearchJobs, products } from "@/db/schema";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
const providerId = "018f0025-4100-7000-8000-000000000001";
const profileId = "018f0025-4100-7000-8000-000000000002";
const productId = "018f0025-4100-7000-8000-000000000003";
const actor: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "018f0025-4100-7000-8000-000000000004",
  email: "test@gamerperu.invalid",
  roles: ["SUPER_ADMIN"],
  permissions: new Set(["catalog:ai_research"]),
};

const insertValues = vi.fn();
function setup(providerKey: string, isEnabled = true) {
  const tx = {
    execute: vi.fn(),
    insert: () => ({ values: insertValues }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => {
            const result =
              table === aiResearchJobs
                ? []
                : table === aiProfiles
                  ? [
                      {
                        id: profileId,
                        profileKey: "PRODUCT_RESEARCH_FAST",
                        providerId,
                        modelId: "configured-model",
                        temperature: "0.20",
                        maxTokens: 4096,
                        isEnabled: true,
                      },
                    ]
                  : table === aiProviders
                    ? [{ id: providerId, providerKey, isEnabled }]
                    : table === products
                      ? [{ id: productId, updatedAt: new Date("2026-10-22T12:00:00Z") }]
                      : [];
            return Object.assign(Promise.resolve(result), { for: () => Promise.resolve(result) });
          },
        }),
      }),
    }),
  };
  mocks.transaction.mockImplementation((operation: (transaction: typeof tx) => unknown) =>
    operation(tx)
  );
}
beforeEach(() => vi.clearAllMocks());
const run = () =>
  createResearchJob(
    {
      mutationRequestId: "request-1",
      selectedProfileId: profileId,
      items: [{ query: "Mouse de prueba", mode: "ENRICH", targetProductId: productId }],
    },
    { authContext: actor }
  );

it.each(["google", "groq", "cloudflare"])(
  "admite una investigación ENRICH con %s habilitado",
  async (providerKey) => {
    setup(providerKey);
    const result = await run();
    expect(result.replayed).toBe(false);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProfileId: profileId,
        profileSnapshot: expect.objectContaining({ providerId }),
        status: "QUEUED",
      })
    );
  }
);

it.each(["openai", "anthropic", "mock"])(
  "rechaza %s sin adaptador de investigación",
  async (providerKey) => {
    setup(providerKey);
    await expect(run()).rejects.toThrow("AI_PROVIDER_DISABLED");
    expect(insertValues).not.toHaveBeenCalled();
  }
);

it("rechaza Cloudflare si el proveedor está deshabilitado", async () => {
  setup("cloudflare", false);
  await expect(run()).rejects.toThrow("AI_PROVIDER_DISABLED");
  expect(insertValues).not.toHaveBeenCalled();
});
