"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import styles from "./account.module.css";

interface NavDestination {
  label: string;
  href: string;
}

const NAV_DESTINATIONS: NavDestination[] = [
  { label: "Resumen", href: "/cuenta" },
  { label: "Perfil", href: "/cuenta/perfil" },
  { label: "Direcciones", href: "/cuenta/direcciones" },
  { label: "Pedidos", href: "/cuenta/pedidos" },
  { label: "Favoritos", href: "/cuenta/favoritos" },
  { label: "Referidos", href: "/cuenta/referidos" },
];

export function AccountNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navContainer} aria-label="Navegación de mi cuenta">
      <ul className={styles.navList}>
        {NAV_DESTINATIONS.map((item) => {
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
