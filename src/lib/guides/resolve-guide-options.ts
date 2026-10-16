import type { GuideCriterion, GuideOption } from "@/content/guides";
import type {
  DiscoveryFilterState,
  ValidatedSpecificationSchema,
} from "@/lib/discovery-filters/types";
import { parseDiscoveryUrl, serializeDiscoveryUrl } from "@/lib/discovery-filters/url";

export interface ResolvedGuideOption extends GuideOption {
  /** Canonical filtered category URL, so the link never goes through a redirect. */
  href: string;
  count: number;
}

export interface ResolvedGuideCriterion extends Omit<GuideCriterion, "options"> {
  options: ResolvedGuideOption[];
}

/** Public parameter names an option filters on, with range suffixes folded into one field. */
function filteredParams(filter: GuideOption["filter"]): Set<string> {
  return new Set(Object.keys(filter).map((key) => key.replace(/_(min|max)$/, "")));
}

/**
 * Turns an option into a filter state only when the category schema supports every parameter it
 * uses. A parameter the schema does not know is dropped by the parser, which would silently
 * widen the filter and show a misleading count.
 */
export function buildGuideOptionState(
  option: GuideOption,
  schema: ValidatedSpecificationSchema | null
): DiscoveryFilterState | null {
  if (!schema) return null;
  const state = parseDiscoveryUrl(option.filter, "category", schema);
  const expected = filteredParams(option.filter).size;
  return Object.keys(state.technical).length === expected ? state : null;
}

/**
 * Resolves every option against the live schema and catalog. Options the schema cannot express
 * or that match no published product are left out, and criteria left without options keep their
 * explanation so the guide still reads as advice.
 */
export async function resolveGuideCriteria(
  criteria: GuideCriterion[],
  categorySlug: string,
  schema: ValidatedSpecificationSchema | null,
  countProducts: (state: DiscoveryFilterState) => Promise<number>
): Promise<ResolvedGuideCriterion[]> {
  return Promise.all(
    criteria.map(async (criterion) => {
      const resolved = await Promise.all(
        criterion.options.map(async (option): Promise<ResolvedGuideOption | null> => {
          const state = buildGuideOptionState(option, schema);
          if (!state) return null;
          const count = await countProducts(state);
          if (count === 0) return null;
          return {
            ...option,
            count,
            href: serializeDiscoveryUrl(`/categorias/${categorySlug}`, state, "category", schema),
          };
        })
      );
      return {
        ...criterion,
        options: resolved.filter((option): option is ResolvedGuideOption => option !== null),
      };
    })
  );
}
