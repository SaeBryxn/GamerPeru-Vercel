import type { PdpAccessory } from "./pdp-accessories";

/**
 * Showcase-only PDP content for DEV_CATALOG_PREVIEW. The catalog has no
 * accessory or package-contents model yet, so production renders neither.
 * Keyed by category slug so every product type gets plausible extras.
 */
export interface PreviewExtras {
  accessories: PdpAccessory[];
  packageContents: string[];
}

const MOUSE_EXTRAS: PreviewExtras = {
  accessories: [
    { id: "grip-black", name: "Grip tape precortado — Negro", priceCents: 2990, glyph: "grip" },
    { id: "skates-ptfe", name: "Skates PTFE de repuesto", priceCents: 1990, glyph: "skates" },
    { id: "grip-white", name: "Grip tape precortado — Blanco", priceCents: 2990, glyph: "grip" },
    { id: "dots-upe", name: "Dot skates UPE (40 piezas)", priceCents: 3490, glyph: "dots" },
    {
      id: "dots-ptfe",
      name: "Dot skates PTFE blancos (40 piezas)",
      priceCents: 3490,
      glyph: "dots",
    },
  ],
  packageContents: [
    "Mouse",
    "Receptor inalámbrico",
    "Cable USB-C a USB-A",
    "Grip tapes precortados",
    "Skates de repuesto",
  ],
};

const PREVIEW_EXTRAS_BY_CATEGORY: Record<string, PreviewExtras> = {
  mouses: MOUSE_EXTRAS,
  teclados: {
    accessories: [
      {
        id: "keycaps-pbt",
        name: "Set de keycaps PBT doble inyección",
        priceCents: 12990,
        glyph: "keycaps",
      },
      { id: "cable-coiled", name: "Cable USB-C en espiral", priceCents: 5990, glyph: "cable" },
      {
        id: "switch-puller",
        name: "Extractor de switches y keycaps",
        priceCents: 1990,
        glyph: "tool",
      },
    ],
    packageContents: [
      "Teclado",
      "Cable USB-C a USB-A",
      "Extractor de keycaps y switches",
      "Keycaps adicionales",
    ],
  },
  mousepads: {
    accessories: [
      { id: "mouse-bungee", name: "Bungee para cable de mouse", priceCents: 4990, glyph: "cable" },
      { id: "skates-ptfe", name: "Skates PTFE de repuesto", priceCents: 1990, glyph: "skates" },
    ],
    packageContents: ["Mousepad", "Tubo de transporte"],
  },
  audio: {
    accessories: [
      { id: "tips-foam", name: "Eartips de espuma (3 pares)", priceCents: 3990, glyph: "tips" },
      { id: "cable-upgrade", name: "Cable de upgrade 4.4 mm", priceCents: 8990, glyph: "cable" },
      { id: "case-hard", name: "Estuche rígido de transporte", priceCents: 3490, glyph: "case" },
    ],
    packageContents: [
      "Auriculares",
      "Cable desmontable 0.78 mm 2-pin",
      "Eartips de silicona (S/M/L)",
      "Estuche de transporte",
    ],
  },
  accesorios: {
    accessories: [],
    packageContents: ["Accesorio", "Guía de instalación"],
  },
};

export function getPreviewExtras(categorySlug: string): PreviewExtras {
  return PREVIEW_EXTRAS_BY_CATEGORY[categorySlug] ?? MOUSE_EXTRAS;
}
