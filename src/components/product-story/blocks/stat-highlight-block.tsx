import React from "react";
import type { StatHighlightPayload } from "@/lib/catalog/story-validation";
import styles from "./stat-highlight-block.module.css";

export interface StatHighlightBlockProps {
  payload: StatHighlightPayload;
}

export function StatHighlightBlock({ payload }: StatHighlightBlockProps): React.JSX.Element {
  return (
    <section className={styles.section} data-testid="story-stat-highlight-block">
      {payload.title && (
        <h2 className={styles.title} data-testid="stat-highlight-title">
          {payload.title}
        </h2>
      )}

      <div className={styles.statsGrid}>
        {payload.stats.map((stat, index) => (
          <div key={`stat-${index}`} className={styles.statCard} data-testid={`stat-card-${index}`}>
            <div className={styles.valueWrapper}>
              <span className={styles.value} data-testid="stat-value">
                {stat.value}
              </span>
              {stat.unit && (
                <span className={styles.unit} data-testid="stat-unit">
                  {stat.unit}
                </span>
              )}
            </div>
            <span className={styles.label} data-testid="stat-label">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
