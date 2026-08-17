import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/(storefront)/buscar/page";
import { sanitizeObject, sanitizeString } from "@/lib/observability/sentry-sanitize";

describe("GP-012 — Search Page Metadata & Sentry Privacy", () => {
  describe("generateMetadata", () => {
    it("generates indexable metadata for bare /buscar landing", async () => {
      const meta = await generateMetadata({
        searchParams: Promise.resolve({}),
      });

      expect(meta.title).toBe("Buscar Periféricos Gaming | Gamer Perú");
      expect(meta.description).toContain("Gamer Perú");
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.alternates?.canonical).toBe("/buscar");
    });

    it("generates noindex metadata for search query", async () => {
      const meta = await generateMetadata({
        searchParams: Promise.resolve({ q: "mouse" }),
      });

      expect(meta.title).toBe("Búsqueda: mouse | Gamer Perú");
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/buscar?q=mouse");
    });

    it("generates noindex metadata for paginated search query", async () => {
      const meta = await generateMetadata({
        searchParams: Promise.resolve({ q: "teclado", page: "2" }),
      });

      expect(meta.title).toBe("Búsqueda: teclado (Página 2) | Gamer Perú");
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/buscar?q=teclado&page=2");
    });
  });

  describe("Sentry Query-String Redaction", () => {
    it("redacts ?q= query parameter from URLs in strings", () => {
      const url = "https://gamerperu.com/buscar?q=secret_query_text";
      const sanitized = sanitizeString(url);
      expect(sanitized).toBe("https://gamerperu.com/buscar?q=[REDACTED]");
    });

    it("redacts &q= parameter from predictive API URLs", () => {
      const url = "https://gamerperu.com/api/search/predictive?foo=bar&q=private_name";
      const sanitized = sanitizeString(url);
      expect(sanitized).toContain("&q=[REDACTED]");
      expect(sanitized).not.toContain("private_name");
    });

    it("redacts 'q' key in objects", () => {
      const obj = { q: "sensitive search term", other: "safe" };
      const sanitized = sanitizeObject(obj);
      expect(sanitized.q).toBe("[REDACTED]");
      expect(sanitized.other).toBe("safe");
    });
  });
});
