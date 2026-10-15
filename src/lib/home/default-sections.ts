import type { HomeSection } from "./section-schemas";

/**
 * The home as it shipped before it became administrable (ADR-012).
 *
 * Seeded by migration 0021 with these exact ids and contents, and rendered whenever the section
 * table is empty or unreachable, and in E2E fixture runs. Changing this list does not change a
 * seeded database; it only changes the fallback.
 */
export const DEFAULT_HOME_SECTIONS: readonly HomeSection[] = [
  {
    id: "01a1c000-0000-7000-8000-000000000001",
    type: "video_hero",
    displayOrder: 0,
    isVisible: true,
    content: {
      heading: "Periféricos gaming de alto rendimiento",
      scrollHintLabel: "Desliza para ver la tienda",
      video: { kind: "youtube", videoId: "2gX-vyQwHsA" },
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000002",
    type: "product_carousel",
    displayOrder: 1,
    isVisible: true,
    content: {
      eyebrow: "Colección",
      title: "Lo que tenemos disponible",
      source: { kind: "showcase" },
      maxItems: 16,
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000003",
    type: "feature_video",
    displayOrder: 2,
    isVisible: true,
    content: {
      eyebrow: "Nueva generación",
      title: "ATK A9 PRO MAX",
      subtitle: "El mouse insignia de ATK, disponible en Gamer Perú.",
      cta: { label: "Ver más", href: "/productos/atk-a9-pro-max-white" },
      video: { kind: "youtube", videoId: "3nAqLAV8JN0" },
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000004",
    type: "split_showcase",
    displayOrder: 3,
    isVisible: true,
    content: {
      eyebrow: "Multimarca · Precios en soles · Soporte local",
      title: "Armado para competir",
      features: [
        {
          title: "Marcas que cuestan encontrar",
          description: "Trabajamos con ATK, Mchose, JINMS y X-Raypad.",
        },
        {
          title: "Precios en soles",
          description: "Todo el catálogo en PEN, sin conversiones ni sorpresas al pagar.",
        },
        {
          title: "Pago con Yape o Plin",
          description: "Coordinamos y verificamos cada pago contigo antes de despachar.",
        },
        {
          title: "Atención por WhatsApp",
          description: "Te responde una persona del equipo, no un robot.",
        },
      ],
      image: { mediaAssetId: null, alt: "Mouse gaming destacado de Gamer Perú" },
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000005",
    type: "compare_slider",
    displayOrder: 4,
    isVisible: true,
    content: {
      eyebrow: "Dos acabados del mismo modelo",
      title: "Elige el tuyo.",
      left: {
        kicker: "Clásico",
        name: "Negro",
        image: { mediaAssetId: null, alt: "Mouse gaming en color negro, vista de perfil" },
      },
      right: {
        kicker: "Limpio",
        name: "Blanco",
        image: { mediaAssetId: null, alt: "Mouse gaming en color blanco, vista de perfil" },
      },
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000006",
    type: "catalog_rail",
    displayOrder: 5,
    isVisible: true,
    content: {
      eyebrow: "Mouses",
      title: "Nuestros mouses",
      categorySlug: "mouses",
      seeAllLabel: "Ver todos",
      maxItems: 12,
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000007",
    type: "bento_showcase",
    displayOrder: 6,
    isVisible: true,
    content: {
      title: ["Explora nuestros", "mousepads"],
      description:
        "Superficies de control y de velocidad, en tamaño grande o compacto según tu sensibilidad.",
      images: [
        { mediaAssetId: null, alt: "Mousepad grande sobre un escritorio" },
        { mediaAssetId: null, alt: "Detalle del borde cosido de un mousepad" },
        { mediaAssetId: null, alt: "Mousepad con diseño ilustrado" },
      ],
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000008",
    type: "catalog_rail",
    displayOrder: 7,
    isVisible: true,
    content: {
      eyebrow: "Mousepads",
      title: "Nuestros mousepads",
      categorySlug: "mousepads",
      seeAllLabel: "Ver todos",
      maxItems: 12,
    },
  },
  {
    id: "01a1c000-0000-7000-8000-000000000009",
    type: "community_banner",
    displayOrder: 8,
    isVisible: true,
    content: {
      eyebrow: "Gamer Perú",
      title: ["Únete a nuestra", "comunidad"],
      description:
        "Novedades, lanzamientos y recomendaciones directo del equipo que arma la tienda.",
      ctaLabel: "Entrar al Discord",
      ctaHref: null,
      background: { mediaAssetId: null, alt: "Ilustración de la comunidad Gamer Perú" },
    },
  },
  {
    id: "01a1c000-0000-7000-8000-00000000000a",
    type: "trust_strip",
    displayOrder: 9,
    isVisible: true,
    content: {
      items: [
        {
          icon: "whatsapp",
          title: "Atención por WhatsApp",
          description: "Te responde una persona del equipo.",
        },
        {
          icon: "payment",
          title: "Pago con Yape o Plin",
          description: "Verificamos cada pago al coordinar tu pedido.",
        },
        {
          icon: "currency",
          title: "Precios en soles",
          description: "Todo el catálogo en PEN, sin conversiones.",
        },
        {
          icon: "catalog",
          title: "Catálogo multimarca",
          description: "ATK, Mchose, JINMS y X-Raypad.",
        },
      ],
    },
  },
];
