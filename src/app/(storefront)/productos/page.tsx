import type React from "react";
import type { Metadata } from "next";
import FilteredCatalogPage, { generateMetadata as generateFilteredMetadata } from "./filtros/page";

/**
 * Unfiltered full catalog, served from the ISR cache like the category listings: the clean URL
 * renders once per revalidation, and the proxy rewrites any URL with a query string to ./filtros.
 */
export const revalidate = 3600;

const NO_FILTERS = Promise.resolve({});

export function generateMetadata(): Promise<Metadata> {
  return generateFilteredMetadata({ searchParams: NO_FILTERS });
}

export default function CatalogPage(): Promise<React.JSX.Element> {
  return FilteredCatalogPage({ searchParams: NO_FILTERS });
}
