"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { getQueryCodePointLength } from "@/lib/search/normalization";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";
import { PredictiveResults, type PredictiveProductDTO } from "./predictive-results";
import styles from "./search-modal.module.css";

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export function SearchModal({ isOpen, onClose, initialQuery = "" }: SearchModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef<number>(0);

  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<PredictiveProductDTO[]>([]);
  const [brands, setBrands] = useState<Array<{ name: string; slug: string }>>([]);
  const [categories, setCategories] = useState<Array<{ name: string; slug: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      if (dialog.open) {
        dialog.close();
      }
      abortControllerRef.current?.abort();
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const cleanQuery = query.trim();

    if (getQueryCodePointLength(cleanQuery) < MIN_SEARCH_QUERY_LENGTH) {
      abortControllerRef.current?.abort();
      setProducts([]);
      setBrands([]);
      setCategories([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const timer = setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentReqId = ++reqIdRef.current;

      try {
        const response = await fetch(`/api/search/predictive?q=${encodeURIComponent(cleanQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (currentReqId !== reqIdRef.current) {
          return;
        }

        if (!response.ok) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        if (currentReqId === reqIdRef.current) {
          setProducts(data.products ?? []);
          setBrands(data.brands ?? []);
          setCategories(data.categories ?? []);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return;
        }
        if (currentReqId === reqIdRef.current) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
      e.preventDefault();
      onClose();
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleClear = () => {
    setQuery("");
    setProducts([]);
    setBrands([]);
    setCategories([]);
    setHasError(false);
    setIsLoading(false);
    inputRef.current?.focus();
  };

  const cleanQuery = query.trim();

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label="Búsqueda de productos"
    >
      <div className={styles.modalHeader}>
        <form method="GET" action="/buscar" className={styles.searchForm}>
          <div className={styles.inputWrapper}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={20} />
            </span>
            <input
              ref={inputRef}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar periféricos, marcas..."
              className={styles.searchInput}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              maxLength={100}
              aria-label="Término de búsqueda"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className={styles.clearButton}
                aria-label="Limpiar búsqueda"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </form>

        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Cerrar búsqueda"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.modalBody}>
        <PredictiveResults
          query={query}
          products={products}
          brands={brands}
          categories={categories}
          isLoading={isLoading}
          hasError={hasError}
          onLinkClick={onClose}
        />
      </div>

      {getQueryCodePointLength(cleanQuery) >= MIN_SEARCH_QUERY_LENGTH && (
        <div className={styles.modalFooter}>
          <Link
            href={`/buscar?q=${encodeURIComponent(cleanQuery)}`}
            className={styles.seeAllButton}
            onClick={onClose}
          >
            Ver todos los resultados para &ldquo;{cleanQuery}&rdquo;
          </Link>
        </div>
      )}
    </dialog>
  );
}
