/** Anchors of the product editor sections, shared by the section nav and the readiness card. */
export const PRODUCT_EDITOR_SECTIONS = {
  overview: "resumen",
  general: "informacion",
  media: "imagenes",
  variants: "variantes",
  specifications: "especificaciones",
  story: "historia",
} as const;

export type ProductEditorSection =
  (typeof PRODUCT_EDITOR_SECTIONS)[keyof typeof PRODUCT_EDITOR_SECTIONS];

export interface ReadinessGuidance {
  /** Section anchor that resolves the issue. */
  section: ProductEditorSection;
  /** What the operator has to do, in plain language. */
  action: string;
}

const GUIDANCE: Record<string, ReadinessGuidance> = {
  PRODUCT_NAME_REQUIRED: { section: "informacion", action: "Escribe el nombre del producto" },
  PRODUCT_NAME_TOO_LONG: { section: "informacion", action: "Acorta el nombre del producto" },
  PRODUCT_SLUG_REQUIRED: { section: "informacion", action: "Define la URL del producto" },
  PRODUCT_SLUG_INVALID_FORMAT: {
    section: "informacion",
    action: "Corrige la URL: solo minúsculas, números y guiones",
  },
  PRODUCT_SLUG_TOO_LONG: { section: "informacion", action: "Acorta la URL del producto" },
  BRAND_NOT_FOUND: { section: "informacion", action: "Elige una marca válida" },
  BRAND_NOT_PUBLISHED: {
    section: "informacion",
    action: "Publica esa marca en Categorías y marcas",
  },
  CATEGORY_NOT_FOUND: { section: "informacion", action: "Elige una categoría válida" },
  CATEGORY_NOT_PUBLISHED: {
    section: "informacion",
    action: "Publica esa categoría en Categorías y marcas",
  },
  NO_ACTIVE_VARIANTS: { section: "variantes", action: "Activa al menos una variante" },
  VARIANT_SKU_INVALID: { section: "variantes", action: "Corrige el código SKU de la variante" },
  VARIANT_PRICE_INVALID: { section: "variantes", action: "Pon un precio válido a la variante" },
  VARIANT_ATTRIBUTES_INVALID: {
    section: "variantes",
    action: "Revisa los atributos de la variante",
  },
  SPECIFICATION_SCHEMA_INACTIVE: {
    section: "especificaciones",
    action: "La ficha técnica de esta categoría está inactiva",
  },
  PRODUCT_SPECIFICATIONS_MISSING: {
    section: "especificaciones",
    action: "Completa la ficha técnica",
  },
  SPECIFICATION_SCHEMA_MISMATCH: {
    section: "especificaciones",
    action: "Vuelve a guardar la ficha técnica",
  },
  SPECIFICATION_VERSION_MISMATCH: {
    section: "especificaciones",
    action: "Vuelve a guardar la ficha técnica",
  },
  MEDIA_VARIANT_PRODUCT_MISMATCH: {
    section: "imagenes",
    action: "Una imagen está asignada a otra variante",
  },
  PRIMARY_MEDIA_MISSING: { section: "imagenes", action: "Elige cuál es la foto principal" },
  PRIMARY_MEDIA_NOT_ATTACHED: { section: "imagenes", action: "Elige la foto principal" },
  PRIMARY_MEDIA_MUST_BE_GLOBAL: {
    section: "imagenes",
    action: "La foto principal no puede ser de una sola variante",
  },
  PRIMARY_MEDIA_INVALID_ASSET: { section: "imagenes", action: "Vuelve a subir la foto principal" },
  NO_VALID_PUBLIC_MEDIA: { section: "imagenes", action: "Sube al menos una foto" },
  MISSING_SUBTITLE: { section: "informacion", action: "Agrega un subtítulo" },
  SHORT_DESCRIPTION: { section: "informacion", action: "Amplía la descripción" },
  NO_COMPARE_AT_PRICE: { section: "variantes", action: "Agrega el precio tachado" },
  MISSING_WEIGHT: { section: "variantes", action: "Registra el peso en gramos" },
};

const FALLBACK: ReadinessGuidance = { section: "resumen", action: "Revisa este punto" };

export function getReadinessGuidance(code: string): ReadinessGuidance {
  return GUIDANCE[code] ?? FALLBACK;
}

export const SECTION_LABEL: Record<ProductEditorSection, string> = {
  resumen: "Resumen",
  informacion: "Información",
  imagenes: "Fotos",
  variantes: "Variantes y stock",
  especificaciones: "Ficha técnica",
  historia: "Historia",
};
