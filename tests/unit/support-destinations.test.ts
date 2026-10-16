import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_SOFTWARE,
  SOFTWARE_KINDS,
  getSoftwareEntries,
} from "@/content/software/brand-software";
import { SOFTWARE_KIND_PAGES, getSoftwareKindPage } from "@/content/software/kinds";
import { ROBOTS_DISALLOW, buildRobots, staticSitemapPaths } from "@/lib/seo/sitemap-entries";

describe("Software centre content", () => {
  it("has a page for every software kind linked from the menu", () => {
    expect(SOFTWARE_KIND_PAGES.map((page) => page.kind)).toEqual([...SOFTWARE_KINDS]);
    expect(getSoftwareKindPage("no-existe")).toBeUndefined();
  });

  it("covers the catalog brands", () => {
    expect(BRAND_SOFTWARE.map((brand) => brand.brandSlug).sort()).toEqual([
      "atk",
      "jinms",
      "mchose",
      "x-raypad",
    ]);
  });

  it("links only to HTTPS pages on the brand's own domain", () => {
    for (const brand of BRAND_SOFTWARE) {
      for (const entry of brand.entries) {
        if (!entry.url) continue;
        const url = new URL(entry.url);
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toContain(brand.brandSlug.replace("-", ""));
      }
    }
  });

  it("explains brands without software instead of leaving them empty", () => {
    for (const brand of BRAND_SOFTWARE) {
      expect(brand.entries.length > 0 || Boolean(brand.noSoftwareNote)).toBe(true);
    }
  });

  it("lists one entry per brand for a kind", () => {
    const mouse = getSoftwareEntries("mouse").map(({ brand }) => brand.brandSlug);
    expect(new Set(mouse).size).toBe(mouse.length);
    expect(getSoftwareEntries("teclado")).toEqual([]);
  });

  it("warns that an interrupted firmware update is not a factory defect", () => {
    expect(getSoftwareKindPage("firmware")?.cautions?.join(" ")).toMatch(/defecto de fábrica/);
  });
});

describe("Sitemap and robots", () => {
  const appDir = join(process.cwd(), "src", "app");
  const pageDirs: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === "page.tsx") pageDirs.push(dir);
    }
  })(appDir);
  const routes = pageDirs.map((dir) => {
    const segments = relative(appDir, dir)
      .split(sep)
      .filter((segment) => segment && !/^\(.*\)$/.test(segment))
      .map((segment) => (segment.startsWith("[") ? "[^/]+" : segment));
    return new RegExp(`^/${segments.join("/")}$`);
  });

  it.each(staticSitemapPaths())("lists %s, which is a real page", (path) => {
    expect(routes.some((route) => route.test(path))).toBe(true);
  });

  it("keeps private and transactional paths out of the sitemap", () => {
    for (const path of staticSitemapPaths()) {
      expect(ROBOTS_DISALLOW.some((blocked) => path.startsWith(blocked))).toBe(false);
    }
  });

  it("disallows admin, account, checkout and API paths and points to the sitemap", () => {
    const robots = buildRobots();
    const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(["/admin", "/api/", "/cuenta", "/checkout"])
    );
    expect(robots.sitemap).toBe("https://gamerperu.com/sitemap.xml");
  });
});
