"use client";

import React from "react";
import { motion } from "framer-motion";
import { SECTION_LABEL, type ProductEditorSection } from "@/lib/admin/catalog/readiness-guidance";
import styles from "./product-section-nav.module.css";

interface ProductSectionNavProps {
  sections: ProductEditorSection[];
  active: ProductEditorSection;
  onSelect: (section: ProductEditorSection) => void;
  /** Sections with an unresolved blocker, marked so the operator sees where the work is. */
  sectionsWithIssues?: ProductEditorSection[];
}

export function ProductSectionNav({
  sections,
  active,
  onSelect,
  sectionsWithIssues = [],
}: ProductSectionNavProps) {
  return (
    <div
      className={styles.nav}
      role="tablist"
      aria-label="Secciones del producto"
      data-testid="product-section-nav"
    >
      {sections.map((section) => {
        const isActive = section === active;
        const hasIssue = sectionsWithIssues.includes(section);
        return (
          <button
            key={section}
            type="button"
            role="tab"
            id={`tab-${section}`}
            aria-selected={isActive}
            aria-controls={`panel-${section}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(section)}
            className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
            data-testid={`section-nav-${section}`}
          >
            {isActive && (
              <motion.span
                layoutId="product-section-pill"
                className={styles.pill}
                transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
                aria-hidden="true"
              />
            )}
            <span className={styles.label}>{SECTION_LABEL[section]}</span>
            {hasIssue && (
              <span className={styles.issueDot} aria-label="Tiene pendientes" role="img" />
            )}
          </button>
        );
      })}
    </div>
  );
}
