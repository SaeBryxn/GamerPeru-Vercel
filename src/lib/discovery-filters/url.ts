import { formatCentsToPenDecimal, parsePenStringToCents } from "./pen-parser";
import type {
  AppliedFilterChip,
  DiscoveryFacets,
  DiscoveryFilterState,
  DiscoverySort,
  DiscoverySurface,
  NumberRangeFilter,
  TechnicalFilterValue,
  ValidatedSpecificationField,
  ValidatedSpecificationSchema,
} from "./types";
import { FILTER_SAFETY_BOUNDS } from "./types";

const VALID_SORTS_SET = new Set<string>([
  "recientes",
  "precio-menor",
  "precio-mayor",
  "nombre-asc",
  "nombre-desc",
]);

/**
 * Parses raw searchParams from Next.js into a validated DiscoveryFilterState.
 */
export function parseDiscoveryUrl(
  searchParams: Record<string, string | string[] | undefined>,
  surface: DiscoverySurface,
  validatedSchema: ValidatedSpecificationSchema | null = null
): DiscoveryFilterState {
  // 1. Brands
  const rawMarcas = searchParams.marca;
  let brands: string[] = [];
  if (surface !== "brand" && rawMarcas !== undefined) {
    const list = Array.isArray(rawMarcas) ? rawMarcas : [rawMarcas];
    for (const item of list) {
      if (typeof item === "string") {
        const trimmed = item.trim().toLowerCase();
        if (
          trimmed.length > 0 &&
          trimmed.length <= FILTER_SAFETY_BOUNDS.MAX_FILTER_VALUE_LENGTH &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed) &&
          !brands.includes(trimmed)
        ) {
          brands.push(trimmed);
          if (brands.length >= FILTER_SAFETY_BOUNDS.MAX_BRAND_VALUES) break;
        }
      }
    }
  }

  // 2. Categories
  const rawCategorias = searchParams.categoria;
  let categories: string[] = [];
  if (surface !== "category" && rawCategorias !== undefined) {
    const list = Array.isArray(rawCategorias) ? rawCategorias : [rawCategorias];
    for (const item of list) {
      if (typeof item === "string") {
        const trimmed = item.trim().toLowerCase();
        if (
          trimmed.length > 0 &&
          trimmed.length <= FILTER_SAFETY_BOUNDS.MAX_FILTER_VALUE_LENGTH &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed) &&
          !categories.includes(trimmed)
        ) {
          categories.push(trimmed);
          if (categories.length >= FILTER_SAFETY_BOUNDS.MAX_CATEGORY_VALUES) break;
        }
      }
    }
  }

  // 3. Price
  let minPriceCents = parsePenStringToCents(searchParams.precio_min);
  let maxPriceCents = parsePenStringToCents(searchParams.precio_max);

  if (minPriceCents !== null && maxPriceCents !== null && minPriceCents > maxPriceCents) {
    minPriceCents = null;
    maxPriceCents = null;
  }

  // 4. Technical Specifications
  const technical: Record<string, TechnicalFilterValue> = {};

  // Technical filters are only active if a valid schema exists AND (surface is category OR exactly 1 categoria selected)
  const isTechnicalContextActive =
    validatedSchema !== null &&
    (surface === "category" ||
      (categories.length === 1 && (surface === "brand" || surface === "search")));

  if (isTechnicalContextActive && validatedSchema) {
    const fieldsByParam = new Map<string, ValidatedSpecificationField>();
    for (const field of validatedSchema.fieldDefinitions) {
      if (field.filterable && field.publicParam) {
        fieldsByParam.set(field.publicParam, field);
      }
    }

    let activeTechFieldsCount = 0;

    for (const [paramName, field] of fieldsByParam.entries()) {
      if (activeTechFieldsCount >= FILTER_SAFETY_BOUNDS.MAX_ACTIVE_TECHNICAL_FIELDS) break;

      if (field.filterKind === "ENUM_MULTI") {
        const rawVal = searchParams[paramName];
        if (rawVal !== undefined) {
          const list = Array.isArray(rawVal) ? rawVal : [rawVal];
          const validOptions = new Set((field.options ?? []).map((o) => o.value));
          const selectedEnumValues: string[] = [];

          for (const item of list) {
            if (typeof item === "string") {
              const trimmed = item.trim();
              if (
                trimmed.length > 0 &&
                trimmed.length <= FILTER_SAFETY_BOUNDS.MAX_FILTER_VALUE_LENGTH &&
                validOptions.has(trimmed) &&
                !selectedEnumValues.includes(trimmed)
              ) {
                selectedEnumValues.push(trimmed);
                if (selectedEnumValues.length >= FILTER_SAFETY_BOUNDS.MAX_ENUM_VALUES_PER_FIELD) {
                  break;
                }
              }
            }
          }

          if (selectedEnumValues.length > 0) {
            technical[field.key] = selectedEnumValues;
            activeTechFieldsCount++;
          }
        }
      } else if (field.filterKind === "NUMBER_RANGE") {
        const rawMin = searchParams[`${paramName}_min`];
        const rawMax = searchParams[`${paramName}_max`];

        const rawMinStr = Array.isArray(rawMin) ? rawMin[0] : rawMin;
        const rawMaxStr = Array.isArray(rawMax) ? rawMax[0] : rawMax;

        let minNum: number | undefined = undefined;
        let maxNum: number | undefined = undefined;

        if (typeof rawMinStr === "string" && /^-?\d+(\.\d+)?$/.test(rawMinStr.trim())) {
          const parsed = parseFloat(rawMinStr.trim());
          if (Number.isFinite(parsed)) minNum = parsed;
        }
        if (typeof rawMaxStr === "string" && /^-?\d+(\.\d+)?$/.test(rawMaxStr.trim())) {
          const parsed = parseFloat(rawMaxStr.trim());
          if (Number.isFinite(parsed)) maxNum = parsed;
        }

        if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
          minNum = undefined;
          maxNum = undefined;
        }

        if (minNum !== undefined || maxNum !== undefined) {
          technical[field.key] = { min: minNum, max: maxNum };
          activeTechFieldsCount++;
        }
      } else if (field.filterKind === "BOOLEAN") {
        const rawVal = searchParams[paramName];
        // Only public param = "1" represents true. Any other value is ignored/canonicalized away.
        if (rawVal === "1" || (Array.isArray(rawVal) && rawVal.includes("1"))) {
          technical[field.key] = true;
          activeTechFieldsCount++;
        }
      }
    }
  }

  // 5. Sort
  let sort: DiscoverySort = null;
  const rawSort = typeof searchParams.sort === "string" ? searchParams.sort.trim() : null;
  if (rawSort && VALID_SORTS_SET.has(rawSort)) {
    if (surface === "search") {
      sort = rawSort as DiscoverySort;
    } else {
      // Category and Brand: "recientes" is the default (omitted in URL)
      if (rawSort !== "recientes") {
        sort = rawSort as DiscoverySort;
      }
    }
  }

  // 6. Page
  let page = 1;
  const rawPage = searchParams.page;
  if (Array.isArray(rawPage)) {
    for (const item of rawPage) {
      if (typeof item === "string" && /^[1-9]\d*$/.test(item.trim())) {
        const parsedPage = parseInt(item.trim(), 10);
        if (Number.isSafeInteger(parsedPage) && parsedPage > 0) {
          page = parsedPage;
          break;
        }
      }
    }
  } else if (typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage.trim())) {
    const parsedPage = parseInt(rawPage.trim(), 10);
    if (Number.isSafeInteger(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }
  }

  return {
    brands,
    categories,
    price: {
      minCents: minPriceCents,
      maxCents: maxPriceCents,
    },
    technical,
    sort,
    page,
  };
}

