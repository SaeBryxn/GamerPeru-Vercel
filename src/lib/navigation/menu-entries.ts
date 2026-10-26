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
    adminLabel: "Productos",
    description: "Vitrina general con todas las colecciones.",
    defaultVisible: true,
    defaultOrder: 0,
  },
  {
    id: "mouses",
    adminLabel: "Mouses",
    description: "Mouses gaming, skates y grip tapes.",
    categorySlug: "mouses",
    defaultVisible: true,
    defaultOrder: 1,
  },
  {
    id: "teclados",
    adminLabel: "Teclados",
    description: "Teclados mecánicos y magnéticos.",
    categorySlug: "teclados",
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
    adminLabel: "Mousepads",
    description: "Mousepads y deskmats.",
    categorySlug: "mousepads",
    defaultVisible: true,
    defaultOrder: 4,
  },
  {
    id: "soporte",
    adminLabel: "Soporte",
    description: "Preguntas frecuentes, contacto, distribuidores y tienda oficial.",
    defaultVisible: true,
    defaultOrder: 5,
  },
  {
    id: "software",
    adminLabel: "Software",
    description: "Software oficial por marca, receptores 8K y firmware.",
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
