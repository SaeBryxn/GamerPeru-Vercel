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

export function parseTechnicalDecimal(
  raw: unknown,
  fieldMin?: number,
  fieldMax?: number
): number | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 20 || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return undefined;
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return undefined;

  if (fieldMin !== undefined && num < fieldMin) return undefined;
  if (fieldMax !== undefined && num > fieldMax) return undefined;

  return num;
}

export interface ParseDiscoveryUrlOptions {
  allowedBrands?: Set<string>;
  allowedCategories?: Set<string>;
}

export function parseDiscoveryUrl(
  searchParams: Record<string, string | string[] | undefined>,
  surface: DiscoverySurface,
  validatedSchema: ValidatedSpecificationSchema | null = null,
  options?: ParseDiscoveryUrlOptions
): DiscoveryFilterState {
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
          if (!options?.allowedBrands || options.allowedBrands.has(trimmed)) {
            brands.push(trimmed);
            if (brands.length >= FILTER_SAFETY_BOUNDS.MAX_BRAND_VALUES) break;
          }
        }
      }
    }
  }

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
          if (!options?.allowedCategories || options.allowedCategories.has(trimmed)) {
            categories.push(trimmed);
            if (categories.length >= FILTER_SAFETY_BOUNDS.MAX_CATEGORY_VALUES) break;
          }
        }
      }
    }
  }

  let minPriceCents = parsePenStringToCents(searchParams.precio_min);
  let maxPriceCents = parsePenStringToCents(searchParams.precio_max);

  if (minPriceCents !== null && maxPriceCents !== null && minPriceCents > maxPriceCents) {
    minPriceCents = null;
    maxPriceCents = null;
  }

  const technical: Record<string, TechnicalFilterValue> = {};

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

        let minNum = parseTechnicalDecimal(rawMinStr, field.min, field.max);
        let maxNum = parseTechnicalDecimal(rawMaxStr, field.min, field.max);

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
        if (rawVal === "1" || (Array.isArray(rawVal) && rawVal.includes("1"))) {
          technical[field.key] = true;
          activeTechFieldsCount++;
        }
      }
    }
  }

  let sort: DiscoverySort = null;
  const rawSort = typeof searchParams.sort === "string" ? searchParams.sort.trim() : null;
  if (rawSort && VALID_SORTS_SET.has(rawSort)) {
    if (surface === "search") {
      sort = rawSort as DiscoverySort;
    } else {
      if (rawSort !== "recientes") {
        sort = rawSort as DiscoverySort;
      }
    }
  }

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

export function pruneFilterStateAgainstDomains(
  state: DiscoveryFilterState,
  allowedBrands?: Set<string> | null,
  allowedCategories?: Set<string> | null
): { state: DiscoveryFilterState; wasPruned: boolean } {
  let wasPruned = false;

  let brands = state.brands;
  if (allowedBrands) {
    const pruned = brands.filter((b) => allowedBrands.has(b));
    if (pruned.length !== brands.length) {
      brands = pruned;
      wasPruned = true;
    }
  }

  let categories = state.categories;
  if (allowedCategories) {
    const pruned = categories.filter((c) => allowedCategories.has(c));
    if (pruned.length !== categories.length) {
      categories = pruned;
      wasPruned = true;
    }
  }

  if (wasPruned) {
    return {
      state: {
        ...state,
        brands,
        categories,
        page: 1,
      },
      wasPruned: true,
    };
  }

  return { state, wasPruned: false };
}

export interface SerializeDiscoveryUrlOptions {
  searchQuery?: string;
  overridePage?: number;
  preservePage?: boolean;
}

