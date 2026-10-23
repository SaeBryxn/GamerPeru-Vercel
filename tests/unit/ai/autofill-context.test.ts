import { beforeEach, expect, it, vi } from "vitest";
import { getProductAutofillContext } from "@/lib/ai/admin/readers";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
const actor: VerifiedAuthContextReady = {
  status: "READY",
  authUserId: "test-actor",
  email: "test@gamerperu.invalid",
  roles: ["SUPER_ADMIN"],
  permissions: new Set(["catalog:ai_research"]),
};
beforeEach(() => vi.clearAllMocks());
function setup(profiles: unknown[]) {
  mocks.select
    .mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve(profiles) }) }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([{ jobId: "previous-job" }]) }),
        }),
      }),
    });
}
it("elige el perfil de Cloudflare predeterminado antes que uno de Google", async () => {
  setup([
    {
      id: "google-fast",
      profileKey: "PRODUCT_RESEARCH_FAST",
      providerKey: "google",
      providerDefault: false,
    },
    {
      id: "cloudflare-deep",
      profileKey: "PRODUCT_RESEARCH_DEEP",
      providerKey: "cloudflare",
      providerDefault: true,
    },
  ]);
  expect(await getProductAutofillContext("product", { authContext: actor })).toEqual({
    profileId: "cloudflare-deep",
    latestJobId: "previous-job",
  });
});
it("devuelve el aviso de configuración cuando no hay un perfil habilitado", async () => {
  setup([]);
  expect((await getProductAutofillContext("product", { authContext: actor })).profileId).toBeNull();
});
it("no elige proveedores sin adaptador aunque sean predeterminados", async () => {
  setup([
    {
      id: "unsupported",
      profileKey: "PRODUCT_RESEARCH_FAST",
      providerKey: "openai",
      providerDefault: true,
    },
    {
      id: "cloudflare-fast",
      profileKey: "PRODUCT_RESEARCH_FAST",
      providerKey: "cloudflare",
      providerDefault: false,
    },
  ]);
  expect((await getProductAutofillContext("product", { authContext: actor })).profileId).toBe(
    "cloudflare-fast"
  );
});
