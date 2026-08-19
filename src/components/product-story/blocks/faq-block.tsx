import React from "react";
import type { FaqPayload } from "@/lib/catalog/story-validation";
import styles from "./faq-block.module.css";

export interface FaqBlockProps {
  payload: FaqPayload;
}

export function FaqBlock({ payload }: FaqBlockProps): React.JSX.Element {
  const title = payload.title ?? "Preguntas Frecuentes";

  return (
    <section className={styles.section} data-testid="story-faq-block">
      <h2 className={styles.title} data-testid="faq-title">
        {title}
      </h2>

      <div className={styles.accordionList}>
        {payload.items.map((item, index) => (
          <details
            key={`faq-${index}`}
            className={styles.details}
            data-testid={`faq-item-${index}`}
          >
            <summary className={styles.summary} data-testid={`faq-summary-${index}`}>
              <span>{item.question}</span>
              <span className={styles.icon} aria-hidden="true">
                +
              </span>
            </summary>
            <p className={styles.answer} data-testid={`faq-answer-${index}`}>
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
