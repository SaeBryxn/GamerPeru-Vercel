import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Next dev only needs the application bindings. The deployed OpenNext cache Durable Objects
// are not exported by Wrangler's development proxy and must stay in the deployment config.
if (process.env.NODE_ENV === "development") {
  void initOpenNextCloudflareForDev({ configPath: "wrangler.dev.jsonc" });
}

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * The media CDN uses the public R2 custom domain in production and local fixtures in tests.
 * Deriving it from NEXT_PUBLIC_CDN_URL keeps next/image from rejecting catalog photos whenever
 * that bucket changes, instead of requiring a hardcoded hostname per environment.
 */
function resolveCdnRemotePattern() {
  const raw = process.env.NEXT_PUBLIC_CDN_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/**",
      search: "",
    };
  } catch {
    return null;
  }
}

const cdnRemotePattern = resolveCdnRemotePattern();

// Set by open-next.config.ts. The Sentry server SDK compiles WebAssembly when it loads, which
// Workers forbid, so Cloudflare builds leave out both the Sentry wrapper and the instrumentation
// hook. The hook lives in `instrumentation.node.ts` and is only picked up where `node.ts` is a
// page extension.
const isCloudflareBuild = process.env.GP_DEPLOY_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  pageExtensions: isCloudflareBuild
    ? ["tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js", "node.ts"],
  reactStrictMode: true,
  poweredByHeader: false,
  // The repository intentionally has no AGENTS.md; without this `next dev` recreates it.
  agentRules: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.gamerperu.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      ...(cdnRemotePattern ? [cdnRemotePattern] : []),
    ],
    localPatterns: [
      {
        pathname: "/media/**",
        search: "",
      },
      // Editorial art for the homepage (see public/images/home/README.md).
      {
        pathname: "/images/**",
        search: "",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const hasSentryBuildCredentials = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default isCloudflareBuild
  ? nextConfig
  : withSentryConfig(nextConfig, {
      silent: !hasSentryBuildCredentials,
      telemetry: false,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      sourcemaps: {
        disable: !hasSentryBuildCredentials,
      },
      release: {
        create: hasSentryBuildCredentials,
      },
    });
