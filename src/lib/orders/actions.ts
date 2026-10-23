"use server";

import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { cancelUnpaidOrder } from "./service";
import type { CancelUnpaidOrderInput, CancelUnpaidOrderResult } from "./types";

/**
 * Server Action for customer or guest cancellation of eligible unpaid orders.
 */
export async function cancelUnpaidOrderAction(
  input: CancelUnpaidOrderInput
): Promise<CancelUnpaidOrderResult> {
  const result = await cancelUnpaidOrder(input);
  if (result.success) {
    revalidateStorefrontCatalog();
  }
  return result;
}
