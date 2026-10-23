export function productEditorVersion(
  product: { updatedAt: Date | string },
  variants: Array<{ id: string; updatedAt: Date | string }>,
  media: Array<{
    id: string;
    variantId: string | null;
    mediaAssetId: string;
    createdAt: Date | string;
  }>
) {
  return JSON.stringify([
    new Date(product.updatedAt).toISOString(),
    variants.map((item) => [item.id, new Date(item.updatedAt).toISOString()]).sort(),
    media
      .map((item) => [
        item.id,
        item.variantId,
        item.mediaAssetId,
        new Date(item.createdAt).toISOString(),
      ])
      .sort(),
  ]);
}

export function specificationDraftVersion(values: Record<string, unknown>) {
  return JSON.stringify(
    Object.entries(values)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}
