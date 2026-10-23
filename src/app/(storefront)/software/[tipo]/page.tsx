import type { Metadata } from "next";
import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { BrandSoftwareList } from "@/components/software/brand-software-list";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { getSoftwareKindPage, SOFTWARE_KIND_PAGES } from "@/content/software/kinds";
import styles from "@/components/software/software.module.css";

interface SoftwareKindPageProps {
  params: Promise<{ tipo: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return SOFTWARE_KIND_PAGES.map((page) => ({ tipo: page.kind }));
}

export async function generateMetadata({ params }: SoftwareKindPageProps): Promise<Metadata> {
  const page = getSoftwareKindPage((await params).tipo);
  if (!page) return {};
  return {
    title: `${page.title} | Software y drivers | Gamer Perú`,
    description: page.metaDescription,
    alternates: { canonical: `/software/${page.kind}` },
  };
}

export default async function SoftwareKindPage({ params }: SoftwareKindPageProps) {
  const page = getSoftwareKindPage((await params).tipo);
  if (!page) notFound();

  const others = SOFTWARE_KIND_PAGES.filter((other) => other.kind !== page.kind);

  return (
    <SupportShell
      hero={{ eyebrow: "Software y drivers", title: page.title, description: page.intro }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title="¿Dudas con tu modelo?"
            text="Escríbenos con el modelo exacto antes de instalar o actualizar."
          >
            <Link href="/soporte/contacto" className={styles.textLink}>
              Escríbenos
            </Link>
            <nav aria-label="Más software">
              <ul className={styles.asideLinks}>
                {others.map((other) => (
                  <li key={other.kind}>
                    <Link href={`/software/${other.kind}`} className={styles.textLink}>
                      {other.title}
                    </Link>
                  </li>
                ))}
                {page.categorySlug && (
                  <li>
                    <Link href={`/categorias/${page.categorySlug}`} className={styles.textLink}>
                      Ver el catálogo
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </SupportAsideCard>
        </Reveal>
      }
    >
      {page.cautions?.map((caution) => (
        <Reveal key={caution}>
          <p className={styles.caution} role="note">
            <TriangleAlert size={20} aria-hidden="true" />
            <span>{caution}</span>
          </p>
        </Reveal>
      ))}

      <section aria-labelledby="pasos">
        <Reveal>
          <h2 id="pasos" className={styles.sectionTitle}>
            {page.stepsTitle}
          </h2>
          <ol className={styles.steps}>
            {page.steps.map((step) => (
              <li key={step.title} className={styles.step}>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.cardText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section aria-labelledby="oficial">
        <Reveal>
          <h2 id="oficial" className={styles.sectionTitle}>
            Software oficial por marca
          </h2>
          <p className={styles.sectionLead}>
            Descarga solo desde el sitio de la marca. Si no ves un enlace directo, te enviamos el
            oficial para tu modelo.
          </p>
          <BrandSoftwareList
            kind={page.kind}
            emptyText="Todavía no tenemos periféricos de este tipo en el catálogo. Si buscas software para uno, te ayudamos."
          />
        </Reveal>
      </section>
    </SupportShell>
  );
}
