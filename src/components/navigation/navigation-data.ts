import type { FooterColumn, NavigationConfig, NavLink } from "./types";

/**
 * Gamer Perú — Static Navigation Presentation Seed
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * 1. This file contains presentation seed configuration for the Storefront navigation shell.
 * 2. It emits canonical GP-013 parameter destinations.
 * 3. Modifying this seed does not mutate catalog state.
 * 4. `series`, `promos` and `brands` are declared empty on purpose: their presence asks
 *    getStorefrontNavigation() to fill them from published catalog data, so the seed never names
 *    a brand, product line or photo the store does not carry.
 */
const PRODUCT_TYPES: NavLink[] = [
  { label: "Mouses gaming", href: "/categorias/mouses" },
  { label: "Mousepads", href: "/categorias/mousepads" },
  { label: "Teclados", href: "/categorias/teclados" },
];

/**
 * Footer columns that never depend on the catalog. Product and brand columns are added at request
 * time from published catalog data (see resolve-navigation), so the footer never names a product
 * or brand the store does not carry.
 */
function buildFooterColumns(): FooterColumn[] {
  return [
    {
      title: "Explorar",
      links: [
        { label: "Mouses", href: "/categorias/mouses" },
        { label: "Mousepads", href: "/categorias/mousepads" },
        { label: "Accesorios", href: "/categorias/accesorios" },
        { label: "Skates", href: "/categorias/accesorios?tipo_accesorio=skates" },
        { label: "Buscar", href: "/buscar" },
      ],
    },
    {
      title: "Tu cuenta",
      links: [
        { label: "Iniciar sesión", href: "/auth/login" },
        { label: "Crear cuenta", href: "/auth/registro" },
        { label: "Mis pedidos", href: "/cuenta/pedidos" },
        { label: "Carrito", href: "/carrito" },
      ],
    },
  ];
}

