import type { ProductCardImage } from "./types";

/** Photos a card scrubs through; beyond three the hover strip stops reading as distinct views. */
export const CARD_GALLERY_SIZE = 3;

/**
 * Orders a card's photos: the card image first, then the rest of the gallery without repeating it.
 * The card image can be a designated primary that is not part of the gallery, so it is merged in
 * rather than assumed to lead.
 */
export function buildCardGallery(
  cardImage: ProductCardImage | null,
  gallery: readonly ProductCardImage[] | null | undefined
): ProductCardImage[] {
  const ordered = cardImage ? [cardImage] : [];
  for (const image of gallery ?? []) {
    if (!ordered.some((existing) => existing.objectKey === image.objectKey)) ordered.push(image);
  }
  return ordered.slice(0, CARD_GALLERY_SIZE);
}
