"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { CloseButton, DomeButton, Icon } from "@/components/ui";
import { formatCentsToPenDecimal, parsePenStringToCents } from "@/lib/discovery-filters/pen-parser";
import {
  formatTechnicalDecimal,
  parseTechnicalDecimal,
  serializeDiscoveryUrl,
} from "@/lib/discovery-filters/url";
import type {
  DiscoveryFacets,
  DiscoveryFilterState,
  DiscoverySort,
  DiscoverySurface,
  TechnicalFilterValue,
} from "@/lib/discovery-filters/types";
import { getSortOptions } from "../sort-dropdown/sort-options";
import { PriceRangeSlider } from "./price-range-slider";
import { ToggleSwitch } from "./toggle-switch";
import styles from "./filter-drawer.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

// Anchored to the left edge: slides in toward the center and back out.
const PANEL_VARIANTS: Variants = {
  hidden: { x: "-100%", transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } },
  visible: {
    x: 0,
    transition: {
      duration: 0.6,
      ease: EASE_OUT_EXPO,
      staggerChildren: 0.06,
      delayChildren: 0.18,
    },
  },
};

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

const PRICE_STEP_CENTS = 100;
// Used until the catalog readers report facets.priceRange; the top handle then
// means "S/ 1,000 and up" and applies no upper bound.
const FALLBACK_PRICE_CEILING_CENTS = 100_000;

export interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  basePath: string;
  facets: DiscoveryFacets;
  filterState: DiscoveryFilterState;
  surface: DiscoverySurface;
  searchQuery?: string;
}