/**
 * Serializes DiscoveryFilterState into a canonical URL string according to GP-013 rules.
 */
export function serializeDiscoveryUrl(
  basePath: string,
  state: DiscoveryFilterState,
  surface: DiscoverySurface,
  validatedSchema: ValidatedSpecificationSchema | null = null,
  options?: {
    searchQuery?: string;
    overridePage?: number;
    preservePage?: boolean;
  }
): string {
  const queryParams: Array<[string, string]> = [];

  // Search query (must be first if on search surface)
  if (surface === "search" && options?.searchQuery) {
    queryParams.push(["q", options.searchQuery]);
  }

  // Category multi-filter (on Brand / Search)
  if (surface !== "category" && state.categories.length > 0) {
    const sortedCats = [...state.categories].sort();
    for (const cat of sortedCats) {
      queryParams.push(["categoria", cat]);
    }
  }

  // Brand multi-filter (on Category / Search)
  if (surface !== "brand" && state.brands.length > 0) {
    const sortedBrands = [...state.brands].sort();
    for (const b of sortedBrands) {
      queryParams.push(["marca", b]);
    }
  }

  // Price
  if (state.price.minCents !== null) {
    queryParams.push(["precio_min", formatCentsToPenDecimal(state.price.minCents)]);
  }
  if (state.price.maxCents !== null) {
    queryParams.push(["precio_max", formatCentsToPenDecimal(state.price.maxCents)]);
  }

  // Technical parameters (alphabetical by publicParam)
  const isTechnicalContextActive =
    validatedSchema !== null &&
    (surface === "category" ||
      (state.categories.length === 1 && (surface === "brand" || surface === "search")));

  if (isTechnicalContextActive && validatedSchema) {
    const fieldMap = new Map<string, ValidatedSpecificationField>();
    for (const f of validatedSchema.fieldDefinitions) {
      fieldMap.set(f.key, f);
    }

    const technicalEntries: Array<[string, string]> = [];

    for (const [key, val] of Object.entries(state.technical)) {
      const field = fieldMap.get(key);
      if (!field || !field.filterable || !field.publicParam) continue;

      if (field.filterKind === "ENUM_MULTI" && Array.isArray(val)) {
        const sortedVals = [...val].sort();
        for (const v of sortedVals) {
          technicalEntries.push([field.publicParam, v]);
        }
      } else if (field.filterKind === "NUMBER_RANGE" && typeof val === "object" && val !== null) {
        const range = val as NumberRangeFilter;
        if (range.min !== undefined) {
          technicalEntries.push([`${field.publicParam}_min`, String(range.min)]);
        }
        if (range.max !== undefined) {
          technicalEntries.push([`${field.publicParam}_max`, String(range.max)]);
        }
      } else if (field.filterKind === "BOOLEAN" && val === true) {
        technicalEntries.push([field.publicParam, "1"]);
      }
    }

    // Sort technical entries alphabetically by param name, then by value
    technicalEntries.sort((a, b) => {
      const cmp = a[0].localeCompare(b[0]);
      if (cmp !== 0) return cmp;
      return a[1].localeCompare(b[1]);
    });

    queryParams.push(...technicalEntries);
  }

  // Sort
  if (state.sort !== null) {
    if (surface === "search") {
      // Search default is omitted (relevance)
      queryParams.push(["sort", state.sort]);
    } else {
      // Category/Brand: "recientes" is default (omitted)
      if (state.sort !== "recientes") {
        queryParams.push(["sort", state.sort]);
      }
    }
  }

  // Page
  const targetPage = options?.overridePage ?? (options?.preservePage ? state.page : 1);
  if (targetPage > 1) {
    queryParams.push(["page", String(targetPage)]);
  }

  if (queryParams.length === 0) {
    return basePath;
  }

  const queryString = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return `${basePath}?${queryString}`;
}

