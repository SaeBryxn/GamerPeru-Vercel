import React from "react";
import {
  ArrowUpRight,
  LayoutTemplate,
  Menu,
  Package,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { AdminSection } from "../ui";
import type { DashboardLinks } from "./dashboard-links";
import styles from "./operations.module.css";
import { SpotlightLink } from "./spotlight-link";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export function buildQuickActions(links: DashboardLinks): QuickAction[] {
  const actions: (QuickAction | null)[] = [
    links.home
      ? {
          id: "home",
          title: "Editar portada",
          description: "Secciones e imágenes",
          href: links.home,
          icon: LayoutTemplate,
        }
      : null,
    links.products
      ? {
          id: "catalog",
          title: "Gestionar productos",
          description: "Precios, fotos y colores",
          href: links.products(),
          icon: Package,
        }
      : null,
    links.menu
      ? {
          id: "menu",
          title: "Editar menú",
          description: "Navegación de la tienda",
          href: links.menu,
          icon: Menu,
        }
      : null,
    links.orders
      ? {
          id: "orders",
          title: "Ver pedidos",
          description: "Compras y envíos",
          href: links.orders({}),
          icon: ShoppingBag,
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
        {actions.map(({ icon: Icon, ...action }) => (
          <li key={action.id}>
            <SpotlightLink
              href={action.href}
              className={styles.actionCard}
              data-section={action.id}
              data-testid={`quick-action-${action.id}`}
            >
              <span className={styles.actionIcon}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className={styles.actionCopy}>
                <span className={styles.actionTitle}>{action.title}</span>
                <span className={styles.actionDescription}>{action.description}</span>
              </span>
              <ArrowUpRight size={15} className={styles.actionArrow} aria-hidden="true" />
            </SpotlightLink>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}
