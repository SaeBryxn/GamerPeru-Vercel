import { COMPANY } from "@/config/company";
import type { LegalDocument } from "./types";

export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "terminos",
  eyebrow: "Legal",
  title: "Términos de servicio",
  summary: `Las condiciones para comprar en ${COMPANY.tradeName}, la tienda online operada por ${COMPANY.legalName}.`,
  updatedAt: "2026-10-01",
  sections: [
    {
      id: "aceptacion",
      heading: "1. Aceptación",
      paragraphs: [
        `Al usar ${COMPANY.tradeName} o realizar una compra aceptas estos términos. Si no estás de acuerdo con ellos, te pedimos no usar la tienda.`,
      ],
    },
    {
      id: "cuenta",
      heading: "2. Tu cuenta",
      paragraphs: [
        "Puedes comprar con o sin cuenta. Si creas una, eres responsable de mantener la confidencialidad de tu acceso y de que tus datos sean correctos.",
      ],
    },
    {
      id: "precios",
      heading: "3. Productos y precios",
      paragraphs: [
        "Los precios se muestran en soles (S/). Hacemos lo posible por que la información de cada producto sea exacta; si detectamos un error evidente de precio o descripción antes de confirmar tu pago, te contactaremos para corregirlo o anular el pedido sin costo para ti.",
        "La disponibilidad de cada producto se indica en su página y puede cambiar sin previo aviso.",
      ],
    },
    {
      id: "pedidos-y-pagos",
      heading: "4. Pedidos y pagos",
      paragraphs: [
        "Al realizar un pedido reservamos los productos por un tiempo limitado mientras completas el pago con Yape o Plin y subes tu comprobante.",
        "El pago se considera confirmado solo cuando nuestro equipo verifica que el monto llegó a nuestra cuenta. Subir un comprobante no equivale a un pago confirmado. Si el pago no puede verificarse, el pedido puede cancelarse.",
      ],
    },
    {
      id: "envios",
      heading: "5. Entregas",
      paragraphs: [
        "Las opciones de entrega disponibles y su costo se muestran al finalizar la compra. El pedido se prepara una vez confirmado el pago. Puedes seguir su estado en la página del pedido.",
      ],
    },
    {
      id: "cambios-y-devoluciones",
      heading: "6. Cambios, devoluciones y reclamos",
      paragraphs: [
        "Para solicitar un cambio, una devolución o presentar un reclamo, escríbenos desde la página de Contacto con el número de tu pedido. Atenderemos tu solicitud conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571).",
      ],
    },
    {
      id: "propiedad",
      heading: "7. Propiedad intelectual",
      paragraphs: [
        "Las marcas, nombres comerciales y logotipos de los productos pertenecen a sus respectivos titulares. El diseño y los contenidos propios de la tienda no pueden reproducirse sin autorización.",
      ],
    },
    {
      id: "ley",
      heading: "8. Ley aplicable",
      paragraphs: [
        "Estos términos se rigen por las leyes de la República del Perú.",
        "Podemos actualizarlos; la versión vigente es la publicada en esta página con su fecha de actualización.",
      ],
    },
  ],
};
