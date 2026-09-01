"use server";

import { revalidatePath } from "next/cache";
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
    revalidatePath(`/checkout/confirmacion/${input.orderNumber}`);
    revalidatePath("/cuenta/pedidos");
  }
  return result;
}
