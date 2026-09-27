import { formatCurrency } from "@/lib/utils/currency";
import {
  escapeHtml,
  mutedParagraph,
  paragraph,
  renderButton,
  renderLayout,
  renderLineItems,
  renderSummaryRow,
  table,
} from "./layout";
import type { OrderEmailContext, RenderedEmail } from "./types";

/** Payment verified: the order is confirmed and moves to preparation. */
export function renderPaymentApproved(context: OrderEmailContext): RenderedEmail {
  const total = formatCurrency(context.totalCents);
  const firstName = context.recipientName?.trim().split(/\s+/)[0];
  const hello = firstName ? `Hola, ${firstName}.` : "Hola.";

  const html = renderLayout({
    preheader: `Confirmamos tu pago de ${total}. Ya estamos preparando tu pedido.`,
    heading: "Pago confirmado",
    body: [
      paragraph(
        `${escapeHtml(hello)} Verificamos tu pago de <strong>${escapeHtml(total)}</strong> para el pedido <strong>${escapeHtml(context.orderNumber)}</strong>. Ya está confirmado y pasa a preparación.`
      ),
      paragraph(
        "Te escribiremos de nuevo cuando lo entreguemos al transportista, con el seguimiento."
      ),
      renderButton("Ver mi pedido", context.confirmationUrl),
      table(
        renderLineItems(
          context.items.map((item) => ({
            name: item.name,
            detail: `${item.variant} · ${item.sku}`,
            quantity: item.quantity,
            total: formatCurrency(item.lineTotalCents),
          }))
        ) + renderSummaryRow("Total pagado", total, true)
      ),
      mutedParagraph("Guarda este correo como constancia de tu compra."),
    ].join(""),
  });

  const text = [
    `${hello} Confirmamos tu pago de ${total} para el pedido ${context.orderNumber}.`,
    "Tu pedido pasa a preparación; te avisaremos cuando salga con el transportista.",
    "",
    ...context.items.map(
      (item) =>
        `${item.quantity}× ${item.name} (${item.variant}) — ${formatCurrency(item.lineTotalCents)}`
    ),
    `Total pagado: ${total}`,
    "",
    `Ver mi pedido: ${context.confirmationUrl}`,
  ].join("\n");

  return { subject: `Pago confirmado · pedido ${context.orderNumber}`, html, text };
}
