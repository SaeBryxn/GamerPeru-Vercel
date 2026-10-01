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
    id: "compras",
    title: "Compras",
    items: [
      {
        id: "como-comprar",
        question: "¿Cómo hago un pedido?",
        answer: [
          "Elige tu producto y su variante, añádelo al carrito y finaliza la compra con tus datos y tu dirección de entrega. Al terminar verás las instrucciones de pago.",
        ],
      },
      {
        id: "metodos-de-pago",
        question: "¿Qué métodos de pago aceptan?",
        answer: [
          "Aceptamos Yape y Plin. Todos los precios de la tienda están en soles (S/).",
          "Al finalizar tu compra podrás subir la captura de tu comprobante desde la misma página.",
        ],
      },
      {
        id: "confirmacion-del-pago",
        question: "¿Cuándo queda confirmado mi pago?",
        answer: [
          "Nuestro equipo revisa cada comprobante manualmente. Subir la captura no confirma el pago por sí solo: tu pedido avanza cuando verificamos que el monto llegó a nuestra cuenta.",
          "Si dejaste tu correo, te avisamos cuando el pago queda aprobado.",
        ],
      },
      {
        id: "comprar-sin-cuenta",
        question: "¿Necesito una cuenta para comprar?",
        answer: [
          "No es obligatorio. Con una cuenta guardas tus direcciones, ves el historial de tus pedidos y puedes guardar productos en Favoritos.",
        ],
      },
    ],
  },
  {
    id: "envios",
    title: "Envíos",
    items: [
      {
        id: "envios",
        question: "¿Hacen envíos?",
        answer: [
          "Sí. Las opciones de entrega y su costo se muestran al finalizar la compra según tu dirección. Para un caso particular, escríbenos antes de comprar y te confirmamos las opciones.",
        ],
      },
      {
        id: "cuando-se-envia",
        question: "¿Cuándo se envía mi pedido?",
        answer: [
          "Preparamos el pedido una vez que verificamos tu pago. A partir de ahí, su estado se actualiza en la página del pedido.",
        ],
      },
      {
        id: "seguimiento",
        question: "¿Cómo sigo mi pedido?",
        answer: [
          "Cada pedido tiene un número y una página con su estado: pago en verificación, preparación y envío. Con cuenta lo encuentras en Mis pedidos.",
        ],
      },
      {
        id: "cambiar-pedido",
        question: "¿Puedo modificar o cancelar un pedido?",
        answer: [
          "Escríbenos lo antes posible con el número del pedido. Mientras no se haya preparado, es más sencillo ajustarlo.",
        ],
      },
    ],
  },
  {
    id: "devoluciones",
    title: "Devoluciones",
    items: [
      {
        id: "solicitar-devolucion",
        question: "¿Cómo solicito un cambio o una devolución?",
        answer: [
          "Escríbenos con el número de tu pedido y el motivo. Revisamos cada caso y te indicamos los pasos, conforme al Código de Protección y Defensa del Consumidor.",
        ],
      },
      {
        id: "producto-defectuoso",
        question: "¿Qué hago si mi producto llegó dañado o no funciona?",
        answer: [
          "Escríbenos lo antes posible con el número del pedido, una descripción del problema y fotos o un video. Con eso revisamos el caso contigo.",
        ],
      },
      {
        id: "comprobante-rechazado",
        question: "¿Qué pasa si hay un problema con mi comprobante?",
        answer: [
          "Si no podemos verificarlo (por ejemplo, el monto no coincide o la imagen no se lee), te lo indicaremos para que envíes uno nuevo.",
        ],
      },
    ],
  },
  {
    id: "soporte",
    title: "Soporte",
    items: [
      {
        id: "contacto",
        question: "¿Cómo contacto al equipo?",
        answer: [
          "Con el formulario de esta página o desde la página de Contacto. Si tu consulta es sobre un pedido, incluye su número.",
        ],
      },
      {
        id: "elegir-producto",
        question: "¿Me ayudan a elegir un producto?",
        answer: [
          "Sí. Cuéntanos qué juegas, el tamaño de tu mano y tu forma de agarre, y te recomendamos opciones del catálogo.",
        ],
      },
      {
        id: "stock",
        question: "¿Cómo sé si un producto está disponible?",
        answer: [
          "La página de cada producto indica si puedes añadirlo al carrito. Para consultas de reposición, escríbenos.",
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
