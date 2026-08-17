"use client";

import React, { useState } from "react";
import { Menu, Search, ShoppingCart } from "lucide-react";
import { IconButton } from "@/components/ui";
import { BrandMark } from "../brand-mark";
import { HeaderUtilityLink } from "../header-utilities";
import { MobileDrawer } from "../mobile-drawer";
import type { MegaMenuCategory } from "../types";
import styles from "./mobile-header.module.css";

export interface MobileHeaderProps {
  items: MegaMenuCategory[];
  searchHref?: string;
  cartHref?: string;
  cartCount?: number;
  className?: string;
}

export function MobileHeader({
  items,
  searchHref = "/buscar",
  cartHref = "/carrito",
  cartCount,
  className,
}: MobileHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <div className={[styles.mobileHeader, className].filter(Boolean).join(" ")}>
        <div className={styles.leftGroup}>
          <IconButton
            icon={Menu}
            iconSize="lg"
            variant="ghost"
            aria-label="Abrir menú de navegación"
            onClick={() => setIsDrawerOpen(true)}
          />
          <BrandMark />
        </div>

        <div className={styles.rightGroup}>
          <HeaderUtilityLink href={searchHref} label="Buscar productos" icon={Search} />
          <HeaderUtilityLink
            href={cartHref}
            label="Carrito de compras"
            icon={ShoppingCart}
            badgeCount={cartCount}
          />
        </div>
      </div>

      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} items={items} />
    </>
  );
}
