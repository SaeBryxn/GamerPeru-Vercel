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

  // Close mega-menu on Escape key and return focus to the active disclosure trigger
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

  return (
    <nav
      ref={navRef}
      className={[styles.desktopNav, className].filter(Boolean).join(" ")}
      aria-label="Navegación principal"
      onMouseLeave={() => setActiveCategoryId(null)}
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
            >
              <div
                className={[styles.navItemWrapper, isExpanded ? styles.navItemWrapperActive : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* Primary Category Destination Link — Semantic & Crawlable */}
                <Link
                  href={category.href}
                  className={[styles.categoryLink, isExpanded ? styles.categoryLinkActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setActiveCategoryId(null)}
                >
                  {category.label}
                </Link>

                {/* Separate Disclosure Button for MegaMenu Toggle */}
                <button
                  ref={(el) => {
                    if (el) triggerRefs.current.set(category.id, el);
                    else triggerRefs.current.delete(category.id);
                  }}
                  type="button"
                  className={styles.disclosureTrigger}
                  aria-label={`Abrir menú desplegable de ${category.label}`}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveCategoryId(isExpanded ? null : category.id);
                  }}
                >
                  <span className={styles.chevron}>
                    <Icon icon={ChevronDown} size="sm" aria-hidden="true" />
                  </span>
                </button>
              </div>

              {/* Full-Width MegaMenu Panel — positioned relative to SiteHeader containing block */}
              {isExpanded && (
                <div
                  id={panelId}
                  className={styles.megaMenuPanel}
                  role="region"
                  aria-label={`Menú desplegable ${category.label}`}
                >
                  <Container size="default">
                    <div className={styles.megaMenuLayout}>
                      {/* Left Zone: Category / Collection Hierarchy */}
                      <div className={styles.megaSide}>
                        <p className={styles.sideEyebrow}>Colecciones</p>
                        <div className={styles.sideLinks}>
                          {category.sections[0]?.items.map((item, itemIdx) => (
                            <Link
                              key={itemIdx}
                              href={item.href}
                              className={styles.sideLeadLink}
                              onClick={() => setActiveCategoryId(null)}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>

                        {/* Secondary sections / Brands if present */}
                        {category.brands && category.brands.length > 0 && (
                          <div className={styles.sideBrands}>
                            <p className={styles.sideSubEyebrow}>Marcas</p>
                            <div className={styles.brandTags}>
                              {category.brands.slice(0, 4).map((brand, brandIdx) => (
                                <Link
                                  key={brandIdx}
                                  href={brand.href}
                                  className={styles.brandTag}
                                  onClick={() => setActiveCategoryId(null)}
                                >
                                  {brand.label}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        <Link
                          href={category.href}
                          className={styles.viewAllFooterLink}
                          onClick={() => setActiveCategoryId(null)}
                        >
                          <span>Ver todos los {category.label.toLowerCase()}</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                      </div>

                      {/* Right / Center Zone: Visual Preview Tiles */}
                      <div className={styles.megaPreviews}>
                        <div className={styles.previewsHeader}>
                          <p className={styles.sideEyebrow}>Líneas destacadas</p>
                          <Link
                            href={category.href}
                            className={styles.topRightViewAll}
                            onClick={() => setActiveCategoryId(null)}
                          >
                            Explorar catálogo completo →
                          </Link>
                        </div>

                        <div className={styles.previewGrid}>
                          {(category.previews ?? []).map((preview, previewIdx) => (
                            <Link
                              key={previewIdx}
                              href={preview.href}
                              className={styles.previewCard}
                              onClick={() => setActiveCategoryId(null)}
                            >
                              <div className={styles.previewMedia} aria-hidden="true">
                                <div className={styles.previewAmbient} />
                              </div>
                              <div className={styles.previewContent}>
                                <h3 className={styles.previewTitle}>{preview.title}</h3>
                                <p className={styles.previewSubtitle}>{preview.subtitle}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
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
