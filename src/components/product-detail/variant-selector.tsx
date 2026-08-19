"use client";

import React, { useMemo } from "react";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import styles from "./variant-selector.module.css";

export interface VariantSelectorProps {
  variants: ProductVariantDetail[];
  selectedVariant: ProductVariantDetail;
  onSelectVariant: (variant: ProductVariantDetail) => void;
}

const ATTRIBUTE_KEY_REGEX = /^[a-z][a-z0-9_-]{0,49}$/;

export const SWATCH_ALLOWLIST: Record<string, string> = {
  negro: styles.swatchColor_negro ?? "",
  black: styles.swatchColor_negro ?? "",
  blanco: styles.swatchColor_blanco ?? "",
  white: styles.swatchColor_blanco ?? "",
  rojo: styles.swatchColor_rojo ?? "",
  red: styles.swatchColor_rojo ?? "",
  violeta: styles.swatchColor_violeta ?? "",
  violet: styles.swatchColor_violeta ?? "",
  plata: styles.swatchColor_plata ?? "",
  silver: styles.swatchColor_plata ?? "",
};

export interface ResolvedDimension {
  key: string;
  isColor: boolean;
  options: string[];
}

/**
 * Resolves whether multidimensional selectors can uniquely determine every active variant,
 * or if a full-title fallback must be used.
 */
export function resolveDimensions(variants: ProductVariantDetail[]): {
  dimensions: ResolvedDimension[];
  useFallback: boolean;
} {
  if (variants.length <= 1) {
    return { dimensions: [], useFallback: false };
  }

  // 1. Collect all valid candidate attribute keys
  const keyOccurrences = new Map<string, number>();
  for (const variant of variants) {
    if (!variant.attributes || typeof variant.attributes !== "object") {
      return { dimensions: [], useFallback: true };
    }
    for (const [key, value] of Object.entries(variant.attributes)) {
      if (ATTRIBUTE_KEY_REGEX.test(key) && value !== null && value !== undefined && value !== "") {
        keyOccurrences.set(key, (keyOccurrences.get(key) ?? 0) + 1);
      }
    }
  }

  // 2. Color Alias Precedence: colorway > color
  const allHaveColorway = (keyOccurrences.get("colorway") ?? 0) === variants.length;
  const allHaveColor = (keyOccurrences.get("color") ?? 0) === variants.length;

  let activeColorKey: string | null = null;
  if (allHaveColorway) {
    activeColorKey = "colorway";
  } else if (allHaveColor) {
    activeColorKey = "color";
  }

  // 3. Collect valid dimension keys present on ALL active variants
  const validKeys: string[] = [];
  for (const [key, count] of keyOccurrences.entries()) {
    if (count === variants.length) {
      if (key === "colorway" || key === "color") {
        if (key === activeColorKey) {
          validKeys.push(key);
        }
      } else {
        validKeys.push(key);
      }
    }
  }

  if (validKeys.length === 0) {
    return { dimensions: [], useFallback: true };
  }

  // 4. Sort dimensions: Color first, then alphabetical
  validKeys.sort((a, b) => {
    if (a === activeColorKey) return -1;
    if (b === activeColorKey) return 1;
    return a.localeCompare(b);
  });

  const dimensions: ResolvedDimension[] = validKeys.map((key) => {
    const rawOptions = variants.map((v) => String(v.attributes[key]));
    const uniqueOptions = Array.from(new Set(rawOptions));
    return {
      key,
      isColor: key === activeColorKey,
      options: uniqueOptions,
    };
  });

  // 5. Test uniqueness: Can combinations of these dimensions uniquely identify each variant?
  const signatureSet = new Set<string>();
  for (const variant of variants) {
    const sig = validKeys.map((k) => `${k}:${variant.attributes[k]}`).join("|");
    if (signatureSet.has(sig)) {
      // Ambiguity: multiple variants share identical dimension values -> fallback needed!
      return { dimensions: [], useFallback: true };
    }
    signatureSet.add(sig);
  }

  return { dimensions, useFallback: false };
}

