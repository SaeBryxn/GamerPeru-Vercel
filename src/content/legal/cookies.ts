import { COMPANY } from "@/config/company";
import type { LegalDocument } from "./types";

export const COOKIE_POLICY: LegalDocument = {
  slug: "cookies",
  eyebrow: "Legal",
  title: "Política de cookies",
  summary: `Qué cookies y almacenamiento local usa ${COMPANY.tradeName} y para qué.`,
  updatedAt: "2026-10-01",
  sections: [
    {
      id: "que-son",
      heading: "1. Qué son las cookies",
      paragraphs: [
        "Las cookies son pequeños archivos que un sitio guarda en tu navegador para recordar información entre una página y otra, como tu sesión o tu carrito.",
      ],
    },
    {
      id: "cuales-usamos",
      heading: "2. Cuáles usamos",
      paragraphs: [
        "Solo usamos cookies necesarias para que la tienda funcione. No usamos cookies de publicidad ni de seguimiento de terceros.",
      ],
      items: [
        "Sesión (sb-…-auth-token): mantiene tu sesión iniciada. Se elimina al cerrar sesión.",
        "Carrito (__Secure-gp_cart_session): recuerda tu carrito aunque no hayas iniciado sesión. Dura hasta 30 días.",
        "Sesión de pago (__Secure-gp_payment_session): te permite volver a la página de tu pedido para subir o revisar tu comprobante. Dura hasta 30 días.",
      ],
    },
    {
      id: "almacenamiento-local",
      heading: "3. Almacenamiento local",
      paragraphs: [
        "Guardamos en tu navegador que ya viste el aviso de cookies, para no mostrártelo en cada visita.",
      ],
    },
    {
      id: "terceros",
      heading: "4. Contenido de terceros",
      paragraphs: [
        "Algunas páginas incluyen videos de YouTube en su modo de privacidad mejorada (youtube-nocookie.com), que no guarda cookies hasta que reproduces el video. Al iniciar sesión con Google, Google aplica sus propias políticas.",
      ],
    },
    {
      id: "control",
      heading: "5. Cómo controlarlas",
      paragraphs: [
        "Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las cookies necesarias, no podrás iniciar sesión ni mantener tu carrito.",
      ],
    },
  ],
};
