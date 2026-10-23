import type { Metadata } from "next";
import Link from "@/components/app-link";
import {
  BadgeCheck,
  BookOpen,
  Cpu,
  Handshake,
  MessageCircle,
  Package,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import { ContactDetails } from "@/components/support/contact-details";
import { Reveal } from "@/components/support/reveal";
import { SupportShell } from "@/components/support/support-shell";
import { WarrantySummary } from "@/components/support/warranty-summary";
import { BUYING_GUIDES } from "@/content/guides";
import { buyingGuidePath } from "@/lib/guides/guide-seo";
import styles from "@/components/support/support-hub.module.css";

export const metadata: Metadata = {
  title: "Soporte | Gamer Perú",
  description:
    "Ayuda con tu compra en Gamer Perú: preguntas frecuentes, contacto por WhatsApp, pedidos, garantía, software y guías de compra.",
  alternates: { canonical: "/soporte" },
};

interface SupportCard {
  href: string;
  title: string;
  text: string;
  icon: LucideIcon;
}

const SUPPORT_CARDS: SupportCard[] = [
  {
    href: "/soporte/preguntas-frecuentes",
    title: "Preguntas frecuentes",
    text: "Pagos con Yape y Plin, envíos, cambios y devoluciones.",
    icon: CircleHelp,
  },
  {
    href: "/soporte/contacto",
    title: "Contacto",
    text: "Escríbenos sobre un producto, tu pedido o tu pago.",
    icon: MessageCircle,
  },
  {
    href: "/cuenta/pedidos",
    title: "Mis pedidos",
    text: "Revisa el estado de tus pedidos y sus instrucciones de pago.",
    icon: Package,
  },
  {
    href: "/soporte/tienda-oficial",
    title: "Tienda oficial",
    text: "Productos originales y cómo reconocer nuestros canales oficiales.",
    icon: BadgeCheck,
  },
  {
    href: "/software",
    title: "Software y drivers",
    text: "Software oficial de cada marca, receptores 8K y firmware.",
    icon: Cpu,
  },
  {
    href: "/soporte/distribuidores",
    title: "Distribuidores",
    text: "Para tiendas, centros gamer y equipos de esports.",
    icon: Handshake,
  },
];

export default function SoportePage() {
  return (
    <SupportShell
      hero={{
        title: "Soporte",
        description:
          "Todo lo que necesitas antes y después de tu compra: respuestas rápidas, atención directa del equipo, garantía y software de tus periféricos.",
      }}
      aside={
        <Reveal delay={0.15}>
          <ContactDetails />
        </Reveal>
      }
    >
      <section aria-labelledby="ayuda">
        <Reveal>
          <h2 id="ayuda" className={styles.sectionTitle}>
            ¿En qué te ayudamos?
          </h2>
          <ul className={styles.cards}>
            {SUPPORT_CARDS.map((card) => (
              <li key={card.href}>
                <Link href={card.href} className={styles.card}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <card.icon size={22} />
                  </span>
                  <span className={styles.cardTitle}>{card.title}</span>
                  <span className={styles.cardText}>{card.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <Reveal>
        <WarrantySummary headingId="garantia-titulo" />
      </Reveal>

      <section aria-labelledby="guias">
        <Reveal>
          <h2 id="guias" className={styles.sectionTitle}>
            Guías de compra
          </h2>
          <p className={styles.sectionLead}>
            Qué mirar al elegir cada periférico, con los modelos del catálogo que cumplen cada
            criterio.
          </p>
          <ul className={styles.cards}>
            {BUYING_GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link href={buyingGuidePath(guide.slug)} className={styles.card}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <BookOpen size={22} />
                  </span>
                  <span className={styles.cardTitle}>{guide.title}</span>
                  <span className={styles.cardText}>{guide.metaDescription}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>
    </SupportShell>
  );
}
