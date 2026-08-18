import { describe, expect, it } from "vitest";
import { translateLegacyCategoryUrl } from "@/lib/discovery-filters/legacy-aliases";

describe("Legacy Category Navigation URL Translation (GP-013 Section 1 Policy)", () => {
  it("translates legacy mouses parameters correctly", () => {
    const res1 = translateLegacyCategoryUrl("mouses", { tipo: "ultraligeros" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.targetCategorySlug).toBe("mouses");
    expect(res1.targetPath).toBe("/categorias/mouses");
    expect(res1.translatedParams?.peso_max).toEqual(["45"]);
    expect(res1.translatedParams?.tipo).toBeUndefined();

    const res2 = translateLegacyCategoryUrl("mouses", { tipo: "ergonomicos" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.forma).toEqual(["ergonomico"]);

    const res3 = translateLegacyCategoryUrl("mouses", { tipo: "simetricos" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.forma).toEqual(["simetrico"]);

    const res4 = translateLegacyCategoryUrl("mouses", { tipo: "wireless-8k" });
    expect(res4.hasLegacyParams).toBe(true);
    expect(res4.translatedParams?.polling_min).toEqual(["8000"]);

    const res5 = translateLegacyCategoryUrl("mouses", { sub: "skates" });
    expect(res5.hasLegacyParams).toBe(true);
    expect(res5.targetCategorySlug).toBe("accesorios");
    expect(res5.targetPath).toBe("/categorias/accesorios");
    expect(res5.translatedParams?.tipo_accesorio).toEqual(["skates"]);
  });

  it("translates legacy teclados parameters correctly", () => {
    const res1 = translateLegacyCategoryUrl("teclados", { formato: "compactos" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.targetCategorySlug).toBe("teclados");
    expect(res1.targetPath).toBe("/categorias/teclados");
    expect(res1.translatedParams?.formato).toEqual(["60", "65"]);

    const res2 = translateLegacyCategoryUrl("teclados", { formato: "tkl-75" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.formato).toEqual(["75", "tkl"]);

    const res3 = translateLegacyCategoryUrl("teclados", { formato: "magneticos" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.tipo_switch).toEqual(["magnetico"]);

    const res4 = translateLegacyCategoryUrl("teclados", { sub: "keycaps" });
    expect(res4.hasLegacyParams).toBe(true);
    expect(res4.targetCategorySlug).toBe("accesorios");
    expect(res4.targetPath).toBe("/categorias/accesorios");
    expect(res4.translatedParams?.tipo_accesorio).toEqual(["keycaps"]);
  });

  it("translates legacy audio parameters correctly", () => {
    const res1 = translateLegacyCategoryUrl("audio", { tipo: "iems" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.targetCategorySlug).toBe("audio");
    expect(res1.translatedParams?.tipo_audio).toEqual(["iem"]);

    const res2 = translateLegacyCategoryUrl("audio", { tipo: "open-back" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.tipo_audio).toEqual(["open-back"]);

    const res3 = translateLegacyCategoryUrl("audio", { tipo: "dacs" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.tipo_audio).toEqual(["dac"]);
  });

  it("translates legacy accesorios parameters correctly", () => {
    const res = translateLegacyCategoryUrl("accesorios", { tipo: "skates" });
    expect(res.hasLegacyParams).toBe(true);
    expect(res.targetCategorySlug).toBe("accesorios");
    expect(res.translatedParams?.tipo_accesorio).toEqual(["skates"]);
  });

  it("does NOT trigger redirect for already canonical parameters on mousepads, teclados, or other categories", () => {
    const res1 = translateLegacyCategoryUrl("mousepads", { superficie: "vidrio", tamano: "xl" });
    expect(res1.hasLegacyParams).toBe(false);

    const res2 = translateLegacyCategoryUrl("mouses", { marca: "wlmouse", sort: "precio-menor" });
    expect(res2.hasLegacyParams).toBe(false);

    // Canonical keyboard single values must not trigger legacy redirects
    expect(translateLegacyCategoryUrl("teclados", { formato: "60" }).hasLegacyParams).toBe(false);
    expect(translateLegacyCategoryUrl("teclados", { formato: "65" }).hasLegacyParams).toBe(false);
    expect(translateLegacyCategoryUrl("teclados", { formato: "75" }).hasLegacyParams).toBe(false);
    expect(translateLegacyCategoryUrl("teclados", { formato: "tkl" }).hasLegacyParams).toBe(false);

    // Canonical keyboard repeated values must not trigger legacy redirects
    expect(translateLegacyCategoryUrl("teclados", { formato: ["60", "65"] }).hasLegacyParams).toBe(
      false
    );
    expect(translateLegacyCategoryUrl("teclados", { formato: ["75", "tkl"] }).hasLegacyParams).toBe(
      false
    );
  });

  it("handles mixed canonical + legacy keyboard values correctly", () => {
    const mixed = translateLegacyCategoryUrl("teclados", { formato: ["60", "compactos"] });
    expect(mixed.hasLegacyParams).toBe(true);
    expect(mixed.translatedParams?.formato).toEqual(["60", "60", "65"]);
  });
});
