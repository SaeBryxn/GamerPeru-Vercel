"use client";

import React, { useEffect, useRef } from "react";
import Link from "@/components/app-link";
import { usePathname } from "next/navigation";
import { m, useReducedMotion } from "framer-motion";
import { Heart, LayoutGrid, MapPin, Package, UserRound, type LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { useAccountNavigate } from "./account-transition";
import styles from "./account.module.css";

interface NavDestination {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_DESTINATIONS: NavDestination[] = [
  { label: "Resumen", href: "/cuenta", icon: LayoutGrid },
  { label: "Mis pedidos", href: "/cuenta/pedidos", icon: Package },
  { label: "Favoritos", href: "/cuenta/favoritos", icon: Heart },
  { label: "Direcciones", href: "/cuenta/direcciones", icon: MapPin },
  { label: "Datos personales", href: "/cuenta/perfil", icon: UserRound },
];

const PILL_TRANSITION = { type: "spring", stiffness: 420, damping: 36, mass: 0.8 } as const;

function isActivePath(pathname: string, href: string): boolean {
  return href === "/cuenta"
    ? pathname === "/cuenta"
    : pathname === href || pathname.startsWith(`${href}/`);
}

interface AccountNavigationProps {
  /** Orders on their way to the customer, flagged in brand red on "Mis pedidos". */
  ordersInTransit: number;
}

export function AccountNavigation({ ordersInTransit }: AccountNavigationProps) {
  const pathname = usePathname();
  const navigate = useAccountNavigate();
  const prefersReducedMotion = useReducedMotion();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // On the mobile tab row the active tab may start off-screen.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav className={styles.nav} aria-label="Navegación de mi cuenta">
      <ul className={styles.navList}>
        {NAV_DESTINATIONS.map((item) => {
          const isActive = isActivePath(pathname, item.href);
          const showBadge = item.href === "/cuenta/pedidos" && ordersInTransit > 0;

          return (
            <li key={item.href} className={styles.navItem}>
              <Link
                ref={isActive ? activeRef : undefined}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  // Modified clicks keep their browser meaning (new tab, new window).
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate(item.href);
                }}
              >
                {isActive && (
                  <m.span
                    layoutId="account-nav-pill"
                    className={styles.navPill}
                    transition={prefersReducedMotion ? { duration: 0 } : PILL_TRANSITION}
                    aria-hidden="true"
                  />
                )}
                <item.icon className={styles.navIcon} size={18} aria-hidden="true" />
                <span className={styles.navLabel}>{item.label}</span>
                {showBadge && (
                  <span
                    className={styles.navBadge}
                    aria-label={`${ordersInTransit} en camino`}
                    role="status"
                  >
                    {ordersInTransit}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.navFooter}>
        <LogoutButton appearance="link" />
      </div>
    </nav>
  );
}
