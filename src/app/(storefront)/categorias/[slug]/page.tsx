import type React from "react";
import type { Metadata } from "next";
import FilteredCategoryPage, { generateMetadata as generateFilteredMetadata } from "./filtros/page";

/**
 * Unfiltered category listing, served from the ISR cache.
 *
 * Reading searchParams makes a page render on every request, and a full render costs more than the
 * 10 ms of CPU a Workers Free request gets (Error 1102). Menu links, search engines and shared
 * links all land on the clean URL, so it renders once per revalidation instead. The proxy rewrites
 * any URL with a query string to ./filtros, which keeps filters, sorting, pagination, legacy
 * aliases and canonical redirects exactly as before.
 */
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

const NO_FILTERS = Promise.resolve({});

export function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  return generateFilteredMetadata({ params, searchParams: NO_FILTERS });
}

export default function CategoryPage({ params }: CategoryPageProps): Promise<React.JSX.Element> {
  return FilteredCategoryPage({ params, searchParams: NO_FILTERS });
}
