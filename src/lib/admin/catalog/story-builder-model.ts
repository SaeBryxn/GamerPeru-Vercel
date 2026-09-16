import { canonicalJsonStringify } from "./mutation-request";
import type { AuthoringStoryBlock, AuthoringStoryDocument } from "./story-validation";

export const STORY_BUILDER_MAX_BLOCKS = 30;

export type StoryBlockType = AuthoringStoryBlock["type"];
export type StoryLifecycle = "NO_STORY" | "DRAFT_ONLY" | "PUBLISHED_ONLY" | "DRAFT_OVER_PUBLISHED";

export interface StoryLifecycleSummary {
  lifecycle: StoryLifecycle;
  draftRevisionNumber: number | null;
  publishedRevisionNumber: number | null;
  publishedAt: string | null;
}

export interface StoryBlockDefinition {
  type: StoryBlockType;
  label: string;
  description: string;
}

export const STORY_BLOCK_LIBRARY = [
  {
    type: "hero_media",
    label: "Portada multimedia",
    description: "Encabezado de apertura con texto y medios opcionales.",
  },
  {
    type: "full_bleed_image",
    label: "Imagen a todo lo ancho",
    description: "Una imagen protagonista con texto alternativo y pie opcional.",
  },
  {
    type: "image_text",
    label: "Imagen y texto",
    description: "Contenido editorial en dos columnas con imagen lateral.",
  },
  {
    type: "stat_highlight",
    label: "Datos destacados",
    description: "Cifras y métricas clave presentadas en conjunto.",
  },
  {
    type: "spec_feature",
    label: "Característica destacada",
    description: "Una prestación explicada con imagen y distintivo opcionales.",
  },
  {
    type: "video",
    label: "Video",
    description: "Video del producto con póster, título y descripción opcionales.",
  },
  {
    type: "gallery",
    label: "Galería",
    description: "Colección ordenada de tres a seis imágenes.",
  },
  {
    type: "comparison",
    label: "Comparación",
    description: "Tabla para contrastar características o configuraciones.",
  },
  {
    type: "dimensions",
    label: "Dimensiones",
    description: "Medidas, plano y tipos de agarre del producto.",
  },
  {
    type: "box_contents",
    label: "Contenido de la caja",
    description: "Lista ordenada de accesorios y elementos incluidos.",
  },
  {
    type: "technical_specs",
    label: "Especificaciones técnicas",
    description: "Grupos estructurados de etiquetas y valores técnicos.",
  },
  {
    type: "faq",
    label: "Preguntas frecuentes",
    description: "Preguntas y respuestas visibles en la historia publicada.",
  },
  {
    type: "related_products",
    label: "Productos relacionados",
    description: "Selección explícita de otros productos del catálogo.",
  },
] as const satisfies readonly StoryBlockDefinition[];

export interface CompleteBuilderBlock {
  state: "COMPLETE";
  block: AuthoringStoryBlock;
}

export interface IncompleteBuilderBlock {
  state: "INCOMPLETE";
  blockId: string;
  type: StoryBlockType;
}

export type BuilderStoryBlock = CompleteBuilderBlock | IncompleteBuilderBlock;

export function getStoryBlockDefinition(type: StoryBlockType): StoryBlockDefinition {
  const definition = STORY_BLOCK_LIBRARY.find((candidate) => candidate.type === type);
  if (!definition) {
    throw new Error(`Unsupported Story block type: ${type}`);
  }
  return definition;
}

export function getStoryLifecycleText(summary: StoryLifecycleSummary): string {
  switch (summary.lifecycle) {
    case "NO_STORY":
      return "Sin historia";
    case "DRAFT_ONLY":
      return summary.draftRevisionNumber === null
        ? "Borrador"
        : `Borrador r${summary.draftRevisionNumber}`;
    case "PUBLISHED_ONLY":
      return summary.publishedRevisionNumber === null
        ? "Publicada"
        : `Publicada r${summary.publishedRevisionNumber}`;
    case "DRAFT_OVER_PUBLISHED": {
      const draft =
        summary.draftRevisionNumber === null
          ? "Borrador"
          : `Borrador r${summary.draftRevisionNumber}`;
      const published =
        summary.publishedRevisionNumber === null
          ? "Publicada"
          : `Publicada r${summary.publishedRevisionNumber}`;
      return `${draft} sobre ${published}`;
    }
  }
}

export function createBuilderDocument(document: AuthoringStoryDocument): BuilderStoryBlock[] {
  return structuredClone(document).map((block) => ({ state: "COMPLETE", block }));
}

export function createIncompleteBuilderBlock(
  type: StoryBlockType,
  idFactory: () => string = () => crypto.randomUUID()
): IncompleteBuilderBlock {
  return {
    state: "INCOMPLETE",
    blockId: idFactory(),
    type,
  };
}

export function getBuilderBlockId(block: BuilderStoryBlock): string {
  return block.state === "COMPLETE" ? block.block.blockId : block.blockId;
}

export function getBuilderBlockType(block: BuilderStoryBlock): StoryBlockType {
  return block.state === "COMPLETE" ? block.block.type : block.type;
}

export function toCompleteStoryDocument(
  document: readonly BuilderStoryBlock[]
): AuthoringStoryDocument | null {
  if (document.some((block) => block.state === "INCOMPLETE")) {
    return null;
  }

  return document.flatMap((block) =>
    block.state === "COMPLETE" ? [structuredClone(block.block)] : []
  );
}

export function isStoryBuilderDirty(
  document: readonly BuilderStoryBlock[],
  savedBaseline: AuthoringStoryDocument
): boolean {
  const completeDocument = toCompleteStoryDocument(document);
  if (completeDocument === null) {
    return true;
  }
  return canonicalJsonStringify(completeDocument) !== canonicalJsonStringify(savedBaseline);
}

export function duplicateBuilderBlock(
  document: readonly BuilderStoryBlock[],
  index: number,
  idFactory: () => string = () => crypto.randomUUID()
): BuilderStoryBlock[] {
  const source = document[index];
  if (!source || source.state !== "COMPLETE" || document.length >= STORY_BUILDER_MAX_BLOCKS) {
    return [...document];
  }

  const duplicate = structuredClone(source.block);
  duplicate.blockId = idFactory();
  const next = [...document];
  next.splice(index + 1, 0, { state: "COMPLETE", block: duplicate });
  return next;
}

export function moveBuilderBlock(
  document: readonly BuilderStoryBlock[],
  index: number,
  direction: -1 | 1
): BuilderStoryBlock[] {
  const destination = index + direction;
  if (index < 0 || index >= document.length || destination < 0 || destination >= document.length) {
    return [...document];
  }

  const next = [...document];
  const current = next[index];
  const adjacent = next[destination];
  if (!current || !adjacent) {
    return next;
  }
  next[index] = adjacent;
  next[destination] = current;
  return next;
}

export function removeBuilderBlock(
  document: readonly BuilderStoryBlock[],
  blockId: string
): BuilderStoryBlock[] {
  return document.filter((block) => getBuilderBlockId(block) !== blockId);
}