/**
 * Reconstructs incoming request URL for canonical comparison using exact percent-encoding.
 */
export function reconstructIncomingDiscoveryUrl(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined) {
      if (Array.isArray(v)) {
        for (const val of v) {
          pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
        }
      } else {
        pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
  }
  return pairs.length > 0 ? `${basePath}?${pairs.join("&")}` : basePath;
}

/**
 * Builds applied filter chips for display below the discovery toolbar.
 */
export function buildAppliedFilterChips(
  basePath: string,
  state: DiscoveryFilterState,
  surface: DiscoverySurface,
  facets: DiscoveryFacets,
  searchQuery?: string
): AppliedFilterChip[] {
  const chips: AppliedFilterChip[] = [];

  // 1. Brands
  const brandNameMap = new Map(facets.brands.map((b) => [b.slug, b.name]));
  for (const bSlug of state.brands) {
    const brandName = brandNameMap.get(bSlug) ?? bSlug;
    const nextState: DiscoveryFilterState = {
      ...state,
      brands: state.brands.filter((b) => b !== bSlug),
      page: 1,
    };
    chips.push({
      id: `brand-${bSlug}`,
      label: `Marca: ${brandName}`,
      type: "brand",
      value: bSlug,
      removeHref: serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
        searchQuery,
      }),
    });
  }

  // 2. Categories
  const catNameMap = new Map(facets.categories.map((c) => [c.slug, c.name]));
  for (const cSlug of state.categories) {
    const catName = catNameMap.get(cSlug) ?? cSlug;
    const nextState: DiscoveryFilterState = {
      ...state,
      categories: state.categories.filter((c) => c !== cSlug),
      page: 1,
    };
    chips.push({
      id: `category-${cSlug}`,
      label: `Categoría: ${catName}`,
      type: "category",
      value: cSlug,
      removeHref: serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
        searchQuery,
      }),
    });
  }

  // 3. Price
  if (state.price.minCents !== null || state.price.maxCents !== null) {
    let priceLabel = "";
    if (state.price.minCents !== null && state.price.maxCents !== null) {
      priceLabel = `Precio: S/ ${formatCentsToPenDecimal(state.price.minCents)} - S/ ${formatCentsToPenDecimal(state.price.maxCents)}`;
    } else if (state.price.minCents !== null) {
      priceLabel = `Precio: Desde S/ ${formatCentsToPenDecimal(state.price.minCents)}`;
    } else if (state.price.maxCents !== null) {
      priceLabel = `Precio: Hasta S/ ${formatCentsToPenDecimal(state.price.maxCents)}`;
    }

    const nextState: DiscoveryFilterState = {
      ...state,
      price: { minCents: null, maxCents: null },
      page: 1,
    };
    chips.push({
      id: "price",
      label: priceLabel,
      type: "price",
      removeHref: serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
        searchQuery,
      }),
    });
  }

  // 4. Technical
  if (facets.technicalSchema) {
    const fieldMap = new Map<string, ValidatedSpecificationField>();
    for (const f of facets.technicalSchema.fieldDefinitions) {
      fieldMap.set(f.key, f);
    }

    for (const [key, val] of Object.entries(state.technical)) {
      const field = fieldMap.get(key);
      if (!field) continue;

      if (field.filterKind === "ENUM_MULTI" && Array.isArray(val)) {
        const optionLabelMap = new Map((field.options ?? []).map((o) => [o.value, o.label]));
        for (const enumVal of val) {
          const optLabel = optionLabelMap.get(enumVal) ?? enumVal;
          const nextVals = val.filter((v) => v !== enumVal);
          const nextTech = { ...state.technical };
          if (nextVals.length === 0) {
            delete nextTech[key];
          } else {
            nextTech[key] = nextVals;
          }

          const nextState: DiscoveryFilterState = {
            ...state,
            technical: nextTech,
            page: 1,
          };

          chips.push({
            id: `tech-${key}-${enumVal}`,
            label: `${field.label}: ${optLabel}`,
            type: "technical",
            fieldKey: key,
            value: enumVal,
            removeHref: serializeDiscoveryUrl(
              basePath,
              nextState,
              surface,
              facets.technicalSchema,
              {
                searchQuery,
              }
            ),
          });
        }
      } else if (field.filterKind === "NUMBER_RANGE" && typeof val === "object" && val !== null) {
        const range = val as NumberRangeFilter;
        let rangeLabel = field.label;
        const unit = field.unit ? ` ${field.unit}` : "";
        if (range.min !== undefined && range.max !== undefined) {
          rangeLabel = `${field.label}: ${range.min} - ${range.max}${unit}`;
        } else if (range.min !== undefined) {
          rangeLabel = `${field.label}: Desde ${range.min}${unit}`;
        } else if (range.max !== undefined) {
          rangeLabel = `${field.label}: Hasta ${range.max}${unit}`;
        }

        const nextTech = { ...state.technical };
        delete nextTech[key];
        const nextState: DiscoveryFilterState = {
          ...state,
          technical: nextTech,
          page: 1,
        };

        chips.push({
          id: `tech-${key}`,
          label: rangeLabel,
          type: "technical",
          fieldKey: key,
          removeHref: serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
            searchQuery,
          }),
        });
      } else if (field.filterKind === "BOOLEAN" && val === true) {
        const nextTech = { ...state.technical };
        delete nextTech[key];
        const nextState: DiscoveryFilterState = {
          ...state,
          technical: nextTech,
          page: 1,
        };

        chips.push({
          id: `tech-${key}`,
          label: field.label,
          type: "technical",
          fieldKey: key,
          removeHref: serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
            searchQuery,
          }),
        });
      }
    }
  }

  return chips;
}
