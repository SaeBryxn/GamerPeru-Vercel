import React from "react";
import { buildSearchSuggestions } from "@/components/search";
import { Container } from "@/components/ui";
import { BrandMark } from "../brand-mark";
import { DesktopNav } from "../desktop-nav";
import { HeaderUtilities } from "../header-utilities";
import { MobileHeader } from "../mobile-header";
import type { NavigationConfig } from "../types";
import styles from "./site-header.module.css";

export interface SiteHeaderProps {
  config: NavigationConfig;
  cartCount?: number;
  className?: string;
}

export function SiteHeader({ config, cartCount, className }: SiteHeaderProps) {
  const classNames = [styles.siteHeader, className].filter(Boolean).join(" ");
  const searchSuggestions = buildSearchSuggestions(config.primaryNav, config.shelves);

  return (
    <header className={classNames}>
      <Container size="full" style={{ height: "100%" }}>
        <div className={styles.headerInner}>
          {/* Desktop Layout (>= 1024px) */}
          <div className={styles.desktopLayout}>
            <BrandMark />
            <div className={styles.desktopCenter}>
              <DesktopNav
                items={config.primaryNav}
                productTypes={config.productTypes}
                shelves={config.shelves}
              />
            </div>
            <HeaderUtilities
              searchLabel={config.utilityLinks.search.label}
              accountHref={config.utilityLinks.account.href}
              accountLabel={config.utilityLinks.account.label}
              cartHref={config.utilityLinks.cart.href}
              cartLabel={config.utilityLinks.cart.label}
              cartCount={cartCount}
              searchSuggestions={searchSuggestions}
            />
          </div>

          {/* Mobile Layout (< 1024px) */}
          <MobileHeader items={config.primaryNav} searchSuggestions={searchSuggestions} />
        </div>
      </Container>
    </header>
  );
}
