import { formatCurrency } from "@/lib/utils/currency";
import {
  escapeHtml,
  mutedParagraph,
  panel,
  paragraph,
  renderButton,
  renderLayout,
  renderLineItems,
  renderSummaryRow,
  table,
} from "./layout";
import type { OrderEmailContext, RenderedEmail } from "./types";

const LIMA_DATE_TIME = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

function greeting(context: OrderEmailContext): string {
  const firstName = context.recipientName?.trim().split(/\s+/)[0];
  return firstName ? `Hola, ${firstName}.` : "Hola.";
}

/** Order received: what to pay, where to pay it and by when, before stock is released. */
export function renderOrderPlaced(context: OrderEmailContext): RenderedEmail {
  const total = formatCurrency(context.totalCents);
  const payBy = context.payBy ? LIMA_DATE_TIME.format(new Date(context.payBy)) : null;
  const { payment } = context;

  const paymentHtml = payment
    ? panel(`
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;">Paga con ${escapeHtml(payment.methodName)}</p>
        <p style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(total)}</p>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.6;">
          A nombre de <strong>${escapeHtml(payment.recipientName)}</strong><br />
          Número: <strong style="font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(payment.accountIdentifier)}</strong>
        </p>
        <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#374151;">${escapeHtml(payment.instructionText)}</p>
      `)
    : panel(
        `<p style="margin:0;font-size:14px;line-height:1.6;">Revisa las instrucciones de pago en la página de tu pedido.</p>`
      );

  const html = renderLayout({
    preheader: `Pedido ${context.orderNumber}: paga ${total} para confirmarlo.`,
    heading: `Recibimos tu pedido ${context.orderNumber}`,
    body: [
      paragraph(
        `${escapeHtml(greeting(context))} Tu pedido está reservado. Para confirmarlo, paga el total y envíanos el código de operación desde la página del pedido.`
      ),
      paymentHtml,
      payBy
        ? paragraph(
            `Paga antes del <strong>${escapeHtml(payBy)}</strong>. Después de esa hora el stock reservado puede liberarse.`
          )
        : "",
      renderButton("Enviar código de operación", context.confirmationUrl),
      table(
        renderLineItems(
          context.items.map((item) => ({
            name: item.name,
            detail: `${item.variant} · ${item.sku}`,
            quantity: item.quantity,
            total: formatCurrency(item.lineTotalCents),
          }))
        ) +
          renderSummaryRow("Productos", formatCurrency(context.subtotalCents)) +
          (context.discountCents > 0
            ? renderSummaryRow("Descuento", `−${formatCurrency(context.discountCents)}`)
            : "") +
          renderSummaryRow("Envío", formatCurrency(context.shippingCents)) +
          renderSummaryRow("Total", total, true)
      ),
      mutedParagraph(
        "Un pago enviado no confirma el pedido: lo confirmamos cuando verificamos el abono."
      ),
    ].join(""),
  });

  const text = [
    `${greeting(context)} Recibimos tu pedido ${context.orderNumber}.`,
    "",
    payment
      ? `Paga ${total} con ${payment.methodName} a ${payment.recipientName}, número ${payment.accountIdentifier}.`
      : `Total a pagar: ${total}.`,
    payment ? payment.instructionText : "",
    payBy ? `Paga antes del ${payBy}; después el stock reservado puede liberarse.` : "",
    "",
    `Envía tu código de operación aquí: ${context.confirmationUrl}`,
    "",
    ...context.items.map(
      (item) =>
        `${item.quantity}× ${item.name} (${item.variant}) — ${formatCurrency(item.lineTotalCents)}`
    ),
    `Total: ${total}`,
    "",
    "Un pago enviado no confirma el pedido: lo confirmamos cuando verificamos el abono.",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");

  return { subject: `Pedido ${context.orderNumber} recibido: completa tu pago`, html, text };
}
