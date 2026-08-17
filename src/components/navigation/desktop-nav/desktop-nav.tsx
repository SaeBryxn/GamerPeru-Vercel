"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Container, Icon } from "@/components/ui";
import type { MegaMenuCategory } from "../types";
import styles from "./desktop-nav.module.css";

export interface DesktopNavProps {
  items: MegaMenuCategory[];
  className?: string;
}

export function DesktopNav({ items, className }: DesktopNavProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Close mega-menu on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && activeCategoryId) {
        e.preventDefault();
        const trigger = triggerRefs.current.get(activeCategoryId);
        setActiveCategoryId(null);
        trigger?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCategoryId]);

  // Close mega-menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveCategoryId(null);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeCategory = items.find((item) => item.id === activeCategoryId);

  return (
    <nav
      ref={navRef}
      className={[styles.desktopNav, className].filter(Boolean).join(" ")}
      aria-label="Navegación principal"
    >
      <ul className={styles.navList}>
        {items.map((category) => {
          const isExpanded = activeCategoryId === category.id;
          const panelId = `mega-menu-${category.id}`;

          return (
            <li
              key={category.id}
              className={styles.navItem}
              onMouseEnter={() => setActiveCategoryId(category.id)}
              onMouseLeave={() => setActiveCategoryId(null)}
            >
              <button
                ref={(el) => {
                  if (el) triggerRefs.current.set(category.id, el);
                  else triggerRefs.current.delete(category.id);
                }}
                type="button"
                className={styles.navTrigger}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => setActiveCategoryId(isExpanded ? null : category.id)}
              >
                <span>{category.label}</span>
                <span className={styles.chevron}>
                  <Icon icon={ChevronDown} size="sm" aria-hidden="true" />
                </span>
              </button>

              {isExpanded && activeCategory && (
                <div
                  id={panelId}
                  className={styles.megaMenuPanel}
                  role="region"
                  aria-label={`Menú desplegable ${category.label}`}
                >
                  <Container size="default">
                    <div className={styles.megaMenuGrid}>
                      {/* Category Sub-Sections */}
                      {activeCategory.sections.map((section, idx) => (
                        <div key={idx} className={styles.megaMenuColumn}>
                          <h3 className={styles.columnTitle}>{section.title}</h3>
                          <ul className={styles.columnList}>
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>
                                <Link
                                  href={item.href}
                                  className={styles.columnLink}
                                  onClick={() => setActiveCategoryId(null)}
                                >
                                  {item.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}

                      {/* Brand Directory Column */}
                      {activeCategory.brands && activeCategory.brands.length > 0 && (
                        <div className={styles.megaMenuColumn}>
                          <h3 className={styles.columnTitle}>Marcas Destacadas</h3>
                          <ul className={styles.columnList}>
                            {activeCategory.brands.map((brand, brandIdx) => (
                              <li key={brandIdx}>
                                <Link
                                  href={brand.href}
                                  className={styles.columnLink}
                                  onClick={() => setActiveCategoryId(null)}
                                >
                                  {brand.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* View All / Category Overview Column */}
                      <div className={styles.megaMenuColumn}>
                        <h3 className={styles.columnTitle}>Explorar Todo</h3>
                        <p
                          className="type-body-small"
                          style={{ color: "var(--color-text-secondary)", margin: 0 }}
                        >
                          Catálogo completo de {category.label.toLowerCase()} seleccionados para
                          alto rendimiento.
                        </p>
                        <Link
                          href={category.href}
                          className={styles.viewAllLink}
                          onClick={() => setActiveCategoryId(null)}
                        >
                          Ver todos los {category.label.toLowerCase()} →
                        </Link>
                      </div>
                    </div>
                  </Container>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
