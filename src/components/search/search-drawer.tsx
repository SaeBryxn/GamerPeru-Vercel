"use client";

import React, { useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Mic, Package, Search, X } from "lucide-react";
import { CloseButton, FloatingClose, Icon, useFloatingClose } from "@/components/ui";
import { getQueryCodePointLength } from "@/lib/search/normalization";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";
import { formatCurrency } from "@/lib/utils/currency";
import { usePredictiveSearch, type PredictiveSearchState } from "./use-predictive-search";
import type { SearchSuggestionGroup } from "./search-suggestions";
import { useVoiceSearch } from "./use-voice-search";
import styles from "./search-drawer.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

const PANEL_VARIANTS: Variants = {
  hidden: { x: "100%", transition: { duration: 0.4, ease: [0.4, 0, 1, 1] } },
  visible: {
    x: 0,
    transition: {
      duration: 0.6,
      ease: EASE_OUT_EXPO,
      staggerChildren: 0.05,
      delayChildren: 0.18,
    },
  },
};

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

export interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Collections and products listed before anything is typed. */
  suggestions?: SearchSuggestionGroup[];
}

/**
 * Full-height search panel docked to the right edge: header, search field with voice dictation, and live
 * suggestions from the catalog. Before anything is typed it lists featured products by
 * collection. Enter (or "Ver todos") opens the full /buscar results page.
 */
