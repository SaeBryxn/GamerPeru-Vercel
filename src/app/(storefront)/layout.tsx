import React from "react";
import { CartDrawer, CartProvider } from "@/components/cart";
import { ChatWidget, HomeSocialRail } from "@/components/floating";
import { AnnouncementBar, SiteFooter, SiteHeader, SkipLink } from "@/components/navigation";
import { getStorefrontNavigation } from "@/lib/navigation/resolve-navigation";

export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = await getStorefrontNavigation();

  return (
    <CartProvider>
      <SkipLink />
      <AnnouncementBar
        message={navigation.announcement?.message}
        href={navigation.announcement?.href}
      />
      <SiteHeader config={navigation} />
      {children}
      <SiteFooter columns={navigation.footerColumns} />
      <CartDrawer />
      <HomeSocialRail />
      <ChatWidget />
    </CartProvider>
  );
}
