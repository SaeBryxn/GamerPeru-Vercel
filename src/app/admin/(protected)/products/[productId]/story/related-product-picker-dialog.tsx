"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";
import { searchStoryRelatedProductsAction } from "@/lib/admin/catalog/story-actions";
import type { AdminStoryRelatedProductOption } from "@/lib/admin/catalog/story-reader";
import styles from "./story-builder.module.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface RelatedProductPickerDialogProps {
  isOpen: boolean;
  currentProductId: string;
  alreadySelectedProductIds: readonly string[];
  triggerRef: React.RefObject<HTMLElement | null>;
  onSelectProduct: (product: AdminStoryRelatedProductOption) => void;
  onClose: () => void;
}

export function RelatedProductPickerDialog({
  isOpen,
  currentProductId,
  alreadySelectedProductIds,
  triggerRef,
  onSelectProduct,
  onClose,
}: RelatedProductPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<AdminStoryRelatedProductOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestRequestId = useRef(0);

  // Perform search when dialog opens or searchQuery changes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setResults([]);
      setErrorMessage(null);
      return;
    }

    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    setErrorMessage(null);

    const timer = setTimeout(async () => {
      try {
        const actionResult = await searchStoryRelatedProductsAction({
          productId: currentProductId,
          query: searchQuery,
        });

        // Guard against race conditions: ignore older responses
        if (requestId !== latestRequestId.current) return;

        if (actionResult.success && actionResult.data) {
          setResults(actionResult.data);
        } else {
          setErrorMessage(actionResult.error ?? "No se pudo realizar la búsqueda.");
          setResults([]);
        }
      } catch {
        if (requestId === latestRequestId.current) {
          setErrorMessage("Error de conexión al buscar productos.");
          setResults([]);
        }
      } finally {
        if (requestId === latestRequestId.current) {
          setIsLoading(false);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, currentProductId]);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusFirst = () => {
      if (dialog.contains(document.activeElement) && document.activeElement !== dialog) {
        return;
      }
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? dialog).focus();
    };
    focusFirst();
    const timer = window.setTimeout(focusFirst, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        window.setTimeout(() => triggerRef.current?.focus(), 10);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !dialog.contains(target)) {
        event.stopPropagation();
        focusFirst();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <div
        ref={dialogRef}
        className={`${styles.modalContent} ${styles.productSearchModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="related-product-dialog-title"
        tabIndex={-1}
        data-testid="related-product-picker-dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 id="related-product-dialog-title">Buscar productos relacionados</h2>
            <p>Selecciona un producto del catálogo para vincularlo a esta sección.</p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              onClose();
              window.setTimeout(() => triggerRef.current?.focus(), 10);
            }}
            aria-label="Cerrar búsqueda de productos"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.pickerSearch}>
          <Search size={16} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o slug…"
            aria-label="Buscar producto"
            className={styles.searchInput}
            autoFocus
            data-testid="related-product-search-input"
          />
        </div>

        {errorMessage && (
          <p className={styles.searchErrorMessage} role="alert">
            {errorMessage}
          </p>
        )}

        <div className={styles.productSearchResultsList}>
          {isLoading ? (
            <div className={styles.searchLoading}>
              <Loader2 size={20} className={styles.spinner} aria-hidden="true" />
              <span>Buscando productos…</span>
            </div>
          ) : results.length === 0 ? (
            <p className={styles.emptySearchMessage}>
              {searchQuery.trim()
                ? "No se encontraron productos coincidentes."
                : "No hay productos disponibles para seleccionar."}
            </p>
          ) : (
            results.map((product) => {
              const isAlreadySelected = alreadySelectedProductIds.includes(product.productId);
              return (
                <div
                  key={product.productId}
                  className={styles.productSearchRow}
                  data-testid={`related-product-row-${product.productId}`}
                >
                  <div className={styles.productSearchInfo}>
                    <strong>{product.name}</strong>
                    <span className={styles.productSearchSlug}>/{product.slug}</span>
                    <div className={styles.productEligibilityBadge}>
                      {product.isPublicEligible ? (
                        <span className={styles.eligibleBadge}>
                          <CheckCircle2 size={12} aria-hidden="true" /> Elegible para publicación
                        </span>
                      ) : (
                        <span className={styles.notEligibleBadge}>
                          <AlertCircle size={12} aria-hidden="true" /> No elegible para publicación
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={isAlreadySelected}
                    onClick={() => {
                      onSelectProduct(product);
                      onClose();
                      window.setTimeout(() => triggerRef.current?.focus(), 10);
                    }}
                    aria-label={
                      isAlreadySelected
                        ? `${product.name} ya está seleccionado`
                        : `Agregar ${product.name}`
                    }
                    data-testid={`select-related-product-${product.productId}`}
                  >
                    {isAlreadySelected ? (
                      "Ya agregado"
                    ) : (
                      <>
                        <Plus size={16} aria-hidden="true" />
                        Agregar
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