export function SearchDrawer({ isOpen, onClose, suggestions = [] }: SearchDrawerProps) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const [query, setQuery] = useState("");
  const floatingClose = useFloatingClose();

  const voice = useVoiceSearch(setQuery);
  const predictive = usePredictiveSearch(query);
  const cleanQuery = query.trim();
  const canSearchAll = getQueryCodePointLength(cleanQuery) >= MIN_SEARCH_QUERY_LENGTH;
  const searchAllHref = `/buscar?q=${encodeURIComponent(cleanQuery)}`;

  // The native modal dialog provides the focus trap, inert page and Escape.
  // It opens before paint so the entrance plays inside it, and closes only
  // after every exit animation has finished (see handleExitComplete).
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      triggerRef.current = document.activeElement as HTMLElement;
      dialog.showModal();
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const close = () => {
    voice.stop();
    floatingClose.hide();
    onClose();
  };

  // Guarded so a late exit callback can never close a dialog that was reopened in the meantime.
  const handleExitComplete = () => {
    if (isOpenRef.current) return;
    dialogRef.current?.close();
    setQuery("");
    triggerRef.current?.focus();
  };

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    close();
  };

  // Escape is handled directly as well: browsers may skip the dialog "cancel"
  // event (close-watcher heuristics), which would leave the panel stuck open.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSearchAll) return;
    router.push(searchAllHref);
    close();
  };

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      aria-label="Búsqueda de productos"
      data-testid="search-drawer"
    >
      <AnimatePresence onExitComplete={handleExitComplete}>
        {isOpen && (
          <motion.div
            key="overlay"
            {...floatingClose.targetProps}
            className={`${styles.overlay} ${floatingClose.targetProps.className}`}
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.4 } }}
            exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.05 } }}
            aria-hidden="true"
            data-testid="search-drawer-overlay"
          />
        )}

        {isOpen && (
          <motion.div
            key="panel"
            className={styles.panel}
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <div className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                Buscar
              </h2>
              <CloseButton
                tone="light"
                className={styles.closeButton}
                onClick={close}
                aria-label="Cerrar búsqueda"
              />
            </div>

            <motion.form
              role="search"
              aria-labelledby={titleId}
              className={styles.form}
              onSubmit={handleSubmit}
              variants={SECTION_VARIANTS}
            >
              <div className={styles.field}>
                <input
                  ref={inputRef}
                  type="search"
                  name="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar productos..."
                  className={styles.input}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={100}
                  aria-label="Término de búsqueda"
                />
                {query.length === 0 && (
                  <Icon icon={Search} size="sm" className={styles.searchGlyph} aria-hidden="true" />
                )}
                {query.length > 0 && (
                  <button
                    type="button"
                    className={styles.fieldButton}
                    onClick={handleClear}
                    aria-label="Limpiar búsqueda"
                  >
                    <Icon icon={X} size="sm" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.fieldButton} ${voice.isListening ? styles.fieldButtonActive : ""}`}
                  onClick={voice.toggle}
                  disabled={!voice.isSupported}
                  aria-pressed={voice.isListening}
                  aria-label={voice.isListening ? "Detener búsqueda por voz" : "Buscar por voz"}
                  title={
                    voice.isSupported ? undefined : "La búsqueda por voz no está disponible aquí"
                  }
                  data-testid="search-voice-button"
                >
                  {voice.isListening && (
                    <motion.span
                      className={styles.listeningPulse}
                      initial={{ scale: 0.8, opacity: 0.6 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
                      aria-hidden="true"
                    />
                  )}
                  <Icon icon={Mic} size="md" aria-hidden="true" />
                </button>
              </div>
            </motion.form>

            <motion.div className={styles.results} variants={SECTION_VARIANTS} aria-live="polite">
              <DrawerSuggestions
                state={predictive}
                query={cleanQuery}
                defaults={suggestions}
                onNavigate={close}
              />
            </motion.div>

            {canSearchAll && (
              <motion.div className={styles.footer} variants={SECTION_VARIANTS}>
                <Link href={searchAllHref} className={styles.searchAllLink} onClick={close}>
                  Ver todos los resultados para &ldquo;{cleanQuery}&rdquo;
                </Link>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/*
        Kept outside the panel's AnimatePresence: it toggles while the panel is open (the panel
        sliding under the cursor fires pointerleave), and its exit must not run
        handleExitComplete and close the dialog mid-entrance.
      */}
      <FloatingClose
        state={floatingClose}
        active={isOpen}
        data-testid="search-drawer-floating-close"
      />
    </dialog>
  );
}

const LIST_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT_EXPO } },
};

function DefaultSuggestions({
  groups,
  onNavigate,
}: {
  groups: SearchSuggestionGroup[];
  onNavigate: () => void;
}) {
  if (groups.length === 0) {
    return <p className={styles.hintText}>Busca por producto, marca o categoría.</p>;
  }
  return (
    <motion.div initial="hidden" animate="visible" variants={LIST_VARIANTS}>
      {groups.map((group) => (
        <motion.section
          key={group.href}
          className={styles.suggestGroup}
          aria-label={group.title}
          variants={ROW_VARIANTS}
        >
          <h3 className={styles.suggestTitle}>
            <Link href={group.href} onClick={onNavigate} className={styles.suggestTitleLink}>
              {group.title}
            </Link>
          </h3>
          <ul className={styles.suggestList}>
            {group.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.suggestLink} onClick={onNavigate}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </motion.div>
  );
}

function DrawerSuggestions({
  state,
  query,
  defaults,
  onNavigate,
}: {
  state: PredictiveSearchState;
  query: string;
  defaults: SearchSuggestionGroup[];
  onNavigate: () => void;
}) {
  if (state.status === "idle") {
    return <DefaultSuggestions groups={defaults} onNavigate={onNavigate} />;
  }

  if (state.status === "loading") {
    return (
      <ul className={styles.skeletonList} aria-label="Buscando productos">
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.skeletonRow} aria-hidden="true">
            <span className={styles.skeletonThumb} />
            <span className={styles.skeletonLines}>
              <span />
              <span />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (state.status === "error") {
    return (
      <p className={styles.emptyText}>
        No pudimos cargar sugerencias. Presiona Enter para ver todos los resultados.
      </p>
    );
  }

  const { products, brands, categories } = state;
  if (products.length === 0 && brands.length === 0 && categories.length === 0) {
    return <p className={styles.emptyText}>No encontramos productos para &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <motion.div key={query} initial="hidden" animate="visible" variants={LIST_VARIANTS}>
      {products.length > 0 && (
        <section className={styles.group} aria-label="Productos sugeridos">
          <h3 className={styles.groupTitle}>Productos</h3>
          <motion.ul className={styles.productList} variants={LIST_VARIANTS}>
            {products.map((product) => (
              <motion.li key={product.id} variants={ROW_VARIANTS}>
                <Link
                  href={`/productos/${product.slug}`}
                  className={styles.productRow}
                  onClick={onNavigate}
                >
                  <span className={styles.productThumb}>
                    {product.primaryMedia?.src ? (
                      <Image
                        src={product.primaryMedia.src}
                        alt=""
                        width={56}
                        height={56}
                        className={styles.productImage}
                      />
                    ) : (
                      <Icon icon={Package} size="md" aria-hidden="true" />
                    )}
                  </span>
                  <span className={styles.productText}>
                    <span className={styles.productBrand}>{product.brand.name}</span>
                    <span className={styles.productName}>{product.name}</span>
                  </span>
                  <span className={styles.productPrice}>
                    {formatCurrency(product.startingPriceCents)}
                  </span>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}

      {(brands.length > 0 || categories.length > 0) && (
        <motion.section
          className={styles.group}
          aria-label="Marcas y categorías sugeridas"
          variants={ROW_VARIANTS}
        >
          <h3 className={styles.groupTitle}>Explorar</h3>
          <ul className={styles.chipList}>
            {brands.map((brand) => (
              <li key={`brand-${brand.slug}`}>
                <Link href={`/marcas/${brand.slug}`} className={styles.chip} onClick={onNavigate}>
                  {brand.name}
                </Link>
              </li>
            ))}
            {categories.map((category) => (
              <li key={`category-${category.slug}`}>
                <Link
                  href={`/categorias/${category.slug}`}
                  className={styles.chip}
                  onClick={onNavigate}
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
