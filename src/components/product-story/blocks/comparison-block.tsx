import React from "react";
import type { ComparisonPayload } from "@/lib/catalog/story-validation";
import { sanitizeComparisonRows } from "../helpers/comparison-matrix";
import styles from "./comparison-block.module.css";

export interface ComparisonBlockProps {
  payload: ComparisonPayload;
}

export function ComparisonBlock({ payload }: ComparisonBlockProps): React.JSX.Element | null {
  const validRows = sanitizeComparisonRows(payload.headers, payload.rows);

  // Exact-width row policy: If 0 exact-width rows remain, omit block
  if (validRows.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} data-testid="story-comparison-block">
      {payload.title && (
        <h2 className={styles.title} data-testid="comparison-title">
          {payload.title}
        </h2>
      )}

      <div
        className={styles.tableWrapper}
        tabIndex={0}
        aria-label="Tabla comparativa de especificaciones"
        role="region"
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {payload.headers.map((header, idx) => (
                <th
                  key={`th-${idx}`}
                  scope="col"
                  className={styles.th}
                  data-testid={`comparison-th-${idx}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {validRows.map((row, rowIdx) => (
              <tr key={`tr-${rowIdx}`} className={styles.tr}>
                {row.map((cell, cellIdx) => (
                  <td
                    key={`td-${rowIdx}-${cellIdx}`}
                    className={styles.td}
                    data-testid={`comparison-td-${rowIdx}-${cellIdx}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
