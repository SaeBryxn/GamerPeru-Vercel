import type { HomeSectionType } from "@/db/schema";
import { TRUST_STRIP_ICONS } from "@/lib/home/section-schemas";

export type FieldPath = readonly (string | number)[];

/** One form control, addressed by its path inside the section content. */
export type HomeField =
  | {
      kind: "text";
      path: FieldPath;
      label: string;
      max: number;
      multiline?: boolean;
      hint?: string;
    }
  | { kind: "number"; path: FieldPath; label: string; min: number; max: number; hint?: string }
  | {
      kind: "select";
      path: FieldPath;
      label: string;
      options: readonly { value: string; label: string }[];
    }
  | { kind: "category"; path: FieldPath; label: string }
  | { kind: "href"; path: FieldPath; label: string; hint: string; nullable?: boolean }
  | { kind: "image"; path: FieldPath; label: string; hint?: string }
  | { kind: "video"; path: FieldPath; label: string }
  | { kind: "selection"; path: FieldPath; label: string }
  | { kind: "productSource"; path: FieldPath; label: string }
  | {
      kind: "list";
      path: FieldPath;
      label: string;
      itemLabel: string;
      min: number;
      max: number;
      fields: readonly HomeField[];
      newItem: () => Record<string, unknown>;
    };

const TRUST_ICON_LABELS: Record<(typeof TRUST_STRIP_ICONS)[number], string> = {
  whatsapp: "WhatsApp",
  payment: "Pago verificado",
  currency: "Soles",
  catalog: "Catálogo",
  shipping: "Envío",
};

/**
 * Form layout per section type. Paths and limits mirror the payload schemas in
 * `src/lib/home/section-schemas.ts`, which validate the result on the client and again on the
 * server.
 */
