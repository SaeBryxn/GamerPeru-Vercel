import type { NextRequest } from "next/server";
import { adminJson, withAdminAccess } from "@/lib/admin/admin-api";
import { searchAdmin } from "@/lib/admin/admin-search";

export const dynamic = "force-dynamic";

/** Orders by number and products by name or SKU, five of each, for the ⌘K search. */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return withAdminAccess(async (can) => adminJson(await searchAdmin(query, can)));
}
