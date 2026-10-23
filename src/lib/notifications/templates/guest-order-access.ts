import { paragraph, renderButton, renderLayout } from "./layout";
import type { OrderEmailContext, RenderedEmail } from "./types";
export function renderGuestOrderAccess(context: OrderEmailContext): RenderedEmail {
  return {
    subject: `Acceso a tu pedido ${context.orderNumber}`,
    html: renderLayout({
      preheader: "Enlace temporal para consultar tu pedido.",
      heading: "Recupera el acceso a tu pedido",
      body:
        paragraph(
          "Solicitaste acceso a un pedido de invitado. Este enlace permite consultar ese pedido y gestionar su pago. Vence en 24 horas desde su emisión. No lo compartas. Si no lo solicitaste, ignora este correo."
        ) + renderButton("Abrir mi pedido", context.confirmationUrl),
    }),
    text: `Solicitaste acceso a tu pedido ${context.orderNumber}.\n${context.confirmationUrl}\nEnlace válido durante 24 horas desde su emisión. No lo compartas. Si no lo solicitaste, ignora este correo.`,
  };
}
