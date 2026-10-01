import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContactDetails } from "@/components/support/contact-details";
import { FaqAccordion } from "@/components/support/faq-accordion";
import { ContactForm } from "@/components/support/inquiry-forms";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { FAQ_GROUPS } from "@/content/support/faq";
import styles from "@/components/support/support-pages.module.css";

export const metadata: Metadata = {
  title: "Contacto | Gamer Perú",
  description:
    "Escríbenos sobre productos, pedidos o pagos con Yape y Plin. Te respondemos al correo que nos dejes.",
  alternates: { canonical: "/soporte/contacto" },
};

/** The purchase questions answer most first messages, so they sit next to the form. */
const PURCHASE_FAQ = FAQ_GROUPS.find((group) => group.id === "compras");

export default function ContactoPage() {
  return (
    <SupportShell
      hero={{
        title: "Contacto",
        description:
          "¿Dudas sobre un producto, tu pedido o tu pago? Escríbenos y te ayudamos. Si es sobre un pedido, incluye su número.",
      }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title="Envíanos un mensaje"
            text="Te respondemos al correo que nos dejes."
          >
            <ContactForm />
          </SupportAsideCard>
        </Reveal>
      }
    >
      <Reveal delay={0.1}>
        <ContactDetails />
      </Reveal>
      {PURCHASE_FAQ && (
        <Reveal>
          <FaqAccordion group={PURCHASE_FAQ} />
        </Reveal>
      )}
      <Reveal>
        <Link href="/soporte/preguntas-frecuentes" className={styles.moreLink}>
          Ver todas las preguntas frecuentes
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </Reveal>
    </SupportShell>
  );
}
