import {
  normalizeEditorStoryDocument,
  type EditorStoryBlock,
} from "@/lib/admin/catalog/story-builder-model";
import type { StoryValidationIssue } from "@/lib/admin/catalog/story-validation";

/** Bloques con al menos un problema de validación local, según la ruta `blocks[i]` del issue. */
export function collectIncompleteBlockIds(
  blocks: readonly EditorStoryBlock[],
  issues: readonly StoryValidationIssue[]
): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) {
    const match = issue.path.match(/^blocks\[(\d+)\]/);
    if (!match) continue;
    const block = blocks[parseInt(match[1]!, 10)];
    if (block) ids.add(block.blockId);
  }
  return ids;
}

/**
 * Al abrir la historia solo se despliegan el primer bloque y los que tienen configuración
 * pendiente; el resto queda colapsado para que la lista se lea de un vistazo.
 */
export function getDefaultExpandedBlockIds(blocks: readonly EditorStoryBlock[]): Set<string> {
  const normalized = normalizeEditorStoryDocument(blocks);
  const expanded = normalized.success
    ? new Set<string>()
    : collectIncompleteBlockIds(blocks, normalized.issues);
  if (blocks[0]) expanded.add(blocks[0].blockId);
  return expanded;
}

/**
 * Quita de los bloques cualquier referencia a un medio que se eliminó del producto. Los bloques
 * afectados quedan pendientes (el validador exige el video) en lugar de apuntar a un medio que ya
 * no existe. Devuelve el mismo arreglo si ningún bloque lo usaba, para no marcar cambios.
 */
export function clearStoryMediaReferences(
  blocks: EditorStoryBlock[],
  productMediaId: string
): EditorStoryBlock[] {
  let changed = false;
  const next = blocks.map((block): EditorStoryBlock => {
    if (block.type !== "hero_media" && block.type !== "video") return block;
    const payload = { ...block.payload };
    let blockChanged = false;
    if (payload.videoMediaId === productMediaId) {
      payload.videoMediaId = undefined;
      blockChanged = true;
    }
    if (payload.posterMediaId === productMediaId) {
      payload.posterMediaId = undefined;
      blockChanged = true;
    }
    if (!blockChanged) return block;
    changed = true;
    return { ...block, payload } as EditorStoryBlock;
  });
  return changed ? next : blocks;
}
