import type { Metadata } from "next";
import { FaqAccordion } from "@/components/support/faq-accordion";
import { ContactForm } from "@/components/support/inquiry-forms";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { FAQ_GROUPS } from "@/content/support/faq";

export const metadata: Metadata = {
  title: "Preguntas frecuentes | Gamer Perú",
  description:
    "Compras con Yape y Plin, envíos y seguimiento, cambios y devoluciones, y soporte en Gamer Perú.",
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
    <SupportShell
      hero={{
        title: "¿Tienes una pregunta?",
        description:
          "Reunimos aquí lo que más nos consultan sobre compras, envíos, devoluciones y soporte. Si no encuentras tu respuesta, escríbenos.",
      }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title="¿No encontraste tu respuesta?"
            text="Escríbenos y te respondemos al correo que nos dejes."
          >
            <ContactForm variant="compact" />
          </SupportAsideCard>
        </Reveal>
      }
    >
      <FaqJsonLd />
      {FAQ_GROUPS.map((group, index) => (
        <Reveal key={group.id} delay={index === 0 ? 0.1 : 0}>
          <FaqAccordion group={group} />
        </Reveal>
      ))}
    </SupportShell>
  );
}
