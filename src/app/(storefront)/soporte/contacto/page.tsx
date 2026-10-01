import type { Metadata } from "next";
import { ContactDetails } from "@/components/support/contact-details";
import { ContactForm } from "@/components/support/inquiry-forms";
import { PageHero } from "@/components/support/page-hero";
import { Reveal } from "@/components/support/reveal";
import styles from "@/components/support/support-pages.module.css";

export const metadata: Metadata = {
  title: "Contacto | Gamer Perú",
  description:
    "Escríbenos sobre productos, pedidos o pagos con Yape y Plin. Te respondemos al correo que nos dejes.",
  alternates: { canonical: "/soporte/contacto" },
};

export default function ContactoPage() {
  return (
    <main id="main-content">
      <PageHero
        eyebrow="Soporte"
        title="Contacto"
        description="¿Dudas sobre un producto, tu pedido o tu pago? Escríbenos y te ayudamos."
      />
      <div className={styles.section}>
        <div className={styles.split}>
          <Reveal>
            <ContactDetails />
          </Reveal>
          <Reveal delay={0.1} className={styles.formCard}>
            <ContactForm />
          </Reveal>
        </div>
      </div>
    </main>
  );
}
