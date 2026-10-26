import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Category and brand listings: `/categorias/<slug>` or `/marcas/<slug>`. */
const CATALOG_LISTING = /^\/(categorias|marcas)\/([^/]+)\/?$/;

/** Full catalog listing: `/productos` (product pages live one level below). */
const FULL_CATALOG = /^\/productos\/?$/;

/**
 * Next.js 16 root proxy for protected customer and admin routes.
 * Bypasses all public storefront routes to prevent unnecessary auth overhead.
 *
 * Catalog listings only pass through to pick their route: the clean URL is served from the ISR
 * cache, and a URL with filters, sorting or a page number is rewritten to the per-request
 * `filtros` route. They never touch the auth session.
 */
export async function proxy(request: NextRequest) {
  const listing = CATALOG_LISTING.exec(request.nextUrl.pathname);
  if (listing) {
    if (!request.nextUrl.search) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/${listing[1]}/${listing[2]}/filtros`;
    return NextResponse.rewrite(url);
  }

  if (FULL_CATALOG.test(request.nextUrl.pathname)) {
    if (!request.nextUrl.search) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/productos/filtros";
    return NextResponse.rewrite(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/cuenta/:path*",
    "/admin/:path*",
    "/auth/cambiar-password",
    "/auth/completar-perfil",
    "/api/admin/:path*",
    "/categorias/:slug",
    "/marcas/:slug",
    "/productos",
  ],
};
