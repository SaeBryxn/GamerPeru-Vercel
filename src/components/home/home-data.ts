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
      kind: "abstract",
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
    media: {
      kind: "abstract",
    },
  },
  categories: [
    {
      id: "mouses",
      title: "Mouses",
      subtitle: "Ultraligeros y ergonómicos",
      href: "/categorias/mouses",
      theme: "dark",
      media: {
        kind: "abstract",
      },
    },
    {
      id: "teclados",
      title: "Teclados",
      subtitle: "Switches magnéticos y mecánicos",
      href: "/categorias/teclados",
      theme: "neutral",
      media: {
        kind: "abstract",
      },
    },
    {
      id: "mousepads",
      title: "Mousepads",
      subtitle: "Superficies de control y velocidad",
      href: "/categorias/mousepads",
      theme: "light",
      media: {
        kind: "abstract",
      },
    },
    {
      id: "audio",
      title: "Audio",
      subtitle: "Monitoreo IEM y sonido espacial",
      href: "/categorias/audio",
      theme: "neutral",
      media: {
        kind: "abstract",
      },
    },
    {
      id: "accesorios",
      title: "Accesorios",
      subtitle: "Skates, grip tapes y dongles 8K",
      href: "/categorias/accesorios",
      theme: "light",
      media: {
        kind: "abstract",
      },
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
        media: {
          kind: "abstract",
        },
      },
      {
        id: "gear-teclados",
        title: "Teclados magnéticos",
        categoryLabel: "Teclados",
        href: "/categorias/teclados?formato=magneticos",
        media: {
          kind: "abstract",
        },
      },
      {
        id: "gear-mousepads",
        title: "Mousepads de control",
        categoryLabel: "Mousepads",
        href: "/categorias/mousepads",
        media: {
          kind: "abstract",
        },
      },
      {
        id: "gear-accesorios",
        title: "Dongles y accesorios",
        categoryLabel: "Accesorios",
        href: "/categorias/mouses?sub=dongles",
        media: {
          kind: "abstract",
        },
      },
    ],
  },
  technicalEditorial: {
    eyebrow: "Rendimiento Extremo",
    title: "Tecnología para respuesta instantánea",
    description:
      "Las plataformas modernas pueden alcanzar frecuencias de sondeo de hasta 8000Hz e intervalos mínimos de reporte para juego competitivo.",
    stats: [
      {
        value: "8000Hz",
        label: "Tasa de sondeo ultra-alta",
        description: "Frecuencia de sondeo hasta 8000 reportes por segundo",
      },
      {
        value: "0.125ms",
        label: "Intervalo nominal de sondeo",
        description: "Actualización continua cada 0.125ms (1000ms / 8000Hz)",
      },
    ],
    cta: {
      label: "Ver tecnología de mouses",
      href: "/categorias/mouses",
    },
    media: {
      kind: "abstract",
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
