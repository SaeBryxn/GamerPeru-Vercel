"use client";

import React, { createContext, useContext, useId, useState } from "react";
import Link from "@/components/app-link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import styles from "./account.module.css";

const AccountCardContext = createContext<{ close: () => void } | null>(null);

/** Lets an editor rendered inside an AccountCard fold the card back after a save. */
export function useAccountCardClose(): () => void {
  return useContext(AccountCardContext)?.close ?? (() => {});
}

interface AccountCardProps {
  title: string;
  /** Opens `editor` in place of the summary. */
  editLabel?: string;
  editor?: React.ReactNode;
  /** A navigation action instead of an in-place editor. */
  action?: { label: string; href: string };
  children: React.ReactNode;
}

/**
 * A quiet, bordered block: title on the left, one small outlined action on the right, and a
 * read-only summary that can swap to its editor in place.
 */
export function AccountCard({ title, editLabel, editor, action, children }: AccountCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const headingId = useId();
  const panelId = useId();
  const fade = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {title}
        </h2>
        {editor && editLabel ? (
          <button
            type="button"
            className={styles.outlineButton}
            aria-expanded={isEditing}
            aria-controls={panelId}
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? "Cancelar" : editLabel}
          </button>
        ) : action ? (
          <Link href={action.href} className={styles.outlineButton}>
            {action.label}
          </Link>
        ) : null}
      </div>

      <div id={panelId} className={styles.cardBody}>
        <AnimatePresence mode="wait" initial={false}>
          {isEditing ? (
            <motion.div key="editor" {...fade}>
              <AccountCardContext.Provider value={{ close: () => setIsEditing(false) }}>
                <div className={styles.readable}>{editor}</div>
              </AccountCardContext.Provider>
            </motion.div>
          ) : (
            <motion.div key="summary" {...fade}>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
