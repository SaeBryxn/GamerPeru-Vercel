import type { PermissionName } from "@/lib/auth/rbac";
import type { AdminNavFolder, AdminNavFolderId, AdminNavGroup, AdminNavItem } from "./types";

/** Sidebar sections, in display order. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { id: "operations", label: "Operaciones" },
  { id: "catalog", label: "Catálogo" },
  { id: "storefront", label: "Tienda y contenido" },
  { id: "system", label: "IA y sistema" },
];

export const ADMIN_NAV_FOLDERS: Record<AdminNavFolderId, AdminNavFolder> = {
  "storefront-design": { id: "storefront-design", label: "Diseño de tienda", iconName: "Palette" },
  "ai-engine": { id: "ai-engine", label: "Motor IA", iconName: "Cpu" },
};

/**
 * Canonical Gamer Perú Admin Navigation Items
 *
 * Scope Rule (GP-022):
 * Only implemented and verified destinations are exposed in active navigation.
 * No dead links or placeholders for future milestones are rendered in live navigation.
 */
export const CANONICAL_ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "overview",
    label: "Inicio",
    href: "/admin",
    group: "operations",
    iconName: "Gauge",
    description: "Panel principal de administración",
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/admin/orders",
    group: "operations",
    iconName: "ShoppingBag",
    requiredPermission: "orders:manage",
    description: "Gestión y seguimiento de pedidos",
  },
  {
    id: "payment-verification",
    label: "Pagos",
    href: "/admin/pagos",
    group: "operations",
    iconName: "ReceiptText",
    requiredPermission: "orders:verify",
    description: "Cola de comprobantes Yape/Plin por verificar",
  },
  {
    id: "products",
    label: "Productos",
    href: "/admin/products",
    group: "catalog",
    iconName: "Mouse",
    requiredPermission: "catalog:manage",
    description: "Gestión de catálogo y productos",
  },
  {
    id: "taxonomy",
    label: "Categorías y marcas",
    href: "/admin/taxonomia",
    group: "catalog",
    iconName: "FolderTree",
    requiredPermission: "catalog:manage",
    description: "Árbol del catálogo: categorías y marcas",
  },
  {
    id: "storefront-home",
    label: "Home de la tienda",
    href: "/admin/home",
    group: "storefront",
    folder: "storefront-design",
    iconName: "LayoutTemplate",
    requiredPermission: "catalog:manage",
    description: "Secciones, textos, imágenes y videos de la portada",
  },
  {
    id: "storefront-menu",
    label: "Menú de la tienda",
    href: "/admin/menu",
    group: "storefront",
    folder: "storefront-design",
    iconName: "PanelTop",
    requiredPermission: "catalog:manage",
    description: "Qué secciones ve el cliente en la barra superior",
  },
  {
    id: "ai-product-assistant",
    label: "Asistente IA",
    href: "/admin/products/ai-import",
    group: "system",
    folder: "ai-engine",
    iconName: "Sparkles",
    requiredPermission: "catalog:ai_research",
    description: "Investigación y revisión asistida de productos",
  },
  {
    id: "ai-settings",
    label: "Configuración IA",
    href: "/admin/settings/ai",
    group: "system",
    folder: "ai-engine",
    iconName: "KeyRound",
    requiredPermission: "ai:manage_credentials",
    description: "Proveedores, credenciales y perfiles de IA",
  },
  {
    id: "team",
    label: "Equipo",
    href: "/admin/equipo",
    group: "system",
    iconName: "UserCog",
    requiredPermission: "staff:manage",
    description: "Quién accede al panel y con qué nivel",
  },
];

export type AdminNavEntry =
  | { kind: "item"; item: AdminNavItem }
  | { kind: "folder"; folder: AdminNavFolder; items: AdminNavItem[] };

/**
 * The visible items split into their sections; inside a section, items that share a folder
 * collapse into one entry placed where the first of them sits. Empty sections are dropped.
 */
export function groupAdminNavigation(
  items: AdminNavItem[]
): Array<AdminNavGroup & { entries: AdminNavEntry[] }> {
  return ADMIN_NAV_GROUPS.map((group) => {
    const entries: AdminNavEntry[] = [];
    for (const item of items.filter((candidate) => candidate.group === group.id)) {
      if (!item.folder) {
        entries.push({ kind: "item", item });
        continue;
      }
      const existing = entries.find(
        (entry) => entry.kind === "folder" && entry.folder.id === item.folder
      );
      if (existing?.kind === "folder") existing.items.push(item);
      else entries.push({ kind: "folder", folder: ADMIN_NAV_FOLDERS[item.folder], items: [item] });
    }
    return { ...group, entries };
  }).filter((group) => group.entries.length > 0);
}

/**
 * Filters the canonical admin navigation items based on the staff user's permissions.
 */
export function getAdminNavigation(permissions: Set<PermissionName>): AdminNavItem[] {
  return CANONICAL_ADMIN_NAV_ITEMS.filter((item) => {
    if (!item.requiredPermission) {
      return true;
    }
    return permissions.has(item.requiredPermission);
  });
}
