import type { CheckoutCartDTO } from "./types";
import { formatCurrency } from "@/lib/utils/currency";

export function describeCheckoutChanges(
  before: CheckoutCartDTO | null,
  after: CheckoutCartDTO | null,
  oldShipping: number,
  newShipping: number
): string[] {
  const changes: string[] = [];
  const previous = new Map(before?.items.map((item) => [item.variantId, item]) ?? []);
  for (const item of after?.items ?? []) {
    const old = previous.get(item.variantId);
    if (!old) changes.push(`${item.productName}: añadido al carrito (${item.quantity} unidades).`);
    else {
      if (old.priceCents !== item.priceCents)
        changes.push(
          `${item.productName}: precio por unidad de ${formatCurrency(old.priceCents)} a ${formatCurrency(item.priceCents)}.`
        );
      if (old.quantity !== item.quantity)
        changes.push(`${item.productName}: cantidad de ${old.quantity} a ${item.quantity}.`);
    }
    previous.delete(item.variantId);
  }
  for (const old of previous.values()) changes.push(`${old.productName}: retirado del carrito.`);
  if (oldShipping !== newShipping)
    changes.push(`Envío: de ${formatCurrency(oldShipping)} a ${formatCurrency(newShipping)}.`);
  return changes;
}
