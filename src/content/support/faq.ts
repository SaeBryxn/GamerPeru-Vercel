/**
 * Storefront FAQ. Answers describe how the store works today and make no delivery-time,
 * stock or warranty promises (see docs/design/GLOBAL_NAVIGATION_IMPLEMENTATION.md, content
 * boundary). Anything that depends on a case points the customer to the contact page.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string[];
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "compras-y-pagos",
    title: "Compras y pagos",
    items: [
      {
        id: "metodos-de-pago",
        question: "¿Qué métodos de pago aceptan?",
        answer: [
          "Aceptamos Yape y Plin. Todos los precios de la tienda están en soles (S/).",
          "Al finalizar tu compra verás las instrucciones de pago y podrás subir la captura de tu comprobante desde la misma página.",
        ],
      },
      {
        id: "confirmacion-del-pago",
        question: "¿Cuándo queda confirmado mi pago?",
        answer: [
          "Nuestro equipo revisa cada comprobante manualmente. Subir la captura no confirma el pago por sí solo: tu pedido avanza cuando verificamos que el monto llegó a nuestra cuenta.",
          "Puedes seguir el estado en la página de confirmación de tu pedido o, si tienes cuenta, en Mis pedidos. Si dejaste tu correo, también te avisamos por ahí.",
        ],
      },
      {
        id: "comprar-sin-cuenta",
        question: "¿Necesito una cuenta para comprar?",
        answer: [
          "No es obligatorio. Con una cuenta guardas tus direcciones, ves el historial de tus pedidos y puedes guardar productos en Favoritos.",
        ],
      },
      {
        id: "comprobante-rechazado",
        question: "¿Qué pasa si hay un problema con mi comprobante?",
        answer: [
          "Si no podemos verificarlo (por ejemplo, el monto no coincide o la imagen no se lee), te lo indicaremos para que envíes uno nuevo. Si tienes dudas, escríbenos desde la página de Contacto con el número de tu pedido.",
        ],
      },
    ],
  },
  {
    id: "pedidos-y-envios",
    title: "Pedidos y envíos",
    items: [
      {
        id: "seguimiento",
        question: "¿Cómo sigo mi pedido?",
        answer: [
          "Cada pedido tiene un número y una página con su estado: pago en verificación, preparación y envío. Con cuenta lo encuentras en Mis pedidos.",
        ],
      },
      {
        id: "envios",
        question: "¿Hacen envíos?",
        answer: [
          "Sí. Las opciones de entrega y su costo se muestran al finalizar la compra según tu dirección. Para un caso particular, escríbenos antes de comprar y te confirmamos las opciones.",
        ],
      },
      {
        id: "cambiar-pedido",
        question: "¿Puedo modificar o cancelar un pedido?",
        answer: [
          "Escríbenos lo antes posible desde Contacto con el número del pedido. Mientras el pedido no se haya preparado, es más sencillo ajustarlo.",
        ],
      },
    ],
  },
  {
    id: "productos",
    title: "Productos",
    items: [
      {
        id: "marcas",
        question: "¿Qué marcas venden?",
        answer: [
          "Somos una tienda multimarca de periféricos gaming: mouses, mousepads y accesorios. Puedes ver todas las marcas disponibles en el menú Productos.",
        ],
      },
      {
        id: "stock",
        question: "¿Cómo sé si un producto está disponible?",
        answer: [
          "La página de cada producto indica si puedes añadirlo al carrito. Si una variante no está disponible, el botón lo indica. Para consultas de reposición, escríbenos.",
        ],
      },
      {
        id: "elegir-producto",
        question: "¿Me ayudan a elegir?",
        answer: [
          "Sí. Cuéntanos qué juegas, el tamaño de tu mano y tu forma de agarre desde Contacto o por WhatsApp, y te recomendamos opciones del catálogo.",
        ],
      },
    ],
  },
  {
    id: "cuenta",
    title: "Tu cuenta",
    items: [
      {
        id: "favoritos",
        question: "¿Cómo guardo productos para después?",
        answer: [
          "Toca el corazón en cualquier producto. Con tu sesión iniciada, los encontrarás en Mi cuenta → Favoritos.",
        ],
      },
      {
        id: "datos-personales",
        question: "¿Cómo actualizo o elimino mis datos?",
        answer: [
          "Puedes editar tus datos en Mi cuenta → Datos personales. Para solicitar el acceso, la rectificación o la eliminación de tu información, revisa nuestra Política de privacidad.",
        ],
      },
    ],
  },
];
