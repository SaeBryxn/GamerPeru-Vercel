"use client";

import React, { useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  type Transition,
  type Variants,
} from "framer-motion";
import { Mic, Package, X } from "lucide-react";
import { CloseButton, Icon } from "@/components/ui";
import { getQueryCodePointLength } from "@/lib/search/normalization";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/search/types";
import { formatCurrency } from "@/lib/utils/currency";
import { usePredictiveSearch, type PredictiveSearchState } from "./use-predictive-search";
import { useVoiceSearch } from "./use-voice-search";
import styles from "./search-drawer.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

// Anchored to the right edge: slides in toward the center and back out.
const PANEL_VARIANTS: Variants = {
  hidden: { x: "100%", transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } },
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

// The floating close button trails the cursor with a light, quick spring.
const FOLLOW_SPRING = { stiffness: 700, damping: 45, mass: 0.35 } as const;
const FLOATING_FADE: Transition = { duration: 0.22, ease: EASE_OUT_EXPO };

export interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Right-hand search panel: header, search field with voice dictation, and live
 * suggestions from the catalog. Enter (or "Ver todos") opens the full /buscar
 * results page.
 */
export function SearchDrawer({ isOpen, onClose }: SearchDrawerProps) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState("");
  const [showFloatingClose, setShowFloatingClose] = useState(false);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const followX = useSpring(pointerX, FOLLOW_SPRING);
  const followY = useSpring(pointerY, FOLLOW_SPRING);

  const voice = useVoiceSearch(setQuery);
  const suggestions = usePredictiveSearch(query);
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
    setShowFloatingClose(false);
    onClose();
  };

  const handleExitComplete = () => {
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

  // Mouse only: the floating button replaces the cursor over the backdrop.
  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    if (!showFloatingClose) {
      pointerX.jump(e.clientX);
      pointerY.jump(e.clientY);
      followX.jump(e.clientX);
      followY.jump(e.clientY);
      setShowFloatingClose(true);
      return;
    }
    pointerX.set(e.clientX);
    pointerY.set(e.clientY);
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
            className={styles.overlay}
            onClick={close}
            onPointerMove={handleOverlayPointerMove}
            onPointerLeave={() => setShowFloatingClose(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.4 } }}
            exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.05 } }}
            aria-hidden="true"
            data-testid="search-drawer-overlay"
          />
        )}

        {/*
          Decorative: clicks pass through to the backdrop, which closes the
          panel. Keyboard and screen reader users get the header close button.
        */}
        {isOpen && showFloatingClose && (
          <motion.div
            key="floating-close"
            className={styles.floatingClose}
            style={{ x: followX, y: followY }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: FLOATING_FADE }}
            exit={{ opacity: 0, scale: 0.6, transition: FLOATING_FADE }}
            aria-hidden="true"
            data-testid="search-drawer-floating-close"
          >
            <Icon icon={X} size="lg" />
          </motion.div>
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
            <header className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                Buscar
              </h2>
              <CloseButton
                tone="light"
                className={styles.closeButton}
                onClick={close}
                aria-label="Cerrar búsqueda"
              />
            </header>

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
              <DrawerSuggestions state={suggestions} query={cleanQuery} onNavigate={close} />
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

function DrawerSuggestions({
  state,
  query,
  onNavigate,
}: {
  state: PredictiveSearchState;
  query: string;
  onNavigate: () => void;
}) {
  if (state.status === "idle") {
    return (
      <p className={styles.hintText}>
        Escribe al menos 2 caracteres para buscar productos, marcas o categorías.
      </p>
    );
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
