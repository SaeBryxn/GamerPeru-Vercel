"use client";

import React, { useId, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import type { FaqGroup, FaqItem } from "@/content/support/faq";
import styles from "./faq-accordion.module.css";

const OPEN_TRANSITION = { duration: 0.34, ease: [0.16, 1, 0.3, 1] } as const;

function FaqRow({ item }: { item: FaqItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  return (
    <div className={styles.row}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{item.question}</span>
          {/* A quarter of a turn would only redraw the plus; 45° turns it into an x. */}
          <m.span
            className={styles.icon}
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={reduceMotion ? { duration: 0 } : OPEN_TRANSITION}
            aria-hidden="true"
          >
            <Plus size={16} strokeWidth={2} />
          </m.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            id={panelId}
            role="region"
            className={styles.panel}
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={OPEN_TRANSITION}
          >
            <div className={styles.answer}>
              {item.answer.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One category: an overline title and its questions, each opening on its own. */
export function FaqAccordion({ group }: { group: FaqGroup }) {
  return (
    <section className={styles.group} aria-labelledby={`faq-${group.id}`}>
      <h2 id={`faq-${group.id}`} className={styles.groupTitle}>
        {group.title}
      </h2>
      <div className={styles.list}>
        {group.items.map((item) => (
          <FaqRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