export function serializeDiscoveryUrl(
  basePath: string,
  state: DiscoveryFilterState,
  surface: DiscoverySurface,
  schema: ValidatedSpecificationSchema | null = null,
  options?: SerializeDiscoveryUrlOptions
): string {
  const queryParams: [string, string][] = [];

  if (surface === "search" && options?.searchQuery !== undefined) {
    const q = options.searchQuery.trim();
    if (q.length > 0) {
      queryParams.push(["q", q]);
    }
  }

  if (surface !== "category" && state.categories.length > 0) {
    for (const cat of state.categories) {
      queryParams.push(["categoria", cat]);
    }
  }

  if (surface !== "brand" && state.brands.length > 0) {
    for (const brand of state.brands) {
      queryParams.push(["marca", brand]);
    }
  }

  if (state.price.minCents !== null) {
    queryParams.push(["precio_min", formatCentsToPenDecimal(state.price.minCents)]);
  }
  if (state.price.maxCents !== null) {
    queryParams.push(["precio_max", formatCentsToPenDecimal(state.price.maxCents)]);
  }

  const isTechnicalActive =
    schema !== null &&
    (surface === "category" ||
      (state.categories.length === 1 && (surface === "brand" || surface === "search")));

  if (isTechnicalActive && schema) {
    const technicalEntries: [string, string][] = [];
    const fieldsByKey = new Map<string, ValidatedSpecificationField>();
    for (const field of schema.fieldDefinitions) {
      if (field.filterable && field.publicParam) {
        fieldsByKey.set(field.key, field);
      }
    }

    for (const [key, val] of Object.entries(state.technical)) {
      const field = fieldsByKey.get(key);
      if (!field) continue;

      if (field.filterKind === "ENUM_MULTI" && Array.isArray(val)) {
        for (const optVal of val) {
          technicalEntries.push([field.publicParam, optVal]);
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

    technicalEntries.sort((a, b) => {
      const cmp = a[0].localeCompare(b[0]);
      if (cmp !== 0) return cmp;
      return a[1].localeCompare(b[1]);
    });

    queryParams.push(...technicalEntries);
  }

  if (state.sort !== null) {
    if (surface === "search") {
      queryParams.push(["sort", state.sort]);
    } else {
      if (state.sort !== "recientes") {
        queryParams.push(["sort", state.sort]);
      }
    }
  }

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

export function buildAppliedFilterChips(
  basePath: string,
  state: DiscoveryFilterState,
  surface: DiscoverySurface,
  facets: DiscoveryFacets,
  options?: { searchQuery?: string } | string
): AppliedFilterChip[] {
  const chips: AppliedFilterChip[] = [];
  const searchQuery = typeof options === "string" ? options : options?.searchQuery;

  const brandNameMap = new Map<string, string>(facets.brands.map((b) => [b.slug, b.name]));
  const categoryNameMap = new Map<string, string>(facets.categories.map((c) => [c.slug, c.name]));
  const schema = facets.technicalSchema;
  const fieldsByKey = new Map<string, ValidatedSpecificationField>();
  if (schema) {
    for (const f of schema.fieldDefinitions) {
      fieldsByKey.set(f.key, f);
    }
  }

  if (surface !== "brand") {
    for (const brandSlug of state.brands) {
      const nextBrands = state.brands.filter((b) => b !== brandSlug);
      const nextState: DiscoveryFilterState = { ...state, brands: nextBrands, page: 1 };
      const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
        searchQuery,
        overridePage: 1,
      });

      chips.push({
        id: `brand-${brandSlug}`,
        label: `Marca: ${brandNameMap.get(brandSlug) ?? brandSlug}`,
        type: "brand",
        value: brandSlug,
        removeHref,
      });
    }
  }

  if (surface !== "category") {
    for (const categorySlug of state.categories) {
      const nextCategories = state.categories.filter((c) => c !== categorySlug);
      const nextState: DiscoveryFilterState = { ...state, categories: nextCategories, page: 1 };
      const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
        searchQuery,
        overridePage: 1,
      });

      chips.push({
        id: `category-${categorySlug}`,
        label: `Categoría: ${categoryNameMap.get(categorySlug) ?? categorySlug}`,
        type: "category",
        value: categorySlug,
        removeHref,
      });
    }
  }

  if (state.price.minCents !== null || state.price.maxCents !== null) {
    let priceLabel = "Precio: ";
    if (state.price.minCents !== null && state.price.maxCents !== null) {
      priceLabel += `S/ ${formatCentsToPenDecimal(state.price.minCents)} - S/ ${formatCentsToPenDecimal(state.price.maxCents)}`;
    } else if (state.price.minCents !== null) {
      priceLabel += `Desde S/ ${formatCentsToPenDecimal(state.price.minCents)}`;
    } else if (state.price.maxCents !== null) {
      priceLabel += `Hasta S/ ${formatCentsToPenDecimal(state.price.maxCents)}`;
    }

    const nextState: DiscoveryFilterState = {
      ...state,
      price: { minCents: null, maxCents: null },
      page: 1,
    };
    const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
      searchQuery,
      overridePage: 1,
    });

    chips.push({
      id: "price",
      label: priceLabel,
      type: "price",
      removeHref,
    });
  }

  if (schema) {
    for (const [key, val] of Object.entries(state.technical)) {
      const field = fieldsByKey.get(key);
      if (!field) continue;

      if (field.filterKind === "ENUM_MULTI" && Array.isArray(val)) {
        const optionLabelMap = new Map<string, string>(
          (field.options ?? []).map((o) => [o.value, o.label])
        );

        for (const optVal of val) {
          const nextValues = val.filter((v) => v !== optVal);
          const nextTechnical = { ...state.technical };
          if (nextValues.length === 0) {
            delete nextTechnical[key];
          } else {
            nextTechnical[key] = nextValues;
          }

          const nextState: DiscoveryFilterState = {
            ...state,
            technical: nextTechnical,
            page: 1,
          };
          const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
            searchQuery,
            overridePage: 1,
          });

          chips.push({
            id: `tech-${key}-${optVal}`,
            label: `${field.label}: ${optionLabelMap.get(optVal) ?? optVal}`,
            type: "technical",
            fieldKey: key,
            value: optVal,
            removeHref,
          });
        }
      } else if (field.filterKind === "NUMBER_RANGE" && typeof val === "object" && val !== null) {
        const range = val as NumberRangeFilter;
        let rangeLabel = `${field.label}: `;
        const unitSuffix = field.unit ? ` ${field.unit}` : "";

        if (range.min !== undefined && range.max !== undefined) {
          rangeLabel += `${range.min} - ${range.max}${unitSuffix}`;
        } else if (range.min !== undefined) {
          rangeLabel += `>= ${range.min}${unitSuffix}`;
        } else if (range.max !== undefined) {
          rangeLabel += `<= ${range.max}${unitSuffix}`;
        }

        const nextTechnical = { ...state.technical };
        delete nextTechnical[key];
        const nextState: DiscoveryFilterState = {
          ...state,
          technical: nextTechnical,
          page: 1,
        };
        const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
          searchQuery,
          overridePage: 1,
        });

        chips.push({
          id: `tech-${key}`,
          label: rangeLabel,
          type: "technical",
          fieldKey: key,
          removeHref,
        });
      } else if (field.filterKind === "BOOLEAN" && val === true) {
        const nextTechnical = { ...state.technical };
        delete nextTechnical[key];
        const nextState: DiscoveryFilterState = {
          ...state,
          technical: nextTechnical,
          page: 1,
        };
        const removeHref = serializeDiscoveryUrl(basePath, nextState, surface, schema, {
          searchQuery,
          overridePage: 1,
        });

        chips.push({
          id: `tech-${key}`,
          label: field.label,
          type: "technical",
          fieldKey: key,
          removeHref,
        });
      }
    }
  }

  return chips;
}
