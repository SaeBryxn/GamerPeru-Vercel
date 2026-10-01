import React from "react";
import { CartDrawer, CartProvider } from "@/components/cart";
import { HomeSocialRail, WhatsAppButton } from "@/components/floating";
import { SiteFooter, SiteHeader, SkipLink } from "@/components/navigation";
import { CookieConsent } from "@/components/support/cookie-consent";
import { WishlistProvider } from "@/components/wishlist";
import { getStorefrontNavigation } from "@/lib/navigation/resolve-navigation";

export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = await getStorefrontNavigation();

  return (
    <CartProvider>
      <WishlistProvider>
        <SkipLink />
        <SiteHeader config={navigation} />
        {children}
        <SiteFooter columns={navigation.footerColumns} />
        <CartDrawer />
        <HomeSocialRail />
        <WhatsAppButton />
        <CookieConsent />
      </WishlistProvider>
    </CartProvider>
  );
}
