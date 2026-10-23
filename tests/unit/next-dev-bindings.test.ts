import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ init: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev: mocks.init }));
vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: unknown) => config }));

beforeEach(() => {
  vi.resetModules();
  mocks.init.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("usa los bindings de desarrollo al iniciar Next local", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await import("../../next.config");
  expect(mocks.init).toHaveBeenCalledExactlyOnceWith({ configPath: "wrangler.dev.jsonc" });
});

it("no inicia el proxy de desarrollo en el build de Cloudflare", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GP_DEPLOY_TARGET", "cloudflare");
  await import("../../next.config");
  expect(mocks.init).not.toHaveBeenCalled();
});
