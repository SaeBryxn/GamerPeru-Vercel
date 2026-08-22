"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import styles from "./account.module.css";

interface NavDestination {
  label: string;
  href?: string;
  isAvailable: boolean;
}

const NAV_DESTINATIONS: NavDestination[] = [
  { label: "Resumen", href: "/cuenta", isAvailable: true },
  { label: "Perfil", href: "/cuenta/perfil", isAvailable: true },
  { label: "Direcciones", isAvailable: false },
  { label: "Pedidos", isAvailable: false },
  { label: "Favoritos", isAvailable: false },
];

export function AccountNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navContainer} aria-label="Navegación de mi cuenta">
      <ul className={styles.navList}>
        {NAV_DESTINATIONS.map((item) => {
          if (!item.isAvailable || !item.href) {
            return (
              <li key={item.label} className={styles.navItem}>
                <div className={styles.navDisabled} aria-disabled="true">
                  <span>{item.label}</span>
                  <span className={styles.badgeComingSoon}>Próximamente</span>
                </div>
              </li>
            );
          }

          const isActive =
            item.href === "/cuenta"
              ? pathname === "/cuenta"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.label} className={styles.navItem}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.navDivider} aria-hidden="true" />

      <div className={styles.logoutSection}>
        <LogoutButton />
      </div>
    </nav>
  );
}
