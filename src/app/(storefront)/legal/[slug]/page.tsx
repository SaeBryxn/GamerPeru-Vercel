import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/support/legal-document-view";
import { COOKIE_POLICY } from "@/content/legal/cookies";
import { PRIVACY_POLICY } from "@/content/legal/privacy";
import { TERMS_OF_SERVICE } from "@/content/legal/terms";
import type { LegalDocument } from "@/content/legal/types";

const DOCUMENTS: Record<string, LegalDocument> = {
  [PRIVACY_POLICY.slug]: PRIVACY_POLICY,
  [TERMS_OF_SERVICE.slug]: TERMS_OF_SERVICE,
  [COOKIE_POLICY.slug]: COOKIE_POLICY,
};

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return Object.keys(DOCUMENTS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = DOCUMENTS[slug];
  if (!document) return {};
  return {
    title: `${document.title} | Gamer Perú`,
    description: document.summary,
    alternates: { canonical: `/legal/${document.slug}` },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = DOCUMENTS[slug];
  if (!document) notFound();
  return <LegalDocumentView document={document} />;
}
