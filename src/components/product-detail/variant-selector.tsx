"use client";

import Image from "next/image";
import React, { useMemo } from "react";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import type { ProductMediaItem } from "@/lib/catalog/product-detail-types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./variant-selector.module.css";

export interface VariantSelectorProps {
  variants: ProductVariantDetail[];
  media?: ProductMediaItem[];
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

  // Size precedes color so the selected shape is chosen before its finish.
  validKeys.sort((a, b) => {
    const isSize = (key: string) => /^(size|talla|tamano)$/.test(key);
    if (isSize(a) !== isSize(b)) return isSize(a) ? -1 : 1;
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

  // Exact single-option changes must be able to reach every variant. A sparse catalog can
  // contain an isolated edition/color pair; separate selectors would leave both disabled.
  const reachable = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const current = variants[pending.pop()!]!;
    for (const [index, candidate] of variants.entries()) {
      if (reachable.has(index)) continue;
      let differences = 0;
      for (const key of validKeys) {
        if (String(current.attributes[key]) !== String(candidate.attributes[key])) differences++;
        if (differences > 1) break;
      }
      if (differences <= 1) {
        reachable.add(index);
        pending.push(index);
      }
    }
  }
  if (reachable.size !== variants.length) return { dimensions: [], useFallback: true };

  return { dimensions, useFallback: false };
}

function imageForVariant(
  variant: ProductVariantDetail | undefined,
  media: ProductMediaItem[]
): string | null {
  if (!variant) return null;
  const image =
    media.find(
      (item) =>
        item.mediaAssetId === variant.thumbnailMediaAssetId &&
        (!item.variantId || item.variantId === variant.id) &&
        item.asset.mimeType.startsWith("image/")
    ) ??
    media.find((item) => item.variantId === variant.id && item.asset.mimeType.startsWith("image/"));
  return image ? resolvePublicMediaUrl(image.asset.objectKey) : null;
}

/**
 * Evaluates whether a candidate option for dimensionKey is compatible with the current
 * selection across all other active rendered dimensions.
 */
export function isVariantOptionCompatible(
  variants: ProductVariantDetail[],
  dimensions: ResolvedDimension[],
  selectedVariant: ProductVariantDetail,
  dimensionKey: string,
  candidateOption: string
): boolean {
  return variants.some((v) => {
    if (String(v.attributes[dimensionKey]) !== candidateOption) return false;
    for (const otherDim of dimensions) {
      if (otherDim.key !== dimensionKey) {
        if (
          String(v.attributes[otherDim.key]) !== String(selectedVariant.attributes[otherDim.key])
        ) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Resolves the exact active ProductVariant matching the candidate option and all current
 * other dimension selections. Returns null if no exact combination exists (never falls back
 * to an arbitrary variant).
 */
export function resolveVariantForOption(
  variants: ProductVariantDetail[],
  dimensions: ResolvedDimension[],
  selectedVariant: ProductVariantDetail,
  dimensionKey: string,
  candidateOption: string
): ProductVariantDetail | null {
  const match = variants.find((v) => {
    if (String(v.attributes[dimensionKey]) !== candidateOption) return false;
    for (const otherDim of dimensions) {
      if (otherDim.key !== dimensionKey) {
        if (
          String(v.attributes[otherDim.key]) !== String(selectedVariant.attributes[otherDim.key])
        ) {
          return false;
        }
      }
    }
    return true;
  });

  return match ?? null;
}

/**
 * A colour added from the admin can carry only its title ("Naranja") while its siblings carry a
 * `color` attribute. Reading the title as that colour keeps the colour picker, with its photos,
 * instead of dropping every variant to the plain list of titles. Only variants with no attributes
 * at all are filled, so a real size/colour matrix is never reinterpreted.
 */
export function withTitleAsMissingColor(variants: ProductVariantDetail[]): ProductVariantDetail[] {
  const colorOf = (variant: ProductVariantDetail, key: "color" | "colorway") =>
    String(variant.attributes[key] ?? "").trim();
  const key = variants.some((variant) => colorOf(variant, "colorway")) ? "colorway" : "color";
  const colored = variants.filter((variant) => colorOf(variant, key));
  if (colored.length === 0 || colored.length === variants.length) return variants;
  const fillable = (variant: ProductVariantDetail) =>
    colorOf(variant, key) !== "" || Object.keys(variant.attributes).length === 0;
  if (!variants.every(fillable)) return variants;
  return variants.map((variant) =>
    colorOf(variant, key)
      ? variant
      : { ...variant, attributes: { ...variant.attributes, [key]: variant.title } }
  );
}

export function VariantSelector({
  variants: storedVariants,
  media = [],
  selectedVariant: storedSelectedVariant,
  onSelectVariant: onSelectStoredVariant,
}: VariantSelectorProps): React.JSX.Element {
  const variants = useMemo(() => withTitleAsMissingColor(storedVariants), [storedVariants]);
  const selectedVariant =
    variants.find((variant) => variant.id === storedSelectedVariant.id) ?? storedSelectedVariant;
  // Hands the caller its own variant object, not the normalized copy.
  const onSelectVariant = (variant: ProductVariantDetail) =>
    onSelectStoredVariant(storedVariants.find((stored) => stored.id === variant.id) ?? variant);
  const { dimensions, useFallback } = useMemo(() => resolveDimensions(variants), [variants]);

  if (variants.length <= 1) {
    return <></>;
  }

  // Full-title fallback mode when generic dimensions are ambiguous or missing
  if (useFallback || dimensions.length === 0) {
    const hasDuplicateTitles = new Set(variants.map((v) => v.title)).size !== variants.length;

    return (
      <div className={styles.selectorContainer} data-testid="variant-selector-fallback">
        <div className={styles.fallbackTitleSelector}>
          <span className={styles.dimensionLabel}>Variante:</span>
          <div className={styles.optionsGroup} role="radiogroup" aria-label="Seleccionar variante">
            {variants.map((variant) => {
              const isSelected = variant.id === selectedVariant.id;
              const imageUrl = imageForVariant(variant, media);
              const displayLabel = hasDuplicateTitles
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
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt=""
                      width={44}
                      height={44}
                      className={styles.swatchImage}
                    />
                  )}
                  <span>{displayLabel}</span>
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
              <span className={styles.dimensionLabel}>
                {dim.isColor ? "Color" : /^(size|talla|tamano)$/.test(dim.key) ? "Tamaño" : dim.key}
                :
              </span>
              <span className={styles.dimensionCurrentValue}>{currentValue}</span>
            </div>

            <div
              className={styles.optionsGroup}
              role="radiogroup"
              aria-label={`Seleccionar ${dim.key}`}
            >
              {dim.options.map((option) => {
                const isSelected = option === currentValue;

                // Check combination compatibility
                const isCompatible = isVariantOptionCompatible(
                  variants,
                  dimensions,
                  selectedVariant,
                  dim.key,
                  option
                );

                // Find target variant when clicking this option
                const handleOptionClick = () => {
                  if (isSelected || !isCompatible) return;
                  const target = resolveVariantForOption(
                    variants,
                    dimensions,
                    selectedVariant,
                    dim.key,
                    option
                  );
                  if (target) {
                    onSelectVariant(target);
                  }
                };

                // Check if swatch allowlist applies
                const normalizedColor = option.toLowerCase().trim();
                const swatchClass = dim.isColor ? SWATCH_ALLOWLIST[normalizedColor] : null;

                const optionVariant =
                  resolveVariantForOption(variants, dimensions, selectedVariant, dim.key, option) ??
                  variants.find((variant) => String(variant.attributes[dim.key]) === option);
                const variantImageUrl = imageForVariant(optionVariant, media);

                if (dim.isColor && (swatchClass || variantImageUrl)) {
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
                      {variantImageUrl ? (
                        <Image
                          className={styles.swatchImage}
                          src={variantImageUrl}
                          alt=""
                          width={44}
                          height={44}
                        />
                      ) : (
                        <span className={`${styles.swatchInnerCircle} ${swatchClass}`} />
                      )}
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
