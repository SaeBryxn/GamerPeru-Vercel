"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentsToPenDecimal, parsePenStringToCents } from "@/lib/discovery-filters/pen-parser";
import {
  formatTechnicalDecimal,
  parseTechnicalDecimal,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  DiscoverySurface,
  TechnicalFilterValue,
} from "@/lib/discovery-filters/types";
import styles from "./filter-drawer.module.css";

export interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  basePath: string;
  facets: DiscoveryFacets;
  filterState: DiscoveryFilterState;
  surface: DiscoverySurface;
  searchQuery?: string;
}

export function FilterDrawer({
  isOpen,
  onClose,
  basePath,
  facets,
  filterState,
  surface,
  searchQuery,
}: FilterDrawerProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [draftBrands, setDraftBrands] = useState<string[]>(filterState.brands);
  const [draftCategories, setDraftCategories] = useState<string[]>(filterState.categories);
  const [draftMinPrice, setDraftMinPrice] = useState<string>(
    filterState.price.minCents !== null ? formatCentsToPenDecimal(filterState.price.minCents) : ""
  );
  const [draftMaxPrice, setDraftMaxPrice] = useState<string>(
    filterState.price.maxCents !== null ? formatCentsToPenDecimal(filterState.price.maxCents) : ""
  );
  const [draftTechnical, setDraftTechnical] = useState<Record<string, TechnicalFilterValue>>(
    filterState.technical
  );
  const [draftTechRawNumbers, setDraftTechRawNumbers] = useState<
    Record<string, { min?: string; max?: string }>
  >(() => {
    const initial: Record<string, { min?: string; max?: string }> = {};
    for (const [k, v] of Object.entries(filterState.technical)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        initial[k] = {
          min: v.min !== undefined ? formatTechnicalDecimal(v.min) : "",
          max: v.max !== undefined ? formatTechnicalDecimal(v.max) : "",
        };
      }
    }
    return initial;
  });

  useEffect(() => {
    if (isOpen) {
      setDraftBrands(filterState.brands);
      setDraftCategories(filterState.categories);
      setDraftMinPrice(
        filterState.price.minCents !== null
          ? formatCentsToPenDecimal(filterState.price.minCents)
          : ""
      );
      setDraftMaxPrice(
        filterState.price.maxCents !== null
          ? formatCentsToPenDecimal(filterState.price.maxCents)
          : ""
      );
      setDraftTechnical(filterState.technical);

      const rawNums: Record<string, { min?: string; max?: string }> = {};
      for (const [k, v] of Object.entries(filterState.technical)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          rawNums[k] = {
            min: v.min !== undefined ? formatTechnicalDecimal(v.min) : "",
            max: v.max !== undefined ? formatTechnicalDecimal(v.max) : "",
          };
        }
      }
      setDraftTechRawNumbers(rawNums);
    }
  }, [isOpen, filterState]);

  const handleClose = useCallback(() => {
    setIsTransitioning(false);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = prefersReducedMotion ? 0 : 250;

    const timeout = setTimeout(() => {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
      onClose();
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      } else {
        const launcher = document.querySelector<HTMLElement>(
          '[data-testid="filter-drawer-launcher"]'
        );
        launcher?.focus();
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        setIsTransitioning(true);
      });
    } else if (dialog.open) {
      handleClose();
    }
  }, [isOpen, handleClose]);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first && last) {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
  };

  const handleBrandToggle = (brandSlug: string) => {
    setDraftBrands((prev) =>
      prev.includes(brandSlug) ? prev.filter((b) => b !== brandSlug) : [...prev, brandSlug]
    );
  };

  const handleCategoryToggle = (categorySlug: string) => {
    setDraftCategories((prev) =>
      prev.includes(categorySlug) ? prev.filter((c) => c !== categorySlug) : [...prev, categorySlug]
    );
  };

  const handleTechEnumToggle = (fieldKey: string, optionValue: string) => {
    setDraftTechnical((prev) => {
      const current = (prev[fieldKey] as string[]) ?? [];
      const updated = current.includes(optionValue)
        ? current.filter((v) => v !== optionValue)
        : [...current, optionValue];

      if (updated.length === 0) {
        const copy = { ...prev };
        delete copy[fieldKey];
        return copy;
      }
      return { ...prev, [fieldKey]: updated };
    });
  };

  const handleTechNumberChange = (fieldKey: string, bound: "min" | "max", rawVal: string) => {
    setDraftTechRawNumbers((prev) => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        [bound]: rawVal,
      },
    }));
  };

  const handleTechBooleanToggle = (fieldKey: string) => {
    setDraftTechnical((prev) => {
      const current = prev[fieldKey] === true;
      if (current) {
        const copy = { ...prev };
        delete copy[fieldKey];
        return copy;
      }
      return { ...prev, [fieldKey]: true };
    });
  };

  const handleApply = () => {
    let minCents = parsePenStringToCents(draftMinPrice.trim());
    let maxCents = parsePenStringToCents(draftMaxPrice.trim());

    if (minCents !== null && maxCents !== null && minCents > maxCents) {
      minCents = null;
      maxCents = null;
    }

    const committedTechnical: Record<string, TechnicalFilterValue> = {};
    for (const [k, v] of Object.entries(draftTechnical)) {
      if (Array.isArray(v) || typeof v === "boolean") {
        committedTechnical[k] = v;
      }
    }

    if (facets.technicalFacets) {
      for (const facet of facets.technicalFacets) {
        if (facet.kind === "NUMBER_RANGE") {
          const raw = draftTechRawNumbers[facet.field.key];
          if (raw) {
            const minNum =
              raw.min !== undefined && raw.min.trim() !== ""
                ? parseTechnicalDecimal(raw.min.trim(), facet.field.min, facet.field.max)
                : undefined;
            const maxNum =
              raw.max !== undefined && raw.max.trim() !== ""
                ? parseTechnicalDecimal(raw.max.trim(), facet.field.min, facet.field.max)
                : undefined;

            if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
              // Invalid bounds min > max rejected
            } else if (minNum !== undefined || maxNum !== undefined) {
              committedTechnical[facet.field.key] = {
                min: minNum,
                max: maxNum,
              };
            }
          }
        }
      }
    }

    const nextState: DiscoveryFilterState = {
      brands: draftBrands,
      categories: draftCategories,
      price: { minCents, maxCents },
      technical: committedTechnical,
      sort: filterState.sort,
      page: 1,
    };

    const targetUrl = serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
      searchQuery,
      overridePage: 1,
    });

    handleClose();
    router.push(targetUrl);
  };

  const handleClearDraft = () => {
    setDraftBrands([]);
    setDraftCategories([]);
    setDraftMinPrice("");
    setDraftMaxPrice("");
    setDraftTechnical({});
    setDraftTechRawNumbers({});
  };

  const showCategoryFilter = surface !== "category" && facets.categories.length > 0;
  const showBrandFilter = surface !== "brand" && facets.brands.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${isTransitioning ? styles.open : ""}`}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      aria-label="Filtros de catálogo"
      data-testid="filter-drawer"
    >
      <div className={styles.drawerPanel} role="document">
        <header className={styles.header}>
          <h2 id="filter-drawer-title" className={styles.title}>
            Filtros
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeButton}
            aria-label="Cerrar filtros"
            data-testid="close-filter-drawer-button"
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          {showCategoryFilter && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>Categorías</h3>
              <div className={styles.checkboxList}>
                {facets.categories.map((cat) => {
                  const isChecked = draftCategories.includes(cat.slug);
                  return (
                    <label key={cat.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleCategoryToggle(cat.slug)}
                        className={styles.checkbox}
                        data-testid={`filter-category-${cat.slug}`}
                      />
                      <span>{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {showBrandFilter && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>Marcas</h3>
              <div className={styles.checkboxList}>
                {facets.brands.map((brand) => {
                  const isChecked = draftBrands.includes(brand.slug);
                  return (
                    <label key={brand.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleBrandToggle(brand.slug)}
                        className={styles.checkbox}
                        data-testid={`filter-brand-${brand.slug}`}
                      />
                      <span>{brand.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.group}>
            <h3 className={styles.groupTitle}>Rango de Precio (S/)</h3>
            <div className={styles.rangeInputs}>
              <div className={styles.rangeField}>
                <label htmlFor="price-min" className={styles.rangeLabel}>
                  Mínimo
                </label>
                <input
                  id="price-min"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draftMinPrice}
                  onChange={(e) => setDraftMinPrice(e.target.value)}
                  className={styles.rangeInput}
                  data-testid="price-min-input"
                />
              </div>
              <div className={styles.rangeField}>
                <label htmlFor="price-max" className={styles.rangeLabel}>
                  Máximo
                </label>
                <input
                  id="price-max"
                  type="text"
                  inputMode="decimal"
                  placeholder="9999.00"
                  value={draftMaxPrice}
                  onChange={(e) => setDraftMaxPrice(e.target.value)}
                  className={styles.rangeInput}
                  data-testid="price-max-input"
                />
              </div>
            </div>
          </div>

          {facets.technicalFacets.map((facet) => {
            if (facet.kind === "ENUM_MULTI") {
              const selectedValues = (draftTechnical[facet.field.key] as string[]) ?? [];
              return (
                <div key={facet.field.key} className={styles.group}>
                  <h3 className={styles.groupTitle}>{facet.field.label}</h3>
                  <div className={styles.checkboxList}>
                    {facet.representedOptions.map((opt) => {
                      const isChecked = selectedValues.includes(opt.value);
                      return (
                        <label key={opt.value} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTechEnumToggle(facet.field.key, opt.value)}
                            className={styles.checkbox}
                            data-testid={`filter-tech-${facet.field.key}-${opt.value}`}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (facet.kind === "NUMBER_RANGE") {
              const rawRange = draftTechRawNumbers[facet.field.key] ?? {};
              return (
                <div key={facet.field.key} className={styles.group}>
                  <h3 className={styles.groupTitle}>{facet.field.label}</h3>
                  <div className={styles.rangeInputs}>
                    <div className={styles.rangeField}>
                      <label htmlFor={`range-min-${facet.field.key}`} className={styles.rangeLabel}>
                        Desde
                      </label>
                      <input
                        id={`range-min-${facet.field.key}`}
                        type="number"
                        min={facet.field.min}
                        max={facet.field.max}
                        step={facet.field.step}
                        placeholder={String(facet.minRepresented)}
                        value={rawRange.min ?? ""}
                        onChange={(e) =>
                          handleTechNumberChange(facet.field.key, "min", e.target.value)
                        }
                        className={styles.rangeInput}
                        data-testid={`range-min-${facet.field.key}`}
                      />
                    </div>
                    <div className={styles.rangeField}>
                      <label htmlFor={`range-max-${facet.field.key}`} className={styles.rangeLabel}>
                        Hasta
                      </label>
                      <input
                        id={`range-max-${facet.field.key}`}
                        type="number"
                        min={facet.field.min}
                        max={facet.field.max}
                        step={facet.field.step}
                        placeholder={String(facet.maxRepresented)}
                        value={rawRange.max ?? ""}
                        onChange={(e) =>
                          handleTechNumberChange(facet.field.key, "max", e.target.value)
                        }
                        className={styles.rangeInput}
                        data-testid={`range-max-${facet.field.key}`}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            if (facet.kind === "BOOLEAN") {
              const isChecked = draftTechnical[facet.field.key] === true;
              return (
                <div key={facet.field.key} className={styles.group}>
                  <div className={styles.checkboxList}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleTechBooleanToggle(facet.field.key)}
                        className={styles.checkbox}
                        data-testid={`filter-tech-${facet.field.key}`}
                      />
                      <span>{facet.field.label}</span>
                    </label>
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            onClick={handleApply}
            className={styles.applyButton}
            data-testid="apply-filters-button"
          >
            Ver resultados
          </button>
          <button
            type="button"
            onClick={handleClearDraft}
            className={styles.clearButton}
            data-testid="clear-draft-filters-button"
          >
            Limpiar
          </button>
        </footer>
      </div>
    </dialog>
  );
}
