import type React from "react";
import type { Metadata } from "next";
import FilteredBrandPage, { generateMetadata as generateFilteredMetadata } from "./filtros/page";

/**
 * Unfiltered brand listing, served from the ISR cache. See the category page for why: the proxy
 * rewrites URLs with a query string to ./filtros so only filtered views render per request.
 */
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface BrandPageProps {
  params: Promise<{ slug: string }>;
}

const NO_FILTERS = Promise.resolve({});

export function generateMetadata({ params }: BrandPageProps): Promise<Metadata> {
  return generateFilteredMetadata({ params, searchParams: NO_FILTERS });
}

export default function BrandPage({ params }: BrandPageProps): Promise<React.JSX.Element> {
  return FilteredBrandPage({ params, searchParams: NO_FILTERS });
}
