import type { HomepageData } from "./types";

/**
 * Gamer Perú — Static Homepage Presentation Seed
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * 1. This file contains presentation seed configuration for the Storefront Homepage.
 * 2. It is NOT database authority or canonical commerce catalog truth.
 * 3. Modifying this seed does not mutate catalog state.
 * 4. Contains zero fabricated prices, inventory counts, discount percentages,
 *    customer review ratings, or unauthorized commercial promises.
 * 5. Route destinations represent documented Route-Intent contracts.
 */
export const HOMEPAGE_DATA: HomepageData = {
  hero: {
    eyebrow: "Gamer Perú",
    title: "Periféricos gaming de alto rendimiento",
    description:
      "Selección curada de hardware competitivo, switches magnéticos y tecnología ultraligera para jugadores en Perú.",
    primaryCta: {
      label: "Ver mouses",
      href: "/categorias/mouses",
    },
    secondaryCta: {
      label: "Explorar categorías",
      href: "#categorias",
    },
    media: {
      mediaKind: "abstract",
      altText: "Gamer Perú — Escenario de hardware gaming",
    },
  },
  featuredEditorial: {
    eyebrow: "Diseño Competitivo",
    title: "Ingeniería ultraligera en magnesio",
    description:
      "Estructuras caladas y aleaciones avanzadas diseñadas para máxima maniobrabilidad en juego competitivo.",
    cta: {
      label: "Explorar mouses",
      href: "/categorias/mouses",
    },
    mediaAlt: "Estructura de periférico ultraligero",
  },
  categories: [
    {
      id: "mouses",
      title: "Mouses",
      subtitle: "Ultraligeros y ergonómicos",
      href: "/categorias/mouses",
      theme: "dark",
      mediaAlt: "Categoría Mouses gaming",
    },
    {
      id: "teclados",
      title: "Teclados",
      subtitle: "Switches magnéticos y mecánicos",
      href: "/categorias/teclados",
      theme: "neutral",
      mediaAlt: "Categoría Teclados gaming",
    },
    {
      id: "mousepads",
      title: "Mousepads",
      subtitle: "Superficies de control y velocidad",
      href: "/categorias/mousepads",
      theme: "light",
      mediaAlt: "Categoría Mousepads gaming",
    },
    {
      id: "audio",
      title: "Audio",
      subtitle: "Monitoreo IEM y sonido espacial",
      href: "/categorias/audio",
      theme: "neutral",
      mediaAlt: "Categoría Audio gaming",
    },
    {
      id: "accesorios",
      title: "Accesorios",
      subtitle: "Skates, grip tapes y dongles 8K",
      href: "/categorias/accesorios",
      theme: "light",
      mediaAlt: "Categoría Accesorios gaming",
    },
  ],
  curatedGear: {
    eyebrow: "Gear Destacado",
    title: "Selección Gamer Perú",
    items: [
      {
        id: "gear-mouses",
        title: "Mouses ultraligeros",
        categoryLabel: "Mouses",
        href: "/categorias/mouses?tipo=ultraligeros",
        imageAlt: "Selección de mouses ultraligeros",
      },
      {
        id: "gear-teclados",
        title: "Teclados magnéticos",
        categoryLabel: "Teclados",
        href: "/categorias/teclados?formato=magneticos",
        imageAlt: "Selección de teclados magnéticos",
      },
      {
        id: "gear-mousepads",
        title: "Mousepads de control",
        categoryLabel: "Mousepads",
        href: "/categorias/mousepads",
        imageAlt: "Selección de mousepads de control",
      },
      {
        id: "gear-accesorios",
        title: "Dongles y accesorios",
        categoryLabel: "Accesorios",
        href: "/categorias/mouses?sub=dongles",
        imageAlt: "Selección de dongles y accesorios",
      },
    ],
  },
  technicalEditorial: {
    eyebrow: "Rendimiento Extremo",
    title: "Tecnología para respuesta instantánea",
    description:
      "Las plataformas modernas pueden alcanzar tasas de sondeo de hasta 8000Hz y latencias mínimas de reporte para juego competitivo.",
    stats: [
      {
        value: "8000Hz",
        label: "Tasa de sondeo ultra-alta",
        description: "Intervalo de reporte de hasta 0.125ms",
      },
      {
        value: "0.125ms",
        label: "Latencia de transmisión",
        description: "Actualización continua en cada micro-movimiento",
      },
    ],
    cta: {
      label: "Ver tecnología de mouses",
      href: "/categorias/mouses",
    },
  },
  brands: {
    eyebrow: "Catálogo Multimarca",
    title: "Marcas",
    items: [
      { name: "WLMOUSE", slug: "wlmouse", href: "/marcas/wlmouse" },
      { name: "Pulsar", slug: "pulsar", href: "/marcas/pulsar" },
      { name: "Lamzu", slug: "lamzu", href: "/marcas/lamzu" },
      { name: "ATK", slug: "atk", href: "/marcas/atk" },
      { name: "Ninjutso", slug: "ninjutso", href: "/marcas/ninjutso" },
    ],
  },
  discoveryFooter: {
    trustFacts: [
      {
        title: "Selección multimarca",
        description: "Periféricos curados para juego competitivo y esports.",
      },
      {
        title: "Precios y pagos en PEN / S/",
        description: "Precios y transacciones transparentes en moneda nacional.",
      },
      {
        title: "Verificación manual de pagos",
        description: "Confirmación directa de comprobantes vía Yape y Plin.",
      },
      {
        title: "Plataforma enfocada en Perú",
        description: "Diseñada y operada para la comunidad gamer nacional.",
      },
    ],
    directoryColumns: [
      {
        title: "Categorías",
        links: [
          { label: "Mouses", href: "/categorias/mouses" },
          { label: "Teclados", href: "/categorias/teclados" },
          { label: "Mousepads", href: "/categorias/mousepads" },
          { label: "Audio", href: "/categorias/audio" },
          { label: "Accesorios", href: "/categorias/accesorios" },
        ],
      },
      {
        title: "Marcas",
        links: [
          { label: "WLMOUSE", href: "/marcas/wlmouse" },
          { label: "Pulsar", href: "/marcas/pulsar" },
          { label: "Lamzu", href: "/marcas/lamzu" },
          { label: "ATK", href: "/marcas/atk" },
          { label: "Ninjutso", href: "/marcas/ninjutso" },
        ],
      },
      {
        title: "Atención",
        links: [
          { label: "Centro de Ayuda", href: "/ayuda" },
          { label: "Envíos y Entregas", href: "/envios" },
          { label: "Cambios y Devoluciones", href: "/devoluciones" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Políticas de Privacidad", href: "/privacidad" },
          { label: "Términos del Servicio", href: "/terminos" },
        ],
      },
    ],
  },
};
