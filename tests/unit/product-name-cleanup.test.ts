import { describe, expect, it } from "vitest";
import { compactProductName, planProductNames } from "../../scripts/catalog/product-names.mjs";

describe("Nombres de modelos sin frases de marketing", () => {
  it("conserva versiones y frecuencias que distinguen el modelo", () => {
    expect(
      compactProductName("MCHOSE G3 Dual 8K High-Performance Wireless Gaming Mouse", "mouses")
    ).toBe("MCHOSE G3 Dual 8K");
    expect(
      compactProductName("MCHOSE K7 Ultra 8K Lightweight Wireless Gaming Mouse", "mouses")
    ).toBe("MCHOSE K7 Ultra 8K");
    expect(
      compactProductName("MCHOSE L7 Series Ultra-Lightweight Wireless Gaming Mouse", "mouses")
    ).toBe("MCHOSE L7");
    expect(compactProductName("Mchose K7 v2 Ultra+ Black Gold", "mouses")).toBe(
      "Mchose K7 v2 Ultra+ Black Gold"
    );
  });
  it("limpia teclados, pads y audio sin inventar modelos", () => {
    expect(
      compactProductName("MCHOSE Ace 75: Pro-Performance Hall Effect Keyboard", "teclados")
    ).toBe("MCHOSE Ace 75");
    expect(compactProductName("ATK RS6+ Aluminum Magnetic Switch Keyboard", "teclados")).toBe(
      "ATK RS6+"
    );
    expect(compactProductName("ATK EDGE 60 HE Esports Magnetic Keyboard", "teclados")).toBe(
      "ATK EDGE 60 HE"
    );
    expect(compactProductName("ATK Sky XSoft eSport Gaming Mouse Pad", "mousepads")).toBe(
      "ATK Sky XSoft"
    );
    expect(compactProductName("ATK Anime Mouse Pad – Reverie", "mousepads")).toBe("ATK Reverie");
    expect(
      compactProductName(
        "MCHOSE V9 Turbo+ Wireless Gaming Headset with Magnetic Charging Dock",
        "audio"
      )
    ).toBe("MCHOSE V9 Turbo+");
    expect(compactProductName("ATK Gaming Mouse", "mouses")).toBe("ATK Gaming Mouse");
  });
  it("se puede repetir sin seguir recortando los nombres", () => {
    for (const [name, category] of [
      ["MCHOSE G3 Dual 8K High-Performance Wireless Gaming Mouse", "mouses"],
      ["ATK EDGE 60 HE Esports Magnetic Keyboard", "teclados"],
      ["ATK Anime Mouse Pad – Reverie", "mousepads"],
    ] as const) {
      const short = compactProductName(name, category);
      expect(compactProductName(short, category)).toBe(short);
    }
  });
  it("evita confundir fichas diferentes y conserva sus identidades", () => {
    const rows = planProductNames([
      {
        id: "original",
        name: "Mousepad ATK Sky XSoft",
        category_slug: "mousepads",
        imported: false,
        slug: "original",
      },
      {
        id: "imported",
        name: "ATK Sky XSoft eSport Gaming Mouse Pad",
        category_slug: "mousepads",
        imported: true,
        slug: "imported",
      },
    ]);
    expect(rows).toEqual([
      {
        id: "imported",
        name: "ATK Sky XSoft eSport Gaming Mouse Pad",
        category_slug: "mousepads",
        imported: true,
        slug: "imported",
        nextName: "ATK Sky XSoft",
      },
    ]);
  });
});
