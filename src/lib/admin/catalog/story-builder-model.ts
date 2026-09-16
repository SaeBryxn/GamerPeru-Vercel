import { canonicalJsonStringify } from "./mutation-request";
import {
  StoryValidationError,
  validateAuthoringStoryDocument,
  type AuthoringStoryBlock,
  type AuthoringStoryDocument,
  type StoryValidationIssue,
} from "./story-validation";

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

// ----------------------------------------------------------------------------
// Local Editor Types (CHK3)
// ----------------------------------------------------------------------------

export interface EditorHeroMediaPayload {
  headline: string;
  tagline: string;
  body: string;
  mediaId?: string;
  posterMediaId?: string;
  videoMediaId?: string;
}

export interface EditorFullBleedImagePayload {
  mediaId?: string;
  altText: string;
  caption: string;
}

export interface EditorImageTextPayload {
  headline: string;
  body: string;
  mediaId?: string;
  imagePosition: "left" | "right";
}

export interface EditorStatItem {
  clientId: string;
  value: string;
  label: string;
  unit: string;
}

export interface EditorStatHighlightPayload {
  title: string;
  stats: EditorStatItem[];
}

export interface EditorSpecFeaturePayload {
  title: string;
  description: string;
  mediaId?: string;
  badge: string;
}

export interface EditorVideoPayload {
  videoMediaId?: string;
  posterMediaId?: string;
  title: string;
  caption: string;
}

export interface EditorGalleryItem {
  clientId: string;
  mediaId?: string;
  altText: string;
  caption: string;
}

export interface EditorGalleryPayload {
  title: string;
  items: EditorGalleryItem[];
}

export interface EditorComparisonRow {
  clientId: string;
  cells: string[];
}

export interface EditorComparisonPayload {
  title: string;
  headers: string[];
  rows: EditorComparisonRow[];
}

export interface EditorGripTypeItem {
  clientId: string;
  value: string;
}

export interface EditorDimensionsPayload {
  blueprintMediaId?: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  gripTypes: EditorGripTypeItem[];
}

export interface EditorBoxItem {
  clientId: string;
  title: string;
  mediaId?: string;
  count: string;
}

export interface EditorBoxContentsPayload {
  title: string;
  items: EditorBoxItem[];
}

export interface EditorTechnicalSpecItem {
  clientId: string;
  label: string;
  value: string;
}

export interface EditorTechnicalGroupItem {
  clientId: string;
  groupName: string;
  specs: EditorTechnicalSpecItem[];
}

export interface EditorTechnicalSpecsPayload {
  title: string;
  groups: EditorTechnicalGroupItem[];
}

export interface EditorFaqItem {
  clientId: string;
  question: string;
  answer: string;
}

export interface EditorFaqPayload {
  title: string;
  items: EditorFaqItem[];
}

export interface EditorRelatedProductsPayload {
  title: string;
  productIds: string[];
}

export type EditorStoryBlock =
  | { blockId: string; type: "hero_media"; payload: EditorHeroMediaPayload }
  | { blockId: string; type: "full_bleed_image"; payload: EditorFullBleedImagePayload }
  | { blockId: string; type: "image_text"; payload: EditorImageTextPayload }
  | { blockId: string; type: "stat_highlight"; payload: EditorStatHighlightPayload }
  | { blockId: string; type: "spec_feature"; payload: EditorSpecFeaturePayload }
  | { blockId: string; type: "video"; payload: EditorVideoPayload }
  | { blockId: string; type: "gallery"; payload: EditorGalleryPayload }
  | { blockId: string; type: "comparison"; payload: EditorComparisonPayload }
  | { blockId: string; type: "dimensions"; payload: EditorDimensionsPayload }
  | { blockId: string; type: "box_contents"; payload: EditorBoxContentsPayload }
  | { blockId: string; type: "technical_specs"; payload: EditorTechnicalSpecsPayload }
  | { blockId: string; type: "faq"; payload: EditorFaqPayload }
  | { blockId: string; type: "related_products"; payload: EditorRelatedProductsPayload };

export type BuilderStoryBlock = EditorStoryBlock;

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

export function getBuilderBlockId(block: EditorStoryBlock): string {
  return block.blockId;
}

export function getBuilderBlockType(block: EditorStoryBlock): StoryBlockType {
  return block.type;
}

// ----------------------------------------------------------------------------
// Local Scaffolding (Adding a new block)
// ----------------------------------------------------------------------------

