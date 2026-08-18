import { describe, expect, it } from "vitest";
import { translateLegacyCategoryUrl } from "@/lib/discovery-filters/legacy-aliases";

describe("Legacy Category Navigation URL Translation (GP-013 Section 1 Policy)", () => {
  it("translates legacy mouses parameters correctly", () => {
    // tipo=ultraligeros -> peso_max=45
    const res1 = translateLegacyCategoryUrl("mouses", { tipo: "ultraligeros" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.targetPath).toBe("/categorias/mouses");
    expect(res1.translatedParams?.peso_max).toEqual(["45"]);
    expect(res1.translatedParams?.tipo).toBeUndefined();

    // tipo=ergonomicos -> forma=ergonomico
    const res2 = translateLegacyCategoryUrl("mouses", { tipo: "ergonomicos" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.forma).toEqual(["ergonomico"]);

    // tipo=simetricos -> forma=simetrico
    const res3 = translateLegacyCategoryUrl("mouses", { tipo: "simetricos" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.forma).toEqual(["simetrico"]);

    // tipo=wireless-8k -> polling_min=8000
    const res4 = translateLegacyCategoryUrl("mouses", { tipo: "wireless-8k" });
    expect(res4.hasLegacyParams).toBe(true);
    expect(res4.translatedParams?.polling_min).toEqual(["8000"]);

    // sub=skates -> /categorias/accesorios?tipo_accesorio=skates
    const res5 = translateLegacyCategoryUrl("mouses", { sub: "skates" });
    expect(res5.hasLegacyParams).toBe(true);
    expect(res5.targetPath).toBe("/categorias/accesorios");
    expect(res5.translatedParams?.tipo_accesorio).toEqual(["skates"]);
  });

  it("translates legacy teclados parameters correctly", () => {
    // formato=compactos -> formato=60&formato=65
    const res1 = translateLegacyCategoryUrl("teclados", { formato: "compactos" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.targetPath).toBe("/categorias/teclados");
    expect(res1.translatedParams?.formato).toEqual(["60", "65"]);

    // formato=tkl-75 -> formato=75&formato=tkl
    const res2 = translateLegacyCategoryUrl("teclados", { formato: "tkl-75" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.formato).toEqual(["75", "tkl"]);

    // formato=magneticos -> tipo_switch=magnetico
    const res3 = translateLegacyCategoryUrl("teclados", { formato: "magneticos" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.tipo_switch).toEqual(["magnetico"]);
  });

  it("translates legacy audio parameters correctly", () => {
    // tipo=iems -> tipo_audio=iem
    const res1 = translateLegacyCategoryUrl("audio", { tipo: "iems" });
    expect(res1.hasLegacyParams).toBe(true);
    expect(res1.translatedParams?.tipo_audio).toEqual(["iem"]);

    // tipo=open-back -> tipo_audio=open-back
    const res2 = translateLegacyCategoryUrl("audio", { tipo: "open-back" });
    expect(res2.hasLegacyParams).toBe(true);
    expect(res2.translatedParams?.tipo_audio).toEqual(["open-back"]);

    // tipo=dacs -> tipo_audio=dac
    const res3 = translateLegacyCategoryUrl("audio", { tipo: "dacs" });
    expect(res3.hasLegacyParams).toBe(true);
    expect(res3.translatedParams?.tipo_audio).toEqual(["dac"]);
  });

  it("translates legacy accesorios parameters correctly", () => {
    const res = translateLegacyCategoryUrl("accesorios", { tipo: "cables" });
    expect(res.hasLegacyParams).toBe(true);
    expect(res.translatedParams?.tipo_accesorio).toEqual(["cables"]);
  });

  it("does NOT trigger redirect for already canonical parameters on mousepads or other categories", () => {
    const res1 = translateLegacyCategoryUrl("mousepads", { superficie: "vidrio", tamano: "xl" });
    expect(res1.hasLegacyParams).toBe(false);

    const res2 = translateLegacyCategoryUrl("mouses", { marca: "wlmouse", sort: "precio-menor" });
    expect(res2.hasLegacyParams).toBe(false);
  });
});