export function VariantSelector({
  variants,
  selectedVariant,
  onSelectVariant,
}: VariantSelectorProps): React.JSX.Element {
  const { dimensions, useFallback } = useMemo(() => resolveDimensions(variants), [variants]);

  // Check if duplicate titles exist for fallback disambiguation
  const titleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of variants) {
      counts.set(v.title, (counts.get(v.title) ?? 0) + 1);
    }
    return counts;
  }, [variants]);

  if (variants.length <= 1) {
    return <></>;
  }

  // Full-Title Fallback Rendering
  if (useFallback) {
    return (
      <div className={styles.selectorContainer} data-testid="variant-selector-fallback">
        <div className={styles.fallbackTitleSelector}>
          <span className={styles.dimensionLabel}>Opción</span>
          <div className={styles.optionsGroup} role="radiogroup" aria-label="Seleccionar variante">
            {variants.map((variant) => {
              const isSelected = variant.id === selectedVariant.id;
              const hasDuplicates = (titleCounts.get(variant.title) ?? 0) > 1;
              const displayLabel = hasDuplicates
                ? `${variant.title} — ${variant.sku}`
                : variant.title;

              return (
                <button
                  key={variant.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectVariant(variant)}
                  className={`${styles.optionChip} ${isSelected ? styles.optionChipSelected : ""}`}
                  data-testid={`variant-option-${variant.id}`}
                >
                  {displayLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Multidimensional Generic Selectors
  return (
    <div className={styles.selectorContainer} data-testid="variant-selector-dimensions">
      {dimensions.map((dim) => {
        const currentValue = String(selectedVariant.attributes[dim.key] ?? "");

        return (
          <div key={dim.key} className={styles.dimensionBlock}>
            <div className={styles.dimensionHeader}>
              <span className={styles.dimensionLabel}>{dim.key}:</span>
              <span className={styles.dimensionCurrentValue}>{currentValue}</span>
            </div>

            <div
              className={styles.optionsGroup}
              role="radiogroup"
              aria-label={`Seleccionar ${dim.key}`}
            >
              {dim.options.map((option) => {
                const isSelected = option === currentValue;

                // Check compatibility: Is there at least one ACTIVE variant with this option?
                const isCompatible = variants.some((v) => String(v.attributes[dim.key]) === option);

                // Find target variant when clicking this option
                const handleOptionClick = () => {
                  if (isSelected || !isCompatible) return;

                  // 1. Try to find exact variant matching current selections + new option
                  let target = variants.find((v) => {
                    if (String(v.attributes[dim.key]) !== option) return false;
                    for (const otherDim of dimensions) {
                      if (otherDim.key !== dim.key) {
                        if (
                          String(v.attributes[otherDim.key]) !==
                          String(selectedVariant.attributes[otherDim.key])
                        ) {
                          return false;
                        }
                      }
                    }
                    return true;
                  });

                  // 2. If not found, find the best compatible variant with this option
                  target ??= variants.find((v) => String(v.attributes[dim.key]) === option);

                  if (target) {
                    onSelectVariant(target);
                  }
                };

                // Check if swatch allowlist applies
                const normalizedColor = option.toLowerCase().trim();
                const swatchClass = dim.isColor ? SWATCH_ALLOWLIST[normalizedColor] : null;

                if (dim.isColor && swatchClass) {
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${option}${!isCompatible ? " (No disponible)" : ""}`}
                      disabled={!isCompatible}
                      onClick={handleOptionClick}
                      className={`${styles.swatchButton} ${isSelected ? styles.swatchButtonSelected : ""} ${!isCompatible ? styles.swatchButtonDisabled : ""}`}
                      data-testid={`swatch-option-${option}`}
                    >
                      <span className={`${styles.swatchInnerCircle} ${swatchClass}`} />
                    </button>
                  );
                }

                // Standard Text Chip for non-color dimensions or unapproved color names
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!isCompatible}
                    onClick={handleOptionClick}
                    className={`${styles.optionChip} ${isSelected ? styles.optionChipSelected : ""} ${!isCompatible ? styles.optionChipDisabled : ""}`}
                    data-testid={`dimension-option-${dim.key}-${option}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
