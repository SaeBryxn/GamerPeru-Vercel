"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { formatCentsToPenDecimal, parsePenStringToCents } from "@/lib/discovery-filters/pen-parser";
import { parseTechnicalDecimal, serializeDiscoveryUrl } from "@/lib/discovery-filters/url";
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
    setDraftTechnical((prev) => {
      const current = (prev[fieldKey] as { min?: number; max?: number }) ?? {};
      const numVal = parseTechnicalDecimal(rawVal.trim());

      const updated = {
        ...current,
        [bound]: numVal,
      };

      if (updated.min === undefined && updated.max === undefined) {
        const copy = { ...prev };
        delete copy[fieldKey];
        return copy;
      }
      return { ...prev, [fieldKey]: updated };
    });
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

    const nextState: DiscoveryFilterState = {
      brands: draftBrands,
      categories: draftCategories,
      price: { minCents, maxCents },
      technical: draftTechnical,
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
  };

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
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {surface !== "brand" && facets.brands.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>Marcas</h3>
              <div className={styles.checkboxList}>
                {facets.brands.map((brand) => {
                  const isChecked = draftBrands.includes(brand.slug);
                  return (
                    <label key={brand.slug} className={styles.checkboxLabel}>
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

          {surface !== "category" && facets.categories.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>Categorías</h3>
              <div className={styles.checkboxList}>
                {facets.categories.map((category) => {
                  const isChecked = draftCategories.includes(category.slug);
                  return (
                    <label key={category.slug} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleCategoryToggle(category.slug)}
                        className={styles.checkbox}
                        data-testid={`filter-category-${category.slug}`}
                      />
                      <span>{category.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.group}>
            <h3 className={styles.groupTitle}>Precio (PEN)</h3>
            <div className={styles.priceInputs}>
              <div className={styles.priceField}>
                <label htmlFor="price-min-input" className={styles.priceLabel}>
                  Precio mínimo (S/)
                </label>
                <input
                  id="price-min-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="Min"
                  value={draftMinPrice}
                  onChange={(e) => setDraftMinPrice(e.target.value)}
                  className={styles.priceInput}
                  data-testid="price-min-input"
                />
              </div>
              <div className={styles.priceField}>
                <label htmlFor="price-max-input" className={styles.priceLabel}>
                  Precio máximo (S/)
                </label>
                <input
                  id="price-max-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="Max"
                  value={draftMaxPrice}
                  onChange={(e) => setDraftMaxPrice(e.target.value)}
                  className={styles.priceInput}
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
              const range =
                (draftTechnical[facet.field.key] as { min?: number; max?: number }) ?? {};
              const unitSuffix = facet.field.unit ? ` (${facet.field.unit})` : "";
              return (
                <div key={facet.field.key} className={styles.group}>
                  <h3 className={styles.groupTitle}>
                    {facet.field.label}
                    {unitSuffix}
                  </h3>
                  <div className={styles.rangeInputs}>
                    <div className={styles.rangeField}>
                      <label htmlFor={`range-min-${facet.field.key}`} className={styles.rangeLabel}>
                        Desde
                      </label>
                      <input
                        id={`range-min-${facet.field.key}`}
                        type="number"
                        placeholder={String(facet.minRepresented)}
                        value={range.min ?? ""}
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
                        placeholder={String(facet.maxRepresented)}
                        value={range.max ?? ""}
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
