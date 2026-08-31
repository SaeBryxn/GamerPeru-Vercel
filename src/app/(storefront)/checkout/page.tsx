import type { Metadata } from "next";
import React from "react";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { loadCheckoutContext } from "@/lib/checkout/service";
import { CheckoutPageClient } from "@/components/checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finalizar Compra | Gamer Perú",
  description: "Completa tu pedido de forma rápida y segura en Gamer Perú.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CheckoutPage(): Promise<React.JSX.Element> {
  const context = await loadCheckoutContext();

  if (context.auth.status === "NEEDS_PROFILE") {
    redirect("/auth/completar-perfil");
  }

  return (
    <Container size="default">
      <CheckoutPageClient context={context} />
    </Container>
  );
}
