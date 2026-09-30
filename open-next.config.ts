import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

// OpenNext loads this file before it spawns `next build`, which inherits the environment;
// next.config.ts reads it to leave Sentry's server side out of the Worker.
process.env.GP_DEPLOY_TARGET = "cloudflare";

// `opennextjs-cloudflare deploy` starts a local binding proxy before uploading, and Wrangler
// refuses to emulate the HYPERDRIVE binding without a local target. Nothing connects to it during
// a build or deploy, so an unreachable placeholder is enough outside local development.
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??=
  "postgres://unused@127.0.0.1:5432/unused";

/**
 * Backs the storefront caching model (ADR-010) on Workers: prerendered pages and unstable_cache
 * entries live in R2 behind a per-colo regional cache, revalidateTag state lives in sharded
 * Durable Objects, and ISR regenerations are queued through a Durable Object.
 * Cache purge is left out until the site runs on a Cloudflare zone (custom domain).
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  tagCache: doShardedTagCache({ baseShardSize: 12 }),
  queue: doQueue,
  enableCacheInterception: true,
});
