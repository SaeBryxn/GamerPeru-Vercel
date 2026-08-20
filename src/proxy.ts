import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 root proxy for protected customer and admin routes.
 * Bypasses all public storefront routes to prevent unnecessary auth overhead.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/cuenta/:path*",
    "/admin/:path*",
    "/auth/cambiar-password",
    "/auth/completar-perfil",
    "/api/admin/:path*",
  ],
};
