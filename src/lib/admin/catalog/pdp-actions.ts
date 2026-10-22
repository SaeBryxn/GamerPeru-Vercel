"use server";

import { z } from "zod";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { queryPdpAccessories } from "@/lib/catalog/pdp-accessory-query";
import type { ProductPdpAccessory } from "@/lib/catalog/product-detail-types";

export async function searchPdpAccessoriesAction(input: {
  productId: string;
  search: string;
  selectedIds: string[];
}): Promise<{ items: ProductPdpAccessory[]; error?: string }> {
  const auth = await getVerifiedAuthContext();
  if (auth.status !== "READY" || !auth.permissions.has("catalog:manage"))
    return { items: [], error: "No tienes permisos para consultar el catálogo." };
  const parsed = z
    .object({
      productId: z.string().uuid(),
      search: z.string().trim().max(100),
      selectedIds: z.array(z.string().uuid()).max(12),
    })
    .safeParse(input);
  if (!parsed.success) return { items: [], error: "Revisa el texto de búsqueda." };
  try {
    return {
      items: await queryPdpAccessories(
        parsed.data.productId,
        parsed.data.selectedIds,
        parsed.data.search
      ),
    };
  } catch {
    return { items: [], error: "No se pudo consultar el catálogo. Inténtalo de nuevo." };
  }
}
