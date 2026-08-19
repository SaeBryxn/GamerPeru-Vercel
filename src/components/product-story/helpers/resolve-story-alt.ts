/**
 * Deterministic contextual fallback for Product Story content imagery.
 *
 * Invariants:
 * 1. If authoredAlt is provided and non-empty, use it directly.
 * 2. If authoredAlt is absent or whitespace, use a concise, human-readable
 *    contextual string: `${productName} — ${blockDescriptor}`.
 * 3. Never returns raw object keys, database IDs, filenames, or keyword stuffing.
 */
export function resolveStoryAlt(
  authoredAlt: string | null | undefined,
  productName: string,
  blockDescriptor: string
): string {
  if (authoredAlt && typeof authoredAlt === "string" && authoredAlt.trim().length > 0) {
    return authoredAlt.trim();
  }

  const safeProduct = productName.trim();
  const safeDescriptor = blockDescriptor.trim();

  if (!safeDescriptor) {
    return safeProduct;
  }

  return `${safeProduct} — ${safeDescriptor}`;
}
