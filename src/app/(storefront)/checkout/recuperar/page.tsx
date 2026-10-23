import React from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { GuestOrderRecovery } from "./recovery-form";
export const metadata: Metadata = {
  title: "Recuperar pedido | Gamer Perú",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RecoveryPage() {
  return (
    <Container>
      <GuestOrderRecovery />
    </Container>
  );
}