export function createInitialEditorBlock(
  type: StoryBlockType,
  idFactory: () => string = () => crypto.randomUUID()
): EditorStoryBlock {
  const blockId = idFactory();
  switch (type) {
    case "hero_media":
      return {
        blockId,
        type,
        payload: {
          headline: "",
          tagline: "",
          body: "",
          mediaId: undefined,
          posterMediaId: undefined,
          videoMediaId: undefined,
        },
      };
    case "full_bleed_image":
      return {
        blockId,
        type,
        payload: {
          mediaId: undefined,
          altText: "",
          caption: "",
        },
      };
    case "image_text":
      return {
        blockId,
        type,
        payload: {
          headline: "",
          body: "",
          mediaId: undefined,
          imagePosition: "left",
        },
      };
    case "stat_highlight":
      return {
        blockId,
        type,
        payload: {
          title: "",
          stats: [{ clientId: idFactory(), value: "", label: "", unit: "" }],
        },
      };
    case "spec_feature":
      return {
        blockId,
        type,
        payload: {
          title: "",
          description: "",
          mediaId: undefined,
          badge: "",
        },
      };
    case "video":
      return {
        blockId,
        type,
        payload: {
          videoMediaId: undefined,
          posterMediaId: undefined,
          title: "",
          caption: "",
        },
      };
    case "gallery":
      return {
        blockId,
        type,
        payload: {
          title: "",
          items: [
            { clientId: idFactory(), mediaId: undefined, altText: "", caption: "" },
            { clientId: idFactory(), mediaId: undefined, altText: "", caption: "" },
            { clientId: idFactory(), mediaId: undefined, altText: "", caption: "" },
          ],
        },
      };
    case "comparison":
      return {
        blockId,
        type,
        payload: {
          title: "",
          headers: ["", ""],
          rows: [{ clientId: idFactory(), cells: ["", ""] }],
        },
      };
    case "dimensions":
      return {
        blockId,
        type,
        payload: {
          blueprintMediaId: undefined,
          lengthMm: "",
          widthMm: "",
          heightMm: "",
          gripTypes: [],
        },
      };
    case "box_contents":
      return {
        blockId,
        type,
        payload: {
          title: "",
          items: [{ clientId: idFactory(), title: "", mediaId: undefined, count: "" }],
        },
      };
    case "technical_specs":
      return {
        blockId,
        type,
        payload: {
          title: "",
          groups: [
            {
              clientId: idFactory(),
              groupName: "",
              specs: [{ clientId: idFactory(), label: "", value: "" }],
            },
          ],
        },
      };
    case "faq":
      return {
        blockId,
        type,
        payload: {
          title: "",
          items: [{ clientId: idFactory(), question: "", answer: "" }],
        },
      };
    case "related_products":
      return {
        blockId,
        type,
        payload: {
          title: "",
          productIds: [],
        },
      };
  }
}

// ----------------------------------------------------------------------------
// Hydration Boundary (Canonical AuthoringStoryDocument -> EditorStoryBlock[])
// ----------------------------------------------------------------------------

