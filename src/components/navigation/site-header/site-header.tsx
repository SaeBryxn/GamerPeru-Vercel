import React from "react";
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
              wishlistHref={config.utilityLinks.wishlist.href}
              wishlistLabel={config.utilityLinks.wishlist.label}
              cartHref={config.utilityLinks.cart.href}
              cartLabel={config.utilityLinks.cart.label}
              cartCount={cartCount}
            />
          </div>

          {/* Mobile Layout (< 1024px) */}
          <MobileHeader items={config.primaryNav} />
        </div>
      </Container>
    </header>
  );
}
