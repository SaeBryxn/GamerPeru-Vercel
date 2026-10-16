import type { BuyingGuide } from "./types";

export const KEYBOARD_GUIDE: BuyingGuide = {
  slug: "teclados",
  categorySlug: "teclados",
  productNoun: "teclados",
  title: "Guía de compra: teclados gaming",
  metaTitle: "Cómo elegir un teclado gaming | Guía de compra | Gamer Perú",
  metaDescription:
    "Formato, switches magnéticos con rapid trigger o mecánicos: qué mirar al elegir un teclado gaming.",
  intro:
    "Un teclado gaming se elige por dos cosas: cuánto espacio te deja para el mouse y cómo responden sus switches. Empieza por el formato y después decide el tipo de switch.",
  criteria: [
    {
      id: "formato",
      title: "Formato",
      why: [
        "Un teclado compacto deja más espacio para mover el mouse, algo clave si juegas con sensibilidad baja.",
        "Los formatos más grandes conservan las flechas y las teclas de función, útiles si también trabajas o juegas títulos con muchos atajos.",
      ],
      options: [
        {
          id: "compacto",
          label: "60% y 65%",
          description: "Máximo espacio para el mouse.",
          filter: { formato: ["60", "65"] },
        },
        {
          id: "equilibrado",
          label: "75% y TKL",
          description: "Conservan flechas y teclas de función sin teclado numérico.",
          filter: { formato: ["75", "tkl"] },
        },
      ],
    },
    {
      id: "switch",
      title: "Tipo de switch",
      why: [
        "Los switches magnéticos (efecto Hall) miden cuánto bajas la tecla. Puedes ajustar el punto de activación y usar rapid trigger, que libera la tecla apenas empiezas a soltarla: ideal para detenerte y disparar en shooters.",
        "Los mecánicos activan en un punto fijo; son más sencillos y ofrecen una gran variedad de sensaciones (lineales, táctiles o clicky).",
      ],
      options: [
        {
          id: "magnetico",
          label: "Magnéticos con rapid trigger",
          description: "Activación ajustable y respuesta inmediata.",
          filter: { tipo_switch: "magnetico" },
        },
        {
          id: "mecanico",
          label: "Mecánicos",
          description: "Punto de activación fijo y variedad de sensaciones.",
          filter: { tipo_switch: "mecanico" },
        },
      ],
    },
  ],
  profiles: [
    {
      title: "Shooters competitivos",
      text: "Switches magnéticos con rapid trigger y un formato compacto para ganar espacio de mouse.",
    },
    {
      title: "Juego y trabajo",
      text: "Un 75% o TKL conserva las flechas y las teclas de función sin quitar demasiado espacio.",
    },
  ],
  faq: {
    id: "guia-teclados",
    title: "Preguntas sobre teclados",
    items: [
      {
        id: "rapid-trigger",
        question: "¿Qué es el rapid trigger?",
        answer: [
          "Una función de los switches magnéticos: la tecla se libera en cuanto empieza a subir, sin esperar a pasar el punto de reinicio. Permite detenerte y cambiar de dirección más rápido.",
        ],
      },
      {
        id: "configuracion",
        question: "¿Cómo configuro el punto de activación?",
        answer: [
          "Desde el software o el configurador web de la marca. En el centro de software encontrarás el enlace oficial de cada una.",
        ],
      },
    ],
  },
};