export function createEditorDocument(
  document: AuthoringStoryDocument,
  idFactory: () => string = () => crypto.randomUUID()
): EditorStoryBlock[] {
  return document.map((block): EditorStoryBlock => {
    switch (block.type) {
      case "hero_media":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            headline: block.payload.headline ?? "",
            tagline: block.payload.tagline ?? "",
            body: block.payload.body ?? "",
            mediaId: block.payload.mediaId,
            posterMediaId: block.payload.posterMediaId,
            videoMediaId: block.payload.videoMediaId,
          },
        };
      case "full_bleed_image":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            mediaId: block.payload.mediaId,
            altText: block.payload.altText ?? "",
            caption: block.payload.caption ?? "",
          },
        };
      case "image_text":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            headline: block.payload.headline ?? "",
            body: block.payload.body ?? "",
            mediaId: block.payload.mediaId,
            imagePosition: block.payload.imagePosition ?? "left",
          },
        };
      case "stat_highlight":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            stats: block.payload.stats.map((s) => ({
              clientId: idFactory(),
              value: s.value ?? "",
              label: s.label ?? "",
              unit: s.unit ?? "",
            })),
          },
        };
      case "spec_feature":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            description: block.payload.description ?? "",
            mediaId: block.payload.mediaId,
            badge: block.payload.badge ?? "",
          },
        };
      case "video":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            videoMediaId: block.payload.videoMediaId,
            posterMediaId: block.payload.posterMediaId,
            title: block.payload.title ?? "",
            caption: block.payload.caption ?? "",
          },
        };
      case "gallery":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            items: block.payload.items.map((i) => ({
              clientId: idFactory(),
              mediaId: i.mediaId,
              altText: i.altText ?? "",
              caption: i.caption ?? "",
            })),
          },
        };
      case "comparison":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            headers: [...(block.payload.headers ?? [])],
            rows: (block.payload.rows ?? []).map((r) => ({
              clientId: idFactory(),
              cells: [...r],
            })),
          },
        };
      case "dimensions":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            blueprintMediaId: block.payload.blueprintMediaId,
            lengthMm: block.payload.lengthMm !== undefined ? block.payload.lengthMm.toString() : "",
            widthMm: block.payload.widthMm !== undefined ? block.payload.widthMm.toString() : "",
            heightMm: block.payload.heightMm !== undefined ? block.payload.heightMm.toString() : "",
            gripTypes: (block.payload.gripTypes ?? []).map((g) => ({
              clientId: idFactory(),
              value: g,
            })),
          },
        };
      case "box_contents":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            items: block.payload.items.map((i) => ({
              clientId: idFactory(),
              title: i.title ?? "",
              mediaId: i.mediaId,
              count: i.count !== undefined ? i.count.toString() : "",
            })),
          },
        };
      case "technical_specs":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            groups: block.payload.groups.map((g) => ({
              clientId: idFactory(),
              groupName: g.groupName ?? "",
              specs: g.specs.map((s) => ({
                clientId: idFactory(),
                label: s.label ?? "",
                value: s.value ?? "",
              })),
            })),
          },
        };
      case "faq":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            items: block.payload.items.map((i) => ({
              clientId: idFactory(),
              question: i.question ?? "",
              answer: i.answer ?? "",
            })),
          },
        };
      case "related_products":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: block.payload.title ?? "",
            productIds: [...(block.payload.productIds ?? [])],
          },
        };
    }
  });
}

export const createBuilderDocument = createEditorDocument;

export function createIncompleteBuilderBlock(
  type: StoryBlockType,
  idFactory: () => string = () => crypto.randomUUID()
): EditorStoryBlock {
  return createInitialEditorBlock(type, idFactory);
}

export function toCompleteStoryDocument(
  document: readonly EditorStoryBlock[]
): AuthoringStoryDocument | null {
  const result = normalizeEditorStoryDocument(document);
  return result.success ? result.document : null;
}

// ----------------------------------------------------------------------------
// Normalization Boundary (EditorStoryBlock[] -> AuthoringStoryDocument)
// ----------------------------------------------------------------------------

function optionalString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requiredString(raw: string | undefined): string {
  if (raw === undefined) return "";
  return raw.trim();
}

function parseOptionalNumber(raw: string): number | undefined | unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return "INVALID_NUMERIC_TEXT";
  }
  return num;
}

function parseOptionalInteger(raw: string): number | undefined | unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (!/^-?\d+$/.test(trimmed)) {
    return "INVALID_INTEGER_TEXT";
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num)) {
    return "INVALID_INTEGER_TEXT";
  }
  return num;
}

export interface NormalizationResult {
  success: boolean;
  document: AuthoringStoryDocument | null;
  issues: StoryValidationIssue[];
}

