/**
 * Sanitizes Product Story comparison table rows according to the exact-width row policy.
 *
 * Invariants:
 * 1. Let N = headers.length.
 * 2. Only rows where row.length === N are retained unchanged.
 * 3. Mismatched rows (row.length !== N) are omitted from presentation.
 * 4. Never pads with fake "—" cells, never truncates long rows, never merges cells.
 * 5. Returns array of valid exact-width rows.
 */
export function sanitizeComparisonRows(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string[][] {
  const expectedWidth = headers.length;
  if (expectedWidth === 0 || !rows || rows.length === 0) {
    return [];
  }

  const validRows: string[][] = [];

  for (const row of rows) {
    if (row.length === expectedWidth) {
      validRows.push([...row]);
    }
  }

  return validRows;
}
