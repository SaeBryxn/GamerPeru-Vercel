import type { BuyingGuide } from "./types";

export const MOUSE_GUIDE: BuyingGuide = {
  slug: "mouses",
  categorySlug: "mouses",
  productNoun: "mouses",
  title: "Guía de compra: mouses gaming",
  metaTitle: "Cómo elegir un mouse gaming | Guía de compra | Gamer Perú",
  metaDescription:
    "Peso, forma, polling rate y batería: qué mirar al elegir un mouse gaming y qué modelos del catálogo cumplen cada criterio.",
  intro:
    "No existe un mouse ideal para todos. Lo que importa es cómo agarras el mouse, cuánto lo mueves y qué juegas. Estos son los criterios que más cambian la experiencia, con los modelos del catálogo que cumplen cada uno.",
  criteria: [
    {
      id: "peso",
      title: "Peso",
      why: [
        "Un mouse ligero arranca y frena con menos esfuerzo, algo que se nota en los flicks y en sesiones largas con sensibilidad baja.",
        "Si juegas con sensibilidad alta y mueves sobre todo la muñeca, unos gramos de más no te molestarán tanto y pueden darte un control más estable.",
      ],
      options: [
        {
          id: "ultraligero",
          label: "Ultraligero (hasta 55 g)",
          description: "Para tracking rápido y jugadores de brazo.",
          filter: { peso_max: "55" },
        },
        {
          id: "ligero",
          label: "Ligero (55 a 70 g)",
          description: "El punto medio entre agilidad y estabilidad.",
          filter: { peso_min: "55", peso_max: "70" },
        },
        {
          id: "estandar",
          label: "Más de 70 g",
          description: "Más inercia, útil para apuntar de forma estable.",
          filter: { peso_min: "70" },
        },
      ],
    },
    {
      id: "forma",
      title: "Forma y agarre",
      why: [
        "La forma decide si el mouse calza con tu mano. Un simétrico funciona bien en claw y fingertip y sirve para zurdos; un ergonómico apoya mejor la palma de la mano derecha.",
        "Mide tu mano de la muñeca a la punta del dedo medio. Por debajo de 18 cm suelen ir mejor los modelos compactos; por encima de 19 cm, los medianos o grandes.",
      ],
      options: [
        {
          id: "simetrico",
          label: "Simétrico",
          description: "Versátil para claw y fingertip; apto para zurdos.",
          filter: { forma: "simetrico" },
        },
        {
          id: "ergonomico",
          label: "Ergonómico",
          description: "Pensado para apoyar toda la palma de la mano derecha.",
          filter: { forma: "ergonomico" },
        },
      ],
    },
    {
      id: "polling",
      title: "Polling rate",
      why: [
        "Es cuántas veces por segundo el mouse informa su posición. A 1000 Hz lo hace cada 1 ms; a 8000 Hz, cada 0,125 ms, con un movimiento más fluido en monitores de alta frecuencia.",
        "8K exige más al procesador y gasta más batería. Aprovéchalo si tu monitor supera los 240 Hz y tu PC tiene margen; si no, 1000 o 2000 Hz siguen siendo una gran opción.",
      ],
      options: [
        {
          id: "8k",
          label: "8000 Hz (8K)",
          description: "Máxima fluidez en monitores de 240 Hz o más.",
          filter: { polling_min: "8000" },
        },
        {
          id: "2k-4k",
          label: "2000 a 4000 Hz",
          description: "Respuesta muy alta con menor consumo que 8K.",
          filter: { polling_min: "2000", polling_max: "4000" },
        },
        {
          id: "1k",
          label: "Hasta 1000 Hz",
          description: "El estándar de siempre, con la mayor autonomía.",
          filter: { polling_max: "1000" },
        },
      ],
    },
    {
      id: "bateria",
      title: "Batería",
      why: [
        "En los mouses inalámbricos la autonomía depende sobre todo del polling rate: el mismo mouse dura mucho menos a 8K que a 1000 Hz.",
        "Si juegas varias horas al día, una batería grande te evita cargarlo a mitad de semana.",
      ],
      options: [
        {
          id: "larga",
          label: "100 h o más",
          description: "Cargas espaciadas aun con uso diario.",
          filter: { bateria_min: "100" },
        },
        {
          id: "media",
          label: "60 h o más",
          description: "Suficiente para una semana de juego normal.",
          filter: { bateria_min: "60" },
        },
      ],
    },
  ],
  profiles: [
    {
      title: "Shooters tácticos (Valorant, CS2)",
      text: "Sensibilidad baja y mucho movimiento de brazo: prioriza un mouse ligero y una forma con la que puedas frenar con precisión.",
    },
    {
      title: "Tracking (Apex, Overwatch)",
      text: "Seguir objetivos en movimiento premia la fluidez: un polling alto y un mouse ligero ayudan a mantener la mira suave.",
    },
    {
      title: "Uso mixto y MOBA",
      text: "Muchos clics y sesiones largas: busca una forma cómoda para tu mano y una batería que no te obligue a cargar seguido.",
    },
  ],
  faq: {
    id: "guia-mouses",
    title: "Preguntas sobre mouses",
    items: [
      {
        id: "8k-necesario",
        question: "¿Necesito un mouse de 8000 Hz?",
        answer: [
          "No es imprescindible. Notarás la diferencia sobre todo con monitores de 240 Hz o más y un PC con margen de procesador. Con 1000 Hz se compite sin problema.",
        ],
      },
      {
        id: "zurdos",
        question: "Soy zurdo, ¿qué mouse me conviene?",
        answer: [
          "Un modelo simétrico. Los ergonómicos suelen estar diseñados para la mano derecha.",
        ],
      },
      {
        id: "ayuda-eleccion",
        question: "¿Pueden recomendarme un modelo?",
        answer: [
          "Sí. Escríbenos con el tamaño de tu mano, tu agarre y lo que juegas, y te sugerimos opciones del catálogo.",
        ],
      },
    ],
  },
};
