"use client";

import React, { useId, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Plus } from "lucide-react";
import { Icon } from "@/components/ui";
import styles from "./pdp-accordion.module.css";

export interface PdpAccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

/*
 * Content stays mounted (and in the server HTML, so specs remain crawlable);
 * closing animates the height away and only then drops it to display:none,
 * which also removes it from the accessibility tree.
 */
const CONTENT_VARIANTS: Variants = {
  open: {
    display: "block",
    height: "auto",
    opacity: 1,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
    transitionEnd: { display: "none" },
  },
};

export interface PdpAccordionProps {
  items: PdpAccordionItem[];
}

/** Uppercase divider rows with a "+" that turns into an "×" when open. */
export function PdpAccordion({ items }: PdpAccordionProps) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={styles.accordion}>
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        const panelId = `${baseId}-${item.id}`;
        return (
          <div key={item.id} className={styles.item}>
            <h3 className={styles.heading}>
              <button
                type="button"
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                data-testid={`pdp-accordion-${item.id}`}
              >
                <span>{item.title}</span>
                <motion.span
                  className={styles.icon}
                  initial={false}
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                >
                  <Icon icon={Plus} size="sm" aria-hidden="true" />
                </motion.span>
              </button>
            </h3>
            <motion.div
              id={panelId}
              className={styles.panel}
              role="region"
              aria-label={item.title}
              variants={CONTENT_VARIANTS}
              initial={false}
              animate={isOpen ? "open" : "closed"}
            >
              <div className={styles.panelInner}>{item.content}</div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
