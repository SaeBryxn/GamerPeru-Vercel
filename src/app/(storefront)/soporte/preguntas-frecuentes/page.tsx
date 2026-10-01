import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { FaqAccordion } from "@/components/support/faq-accordion";
import { PageHero } from "@/components/support/page-hero";
import { Reveal } from "@/components/support/reveal";
import { DomeLink } from "@/components/ui";
import { FAQ_GROUPS } from "@/content/support/faq";
import styles from "@/components/support/support-pages.module.css";

export const metadata: Metadata = {
  title: "Preguntas frecuentes | Gamer Perú",
  description:
    "Pagos con Yape y Plin, verificación de comprobantes, seguimiento de pedidos, envíos y tu cuenta en Gamer Perú.",
  alternates: { canonical: "/soporte/preguntas-frecuentes" },
};

/** FAQPage structured data, so search engines can show the answers directly. */
function FaqJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
      }))
    ),
  };
  return (
    <script
      type="application/ld+json"
      // Built from static content in this repository, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export default function PreguntasFrecuentesPage() {
  return (
    <main id="main-content">
      <FaqJsonLd />
      <PageHero
        eyebrow="Soporte"
        title="Preguntas frecuentes"
        description="Lo que más nos preguntan sobre pagos, pedidos, productos y tu cuenta."
      />
      <div className={`${styles.section} ${styles.narrow}`}>
        {FAQ_GROUPS.map((group, index) => (
          <Reveal
            key={group.id}
            as="section"
            delay={index === 0 ? 0.1 : 0}
            className={styles.faqGroup}
          >
            <h2 id={group.id} className={styles.faqGroupTitle}>
              {group.title}
            </h2>
            <FaqAccordion items={group.items} />
          </Reveal>
        ))}

        <Reveal className={styles.helpCard}>
          <div>
            <p className={styles.helpTitle}>¿No encontraste tu respuesta?</p>
            <p className={styles.helpText}>Escríbenos y te ayudamos con tu caso.</p>
          </div>
          <DomeLink
            href="/soporte/contacto"
            tone="light"
            domeRise="-60%"
            className={styles.helpAction}
          >
            <MessageCircle size={16} aria-hidden="true" />
            Ir a contacto
          </DomeLink>
        </Reveal>
      </div>
    </main>
  );
}
