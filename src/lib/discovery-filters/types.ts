export type DiscoverySurface = "category" | "brand" | "search";

export type DiscoverySort =
  "recientes" | "precio-menor" | "precio-mayor" | "nombre-asc" | "nombre-desc" | null;

export interface PriceFilterState {
  minCents: number | null;
  maxCents: number | null;
}

export interface NumberRangeFilter {
  min?: number;
  max?: number;
}

export type TechnicalFilterValue = string[] | NumberRangeFilter | boolean;

export interface DiscoveryFilterState {
  brands: string[];
  categories: string[];
  price: PriceFilterState;
  technical: Record<string, TechnicalFilterValue>;
  sort: DiscoverySort;
  page: number;
}

export const FILTER_SAFETY_BOUNDS = {
  MAX_BRAND_VALUES: 20,
  MAX_CATEGORY_VALUES: 10,
  MAX_ACTIVE_TECHNICAL_FIELDS: 12,
  MAX_ENUM_VALUES_PER_FIELD: 20,
  MAX_PUBLIC_PARAM_LENGTH: 40,
  MAX_FILTER_VALUE_LENGTH: 80,
  MAX_PRICE_PARAM_LENGTH: 12,
  MAX_SORT_VALUE_LENGTH: 32,
  MIN_PRICE_CENTS: 1,
  MAX_PRICE_CENTS: 9999999,
} as const;

export const RESERVED_CORE_PARAMS = new Set([
  "q",
  "marca",
  "categoria",
  "precio_min",
  "precio_max",
  "sort",
  "page",
]);

export type SpecificationDataType = "enum" | "number" | "boolean" | "string";
export type SpecificationFilterKind = "ENUM_MULTI" | "NUMBER_RANGE" | "BOOLEAN";

export interface SpecificationEnumOption {
  value: string;
  label: string;
}

export interface ValidatedSpecificationField {
  key: string;
  label: string;
  dataType: SpecificationDataType;
  unit?: string | null;
  filterable: boolean;
  filterKind: SpecificationFilterKind;
  publicParam: string;
  displayOrder: number;
  options?: SpecificationEnumOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface ValidatedSpecificationSchema {
  id: string;
  categoryId: string;
  schemaVersion: number;
  fieldDefinitions: ValidatedSpecificationField[];
}

export interface BrandFacetOption {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryFacetOption {
  id: string;
  name: string;
  slug: string;
}

export interface TechnicalEnumFacet {
  field: ValidatedSpecificationField;
  kind: "ENUM_MULTI";
  representedOptions: SpecificationEnumOption[];
}

export interface TechnicalNumberFacet {
  field: ValidatedSpecificationField;
  kind: "NUMBER_RANGE";
  minRepresented: number;
  maxRepresented: number;
}

export interface TechnicalBooleanFacet {
  field: ValidatedSpecificationField;
  kind: "BOOLEAN";
  hasRepresentedTrue: boolean;
}

export type TechnicalFacet = TechnicalEnumFacet | TechnicalNumberFacet | TechnicalBooleanFacet;

export interface DiscoveryFacets {
  brands: BrandFacetOption[];
  categories: CategoryFacetOption[];
  priceRange?: {
    minPriceCents: number;
    maxPriceCents: number;
  };
  technicalSchema: ValidatedSpecificationSchema | null;
  technicalFacets: TechnicalFacet[];
}

export interface AppliedFilterChip {
  id: string;
  label: string;
  type: "brand" | "category" | "price" | "technical";
  fieldKey?: string;
  value?: string;
  removeHref: string;
}
