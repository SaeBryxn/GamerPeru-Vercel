"use client";

import React, { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import type { FaqItem } from "@/content/support/faq";
import styles from "./faq-accordion.module.css";

const OPEN_TRANSITION = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const;

function FaqRow({ item }: { item: FaqItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  return (
    <div className={styles.row} data-open={isOpen || undefined}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{item.question}</span>
          <motion.span
            className={styles.icon}
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={reduceMotion ? { duration: 0 } : OPEN_TRANSITION}
            aria-hidden="true"
          >
            <Plus size={18} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Questions of one group; each opens independently so answers can be compared side by side. */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <FaqRow key={item.id} item={item} />
      ))}
    </div>
  );
}
