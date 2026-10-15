import type { StoryBlockType } from "@/lib/admin/catalog/story-builder-model";

export interface BlockLibraryGroup {
  title: string;
  types: readonly StoryBlockType[];
}

/** Picker grouping by what the editor is trying to do, not by data shape. */
export const BLOCK_LIBRARY_GROUPS: readonly BlockLibraryGroup[] = [
  {
    title: "Imágenes y video",
    types: ["hero_media", "full_bleed_image", "image_text", "gallery", "video"],
  },
  {
    title: "Destacar el producto",
    types: ["stat_highlight", "spec_feature", "comparison"],
  },
  {
    title: "Ficha y detalles",
    types: ["dimensions", "box_contents", "technical_specs"],
  },
  {
    title: "Cierre de la página",
    types: ["faq", "related_products"],
  },
];

/** What to have at hand before adding each block. */
export const BLOCK_REQUIREMENTS: Record<StoryBlockType, string> = {
  hero_media: "Un título. Imagen o video opcional.",
  full_bleed_image: "1 imagen grande.",
  image_text: "1 imagen, un título y un párrafo.",
  gallery: "De 3 a 6 imágenes.",
  video: "1 video. Póster opcional.",
  stat_highlight: "Cifras con su etiqueta.",
  spec_feature: "Título y descripción. Imagen opcional.",
  comparison: "Las columnas y filas de la tabla.",
  dimensions: "Las medidas. Plano opcional.",
  box_contents: "La lista de accesorios.",
  technical_specs: "Etiquetas y valores técnicos.",
  faq: "Preguntas con su respuesta.",
  related_products: "Otros productos del catálogo.",
};

/** Blocks offered as one-click starters on an empty story. */
export const STARTER_BLOCK_TYPES: readonly StoryBlockType[] = [
  "hero_media",
  "image_text",
  "gallery",
];

export const STORY_FLOW_STEPS: readonly { title: string; detail: string }[] = [
  { title: "Elige un bloque", detail: "El dibujo muestra cómo se verá en la página." },
  { title: "Completa su contenido", detail: "Textos e imágenes, campo por campo." },
  { title: "Guarda y revisa", detail: "Guarda el borrador y abre la vista previa." },
];