export function normalizeEditorStoryDocument(
  editorDocument: readonly EditorStoryBlock[]
): NormalizationResult {
  const candidate = editorDocument.map((block) => {
    switch (block.type) {
      case "hero_media":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            headline: requiredString(block.payload.headline),
            tagline: optionalString(block.payload.tagline),
            body: optionalString(block.payload.body),
            mediaId: optionalString(block.payload.mediaId),
            posterMediaId: optionalString(block.payload.posterMediaId),
            videoMediaId: optionalString(block.payload.videoMediaId),
          },
        };
      case "full_bleed_image":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            mediaId: optionalString(block.payload.mediaId) ?? "",
            altText: optionalString(block.payload.altText),
            caption: optionalString(block.payload.caption),
          },
        };
      case "image_text":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            headline: requiredString(block.payload.headline),
            body: requiredString(block.payload.body),
            mediaId: optionalString(block.payload.mediaId) ?? "",
            imagePosition: block.payload.imagePosition,
          },
        };
      case "stat_highlight":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            stats: block.payload.stats.map((item) => ({
              value: requiredString(item.value),
              label: requiredString(item.label),
              unit: optionalString(item.unit),
            })),
          },
        };
      case "spec_feature":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: requiredString(block.payload.title),
            description: requiredString(block.payload.description),
            mediaId: optionalString(block.payload.mediaId),
            badge: optionalString(block.payload.badge),
          },
        };
      case "video":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            videoMediaId: optionalString(block.payload.videoMediaId) ?? "",
            posterMediaId: optionalString(block.payload.posterMediaId),
            title: optionalString(block.payload.title),
            caption: optionalString(block.payload.caption),
          },
        };
      case "gallery":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            items: block.payload.items.map((item) => ({
              mediaId: optionalString(item.mediaId) ?? "",
              altText: optionalString(item.altText),
              caption: optionalString(item.caption),
            })),
          },
        };
      case "comparison":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            headers: block.payload.headers.map((h) => requiredString(h)),
            rows: block.payload.rows.map((r) => r.cells.map((c) => requiredString(c))),
          },
        };
      case "dimensions": {
        const gripTypes = block.payload.gripTypes
          .map((g) => requiredString(g.value))
          .filter((v) => v !== "");
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            blueprintMediaId: optionalString(block.payload.blueprintMediaId),
            lengthMm: parseOptionalNumber(block.payload.lengthMm),
            widthMm: parseOptionalNumber(block.payload.widthMm),
            heightMm: parseOptionalNumber(block.payload.heightMm),
            gripTypes: gripTypes.length > 0 ? gripTypes : undefined,
          },
        };
      }
      case "box_contents":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            items: block.payload.items.map((item) => ({
              title: requiredString(item.title),
              mediaId: optionalString(item.mediaId),
              count: parseOptionalInteger(item.count),
            })),
          },
        };
      case "technical_specs":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            groups: block.payload.groups.map((g) => ({
              groupName: requiredString(g.groupName),
              specs: g.specs.map((s) => ({
                label: requiredString(s.label),
                value: requiredString(s.value),
              })),
            })),
          },
        };
      case "faq":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            items: block.payload.items.map((item) => ({
              question: requiredString(item.question),
              answer: requiredString(item.answer),
            })),
          },
        };
      case "related_products":
        return {
          blockId: block.blockId,
          type: block.type,
          payload: {
            title: optionalString(block.payload.title),
            productIds: block.payload.productIds,
          },
        };
    }
  });

  try {
    const validated = validateAuthoringStoryDocument(candidate, { allowEmpty: true });
    return {
      success: true,
      document: validated,
      issues: [],
    };
  } catch (error) {
    if (error instanceof StoryValidationError) {
      return {
        success: false,
        document: null,
        issues: error.issues,
      };
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Dirty Checking
// ----------------------------------------------------------------------------

export function isStoryBuilderDirty(
  document: readonly EditorStoryBlock[],
  savedBaseline: AuthoringStoryDocument
): boolean {
  const result = normalizeEditorStoryDocument(document);
  if (!result.success || result.document === null) {
    return true;
  }
  return canonicalJsonStringify(result.document) !== canonicalJsonStringify(savedBaseline);
}

// ----------------------------------------------------------------------------
// Operations (Duplication, Reorder, Removal)
// ----------------------------------------------------------------------------

export function duplicateEditorBlock(
  document: readonly EditorStoryBlock[],
  index: number,
  idFactory: () => string = () => crypto.randomUUID()
): EditorStoryBlock[] {
  const source = document[index];
  if (!source || document.length >= STORY_BUILDER_MAX_BLOCKS) {
    return [...document];
  }

  const newBlockId = idFactory();
  let duplicate: EditorStoryBlock;

  switch (source.type) {
    case "hero_media":
    case "full_bleed_image":
    case "image_text":
    case "spec_feature":
    case "video":
      duplicate = {
        ...structuredClone(source),
        blockId: newBlockId,
      };
      break;
    case "stat_highlight":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          stats: source.payload.stats.map((s) => ({
            ...s,
            clientId: idFactory(),
          })),
        },
      };
      break;
    case "gallery":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          items: source.payload.items.map((item) => ({
            ...item,
            clientId: idFactory(),
          })),
        },
      };
      break;
    case "comparison":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          headers: [...source.payload.headers],
          rows: source.payload.rows.map((row) => ({
            clientId: idFactory(),
            cells: [...row.cells],
          })),
        },
      };
      break;
    case "dimensions":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          ...source.payload,
          gripTypes: source.payload.gripTypes.map((g) => ({
            ...g,
            clientId: idFactory(),
          })),
        },
      };
      break;
    case "box_contents":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          items: source.payload.items.map((item) => ({
            ...item,
            clientId: idFactory(),
          })),
        },
      };
      break;
    case "technical_specs":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          groups: source.payload.groups.map((group) => ({
            clientId: idFactory(),
            groupName: group.groupName,
            specs: group.specs.map((spec) => ({
              ...spec,
              clientId: idFactory(),
            })),
          })),
        },
      };
      break;
    case "faq":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          items: source.payload.items.map((item) => ({
            ...item,
            clientId: idFactory(),
          })),
        },
      };
      break;
    case "related_products":
      duplicate = {
        blockId: newBlockId,
        type: source.type,
        payload: {
          title: source.payload.title,
          productIds: [...source.payload.productIds],
        },
      };
      break;
  }

  const next = [...document];
  next.splice(index + 1, 0, duplicate);
  return next;
}

