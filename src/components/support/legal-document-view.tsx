"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LegalDocument } from "@/content/legal/types";
import { PageHero } from "./page-hero";
import styles from "./legal-document-view.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Legal page: a full-width header, then the text in a narrow reading column with a table of
 * contents beside it on wide screens. The body fades in once the header has settled.
 */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const reduceMotion = useReducedMotion();
  const updated = DATE_FORMAT.format(new Date(`${document.updatedAt}T00:00:00Z`));

  return (
    <main id="main-content">
      <PageHero
        eyebrow={document.eyebrow}
        title={document.title}
        description={document.summary}
        meta={`Última actualización: ${updated}`}
      />

      <motion.div
        className={styles.layout}
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <nav className={styles.toc} aria-label="Contenido del documento">
          <p className={styles.tocTitle}>En esta página</p>
          <ol className={styles.tocList}>
            {document.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={styles.tocLink}>
                  {section.heading.replace(/^\d+\.\s*/, "")}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className={styles.prose}>
          {document.sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </motion.div>
    </main>
  );
}
