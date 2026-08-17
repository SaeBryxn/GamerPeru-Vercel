import type { NavigationConfig } from "./types";

/**
 * Gamer Perú — Static Navigation Presentation Seed
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * 1. This file contains presentation seed configuration for the Storefront navigation shell.
 * 2. It is NOT database authority or canonical commerce catalog truth.
 * 3. Modifying this seed does not mutate catalog state.
 * 4. GP-011 (Catalog Discovery) and future catalog tasks will derive or replace
 *    public navigation dynamically from published database truth.
 * 5. Route destinations represent documented Route-Intent contracts; their destination
 *    pages are implemented by later assigned GPs.
 */
export const NAVIGATION_CONFIG: NavigationConfig = {
  announcement: {
    message: "Periféricos gaming multimarca para Perú",
  },
  brandMark: {
    label: "Gamer Perú",
    href: "/",
  },
  primaryNav: [
    {
      id: "mouses",
      label: "Mouses",
      href: "/categorias/mouses",
      sections: [
        {
          title: "Por Tipo",
          items: [
            { label: "Ultraligeros (< 45g)", href: "/categorias/mouses?tipo=ultraligeros" },
            { label: "Ergonómicos", href: "/categorias/mouses?tipo=ergonomicos" },
            { label: "Simétricos (Ambi)", href: "/categorias/mouses?tipo=simetricos" },
            { label: "Wireless 8000Hz", href: "/categorias/mouses?tipo=wireless-8k" },
          ],
        },
        {
          title: "Accesorios para Mouse",
          items: [
            { label: "Skates de Vidrio & PTFE", href: "/categorias/mouses?sub=skates" },
            { label: "Grip Tapes", href: "/categorias/mouses?sub=grip-tapes" },
            { label: "Dongles 4K / 8K", href: "/categorias/mouses?sub=dongles" },
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
    },
    {
      id: "teclados",
      label: "Teclados",
      href: "/categorias/teclados",
      sections: [
        {
          title: "Por Formato",
          items: [
            { label: "60% & 65% Compactos", href: "/categorias/teclados?formato=compactos" },
            { label: "75% & TKL", href: "/categorias/teclados?formato=tkl-75" },
            {
              label: "Magnéticos (Rapid Trigger)",
              href: "/categorias/teclados?formato=magneticos",
            },
          ],
        },
        {
          title: "Componentes & Modding",
          items: [
            { label: "Switches Magnéticos & Mecánicos", href: "/categorias/teclados?sub=switches" },
            { label: "Keycaps PBT", href: "/categorias/teclados?sub=keycaps" },
            { label: "Placas & Gaskets", href: "/categorias/teclados?sub=modding" },
          ],
        },
      ],
      brands: [
        { label: "Wooting", href: "/marcas/wooting" },
        { label: "DrunkDeer", href: "/marcas/drunkdeer" },
        { label: "ATK", href: "/marcas/atk" },
        { label: "MelGeek", href: "/marcas/melgeek" },
      ],
    },
    {
      id: "mousepads",
      label: "Mousepads",
      href: "/categorias/mousepads",
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
            { label: "Superficie Speed / Cordura", href: "/categorias/mousepads?superficie=speed" },
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
    },
    {
      id: "audio",
      label: "Audio",
      href: "/categorias/audio",
      sections: [
        {
          title: "Categorías",
          items: [
            { label: "IEMs para Gaming Competitivo", href: "/categorias/audio?tipo=iems" },
            { label: "Auriculares Open-Back", href: "/categorias/audio?tipo=open-back" },
            { label: "DACs & Amplificadores USB", href: "/categorias/audio?tipo=dacs" },
          ],
        },
      ],
      brands: [
        { label: "Moondrop", href: "/marcas/moondrop" },
        { label: "Tangzu", href: "/marcas/tangzu" },
        { label: "Truthear", href: "/marcas/truthear" },
        { label: "Sennheiser", href: "/marcas/sennheiser" },
      ],
    },
    {
      id: "accesorios",
      label: "Accesorios",
      href: "/categorias/accesorios",
      sections: [
        {
          title: "Complementos",
          items: [
            { label: "Cables Paracord & Coiled", href: "/categorias/accesorios?tipo=cables" },
            { label: "Bungees de Mouse", href: "/categorias/accesorios?tipo=bungees" },
            { label: "Soportes de Auriculares", href: "/categorias/accesorios?tipo=soportes" },
            {
              label: "Herramientas de Mantenimiento",
              href: "/categorias/accesorios?tipo=herramientas",
            },
          ],
        },
      ],
      brands: [
        { label: "Pulsar", href: "/marcas/pulsar" },
        { label: "Lamzu", href: "/marcas/lamzu" },
        { label: "WLMOUSE", href: "/marcas/wlmouse" },
      ],
    },
  ],
  utilityLinks: {
    search: { label: "Buscar productos", href: "/buscar" },
    account: { label: "Mi cuenta", href: "/cuenta" },
    wishlist: { label: "Lista de favoritos", href: "/favoritos" },
    cart: { label: "Carrito de compras", href: "/carrito" },
  },
  footerColumns: [
    {
      title: "Explorar Catálogo",
      links: [
        { label: "Mouses de Rendimiento", href: "/categorias/mouses" },
        { label: "Teclados Mecánicos & Magnéticos", href: "/categorias/teclados" },
        { label: "Mousepads de Control & Vidrio", href: "/categorias/mousepads" },
        { label: "Audio IEM para Gaming", href: "/categorias/audio" },
        { label: "Accesorios & Modding", href: "/categorias/accesorios" },
      ],
    },
    {
      title: "Atención al Cliente",
      links: [
        { label: "Centro de Ayuda", href: "/ayuda" },
        { label: "Información de Envíos", href: "/envios" },
        { label: "Cambios y Devoluciones", href: "/devoluciones" },
        { label: "Política de Privacidad", href: "/privacidad" },
        { label: "Términos y Condiciones", href: "/terminos" },
      ],
    },
  ],
};
