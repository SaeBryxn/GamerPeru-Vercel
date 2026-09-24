"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { CloseButton, DOME_TRANSITION, DomeButton } from "@/components/ui";
import type { DiscoverySort, DiscoverySurface } from "@/lib/discovery-filters/types";
import { getSortLabel, getSortOptions } from "./sort-options";
import styles from "./sort-dropdown.module.css";

const MENU_VARIANTS: Variants = {
  closed: { opacity: 0, scale: 0.92, transition: { duration: 0.2, ease: "easeIn" } },
  open: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.035,
      delayChildren: 0.08,
    },
  },
};

const OPTION_VARIANTS: Variants = {
  closed: { opacity: 0, x: 12 },
  open: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

// Underline grows from the left while the option is hovered or focused.
const UNDERLINE_VARIANTS: Variants = {
  rest: { scaleX: 0, transition: DOME_TRANSITION },
  hover: { scaleX: 1, transition: DOME_TRANSITION },
};

export interface SortDropdownProps {
  surface: DiscoverySurface;
  value: DiscoverySort;
  onChange: (sort: DiscoverySort) => void;
}

/**
 * "Sort by" trigger with a dark floating menu. Follows the menu-button pattern:
 * arrow keys move between options, Escape or an outside click closes it, and
 * focus returns to the trigger.
 */
export function SortDropdown({ surface, value, onChange }: SortDropdownProps) {
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const options = getSortOptions(surface);
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0
  );
  const selectedLabel = getSortLabel(surface, value);

  function close(restoreFocus = true) {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[selectedIndex]?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, selectedIndex]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const focusedIndex = optionRefs.current.findIndex((el) => el === document.activeElement);
    const lastIndex = options.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = focusedIndex >= lastIndex ? 0 : focusedIndex + 1;
    else if (event.key === "ArrowUp") nextIndex = focusedIndex <= 0 ? lastIndex : focusedIndex - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    } else if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div ref={rootRef} className={styles.sortDropdown}>
      <span className={styles.label} aria-hidden="true">
        Ordenar por:
      </span>
      <DomeButton
        ref={triggerRef}
        tone="light"
        className={styles.trigger}
        aria-label={`Ordenar por: ${selectedLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        data-testid="catalog-sort-button"
      >
        <span>{selectedLabel}</span>
        <span className={styles.dot} aria-hidden="true" />
      </DomeButton>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={menuId}
            className={styles.menu}
            role="menu"
            aria-label="Ordenar por"
            variants={MENU_VARIANTS}
            initial="closed"
            animate="open"
            exit="closed"
            onKeyDown={handleMenuKeyDown}
            data-testid="catalog-sort-menu"
          >
            <div className={styles.menuHeader}>
              <span className={styles.menuTitle}>Ordenar por</span>
              <CloseButton
                tone="dark"
                className={styles.menuClose}
                aria-label="Cerrar orden"
                onClick={() => close()}
              />
            </div>

            <ul className={styles.optionList} role="none">
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <motion.li key={option.label} role="none" variants={OPTION_VARIANTS}>
                    <motion.button
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      tabIndex={-1}
                      className={[styles.option, isSelected ? styles.optionSelected : ""]
                        .filter(Boolean)
                        .join(" ")}
                      initial="rest"
                      animate="rest"
                      whileHover="hover"
                      whileFocus="hover"
                      onClick={() => {
                        close();
                        if (option.value !== value) onChange(option.value);
                      }}
                    >
                      <span className={styles.optionLabel}>
                        {option.label}
                        <motion.span
                          className={styles.underline}
                          variants={UNDERLINE_VARIANTS}
                          aria-hidden="true"
                        />
                      </span>
                      {isSelected && <span className={styles.selectedDot} aria-hidden="true" />}
                    </motion.button>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
