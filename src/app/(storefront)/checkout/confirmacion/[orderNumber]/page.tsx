import type { Metadata } from "next";
import React from "react";
import Link from "@/components/app-link";
import { AlertCircle } from "lucide-react";
import { Container, Icon } from "@/components/ui";
import { loadCheckoutConfirmation } from "@/lib/checkout/service";
import { loadAuthorizedPaymentInstructions } from "@/lib/payments/reader";
import { CheckoutConfirmationView } from "@/components/checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmación de Pedido | Gamer Perú",
  description: "Revisa el estado de tu pedido registrado en Gamer Perú.",
  robots: {
    index: false,
    follow: false,
  },
};

interface ConfirmationPageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function CheckoutConfirmationPage({
  params,
}: ConfirmationPageProps): Promise<React.JSX.Element> {
  const { orderNumber } = await params;
  const result = await loadCheckoutConfirmation(orderNumber);

  if (!result.success) {
    return (
      <Container size="default">
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            backgroundColor: "var(--color-surface-secondary)",
            border: "1px solid var(--color-border-primary)",
            borderRadius: "var(--radius-lg)",
            margin: "40px auto",
            maxWidth: "600px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
          data-testid="confirmation-unauthorized-view"
        >
          <Icon icon={AlertCircle} size="xl" style={{ color: "#ff4d4f" }} aria-hidden="true" />
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "24px",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Pedido no disponible
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "14px",
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            El pedido solicitado no se encuentra disponible para su visualización.
          </p>
          <Link
            href="/categorias/mouses"
            style={{
              marginTop: "16px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 24px",
              backgroundColor: "var(--color-brand-primary, #ff003b)",
              color: "#ffffff",
              fontFamily: "var(--font-heading)",
              fontSize: "14px",
              fontWeight: 700,
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
            }}
          >
            Ir al catálogo
          </Link>
          <Link href="/checkout/recuperar">Recuperar acceso a mi pedido</Link>
        </div>
      </Container>
    );
  }

  const instructionsResult = await loadAuthorizedPaymentInstructions(orderNumber);

  return (
    <Container size="default">
      <CheckoutConfirmationView
        confirmation={result.confirmation}
        paymentInstructions={instructionsResult.success ? instructionsResult.instructions : null}
      />
    </Container>
  );
}
