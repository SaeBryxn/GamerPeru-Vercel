import React from "react";
import Link from "next/link";
import {
  Wireframe,
  columns,
  rows,
  type WireframeShape,
} from "@/components/admin/wireframe/wireframe";
import { AdminSection } from "../ui";
import type { DashboardLinks } from "./dashboard-links";
import styles from "./operations.module.css";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  href: string;
  wireframe: readonly WireframeShape[];
}

const HOME_SHAPES: readonly WireframeShape[] = [
  ["play", 0, 0, 120, 34],
  ...columns([6, 34, 62, 90], (x): WireframeShape[] => [
    ["img", x, 40, 24, 22],
    ["t", x, 66, 24, 3],
  ]),
  ["h", 6, 73, 40, 4],
];

const CATALOG_SHAPES: readonly WireframeShape[] = [
  ["img", 6, 8, 46, 64],
  ["h", 60, 10, 50, 6],
  ["t", 60, 22, 40, 4],
  ...rows([34, 44, 54], (y): WireframeShape[] => [
    ["t", 60, y, 22, 4],
    ["h", 86, y, 26, 4],
  ]),
  ["btn", 60, 64, 28, 8],
];

const MENU_SHAPES: readonly WireframeShape[] = [
  ["box", 4, 6, 112, 14],
  ...columns([10, 34, 58, 82], (x): WireframeShape[] => [["t", x, 11, 18, 4]]),
  ["box", 4, 26, 112, 48],
  ...columns([12, 46, 80], (x): WireframeShape[] => [
    ["h", x, 34, 26, 4],
    ["t", x, 44, 22, 3],
    ["t", x, 52, 18, 3],
    ["t", x, 60, 22, 3],
  ]),
];

const ORDERS_SHAPES: readonly WireframeShape[] = rows([8, 26, 44, 62], (y): WireframeShape[] => [
  ["box", 4, y, 112, 14],
  ["h", 10, y + 5, 24, 4],
  ["t", 42, y + 5, 30, 4],
  ["btn", 92, y + 4, 18, 6],
]);

export function buildQuickActions(links: DashboardLinks): QuickAction[] {
  const actions: (QuickAction | null)[] = [
    links.home
      ? {
          id: "home",
          title: "Editar el home de la tienda",
          description: "Ordena secciones, cambia textos, imágenes y videos de la portada.",
          href: links.home,
          wireframe: HOME_SHAPES,
        }
      : null,
    links.products
      ? {
          id: "catalog",
          title: "Catálogo, fichas e historias",
          description: "Productos, variantes y stock, ficha técnica e historia de cada uno.",
          href: links.products(),
          wireframe: CATALOG_SHAPES,
        }
      : null,
    links.menu
      ? {
          id: "menu",
          title: "Menú y navegación",
          description: "Qué secciones ve el cliente en la barra superior y en qué orden.",
          href: links.menu,
          wireframe: MENU_SHAPES,
        }
      : null,
    links.orders
      ? {
          id: "orders",
          title: "Pedidos",
          description: "Busca, filtra y gestiona pedidos, pagos y envíos.",
          href: "/admin/orders",
          wireframe: ORDERS_SHAPES,
        }
      : null,
  ];
  return actions.filter((action): action is QuickAction => action !== null);
}

export function QuickActions({ links }: { links: DashboardLinks }) {
  const actions = buildQuickActions(links);
  if (actions.length === 0) return null;

  return (
    <AdminSection id="quick-actions-heading" title="Accesos rápidos">
      <ul className={styles.actionGrid}>
        {actions.map((action) => (
          <li key={action.id}>
            <Link
              href={action.href}
              className={styles.actionCard}
              data-testid={`quick-action-${action.id}`}
            >
              <Wireframe shapes={action.wireframe} className={styles.actionThumb} />
              <span className={styles.actionTitle}>{action.title}</span>
              <span className={styles.actionDescription}>{action.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}