function technicalRawNumbers(technical: Record<string, TechnicalFilterValue>) {
  const raw: Record<string, { min?: string; max?: string }> = {};
  for (const [k, v] of Object.entries(technical)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      raw[k] = {
        min: v.min !== undefined ? formatTechnicalDecimal(v.min) : "",
        max: v.max !== undefined ? formatTechnicalDecimal(v.max) : "",
      };
    }
  }
  return raw;
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

  const [draftSort, setDraftSort] = useState<DiscoverySort>(filterState.sort);
  const [isPriceOpen, setIsPriceOpen] = useState(true);
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
  const [draftTechRawNumbers, setDraftTechRawNumbers] = useState(() =>
    technicalRawNumbers(filterState.technical)
  );

  useEffect(() => {
    if (isOpen) {
      setDraftSort(filterState.sort);
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
      setDraftTechRawNumbers(technicalRawNumbers(filterState.technical));
    }
  }, [isOpen, filterState]);

  // The native modal dialog provides the focus trap, inert page and Escape.
  // It opens before paint so the panel's entrance plays inside it, and closes
  // only after the exit animation (see onExitComplete).
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      triggerRef.current = document.activeElement as HTMLElement;
      dialog.showModal();
    }
  }, [isOpen]);

  const handleExitComplete = () => {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  };

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  // Escape is handled directly as well: browsers may skip the dialog "cancel"
  // event (close-watcher heuristics), which would leave the panel stuck open.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
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

  // Slider bounds: 0 to the most expensive represented product, rounded up to S/ 1.
  const sliderMaxCents = facets.priceRange
    ? Math.ceil(facets.priceRange.maxPriceCents / PRICE_STEP_CENTS) * PRICE_STEP_CENTS
    : FALLBACK_PRICE_CEILING_CENTS;
  const parsedMin = parsePenStringToCents(draftMinPrice.trim());
  const parsedMax = parsePenStringToCents(draftMaxPrice.trim());
  const sliderMinCents = Math.min(Math.max(parsedMin ?? 0, 0), sliderMaxCents);
  const sliderMaxValueCents = Math.min(Math.max(parsedMax ?? sliderMaxCents, 0), sliderMaxCents);

  // Handles at the ends of the track mean "no bound", keeping the URL clean.
  const handleSliderChange = (minCents: number, maxCents: number) => {
    setDraftMinPrice(minCents <= 0 ? "" : formatCentsToPenDecimal(minCents));
    setDraftMaxPrice(maxCents >= sliderMaxCents ? "" : formatCentsToPenDecimal(maxCents));
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

    const nextState: DiscoveryFilterState = {
      brands: draftBrands,
      categories: draftCategories,
      price: { minCents, maxCents },
      technical: committedTechnical,
      sort: draftSort,
      page: 1,
    };

    const targetUrl = serializeDiscoveryUrl(basePath, nextState, surface, facets.technicalSchema, {
      searchQuery,
      overridePage: 1,
    });

    onClose();
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
  const sortOptions = getSortOptions(surface);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      aria-labelledby="filter-drawer-title"
      data-testid="filter-drawer"
    >
      <AnimatePresence onExitComplete={handleExitComplete}>
        {isOpen && (
          <m.div
            key="overlay"
            className={styles.overlay}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.4 } }}
            exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.05 } }}
            aria-hidden="true"
          />
        )}
        {isOpen && (
          <m.div
            key="panel"
            className={styles.panel}
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <header className={styles.header}>
              <h2 id="filter-drawer-title" className={styles.title}>
                Filtros
              </h2>
              <CloseButton
                tone="light"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Cerrar filtros"
                data-testid="close-filter-drawer-button"
              />
            </header>

            <div className={styles.body}>
              <m.div className={styles.sortField} variants={SECTION_VARIANTS}>
                <label htmlFor="filter-drawer-sort" className={styles.sortFieldLabel}>
                  Ordenar por
                </label>
                <select
                  id="filter-drawer-sort"
                  className={styles.sortSelect}
                  value={draftSort ?? ""}
                  onChange={(e) =>
                    setDraftSort(e.target.value === "" ? null : (e.target.value as DiscoverySort))
                  }
                  data-testid="drawer-sort-select"
                >
                  {sortOptions.map((option) => (
                    <option key={option.label} value={option.value ?? ""}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon
                  icon={ChevronDown}
                  size="sm"
                  className={styles.sortChevron}
                  aria-hidden="true"
                />
              </m.div>

              <m.div className={styles.group} variants={SECTION_VARIANTS}>
                <button
                  type="button"
                  className={styles.accordionTrigger}
                  aria-expanded={isPriceOpen}
                  aria-controls="filter-drawer-price"
                  onClick={() => setIsPriceOpen((open) => !open)}
                >
                  <span className={styles.groupTitle}>Precio</span>
                  <m.span
                    className={styles.accordionChevron}
                    initial={false}
                    animate={{ rotate: isPriceOpen ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  >
                    <Icon icon={ChevronDown} size="sm" aria-hidden="true" />
                  </m.span>
                </button>

                <AnimatePresence initial={false}>
                  {isPriceOpen && (
                    <m.div
                      id="filter-drawer-price"
                      className={styles.accordionContent}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                    >
                      <div className={styles.accordionInner}>
                        {sliderMaxCents > 0 && (
                          <PriceRangeSlider
                            maxBoundCents={sliderMaxCents}
                            minCents={sliderMinCents}
                            maxCents={sliderMaxValueCents}
                            openEndedMax={!facets.priceRange}
                            onChange={handleSliderChange}
                          />
                        )}
                        <div className={styles.priceFields}>
                          <label className={styles.priceField}>
                            <span className={styles.pricePrefix} aria-hidden="true">
                              S/
                            </span>
                            <input
                              id="price-min"
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={draftMinPrice}
                              onChange={(e) => setDraftMinPrice(e.target.value)}
                              className={styles.priceInput}
                              aria-label="Precio mínimo en soles"
                              data-testid="price-min-input"
                            />
                          </label>
                          <span className={styles.priceSeparator}>a</span>
                          <label className={styles.priceField}>
                            <span className={styles.pricePrefix} aria-hidden="true">
                              S/
                            </span>
                            <input
                              id="price-max"
                              type="text"
                              inputMode="decimal"
                              placeholder={String(sliderMaxCents / 100)}
                              value={draftMaxPrice}
                              onChange={(e) => setDraftMaxPrice(e.target.value)}
                              className={styles.priceInput}
                              aria-label="Precio máximo en soles"
                              data-testid="price-max-input"
                            />
                          </label>
                        </div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </m.div>

              {showCategoryFilter && (
                <m.div className={styles.group} variants={SECTION_VARIANTS}>
                  <h3 className={styles.groupTitle}>Categorías</h3>
                  <div className={styles.checkboxList}>
                    {facets.categories.map((cat) => (
                      <label key={cat.id} className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draftCategories.includes(cat.slug)}
                          onChange={() => handleCategoryToggle(cat.slug)}
                          className={styles.checkbox}
                          data-testid={`filter-category-${cat.slug}`}
                        />
                        <span>{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </m.div>
              )}

              {showBrandFilter && (
                <m.div className={styles.group} variants={SECTION_VARIANTS}>
                  <h3 className={styles.groupTitle}>Marcas</h3>
                  <div className={styles.checkboxList}>
                    {facets.brands.map((brand) => (
                      <label key={brand.id} className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={draftBrands.includes(brand.slug)}
                          onChange={() => handleBrandToggle(brand.slug)}
                          className={styles.checkbox}
                          data-testid={`filter-brand-${brand.slug}`}
                        />
                        <span>{brand.name}</span>
                      </label>
                    ))}
                  </div>
                </m.div>
              )}

              {facets.technicalFacets.map((facet) => {
                if (facet.kind === "ENUM_MULTI") {
                  const selectedValues = (draftTechnical[facet.field.key] as string[]) ?? [];
                  return (
                    <m.div
                      key={facet.field.key}
                      className={styles.group}
                      variants={SECTION_VARIANTS}
                    >
                      <h3 className={styles.groupTitle}>{facet.field.label}</h3>
                      <div className={styles.checkboxList}>
                        {facet.representedOptions.map((opt) => (
                          <label key={opt.value} className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={selectedValues.includes(opt.value)}
                              onChange={() => handleTechEnumToggle(facet.field.key, opt.value)}
                              className={styles.checkbox}
                              data-testid={`filter-tech-${facet.field.key}-${opt.value}`}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </m.div>
                  );
                }

                if (facet.kind === "NUMBER_RANGE") {
                  const rawRange = draftTechRawNumbers[facet.field.key] ?? {};
                  return (
                    <m.div
                      key={facet.field.key}
                      className={styles.group}
                      variants={SECTION_VARIANTS}
                    >
                      <h3 className={styles.groupTitle}>{facet.field.label}</h3>
                      <div className={styles.rangeInputs}>
                        <div className={styles.rangeField}>
                          <label
                            htmlFor={`range-min-${facet.field.key}`}
                            className={styles.rangeLabel}
                          >
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
                          <label
                            htmlFor={`range-max-${facet.field.key}`}
                            className={styles.rangeLabel}
                          >
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
                    </m.div>
                  );
                }

                if (facet.kind === "BOOLEAN") {
                  return (
                    <m.div
                      key={facet.field.key}
                      className={styles.group}
                      variants={SECTION_VARIANTS}
                    >
                      <ToggleSwitch
                        label={facet.field.label}
                        checked={draftTechnical[facet.field.key] === true}
                        onChange={() => handleTechBooleanToggle(facet.field.key)}
                        testId={`filter-tech-${facet.field.key}`}
                      />
                    </m.div>
                  );
                }

                return null;
              })}
            </div>

            <m.footer className={styles.footer} variants={SECTION_VARIANTS}>
              <DomeButton
                tone="dark"
                className={styles.applyButton}
                onClick={handleApply}
                data-testid="apply-filters-button"
              >
                Ver resultados
              </DomeButton>
              <button
                type="button"
                onClick={handleClearDraft}
                className={styles.clearButton}
                data-testid="clear-draft-filters-button"
              >
                Limpiar
              </button>
            </m.footer>
          </m.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
