import type { FooterColumn, NavigationConfig, NavLink } from "./types";

/**
 * Gamer Perú — Static Navigation Presentation Seed
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * 1. This file contains presentation seed configuration for the Storefront navigation shell.
 * 2. It emits canonical GP-013 parameter destinations.
 * 3. Modifying this seed does not mutate catalog state.
 */
const PRODUCT_TYPES: NavLink[] = [
  { label: "Mouses gaming", href: "/categorias/mouses" },
  { label: "Mousepads", href: "/categorias/mousepads" },
  { label: "Teclados", href: "/categorias/teclados" },
  { label: "Skates", href: "/categorias/accesorios?tipo_accesorio=skates" },
  { label: "Grip tapes", href: "/categorias/accesorios?tipo_accesorio=grip-tapes" },
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
      href: "/buscar",
      menuLayout: "products",
      sections: [{ title: "Colecciones", items: PRODUCT_TYPES }],
    },
    {
      id: "mouses",
      label: "Mouses",
      href: "/categorias/mouses",
      menuLayout: "series",
      series: [
        {
          title: "Serie G",
          items: [
            { label: "G Wireless", href: "/buscar?q=serie%20g" },
            { label: "G Edición Especial", href: "/buscar?q=serie%20g%20edicion" },
          ],
        },
        {
          title: "Serie X",
          items: [
            { label: "X Mini", href: "/buscar?q=serie%20x%20mini" },
            { label: "X Pro", href: "/buscar?q=serie%20x%20pro" },
            { label: "X Max", href: "/buscar?q=serie%20x%20max" },
          ],
        },
        {
          title: "Ediciones Limitadas",
          items: [{ label: "Colección Magnesio", href: "/buscar?q=edicion%20limitada" }],
        },
        {
          title: "Serie M",
          items: [
            { label: "M Standard", href: "/buscar?q=serie%20m" },
            { label: "M Magnesio", href: "/buscar?q=serie%20m%20magnesio" },
          ],
        },
      ],
      guide: { label: "Guía de compra", href: "/guia-de-compra/mouses" },
      promos: [
        {
          title: "Serie G",
          href: "/buscar?q=serie%20g",
          image: "/media/mega-menu/angulo-1.png",
        },
        {
          title: "Serie M",
          href: "/buscar?q=serie%20m",
          image: "/media/mega-menu/angulo-3.png",
          badge: "Nuevo",
        },
      ],
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
      brands: [
        { label: "WLMOUSE", href: "/marcas/wlmouse" },
        { label: "Pulsar", href: "/marcas/pulsar" },
        { label: "Lamzu", href: "/marcas/lamzu" },
        { label: "ATK / VXE", href: "/marcas/atk" },
        { label: "Ninjutso", href: "/marcas/ninjutso" },
      ],
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
      series: [
        {
          title: "Serie 63 HE",
          items: [
            { label: "63 HE Magnético", href: "/buscar?q=63%20he" },
            { label: "63 HE Edición Aluminio", href: "/buscar?q=63%20he%20aluminio" },
          ],
        },
        {
          title: "Serie 75 HE",
          items: [
            { label: "75 HE Rapid Trigger", href: "/buscar?q=75%20he" },
            { label: "75 HE Wireless", href: "/buscar?q=75%20he%20wireless" },
          ],
        },
        {
          title: "Accesorios",
          items: [
            { label: "Keycaps PBT", href: "/categorias/accesorios?tipo_accesorio=keycaps" },
            { label: "Switches", href: "/categorias/accesorios?tipo_accesorio=switches" },
          ],
        },
      ],
      guide: { label: "Guía de compra", href: "/guia-de-compra/teclados" },
      promos: [
        {
          title: "Serie 63 HE",
          href: "/buscar?q=63%20he",
          image: "/media/mega-menu/keyboard/producto-1-angulo-1.png",
          badge: "Agotado",
        },
        {
          title: "Serie 75 HE",
          href: "/buscar?q=75%20he",
          image: "/media/mega-menu/keyboard/producto-2-angulo-1.png",
          badge: "Nuevo",
        },
      ],
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
      brands: [
        { label: "Wooting", href: "/marcas/wooting" },
        { label: "DrunkDeer", href: "/marcas/drunkdeer" },
        { label: "ATK", href: "/marcas/atk" },
        { label: "MelGeek", href: "/marcas/melgeek" },
      ],
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
      brands: [
        { label: "Moondrop", href: "/marcas/moondrop" },
        { label: "Tangzu", href: "/marcas/tangzu" },
        { label: "Truthear", href: "/marcas/truthear" },
        { label: "Sennheiser", href: "/marcas/sennheiser" },
      ],
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
      menuLayout: "grid",
      tiles: [
        {
          title: "Vidrio",
          href: "/categorias/mousepads?superficie=vidrio",
          image: "/media/mega-menu/mousepad/producto-1-angulo-1.png",
        },
        {
          title: "Control",
          href: "/categorias/mousepads?superficie=control",
          image: "/media/mega-menu/mousepad/producto-2-angulo-1.png",
        },
        {
          title: "Speed",
          href: "/categorias/mousepads?superficie=speed",
          image: "/media/mega-menu/mousepad/producto-3-angulo-1.png",
        },
        {
          title: "Deskmat XXL",
          href: "/categorias/mousepads?tamano=xxl",
          image: "/media/mega-menu/mousepad/producto-4-angulo-1.png",
        },
      ],
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
      brands: [
        { label: "Artisan", href: "/marcas/artisan" },
        { label: "Lethal Gaming Gear", href: "/marcas/lgg" },
        { label: "Pulsar Superglide", href: "/marcas/pulsar" },
        { label: "Lamzu", href: "/marcas/lamzu" },
      ],
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
          image: "/media/mega-menu/software/mouse.png",
          tone: "feature",
        },
        {
          title: "TECLADO",
          href: "/software/teclado",
          image: "/media/mega-menu/software/keyboard.png",
        },
        {
          title: "DONGLE 8K",
          href: "/software/dongle",
          image: "/media/mega-menu/software/dongle.png",
        },
        {
          title: "FIRMWARE",
          href: "/software/firmware",
          image: "/media/mega-menu/software/firmware.png",
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
