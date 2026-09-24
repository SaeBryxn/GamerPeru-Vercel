/**
 * Canonical description of every top-level storefront menu entry.
 *
 * The menu itself is declared in NAVIGATION_CONFIG; this registry adds the operator-facing
 * metadata the admin needs to decide what to show: what the entry sells, which catalog category
 * backs it, and whether its destination is a page that exists today.
 */
export interface MenuEntryDescriptor {
  /** Matches MegaMenuCategory.id in NAVIGATION_CONFIG.primaryNav. */
  id: string;
  /** Label shown in the admin, in Spanish, regardless of the storefront label. */
  adminLabel: string;
  description: string;
  /** Category slug whose published products back this entry, when it sells something. */
  categorySlug?: string;
  /**
   * Destination pages that do not exist yet. Listing them keeps the admin honest instead of
   * letting the storefront ship navigation that resolves to 404.
   */
  missingDestinations?: string[];
  /** Entries the store does not sell yet start hidden. */
  defaultVisible: boolean;
  defaultOrder: number;
}

export const MENU_ENTRY_DESCRIPTORS: MenuEntryDescriptor[] = [
  {
    id: "productos",
    adminLabel: "Product",
    description: "Vitrina general con todas las colecciones.",
    defaultVisible: true,
    defaultOrder: 0,
  },
  {
    id: "mouses",
    adminLabel: "Mouse",
    description: "Mouses gaming, skates y grip tapes.",
    categorySlug: "mouses",
    missingDestinations: ["/guia-de-compra/mouses"],
    defaultVisible: true,
    defaultOrder: 1,
  },
  {
    id: "teclados",
    adminLabel: "Keyboard",
    description: "Teclados mecánicos y magnéticos.",
    categorySlug: "teclados",
    missingDestinations: ["/guia-de-compra/teclados"],
    defaultVisible: false,
    defaultOrder: 2,
  },
  {
    id: "audio",
    adminLabel: "IEM",
    description: "Audífonos in-ear y audio para gaming.",
    categorySlug: "audio",
    defaultVisible: false,
    defaultOrder: 3,
  },
  {
    id: "mousepads",
    adminLabel: "MousePad",
    description: "Mousepads y deskmats.",
    categorySlug: "mousepads",
    defaultVisible: true,
    defaultOrder: 4,
  },
  {
    id: "soporte",
    adminLabel: "Support",
    description: "Preguntas frecuentes, contacto y distribuidores.",
    missingDestinations: [
      "/soporte",
      "/soporte/preguntas-frecuentes",
      "/soporte/contacto",
      "/soporte/distribuidores",
      "/soporte/tienda-oficial",
    ],
    defaultVisible: true,
    defaultOrder: 5,
  },
  {
    id: "software",
    adminLabel: "Software",
    description: "Descargas de software y firmware.",
    missingDestinations: [
      "/software",
      "/software/mouse",
      "/software/teclado",
      "/software/dongle",
      "/software/firmware",
    ],
    defaultVisible: true,
    defaultOrder: 6,
  },
];

export function getMenuEntryDescriptor(entryId: string): MenuEntryDescriptor | undefined {
  return MENU_ENTRY_DESCRIPTORS.find((entry) => entry.id === entryId);
}

export function isKnownMenuEntry(entryId: string): boolean {
  return MENU_ENTRY_DESCRIPTORS.some((entry) => entry.id === entryId);
}
