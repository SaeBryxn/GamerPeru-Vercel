import fs from "node:fs";
import path from "node:path";
import type { Page, Route } from "@playwright/test";

const FIXTURES_DIR = path.resolve("tests/fixtures/gp014-media");

const GP014_MEDIA_KEY_TO_FILE: Readonly<Record<string, { filename: string; mimeType: string }>> = {
  "products/mouse-pro-mod-01/hero.png": { filename: "hero.png", mimeType: "image/png" },
  "products/mouse-pro-mod-01/variant-black.png": {
    filename: "variant-black.png",
    mimeType: "image/png",
  },
  "products/mouse-pro-mod-01/variant-white.png": {
    filename: "variant-white.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/story-hero.png": { filename: "story-hero.png", mimeType: "image/png" },
  "stories/mouse-pro-mod-01/hero-ambient.mp4": {
    filename: "hero-ambient.mp4",
    mimeType: "video/mp4",
  },
  "stories/mouse-pro-mod-01/hero-poster.png": {
    filename: "hero-poster.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/full-bleed-detail.png": {
    filename: "full-bleed-detail.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/ergonomics.png": { filename: "ergonomics.png", mimeType: "image/png" },
  "stories/mouse-pro-mod-01/optical-switches.png": {
    filename: "optical-switches.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/performance-demo.mp4": {
    filename: "performance-demo.mp4",
    mimeType: "video/mp4",
  },
  "stories/mouse-pro-mod-01/demo-poster.png": {
    filename: "demo-poster.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/gallery-top.png": {
    filename: "gallery-top.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/gallery-side.png": {
    filename: "gallery-side.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/gallery-bottom.png": {
    filename: "gallery-bottom.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/dimensions-blueprint.png": {
    filename: "dimensions-blueprint.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/item-mouse.png": { filename: "item-mouse.png", mimeType: "image/png" },
  "stories/mouse-pro-mod-01/item-dongle.png": {
    filename: "item-dongle.png",
    mimeType: "image/png",
  },
  "stories/mouse-pro-mod-01/item-cable.png": { filename: "item-cable.png", mimeType: "image/png" },
};

function normalizeMediaKey(rawUrlOrPath: string): string | null {
  try {
    let clean = rawUrlOrPath;
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      const parsed = new URL(clean);
      clean = parsed.pathname;
    }
    if (clean.startsWith("/media/")) {
      clean = clean.slice("/media/".length);
    } else if (clean.startsWith("/")) {
      clean = clean.slice(1);
    }
    return decodeURIComponent(clean);
  } catch {
    return null;
  }
}

/**
 * Installs Playwright-only media fulfillment routes on the given page.
 * Intercepts Next.js image optimizer requests (`/_next/image?url=...`) and direct `/media/...` requests,
 * serving deterministic decodable fixtures from `tests/fixtures/gp014-media/`.
 */
export async function installGp014MediaFixtures(page: Page): Promise<void> {
  // 1. Intercept Next.js Image Optimizer requests
  await page.route("**/_next/image*", async (route: Route) => {
    const requestUrl = new URL(route.request().url());
    const originalUrlParam = requestUrl.searchParams.get("url");

    if (!originalUrlParam) {
      await route.continue();
      return;
    }

    const mediaKey = normalizeMediaKey(originalUrlParam);
    if (!mediaKey) {
      await route.continue();
      return;
    }

    const fixtureEntry = GP014_MEDIA_KEY_TO_FILE[mediaKey];
    if (fixtureEntry) {
      const filePath = path.join(FIXTURES_DIR, fixtureEntry.filename);
      if (fs.existsSync(filePath)) {
        const body = fs.readFileSync(filePath);
        await route.fulfill({
          status: 200,
          contentType: fixtureEntry.mimeType,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
          body,
        });
        return;
      }
    }

    // Fail closed on unknown synthetic GP-014 keys
    if (mediaKey.startsWith("products/") || mediaKey.startsWith("stories/")) {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: `GP-014 Test Fixture Not Found: ${mediaKey}`,
      });
      return;
    }

    await route.continue();
  });

  // 2. Intercept direct /media/... requests (e.g. video files, posters)
  await page.route("**/media/**", async (route: Route) => {
    const requestUrl = new URL(route.request().url());
    const mediaKey = normalizeMediaKey(requestUrl.pathname);

    if (!mediaKey) {
      await route.continue();
      return;
    }

    const fixtureEntry = GP014_MEDIA_KEY_TO_FILE[mediaKey];
    if (fixtureEntry) {
      const filePath = path.join(FIXTURES_DIR, fixtureEntry.filename);
      if (fs.existsSync(filePath)) {
        const body = fs.readFileSync(filePath);
        await route.fulfill({
          status: 200,
          contentType: fixtureEntry.mimeType,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "accept-ranges": "bytes",
          },
          body,
        });
        return;
      }
    }

    // Fail closed on unknown synthetic GP-014 keys
    if (mediaKey.startsWith("products/") || mediaKey.startsWith("stories/")) {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: `GP-014 Test Fixture Not Found: ${mediaKey}`,
      });
      return;
    }

    await route.continue();
  });
}