export const duplicateBuilderBlock = duplicateEditorBlock;

export function moveEditorBlock(
  document: readonly EditorStoryBlock[],
  index: number,
  direction: -1 | 1
): EditorStoryBlock[] {
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

export const moveBuilderBlock = moveEditorBlock;

export function removeEditorBlock(
  document: readonly EditorStoryBlock[],
  blockId: string
): EditorStoryBlock[] {
  return document.filter((block) => block.blockId !== blockId);
}

export const removeBuilderBlock = removeEditorBlock;

// ----------------------------------------------------------------------------
// Path to Field ID Mapping for Validation
// ----------------------------------------------------------------------------

export function resolveTargetFromIssuePath(
  path: string,
  document: readonly EditorStoryBlock[]
): { blockId: string | null; targetId: string } {
  const blockMatch = path.match(/^blocks\[(\d+)\](?:\.(.*))?$/);
  if (!blockMatch) {
    return { blockId: null, targetId: "story-document-title" };
  }

  const blockIndex = Number(blockMatch[1]);
  const block = document[blockIndex];
  if (!block) {
    return { blockId: null, targetId: "story-document-title" };
  }

  const subPath = blockMatch[2] ?? "";
  const blockId = block.blockId;

  // Clean "payload." prefix if present
  const cleanedSubPath = subPath.startsWith("payload.")
    ? subPath.slice("payload.".length)
    : subPath;

  if (!cleanedSubPath) {
    return { blockId, targetId: `story-block-${blockId}` };
  }

  // Handle nested items like stats[0].value, items[1].mediaId, etc.
  const statMatch = cleanedSubPath.match(/^stats\[(\d+)\](?:\.(.*))?$/);
  if (statMatch && block.type === "stat_highlight") {
    const sIndex = Number(statMatch[1]);
    const prop = statMatch[2] ?? "value";
    return { blockId, targetId: `field-${blockId}-stats-${sIndex}-${prop}` };
  }

  const galleryMatch = cleanedSubPath.match(/^items\[(\d+)\](?:\.(.*))?$/);
  if (galleryMatch) {
    const iIndex = Number(galleryMatch[1]);
    const prop = galleryMatch[2] ?? "mediaId";
    return { blockId, targetId: `field-${blockId}-items-${iIndex}-${prop}` };
  }

  const headerMatch = cleanedSubPath.match(/^headers\[(\d+)\]$/);
  if (headerMatch) {
    return { blockId, targetId: `field-${blockId}-headers-${headerMatch[1]}` };
  }

  const rowMatch = cleanedSubPath.match(/^rows\[(\d+)\](?:\[(\d+)\])?$/);
  if (rowMatch) {
    const rIndex = rowMatch[1];
    const cIndex = rowMatch[2] ?? "0";
    return { blockId, targetId: `field-${blockId}-cell-${rIndex}-${cIndex}` };
  }

  const gripMatch = cleanedSubPath.match(/^gripTypes\[(\d+)\]$/);
  if (gripMatch) {
    return { blockId, targetId: `field-${blockId}-gripTypes-${gripMatch[1]}` };
  }

  const groupMatch = cleanedSubPath.match(/^groups\[(\d+)\](?:\.(.*))?$/);
  if (groupMatch) {
    const gIndex = groupMatch[1];
    const rest = groupMatch[2] ?? "";
    const specMatch = rest.match(/^specs\[(\d+)\](?:\.(.*))?$/);
    if (specMatch) {
      const sIndex = specMatch[1];
      const prop = specMatch[2] ?? "label";
      return { blockId, targetId: `field-${blockId}-groups-${gIndex}-specs-${sIndex}-${prop}` };
    }
    if (rest === "groupName") {
      return { blockId, targetId: `field-${blockId}-groups-${gIndex}-name` };
    }
    return { blockId, targetId: `field-${blockId}-groups-${gIndex}` };
  }

  const productMatch = cleanedSubPath.match(/^productIds(?:\[(\d+)\])?$/);
  if (productMatch) {
    return { blockId, targetId: `field-${blockId}-productIds` };
  }

  // Common simple fields: headline, tagline, body, mediaId, title, etc.
  return { blockId, targetId: `field-${blockId}-${cleanedSubPath}` };
}

// ----------------------------------------------------------------------------
// Action Classification (from CHK2-BR1)
// ----------------------------------------------------------------------------

export type StoryActionResultDisposition = "SUCCESS" | "DEFINITIVE_FAILURE" | "AMBIGUOUS_FAILURE";

export const DEFINITIVE_STORY_ERROR_CODES = [
  "STORY_VALIDATION_ERROR",
  "STORY_STALE_WRITE",
  "CATALOG_IDEMPOTENCY_CONFLICT",
  "CATALOG_REPLAY_INTEGRITY_ERROR",
  "STORY_LIFECYCLE_INTEGRITY",
  "STORY_LIFECYCLE_INTEGRITY_ERROR",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_STORY_NOT_FOUND",
  "STORY_DRAFT_NOT_FOUND",
  "STORY_PUBLISHED_REVISION_NOT_FOUND",
  "STORY_INVALID_REQUEST",
  "STORY_NOT_RENDERABLE",
  "FORBIDDEN",
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_UNAVAILABLE",
] as const;

export type DefinitiveStoryErrorCode = (typeof DEFINITIVE_STORY_ERROR_CODES)[number];

export function classifyStoryActionResult(result: unknown): StoryActionResultDisposition {
  if (
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    result.success === true &&
    "data" in result &&
    result.data !== null &&
    result.data !== undefined
  ) {
    return "SUCCESS";
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "code" in result &&
    typeof result.code === "string" &&
    (DEFINITIVE_STORY_ERROR_CODES as readonly string[]).includes(result.code)
  ) {
    return "DEFINITIVE_FAILURE";
  }

  return "AMBIGUOUS_FAILURE";
}

/**
 * Resolves exact field validation error for a block from canonical StoryValidationIssue[].
 * Prevents broad substring matching leaks (e.g. items[0].title matching top-level title).
 */
export function getExactFieldIssue(
  issues: readonly StoryValidationIssue[] | undefined,
  relativePayloadPath: string
): string | undefined {
  if (!issues || issues.length === 0) return undefined;

  let normalizedPath: string;
  const trimmed = relativePayloadPath.trim();
  if (trimmed === "" || trimmed === "payload") {
    normalizedPath = ".payload";
  } else if (trimmed.startsWith(".payload.")) {
    normalizedPath = trimmed;
  } else if (trimmed.startsWith("payload.")) {
    normalizedPath = `.${trimmed}`;
  } else if (trimmed.startsWith(".")) {
    normalizedPath = `.payload${trimmed}`;
  } else {
    normalizedPath = `.payload.${trimmed}`;
  }

  for (const issue of issues) {
    if (issue.path.endsWith(normalizedPath)) {
      const prefix = issue.path.slice(0, -normalizedPath.length);
      if (prefix === "" || /^blocks\[\d+\]$/.test(prefix)) {
        return issue.message;
      }
    }
  }

  return undefined;
}

export function adaptPersistedValidationIssueToAuthoring(
  issue: StoryValidationIssue
): StoryValidationIssue {
  const tokenMap: Record<string, string> = {
    mediaKey: "mediaId",
    posterKey: "posterMediaId",
    videoKey: "videoMediaId",
    blueprintMediaKey: "blueprintMediaId",
    productSlugs: "productIds",
  };

  const adaptedPath = issue.path.replace(
    /(^|[.\[])(mediaKey|posterKey|videoKey|blueprintMediaKey|productSlugs)($|[.\[\]])/g,
    (_match, prefix, token, suffix) => `${prefix}${tokenMap[token]}${suffix}`
  );

  return {
    ...issue,
    path: adaptedPath,
  };
}
