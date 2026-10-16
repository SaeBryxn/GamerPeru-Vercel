import type { BuyingGuide } from "./types";

export const MOUSEPAD_GUIDE: BuyingGuide = {
  slug: "mousepads",
  categorySlug: "mousepads",
  productNoun: "mousepads",
  title: "Guía de compra: mousepads",
  metaTitle: "Cómo elegir un mousepad gaming | Guía de compra | Gamer Perú",
  metaDescription:
    "Vidrio, control, speed o híbrido; tamaño y grosor: qué mirar al elegir un mousepad y qué modelos del catálogo cumplen cada criterio.",
  intro:
    "El mousepad decide cómo se desliza y cómo frena tu mouse tanto como el propio mouse. Elige primero la superficie según tu estilo y después el tamaño según tu sensibilidad.",
  criteria: [
    {
      id: "superficie",
      title: "Superficie",
      why: [
        "Una superficie rápida deja que el mouse se deslice con poca resistencia; una de control lo frena antes y facilita los microajustes.",
        "El vidrio es el más rápido y no se desgasta con el uso, aunque se siente distinto a la tela y conviene acompañarlo con skates adecuados.",
      ],
      options: [
        {
          id: "vidrio",
          label: "Vidrio",
          description: "Deslizamiento máximo y superficie que no se desgasta.",
          filter: { superficie: "vidrio" },
        },
        {
          id: "control",
          label: "Control",
          description: "Más fricción para frenar con precisión.",
          filter: { superficie: "control" },
        },
        {
          id: "speed",
          label: "Speed",
          description: "Tela rápida para movimientos amplios.",
          filter: { superficie: "speed" },
        },
        {
          id: "hibrido",
          label: "Híbrido",
          description: "Un equilibrio entre arranque rápido y frenado.",
          filter: { superficie: "hibrido" },
        },
      ],
    },
    {
      id: "tamano",
      title: "Tamaño",
      why: [
        "Con sensibilidad baja recorres más espacio para girar: necesitas un pad grande para no llegar al borde en medio de una pelea.",
        "Si juegas con sensibilidad alta o tienes poco espacio en el escritorio, un pad mediano basta y se acomoda mejor junto al teclado.",
      ],
      options: [
        {
          id: "grande",
          label: "Grande (450 mm de largo o más)",
          description: "Para sensibilidad baja y movimientos de brazo.",
          filter: { largo_min: "450" },
        },
        {
          id: "mediano",
          label: "Mediano (menos de 450 mm)",
          description: "Para sensibilidad media o alta y escritorios compactos.",
          filter: { largo_max: "449" },
        },
      ],
    },
    {
      id: "grosor",
      title: "Grosor",
      why: [
        "Un pad delgado mantiene la mano a la altura del escritorio. Uno más grueso amortigua y absorbe mejor las irregularidades de la mesa.",
      ],
      options: [
        {
          id: "delgado",
          label: "Delgado (hasta 3 mm)",
          description: "Sensación firme y directa.",
          filter: { grosor_max: "3" },
        },
        {
          id: "grueso",
          label: "Grueso (4 mm o más)",
          description: "Más amortiguación para la muñeca.",
          filter: { grosor_min: "4" },
        },
      ],
    },
  ],
  profiles: [
    {
      title: "Shooters tácticos",
      text: "Una superficie de control o híbrida ayuda a detener la mira justo en la cabeza; con sensibilidad baja, elige un tamaño grande.",
    },
    {
      title: "Tracking y movimientos amplios",
      text: "Vidrio o speed para que el mouse fluya sin esfuerzo al seguir objetivos.",
    },
    {
      title: "Escritorio compacto",
      text: "Un pad mediano y delgado ocupa menos espacio y se lleva fácil a torneos.",
    },
  ],
  faq: {
    id: "guia-mousepads",
    title: "Preguntas sobre mousepads",
    items: [
      {
        id: "vidrio-skates",
        question: "¿Un mousepad de vidrio desgasta los skates?",
        answer: [
          "Puede desgastarlos más rápido que la tela. Unos skates de buena calidad y limpiar la superficie con frecuencia ayudan a que duren más.",
        ],
      },
      {
        id: "limpieza",
        question: "¿Cómo limpio mi mousepad?",
        answer: [
          "Los de tela, con agua tibia y jabón neutro, dejándolos secar al aire. Los de vidrio, con un paño de microfibra y un limpiador sin alcohol abrasivo.",
        ],
      },
      {
        id: "ayuda-eleccion",
        question: "¿Me ayudan a combinar mouse y mousepad?",
        answer: [
          "Sí. Escríbenos con tu mouse, tu sensibilidad y lo que juegas, y te sugerimos opciones del catálogo.",
        ],
      },
    ],
  },
};
