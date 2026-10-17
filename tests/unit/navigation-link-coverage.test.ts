import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import { BUYING_GUIDES } from "@/content/guides";
import { SOFTWARE_KIND_PAGES } from "@/content/software/kinds";

const APP_DIR = join(process.cwd(), "src", "app");

/** Every page or route handler in src/app as a path pattern, route groups removed. */
function collectRoutePatterns(dir: string): RegExp[] {
  const patterns: RegExp[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      patterns.push(...collectRoutePatterns(full));
    } else if (/^(page|route)\.tsx?$/.test(entry.name)) {
      const segments = relative(APP_DIR, dir)
        .split(sep)
        .filter((segment) => segment && !/^\(.*\)$/.test(segment))
        .map((segment) =>
          segment.startsWith("[...") ? ".+" : segment.startsWith("[") ? "[^/]+" : segment
        );
      patterns.push(new RegExp(`^/${segments.join("/")}$`));
    }
  }
  return patterns;
}

function collectStrings(field: string, value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(field, item, out));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === field && typeof child === "string") out.push(child);
      else collectStrings(field, child, out);
    }
  }
  return out;
}

const routes = collectRoutePatterns(APP_DIR);
const hrefs = [...new Set(collectStrings("href", NAVIGATION_CONFIG))];
const paths = hrefs.map((href) => new URL(href, "https://gamerperu.com").pathname);

describe("Navigation link coverage", () => {
  it("collects the menu links", () => {
    expect(paths.length).toBeGreaterThan(20);
    expect(paths).toContain("/guia-de-compra/mouses");
    expect(paths).toContain("/software/firmware");
    expect(paths).toContain("/soporte/tienda-oficial");
    expect(routes.some((route) => route.test("/ruta-que-no-existe"))).toBe(false);
  });

  it.each(paths)("%s resolves to a route in src/app", (path) => {
    expect(routes.some((route) => route.test(path))).toBe(true);
  });

  it("only links buying guides and software kinds that are generated", () => {
    const guides = new Set(BUYING_GUIDES.map((guide) => guide.slug));
    const kinds = new Set<string>(SOFTWARE_KIND_PAGES.map((page) => page.kind));
    for (const path of paths) {
      const guide = /^\/guia-de-compra\/([^/]+)$/.exec(path);
      if (guide) expect(guides.has(guide[1]!), path).toBe(true);
      const kind = /^\/software\/([^/]+)$/.exec(path);
      if (kind) expect(kinds.has(kind[1]!), path).toBe(true);
    }
  });

  it("declares no brand pages: brands come from the published catalog", () => {
    expect(paths.filter((path) => path.startsWith("/marcas/"))).toEqual([]);
    expect(JSON.stringify(NAVIGATION_CONFIG).toLowerCase()).not.toContain("wlmouse");
  });

  it("declares only images that exist in public/", () => {
    for (const image of collectStrings("image", NAVIGATION_CONFIG)) {
      expect(existsSync(join(process.cwd(), "public", image)), image).toBe(true);
    }
  });
});
