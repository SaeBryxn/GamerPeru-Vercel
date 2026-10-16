/**
 * Official software per catalog brand. Only destinations published by the brand itself are
 * listed; when a brand has no public page we could verify, the entry has no `url` and the page
 * offers to send the official link through support instead. Gamer Perú hosts no installers.
 */

export const SOFTWARE_KINDS = ["mouse", "teclado", "dongle", "firmware"] as const;
export type SoftwareKind = (typeof SOFTWARE_KINDS)[number];

export interface BrandSoftwareEntry {
  kind: SoftwareKind;
  name: string;
  /** What the operator can do with it, in one line. */
  description: string;
  /** Official page on the brand's own domain; absent when none could be verified. */
  url?: string;
}

export interface BrandSoftware {
  brandSlug: string;
  brandName: string;
  entries: BrandSoftwareEntry[];
  /** Shown instead of entries for brands whose products need no software. */
  noSoftwareNote?: string;
}

const ATK_V_HUB = "https://www.atk.store/blogs/news/atk-v-hub-instructions";

export const BRAND_SOFTWARE: BrandSoftware[] = [
  {
    brandSlug: "atk",
    brandName: "ATK",
    entries: [
      {
        kind: "mouse",
        name: "ATK V HUB",
        description: "Botones, DPI, polling rate y perfiles de los mouses ATK y VXE.",
        url: ATK_V_HUB,
      },
      {
        kind: "dongle",
        name: "ATK V HUB",
        description: "Empareja los receptores 2.4G, 4K y 8K con tu mouse.",
        url: ATK_V_HUB,
      },
      {
        kind: "firmware",
        name: "ATK V HUB",
        description: "Consulta la versión de firmware del mouse y actualízala.",
        url: ATK_V_HUB,
      },
    ],
  },
  {
    brandSlug: "mchose",
    brandName: "MCHOSE",
    entries: [
      {
        kind: "mouse",
        name: "MCHOSE Hub y driver web",
        description:
          "Configuración del mouse desde el navegador o con la aplicación de escritorio.",
      },
      {
        kind: "dongle",
        name: "MCHOSE Hub y driver web",
        description: "Emparejamiento del receptor 8K incluido con el mouse.",
      },
      {
        kind: "firmware",
        name: "MCHOSE Hub",
        description: "Actualizaciones de firmware del mouse y del receptor.",
      },
    ],
  },
  {
    brandSlug: "jinms",
    brandName: "JINMS",
    entries: [
      {
        kind: "mouse",
        name: "Software de JINMS",
        description: "Te indicamos el software correcto para tu modelo.",
      },
      {
        kind: "firmware",
        name: "Firmware de JINMS",
        description: "Te confirmamos si tu modelo tiene una actualización disponible.",
      },
    ],
  },
  {
    brandSlug: "x-raypad",
    brandName: "X-raypad",
    entries: [],
    noSoftwareNote: "Sus mousepads y skates no necesitan software ni drivers.",
  },
];

export function getSoftwareEntries(
  kind: SoftwareKind
): { brand: BrandSoftware; entry: BrandSoftwareEntry }[] {
  return BRAND_SOFTWARE.flatMap((brand) =>
    brand.entries.filter((entry) => entry.kind === kind).map((entry) => ({ brand, entry }))
  );
}
