import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { getSearchReader } from "@/lib/search/get-reader";
import { getQueryCodePointLength, normalizeSearchQuery } from "@/lib/search/normalization";
import { MAX_SEARCH_QUERY_LENGTH, MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export async function GET(request: NextRequest) {
  try {
    const rawQ = request.nextUrl.searchParams.get("q");

    if (!rawQ) {
      return NextResponse.json(
        { products: [], brands: [], categories: [] },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (getQueryCodePointLength(rawQ) > MAX_SEARCH_QUERY_LENGTH) {
      return NextResponse.json(
        { error: "INVALID_SEARCH_QUERY" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const cleanQuery = normalizeSearchQuery(rawQ);

    if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
      return NextResponse.json(
        { products: [], brands: [], categories: [] },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const reader = getSearchReader();
    const suggestions = await reader.getSearchSuggestions(cleanQuery);

    const products = suggestions.products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle,
      brand: p.brand,
      startingPriceCents: p.startingPriceCents,
      primaryMedia: p.primaryMedia
        ? {
            src: resolvePublicMediaUrl(p.primaryMedia.objectKey),
            altText: p.primaryMedia.altText,
            width: p.primaryMedia.width,
            height: p.primaryMedia.height,
          }
        : null,
    }));

    return NextResponse.json(
      {
        products,
        brands: suggestions.brands,
        categories: suggestions.categories,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch {
    // Privacy invariant: Never log raw query string to telemetry or console
    return NextResponse.json(
      { error: "SEARCH_UNAVAILABLE" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
