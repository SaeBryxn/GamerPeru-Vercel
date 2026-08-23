import React from "react";
import { CartDrawer, CartProvider } from "@/components/cart";
import {
  AnnouncementBar,
  NAVIGATION_CONFIG,
  SiteFooter,
  SiteHeader,
  SkipLink,
} from "@/components/navigation";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <SkipLink />
      <AnnouncementBar
        message={NAVIGATION_CONFIG.announcement?.message}
        href={NAVIGATION_CONFIG.announcement?.href}
      />
      <SiteHeader config={NAVIGATION_CONFIG} />
      {children}
      <SiteFooter columns={NAVIGATION_CONFIG.footerColumns} />
      <CartDrawer />
    </CartProvider>
  );
}
