import React from "react";
import type { TechnicalSpecsPayload } from "@/lib/catalog/story-validation";
import styles from "./technical-specs-block.module.css";

export interface TechnicalSpecsBlockProps {
  payload: TechnicalSpecsPayload;
}

export function TechnicalSpecsBlock({ payload }: TechnicalSpecsBlockProps): React.JSX.Element {
  const title = payload.title ?? "Ficha Técnica";

  return (
    <section className={styles.section} data-testid="story-technical-specs-block">
      <h2 className={styles.title} data-testid="technical-specs-title">
        {title}
      </h2>

      <div className={styles.groupsGrid}>
        {payload.groups.map((group, groupIdx) => (
          <div
            key={`group-${groupIdx}`}
            className={styles.groupCard}
            data-testid={`technical-group-${groupIdx}`}
          >
            <h3 className={styles.groupName}>{group.groupName}</h3>
            <dl className={styles.specList}>
              {group.specs.map((spec, specIdx) => (
                <div key={`spec-${groupIdx}-${specIdx}`} className={styles.specRow}>
                  <dt className={styles.specLabel}>{spec.label}</dt>
                  <dd className={styles.specValue}>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
