import type { Metadata } from "next";
import { ContactDetails } from "@/components/support/contact-details";
import { ContactForm } from "@/components/support/inquiry-forms";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { WarrantySummary } from "@/components/support/warranty-summary";
import { OFFICIAL_CHANNEL_CHECKS, OFFICIAL_STORE_BENEFITS } from "@/content/support/official-store";
import styles from "@/components/support/support-hub.module.css";

export const metadata: Metadata = {
  title: "Tienda oficial | Gamer Perú",
  description:
    "Gamer Perú es el canal directo y oficial en Perú: productos originales en empaque sellado, compra segura en gamerperu.com y atención directa.",
  alternates: { canonical: "/soporte/tienda-oficial" },
};

function PointList({ points }: { points: { title: string; text: string }[] }) {
  return (
    <ul className={styles.points}>
      {points.map((point) => (
        <li key={point.title} className={styles.point}>
          <h3 className={styles.cardTitle}>{point.title}</h3>
          <p className={styles.cardText}>{point.text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function TiendaOficialPage() {
  return (
    <SupportShell
      hero={{
        eyebrow: "Soporte",
        title: "Tienda oficial",
        description:
          "Gamer Perú es un canal directo en Perú para los periféricos de nuestro catálogo. Así te aseguras de recibir un producto original y con respaldo.",
      }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title="¿Te ofrecieron un producto por otro medio?"
            text="Consúltanos antes de pagar y te confirmamos si es un canal nuestro."
          >
            <ContactForm variant="compact" />
          </SupportAsideCard>
        </Reveal>
      }
    >
      <section aria-labelledby="por-que">
        <Reveal>
          <h2 id="por-que" className={styles.sectionTitle}>
            Por qué comprar en gamerperu.com
          </h2>
          <PointList points={OFFICIAL_STORE_BENEFITS} />
        </Reveal>
      </section>

      <section aria-labelledby="canales">
        <Reveal>
          <h2 id="canales" className={styles.sectionTitle}>
            Cómo reconocer nuestros canales oficiales
          </h2>
          <p className={styles.sectionLead}>
            Revisa estas señales antes de comprar o de enviar un pago.
          </p>
          <PointList points={OFFICIAL_CHANNEL_CHECKS} />
        </Reveal>
      </section>

      <Reveal>
        <ContactDetails />
      </Reveal>

      <Reveal>
        <WarrantySummary headingId="garantia-titulo" />
      </Reveal>
    </SupportShell>
  );
}
