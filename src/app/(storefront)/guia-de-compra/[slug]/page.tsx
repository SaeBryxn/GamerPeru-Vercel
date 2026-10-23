import type { Metadata } from "next";
import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { FaqAccordion } from "@/components/support/faq-accordion";
import { Reveal } from "@/components/support/reveal";
import { SupportAsideCard, SupportShell } from "@/components/support/support-shell";
import { BUYING_GUIDES, getBuyingGuide, type BuyingGuide } from "@/content/guides";
import { serializeJsonLd } from "@/lib/catalog/pdp-seo";
import { getCachedCategory, getCachedCategorySchema } from "@/lib/catalog/cached-queries";
import { getCatalogReader } from "@/lib/catalog/reader";
import { buildGuideStructuredData, buyingGuidePath } from "@/lib/guides/guide-seo";
import {
  resolveGuideCriteria,
  type ResolvedGuideCriterion,
} from "@/lib/guides/resolve-guide-options";
import styles from "@/components/guides/buying-guide.module.css";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return BUYING_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const guide = getBuyingGuide((await params).slug);
  if (!guide) return {};
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: buyingGuidePath(guide.slug) },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url: buyingGuidePath(guide.slug),
      siteName: "Gamer Perú",
      locale: "es_PE",
      type: "article",
    },
  };
}

interface GuideCatalog {
  categoryName: string | null;
  totalProducts: number;
  criteria: ResolvedGuideCriterion[];
}

async function loadGuideCatalog(guide: BuyingGuide): Promise<GuideCatalog> {
  const category = await getCachedCategory(guide.categorySlug);
  if (!category) {
    return {
      categoryName: null,
      totalProducts: 0,
      criteria: guide.criteria.map((criterion) => ({ ...criterion, options: [] })),
    };
  }

  const reader = getCatalogReader();
  const schema = await getCachedCategorySchema(category.id);
  const count = async (state?: Parameters<typeof reader.getPublishedProductsByCategory>[2]) =>
    (
      await reader.getPublishedProductsByCategory(
        category.id,
        { page: 1, pageSize: 1 },
        state,
        schema
      )
    ).totalItems;

  const [totalProducts, criteria] = await Promise.all([
    count(),
    resolveGuideCriteria(guide.criteria, guide.categorySlug, schema, count),
  ]);
  return { categoryName: category.name, totalProducts, criteria };
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export default async function BuyingGuidePage({ params }: GuidePageProps) {
  const guide = getBuyingGuide((await params).slug);
  if (!guide) notFound();

  const catalog = await loadGuideCatalog(guide);
  const categoryHref = `/categorias/${guide.categorySlug}`;
  const otherGuides = BUYING_GUIDES.filter((other) => other.slug !== guide.slug);

  return (
    <SupportShell
      hero={{ eyebrow: "Guía de compra", title: guide.title, description: guide.intro }}
      aside={
        <Reveal delay={0.15}>
          <SupportAsideCard
            title={
              catalog.totalProducts > 0
                ? `${plural(catalog.totalProducts, "modelo", "modelos")} en el catálogo`
                : `Aún no tenemos ${guide.productNoun} publicados`
            }
            text={
              catalog.totalProducts > 0
                ? "Abre el catálogo con todos los filtros disponibles."
                : "Escríbenos y te avisamos cuando lleguen, o te ayudamos a elegir."
            }
          >
            <Link
              href={catalog.totalProducts > 0 ? categoryHref : "/soporte/contacto"}
              className={styles.primaryLink}
            >
              {catalog.totalProducts > 0 ? `Ver ${guide.productNoun}` : "Escríbenos"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <nav aria-label="Más guías y ayuda" className={styles.asideNav}>
              {otherGuides.map((other) => (
                <Link key={other.slug} href={buyingGuidePath(other.slug)}>
                  {other.title}
                </Link>
              ))}
              <Link href="/software">Software y drivers</Link>
            </nav>
          </SupportAsideCard>
        </Reveal>
      }
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildGuideStructuredData(guide)) }}
      />

      {catalog.criteria.map((criterion) => (
        <section key={criterion.id} aria-labelledby={`criterio-${criterion.id}`}>
          <Reveal className={styles.criterion}>
            <h2 id={`criterio-${criterion.id}`} className={styles.criterionTitle}>
              {criterion.title}
            </h2>
            {criterion.why.map((paragraph) => (
              <p key={paragraph} className={styles.criterionText}>
                {paragraph}
              </p>
            ))}
            {criterion.options.length > 0 && (
              <ul className={styles.options}>
                {criterion.options.map((option) => (
                  <li key={option.id}>
                    <Link href={option.href} className={styles.option}>
                      <span className={styles.optionLabel}>{option.label}</span>
                      <span className={styles.optionText}>{option.description}</span>
                      <span className={styles.optionCount}>
                        Ver {plural(option.count, "modelo", "modelos")}
                        <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        </section>
      ))}

      <section aria-labelledby="perfiles">
        <Reveal>
          <h2 id="perfiles" className={styles.criterionTitle}>
            Según cómo juegas
          </h2>
          <ul className={styles.profiles}>
            {guide.profiles.map((profile) => (
              <li key={profile.title} className={styles.profile}>
                <h3 className={styles.profileTitle}>{profile.title}</h3>
                <p className={styles.criterionText}>{profile.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <Reveal>
        <FaqAccordion group={guide.faq} />
      </Reveal>
    </SupportShell>
  );
}
