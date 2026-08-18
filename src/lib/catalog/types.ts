/**
 * Gamer Perú — Catalog Discovery Domain Types
 *
 * Public projection types for category and brand discovery pages.
 *
 * Security Invariant:
 * cost_cents, internal supplier metadata, private security classes, and
 * unpublished records are NEVER included in these projections.
 */

export interface CategoryDiscoveryEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  displayOrder: number;
}

export interface BrandDiscoveryEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: {
    objectKey: string;
    altText: string | null;
  } | null;
}

export interface ProductDiscoveryItem {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  brand: {
    name: string;
    slug: string;
  };
  category: {
    name: string;
    slug: string;
  };
  primaryMedia: {
    objectKey: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  } | null;
  startingPriceCents: number;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type {
  DiscoveryFilterState,
  DiscoverySort,
  DiscoveryFacets,
  ValidatedSpecificationSchema,
  TechnicalFacet,
  TechnicalEnumFacet,
  TechnicalNumberFacet,
  TechnicalBooleanFacet,
  SpecificationEnumOption,
  AppliedFilterChip,
} from "@/lib/discovery-filters/types";