export const HOME_SECTION_FIELDS: Record<HomeSectionType, readonly HomeField[]> = {
  brand_strip: [
    { kind: "text", path: ["title"], label: "Título", max: 120 },
    {
      kind: "list",
      path: ["items"],
      label: "Marcas",
      itemLabel: "Marca",
      min: 0,
      max: 24,
      fields: [
        { kind: "text", path: ["name"], label: "Nombre de la marca", max: 80 },
        { kind: "image", path: ["image"], label: "Logo o imagen" },
        {
          kind: "href",
          path: ["href"],
          label: "Enlace dentro de la tienda",
          hint: "Por ejemplo /marcas/mchose o /categorias/mouses?marca=mchose. Se abre en esta misma pestaña.",
        },
      ],
      newItem: () => ({
        name: "",
        href: "/marcas/",
        image: { mediaAssetId: null, alt: "Logo de la marca" },
      }),
    },
  ],
  video_hero: [
    {
      kind: "text",
      path: ["heading"],
      label: "Título principal (H1)",
      max: 120,
      hint: "No se ve sobre el video, pero es el título que leen Google y los lectores de pantalla.",
    },
    { kind: "text", path: ["scrollHintLabel"], label: "Texto del botón para bajar", max: 60 },
    { kind: "video", path: ["video"], label: "Video de portada" },
  ],
  product_carousel: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 60 },
    { kind: "text", path: ["title"], label: "Título", max: 120 },
    { kind: "productSource", path: ["source"], label: "Productos que se muestran" },
    { kind: "selection", path: ["selection"], label: "Productos destacados" },
    { kind: "number", path: ["maxItems"], label: "Cantidad máxima de productos", min: 4, max: 24 },
  ],
  feature_video: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 60 },
    { kind: "text", path: ["title"], label: "Título", max: 80 },
    { kind: "text", path: ["subtitle"], label: "Subtítulo", max: 200, multiline: true },
    { kind: "text", path: ["cta", "label"], label: "Texto del botón", max: 40 },
    {
      kind: "href",
      path: ["cta", "href"],
      label: "Enlace del botón",
      hint: "Una ruta de la tienda, por ejemplo /productos/atk-a9-pro-max-white.",
    },
    { kind: "video", path: ["video"], label: "Video" },
  ],
  split_showcase: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 80 },
    { kind: "text", path: ["title"], label: "Título", max: 120 },
    {
      kind: "list",
      path: ["features"],
      label: "Beneficios",
      itemLabel: "Beneficio",
      min: 1,
      max: 4,
      fields: [
        { kind: "text", path: ["title"], label: "Título", max: 60 },
        { kind: "text", path: ["description"], label: "Descripción", max: 200, multiline: true },
      ],
      newItem: () => ({ title: "", description: "" }),
    },
    {
      kind: "image",
      path: ["image"],
      label: "Imagen",
      hint: "Se ve mejor un PNG con fondo transparente.",
    },
  ],
  compare_slider: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 80 },
    { kind: "text", path: ["title"], label: "Título", max: 120 },
    { kind: "text", path: ["left", "kicker"], label: "Lado izquierdo: antetítulo", max: 40 },
    { kind: "text", path: ["left", "name"], label: "Lado izquierdo: nombre", max: 40 },
    { kind: "image", path: ["left", "image"], label: "Lado izquierdo: imagen" },
    { kind: "text", path: ["right", "kicker"], label: "Lado derecho: antetítulo", max: 40 },
    { kind: "text", path: ["right", "name"], label: "Lado derecho: nombre", max: 40 },
    {
      kind: "image",
      path: ["right", "image"],
      label: "Lado derecho: imagen",
      hint: "Usa el mismo encuadre que la imagen izquierda.",
    },
  ],
  catalog_rail: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 60 },
    { kind: "text", path: ["title"], label: "Título", max: 120 },
    { kind: "category", path: ["categorySlug"], label: "Categoría" },
    { kind: "text", path: ["seeAllLabel"], label: "Texto del enlace «ver todo»", max: 40 },
    { kind: "selection", path: ["selection"], label: "Productos destacados" },
    { kind: "number", path: ["maxItems"], label: "Cantidad máxima de productos", min: 4, max: 24 },
  ],
  bento_showcase: [
    { kind: "text", path: ["title", 0], label: "Título, primera línea", max: 60 },
    { kind: "text", path: ["title", 1], label: "Título, segunda línea (en color)", max: 60 },
    { kind: "text", path: ["description"], label: "Descripción", max: 300, multiline: true },
    { kind: "image", path: ["images", 0], label: "Imagen horizontal" },
    { kind: "image", path: ["images", 1], label: "Imagen cuadrada" },
    { kind: "image", path: ["images", 2], label: "Imagen vertical" },
  ],
  community_banner: [
    { kind: "text", path: ["eyebrow"], label: "Antetítulo", max: 60 },
    { kind: "text", path: ["title", 0], label: "Título, primera línea", max: 60 },
    { kind: "text", path: ["title", 1], label: "Título, segunda línea", max: 60 },
    { kind: "text", path: ["description"], label: "Descripción", max: 300, multiline: true },
    { kind: "text", path: ["ctaLabel"], label: "Texto del botón", max: 40 },
    {
      kind: "href",
      path: ["ctaHref"],
      label: "Enlace de la comunidad",
      hint: "https de Discord, WhatsApp o una red social. Vacío usa el Discord configurado.",
      nullable: true,
    },
    {
      kind: "image",
      path: ["background"],
      label: "Imagen de fondo",
      hint: "Apaisada y oscura, para que el texto blanco se lea.",
    },
  ],
  trust_strip: [
    {
      kind: "list",
      path: ["items"],
      label: "Garantías",
      itemLabel: "Garantía",
      min: 1,
      max: 4,
      fields: [
        {
          kind: "select",
          path: ["icon"],
          label: "Ícono",
          options: TRUST_STRIP_ICONS.map((icon) => ({
            value: icon,
            label: TRUST_ICON_LABELS[icon],
          })),
        },
        { kind: "text", path: ["title"], label: "Título", max: 60 },
        { kind: "text", path: ["description"], label: "Descripción", max: 160 },
      ],
      newItem: () => ({ icon: "catalog", title: "", description: "" }),
    },
  ],
};
