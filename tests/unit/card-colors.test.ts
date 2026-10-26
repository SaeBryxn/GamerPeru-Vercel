import { describe, expect, it } from "vitest";
import { buildCardColors } from "@/lib/catalog/card-colors";

describe("buildCardColors", () => {
  it("lists each colour once, in variant order, linking to its first variant", () => {
    expect(
      buildCardColors([
        { title: "Negro", color: "Negro", bare: false },
        { title: "Blanco / Dorado", color: "Blanco / Dorado", bare: false },
        { title: "Negro XL", color: "negro", bare: false },
      ])
    ).toEqual([
      { name: "Negro", variantSlug: "negro" },
      { name: "Blanco / Dorado", variantSlug: "blanco-dorado" },
    ]);
  });

  it("reads a bare variant's title as its colour when its siblings are colours", () => {
    expect(
      buildCardColors([
        { title: "Naranja", color: null, bare: true },
        { title: "Negro", color: "Negro", bare: false },
      ]).map((color) => color.name)
    ).toEqual(["Naranja", "Negro"]);
  });

  it("shows nothing for a single colour, sizes only or mixed attributes", () => {
    expect(buildCardColors([{ title: "Negro", color: "Negro", bare: false }])).toEqual([]);
    expect(
      buildCardColors([
        { title: "Large", color: null, bare: false },
        { title: "Small", color: null, bare: false },
      ])
    ).toEqual([]);
    expect(
      buildCardColors([
        { title: "Large", color: null, bare: false },
        { title: "Negro", color: "Negro", bare: false },
      ])
    ).toEqual([]);
    expect(buildCardColors(null)).toEqual([]);
  });
});
