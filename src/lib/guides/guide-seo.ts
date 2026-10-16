import { APP_CONFIG } from "@/config/app";
import type { BuyingGuide } from "@/content/guides";

const ORIGIN = `https://${APP_CONFIG.canonicalHost}`;

export function buyingGuidePath(slug: string): string {
  return `/guia-de-compra/${slug}`;
}

/** Article, BreadcrumbList and FAQPage for a buying guide, as one JSON-LD graph. */
export function buildGuideStructuredData(guide: BuyingGuide): Record<string, unknown> {
  const url = `${ORIGIN}${buyingGuidePath(guide.slug)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: guide.title,
        description: guide.metaDescription,
        url,
        inLanguage: "es-PE",
        publisher: { "@type": "Organization", name: "Gamer Perú", url: `${ORIGIN}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${ORIGIN}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: "Soporte",
            item: `${ORIGIN}/soporte`,
          },
          { "@type": "ListItem", position: 3, name: guide.title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
        })),
      },
    ],
  };
}
