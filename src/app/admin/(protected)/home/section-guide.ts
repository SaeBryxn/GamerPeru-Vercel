import type { HomeSectionType } from "@/db/schema";
import {
  columns,
  rows,
  type WireframeShape as Shape,
} from "@/components/admin/wireframe/wireframe";

export interface HomeSectionGuide {
  label: string;
  /** What the section does on the storefront. */
  description: string;
  /** What to have at hand before editing it. */
  needs: string;
  wireframe: readonly Shape[];
}

/** Admin copy and schematic for every section type, in the storefront's visual language. */
export const HOME_SECTION_GUIDES: Record<HomeSectionType, HomeSectionGuide> = {
  video_hero: {
    label: "Portada con video",
    description:
      "Video a pantalla completa al abrir la tienda. Lleva el título principal (H1) de la página.",
    needs: "Un video MP4/WebM de hasta 25 MB con su portada, o un video de YouTube.",
    wireframe: [
      ["play", 0, 0, 120, 80],
      ["to", 46, 64, 28, 4],
      ["btn", 56, 70, 8, 6],
    ],
  },
  product_carousel: {
    label: "Carrusel de productos",
    description: "Fila de productos que se desliza sobre la portada. Los toma del catálogo.",
    needs: "Un título y de dónde salen los productos (destacados o una categoría).",
    wireframe: [
      ["t", 8, 8, 20, 4],
      ["h", 8, 15, 52, 6],
      ...columns([8, 35, 62, 89], (x): Shape[] => [
        ["img", x, 28, 23, 30],
        ["t", x, 62, 23, 4],
        ["h", x, 69, 14, 4],
      ]),
    ],
  },
  feature_video: {
    label: "Video destacado",
    description: "Video de un producto a todo el ancho con título, texto y un botón.",
    needs: "Un video con portada (o de YouTube), un título corto y el enlace del botón.",
    wireframe: [
      ["play", 0, 4, 120, 72],
      ["to", 10, 44, 20, 3],
      ["ho", 10, 50, 56, 8],
      ["to", 10, 61, 44, 3],
      ["btn", 10, 67, 22, 6],
    ],
  },
  split_showcase: {
    label: "Vitrina con beneficios",
    description: "Imagen grande a un lado y hasta cuatro beneficios de la tienda al otro.",
    needs: "Una imagen (PNG con fondo transparente queda mejor) y de 1 a 4 beneficios.",
    wireframe: [
      ["img", 6, 8, 52, 64],
      ["t", 66, 10, 36, 3],
      ["h", 66, 16, 46, 6],
      ...rows([30, 42, 54, 66], (y): Shape[] => [
        ["h", 66, y, 30, 3],
        ["t", 66, y + 5, 46, 3],
      ]),
    ],
  },
  compare_slider: {
    label: "Comparador de acabados",
    description: "Dos fotos del mismo modelo con una cortina que el cliente desliza.",
    needs: "Dos imágenes con el mismo encuadre, y el nombre de cada versión.",
    wireframe: [
      ["t", 40, 6, 40, 3],
      ["h", 34, 12, 52, 6],
      ["img", 6, 24, 54, 50],
      ["img", 60, 24, 54, 50],
      ["btn", 57, 44, 6, 10],
    ],
  },
  catalog_rail: {
    label: "Fila de una categoría",
    description: "Productos de una categoría del catálogo con un enlace a verla completa.",
    needs: "La categoría y un título.",
    wireframe: [
      ["t", 8, 8, 18, 4],
      ["h", 8, 15, 44, 6],
      ["btn", 92, 15, 20, 6],
      ...columns([8, 35, 62, 89], (x): Shape[] => [
        ["img", x, 28, 23, 30],
        ["t", x, 62, 23, 4],
        ["h", x, 69, 14, 4],
      ]),
    ],
  },
  bento_showcase: {
    label: "Mosaico de imágenes",
    description:
      "Título en dos líneas con tres imágenes en mosaico (horizontal, cuadrada y vertical).",
    needs: "Tres imágenes: una apaisada, una cuadrada y una vertical.",
    wireframe: [
      ["h", 6, 8, 40, 6],
      ["h", 6, 17, 30, 6],
      ["t", 6, 28, 40, 3],
      ["img", 52, 6, 62, 30],
      ["img", 52, 40, 29, 34],
      ["img", 85, 40, 29, 34],
    ],
  },
  community_banner: {
    label: "Banner de comunidad",
    description: "Fondo oscuro con un llamado a unirse a la comunidad (Discord u otra red).",
    needs: "Una imagen de fondo oscura y apaisada, y el enlace de la comunidad.",
    wireframe: [
      ["img", 0, 6, 120, 68],
      ["to", 10, 18, 22, 3],
      ["ho", 10, 25, 50, 7],
      ["ho", 10, 35, 40, 7],
      ["to", 10, 47, 54, 3],
      ["btn", 10, 57, 28, 8],
    ],
  },
  trust_strip: {
    label: "Franja de confianza",
    description: "Hasta cuatro garantías que la tienda puede cumplir, antes del pie de página.",
    needs: "De 1 a 4 garantías con ícono, título y una línea de texto.",
    wireframe: columns([6, 35, 64, 93], (x): Shape[] => [
      ["btn", x + 7, 24, 8, 8],
      ["h", x, 38, 22, 4],
      ["t", x, 46, 22, 3],
      ["t", x, 52, 16, 3],
    ]),
  },
};
