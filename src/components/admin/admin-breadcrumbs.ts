import type { AdminNavItem } from "@/lib/admin/types";
import { resolveActiveNavId } from "./admin-nav-sections";

export interface AdminCrumb {
  label: string;
  /** Null for the screen the operator is on. */
  href: string | null;
}

/** Sub-screens below a section, named the way the screens themselves are titled. */
const SEGMENT_LABELS: Record<string, string> = {
  new: "Nuevo",
  story: "Historia",
  "ai-import": "Importar con IA",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelOf(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Product ids say nothing to a person; order numbers (GP-…) are what they search by.
  if (UUID.test(segment)) return "Detalle";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Inicio › section › sub-screen, every level but the current one a link back.
 * Paths outside the navigation fall back to Inicio alone.
 */
export function buildAdminBreadcrumbs(navItems: AdminNavItem[], currentPath: string): AdminCrumb[] {
  const activeId = resolveActiveNavId(navItems, currentPath);
  const active = navItems.find((item) => item.id === activeId);
  if (!active || active.href === "/admin") return [{ label: "Inicio", href: null }];

  const rest = currentPath.slice(active.href.length).split("/").filter(Boolean);
  const crumbs: AdminCrumb[] = [
    { label: "Inicio", href: "/admin" },
    { label: active.label, href: rest.length > 0 ? active.href : null },
  ];
  let path = active.href;
  rest.forEach((segment, index) => {
    path = `${path}/${segment}`;
    crumbs.push({ label: labelOf(segment), href: index < rest.length - 1 ? path : null });
  });
  return crumbs;
}
