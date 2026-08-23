import type { Metadata } from "next";
import React from "react";
import { CartPageClient } from "@/components/cart";

export const metadata: Metadata = {
  title: "Carrito de Compras | Gamer Perú",
  description: "Revisa los productos en tu carrito de compras de Gamer Perú.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function CartPage(): React.JSX.Element {
  return <CartPageClient />;
}