export const NAVIGATION_CONFIG: NavigationConfig = {
  brandMark: {
    label: "Gamer Perú",
    href: "/",
  },
  primaryNav: [
    {
      id: "productos",
      label: "Productos",
      href: "/productos",
      menuLayout: "products",
      sections: [{ title: "Colecciones", items: PRODUCT_TYPES }],
    },
    {
      id: "mouses",
      label: "Mouses",
      href: "/categorias/mouses",
      menuLayout: "series",
      series: [],
      promos: [],
      sections: [
        {
          title: "Por Tipo",
          items: [
            { label: "Ultraligeros (< 45g)", href: "/categorias/mouses?peso_max=45" },
            { label: "Ergonómicos", href: "/categorias/mouses?forma=ergonomico" },
            { label: "Simétricos (Ambi)", href: "/categorias/mouses?forma=simetrico" },
            { label: "Polling 8000Hz", href: "/categorias/mouses?polling_min=8000" },
          ],
        },
        {
          title: "Accesorios para Mouse",
          items: [
            {
              label: "Skates de Vidrio & PTFE",
              href: "/categorias/accesorios?tipo_accesorio=skates",
            },
            { label: "Grip Tapes", href: "/categorias/accesorios?tipo_accesorio=grip-tapes" },
            { label: "Dongles 4K / 8K", href: "/categorias/accesorios?tipo_accesorio=dongles" },
          ],
        },
      ],
      brands: [],
      previews: [
        {
          title: "Ultraligeros",
          subtitle: "Shapes < 45g",
          href: "/categorias/mouses?peso_max=45",
        },
        {
          title: "Ergonómicos",
          subtitle: "Agarre natural",
          href: "/categorias/mouses?forma=ergonomico",
        },
        {
          title: "Simétricos",
          subtitle: "Claw & fingertip",
          href: "/categorias/mouses?forma=simetrico",
        },
        {
          title: "Polling 8000Hz",
          subtitle: "Respuesta ultra-rápida",
          href: "/categorias/mouses?polling_min=8000",
        },
      ],
    },
    {
      id: "teclados",
      label: "Teclados",
      href: "/categorias/teclados",
      menuLayout: "series",
      series: [],
      promos: [],
      sections: [
        {
          title: "Por Formato",
          items: [
            {
              label: "60% & 65% Compactos",
              href: "/categorias/teclados?formato=60&formato=65",
            },
            { label: "75% & TKL", href: "/categorias/teclados?formato=75&formato=tkl" },
            {
              label: "Magnéticos (Rapid Trigger)",
              href: "/categorias/teclados?tipo_switch=magnetico",
            },
          ],
        },
        {
          title: "Componentes & Modding",
          items: [
            {
              label: "Switches Magnéticos & Mecánicos",
              href: "/categorias/accesorios?tipo_accesorio=switches",
            },
            { label: "Keycaps PBT", href: "/categorias/accesorios?tipo_accesorio=keycaps" },
            { label: "Placas & Modding", href: "/categorias/accesorios?tipo_accesorio=modding" },
          ],
        },
      ],
      brands: [],
      previews: [
        {
          title: "Rapid Trigger",
          subtitle: "Switches magnéticos",
          href: "/categorias/teclados?tipo_switch=magnetico",
        },
        {
          title: "Compactos 60%",
          subtitle: "Espacio para mouse",
          href: "/categorias/teclados?formato=60&formato=65",
        },
        {
          title: "75% & TKL",
          subtitle: "Formato balanceado",
          href: "/categorias/teclados?formato=75&formato=tkl",
        },
        {
          title: "Modding",
          subtitle: "Keycaps y switches",
          href: "/categorias/accesorios?tipo_accesorio=modding",
        },
      ],
    },
    {
      id: "audio",
      label: "IEM",
      href: "/categorias/audio",
      sections: [
        {
          title: "Categorías",
          items: [
            { label: "IEMs para Gaming Competitivo", href: "/categorias/audio?tipo_audio=iem" },
            { label: "Auriculares Open-Back", href: "/categorias/audio?tipo_audio=open-back" },
            { label: "DACs & Amplificadores USB", href: "/categorias/audio?tipo_audio=dac" },
          ],
        },
      ],
      brands: [],
      previews: [
        {
          title: "IEMs Gaming",
          subtitle: "Posicionamiento sonoro",
          href: "/categorias/audio?tipo_audio=iem",
        },
        {
          title: "Open-Back",
          subtitle: "Escena sonora abierta",
          href: "/categorias/audio?tipo_audio=open-back",
        },
        {
          title: "DACs USB",
          subtitle: "Amplificación limpia",
          href: "/categorias/audio?tipo_audio=dac",
        },
      ],
    },
    {
      id: "mousepads",
      label: "Mousepads",
      href: "/categorias/mousepads",
      menuLayout: "series",
      series: [],
      promos: [],
      sections: [
        {
          title: "Por Superficie",
          items: [
            {
              label: "Superficie de Vidrio (Glass)",
              href: "/categorias/mousepads?superficie=vidrio",
            },
            {
              label: "Superficie Poron / Control",
              href: "/categorias/mousepads?superficie=control",
            },
            {
              label: "Superficie Speed / Cordura",
              href: "/categorias/mousepads?superficie=speed",
            },
          ],
        },
        {
          title: "Tamaños",
          items: [
            { label: "XL (490 × 420 mm)", href: "/categorias/mousepads?tamano=xl" },
            { label: "Deskmat XXL", href: "/categorias/mousepads?tamano=xxl" },
          ],
        },
      ],
      brands: [],
      previews: [
        {
          title: "Vidrio (Glass)",
          subtitle: "Deslizamiento extremo",
          href: "/categorias/mousepads?superficie=vidrio",
        },
        {
          title: "Poron Control",
          subtitle: "Frenado de precisión",
          href: "/categorias/mousepads?superficie=control",
        },
        {
          title: "Speed Cordura",
          subtitle: "Rapidez y durabilidad",
          href: "/categorias/mousepads?superficie=speed",
        },
        {
          title: "Deskmat XXL",
          subtitle: "Cobertura completa",
          href: "/categorias/mousepads?tamano=xxl",
        },
      ],
    },
    {
      id: "soporte",
      label: "Soporte",
      href: "/soporte",
      menuLayout: "links",
      sections: [
        {
          title: "Soporte",
          items: [
            { label: "Preguntas frecuentes", href: "/soporte/preguntas-frecuentes" },
            { label: "Contacto", href: "/soporte/contacto" },
            { label: "Distribuidores", href: "/soporte/distribuidores" },
            { label: "Tienda oficial", href: "/soporte/tienda-oficial" },
          ],
        },
      ],
    },
    {
      id: "software",
      label: "Software",
      href: "/software",
      menuLayout: "grid",
      sections: [],
      tiles: [
        {
          title: "MOUSE",
          href: "/software/mouse",
          icon: "mouse",
          tone: "feature",
        },
        {
          title: "TECLADO",
          href: "/software/teclado",
          icon: "keyboard",
        },
        {
          title: "DONGLE 8K",
          href: "/software/dongle",
          icon: "usb",
        },
        {
          title: "FIRMWARE",
          href: "/software/firmware",
          icon: "cpu",
        },
      ],
    },
  ],
  productTypes: PRODUCT_TYPES,
  utilityLinks: {
    search: { label: "Buscar productos", href: "/buscar" },
    account: { label: "Mi cuenta", href: "/cuenta" },
    cart: { label: "Carrito de compras", href: "/carrito" },
  },
  footerColumns: buildFooterColumns(),
};
