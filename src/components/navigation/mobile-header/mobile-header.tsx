"use client";

import React, { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { CartLauncher } from "@/components/cart";
import { IconButton } from "@/components/ui";
import { SearchLauncherButton, type SearchSuggestionGroup } from "@/components/search";
import { BrandMark } from "../brand-mark";
import { MobileDrawer } from "../mobile-drawer";
import type { MegaMenuCategory } from "../types";
import styles from "./mobile-header.module.css";

export interface MobileHeaderProps {
  items: MegaMenuCategory[];
  className?: string;
  searchSuggestions?: SearchSuggestionGroup[];
}

export function MobileHeader({ items, className, searchSuggestions }: MobileHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = () => {
    setIsDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <>
      <div className={[styles.mobileHeader, className].filter(Boolean).join(" ")}>
        <div className={styles.leftGroup}>
          <IconButton
            ref={menuButtonRef}
            icon={Menu}
            iconSize="lg"
            variant="ghost"
            aria-label="Abrir menú de navegación"
            onClick={() => setIsDrawerOpen(true)}
          />
          <BrandMark />
        </div>

        <div className={styles.rightGroup}>
          <SearchLauncherButton label="Buscar productos" suggestions={searchSuggestions} />
          <CartLauncher label="Carrito de compras" data-testid="mobile-cart-launcher" />
        </div>
      </div>

      <MobileDrawer isOpen={isDrawerOpen} onClose={handleClose} items={items} />
    </>
  );
}
