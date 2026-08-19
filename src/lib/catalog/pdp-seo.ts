import type { Metadata } from "next";
import { APP_CONFIG } from "@/config/app";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type { ProductDetailEntity } from "./product-detail-types";

/**
 * Normalizes text for SEO metadata (subtitle / description).
 * Collapses whitespace and limits length to <= 160 characters without broken trailing spaces.
 */
export function normalizeSeoText(text: string, maxLength = 160): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return collapsed.slice(0, maxLength).trimEnd();
}

/**
 * Resolves the deterministic metadata description for a product.
 * Precedence:
 * 1. Non-empty product.subtitle
 * 2. Non-empty product.description
 * 3. Neutral deterministic fallback
 */
export function resolveProductDescription(product: ProductDetailEntity): string {
  if (product.subtitle?.trim()) {
    return normalizeSeoText(product.subtitle);
  }
  if (product.description?.trim()) {
    return normalizeSeoText(product.description);
  }
  return `Conoce ${product.name} de ${product.brand.name} en Gamer Perú. Revisa sus características, variantes y precio en soles.`;
}

export interface ResolvedSocialImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Resolves safe product-level social imagery adhering to Amendment B:
 * - Candidate 1: product.primaryMedia (ONLY if variantId === null, image MIME, safe URL)
 * - Candidate 2: first item in product.media where variantId === null, image MIME, safe URL
 * - Candidate 3: null (strictly rejects variant-specific images, videos, documents, brand logos)
 */
export function resolveProductSocialImage(
  product: ProductDetailEntity
): ResolvedSocialImage | null {
  const canonicalOrigin = `https://${APP_CONFIG.canonicalHost}`;

  const formatAbsoluteUrl = (resolvedUrl: string): string => {
    if (resolvedUrl.startsWith("/")) {
      return `${canonicalOrigin}${resolvedUrl}`;
    }
    return resolvedUrl;
  };

  // Candidate 1: Global primary media
  if (
    product.primaryMedia &&
    product.primaryMedia.variantId === null &&
    product.primaryMedia.asset.mimeType.startsWith("image/")
  ) {
    const safeUrl = resolvePublicMediaUrl(product.primaryMedia.asset.objectKey);
    if (safeUrl) {
      return {
        url: formatAbsoluteUrl(safeUrl),
        alt: product.primaryMedia.asset.altText ?? product.name,
        width: product.primaryMedia.asset.width ?? undefined,
        height: product.primaryMedia.asset.height ?? undefined,
      };
    }
  }

  // Candidate 2: First global image in product.media
  for (const item of product.media) {
    if (item.variantId === null && item.asset.mimeType.startsWith("image/")) {
      const safeUrl = resolvePublicMediaUrl(item.asset.objectKey);
      if (safeUrl) {
        return {
          url: formatAbsoluteUrl(safeUrl),
          alt: item.asset.altText ?? product.name,
          width: item.asset.width ?? undefined,
          height: item.asset.height ?? undefined,
        };
      }
    }
  }

  // Candidate 3: None
  return null;
}

/**
 * Builds Next.js Metadata for the Product Detail Page.
 */
export function buildProductMetadata(product: ProductDetailEntity): Metadata {
  const canonicalUrl = `https://${APP_CONFIG.canonicalHost}/productos/${product.slug}`;
  const title = `${product.name} — ${product.brand.name} | Gamer Perú`;
  const description = resolveProductDescription(product);
  const socialImage = resolveProductSocialImage(product);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: APP_CONFIG.name,
      locale: "es_PE",
      type: "website",
      images: socialImage
        ? [
            {
              url: socialImage.url,
              alt: socialImage.alt,
              width: socialImage.width,
              height: socialImage.height,
            },
          ]
        : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Builds Schema.org JSON-LD structured data graph for the Product Detail Page.
 */
export function buildProductStructuredData(
  product: ProductDetailEntity
): Record<string, unknown> | null {
  const canonicalUrl = `https://${APP_CONFIG.canonicalHost}/productos/${product.slug}`;
  const description = resolveProductDescription(product);
  const socialImage = resolveProductSocialImage(product);

  // 1. Offer resolution: Single Offer if all active variants share same price; omit offers if variable
  const activePrices = product.variants.map((v) => v.priceCents);
  const distinctPrices = Array.from(new Set(activePrices));

  let offers: Record<string, unknown> | undefined;
  if (distinctPrices.length === 1 && typeof distinctPrices[0] === "number") {
    offers = {
      "@type": "Offer",
      price: (distinctPrices[0] / 100).toFixed(2),
      priceCurrency: APP_CONFIG.defaultCurrency,
      url: canonicalUrl,
    };
  }

  // 2. Product Node
  const productNode: Record<string, unknown> = {
    "@type": "Product",
    name: product.name,
    description,
    url: canonicalUrl,
    brand: {
      "@type": "Brand",
      name: product.brand.name,
    },
    category: product.category.name,
  };

  if (socialImage) {
    productNode.image = socialImage.url;
  }

  if (offers) {
    productNode.offers = offers;
  }

  // 3. BreadcrumbList Node
  const breadcrumbNode: Record<string, unknown> = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: `https://${APP_CONFIG.canonicalHost}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: product.category.name,
        item: `https://${APP_CONFIG.canonicalHost}/categorias/${product.category.slug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonicalUrl,
      },
    ],
  };

  // 4. Optional FAQPage Node (semantic Schema.org data only when visible FAQ exists)
  let faqNode: Record<string, unknown> | null = null;
  if (product.story?.blocks && product.story.blocks.length > 0) {
    const faqItems: Array<{ question: string; answer: string }> = [];
    for (const block of product.story.blocks) {
      if (block.type === "faq" && Array.isArray(block.payload.items)) {
        for (const item of block.payload.items) {
          if (item.question?.trim() && item.answer?.trim()) {
            faqItems.push({
              question: item.question.trim(),
              answer: item.answer.trim(),
            });
          }
        }
      }
    }

    if (faqItems.length > 0) {
      faqNode = {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      };
    }
  }

  const graphNodes = [productNode, breadcrumbNode, ...(faqNode ? [faqNode] : [])];

  return {
    "@context": "https://schema.org",
    "@graph": graphNodes,
  };
}

/**
 * Secure JSON-LD serializer.
 * Escapes HTML characters to prevent script injection when rendered inside <script type="application/ld+json">.
 */
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
