import type { TrustItem } from "@/components/home/trust-strip/trust-strip";

/**
 * Pre-footer band on the support and legal pages. Only claims the store can back today: no
 * delivery-time or warranty promises until those policies are defined.
 */
export const SUPPORT_TRUST_ITEMS: TrustItem[] = [
  {
    icon: "whatsapp",
    title: "Atención al cliente",
    description: "Te responde una persona del equipo.",
  },
  {
    icon: "shipping",
    title: "Envíos con seguimiento",
    description: "Consulta el estado de tu pedido en su página.",
  },
  {
    icon: "catalog",
    title: "Catálogo multimarca",
    description: "Periféricos de marcas especializadas.",
  },
  {
    icon: "payment",
    title: "Métodos de pago",
    description: "Yape y Plin, verificados por nuestro equipo.",
  },
];
