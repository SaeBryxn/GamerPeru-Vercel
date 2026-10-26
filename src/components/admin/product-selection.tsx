"use client";

import React, { useId, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  ImageIcon,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import type { ProductSelection as Selection } from "@/lib/catalog/curated-products";
import styles from "./product-selection.module.css";

export interface ProductOption {
  id?: string;
  slug: string;
  name: string;
  categorySlug: string;
  imageUrl?: string | null;
  brandName?: string;
}

function ProductPhoto({ product, small = false }: { product?: ProductOption; small?: boolean }) {
  return (
    <span className={`${styles.photo} ${small ? styles.photoSmall : ""}`}>
      {product?.imageUrl ? (
        <Image src={product.imageUrl} alt="" width={160} height={160} loading="lazy" />
      ) : (
        <ImageIcon size={22} aria-hidden="true" />
      )}
    </span>
  );
}

export function ProductSelection({
  value,
  onChange,
  products,
  categorySlug,
  limit = 24,
  disabled = false,
  placementLabel = "Productos destacados",
  onApply,
}: {
  value?: Selection;
  onChange: (next: Selection) => void;
  products: readonly ProductOption[];
  categorySlug?: string;
  limit?: number;
  disabled?: boolean;
  placementLabel?: string;
  onApply?: (next: Selection) => Promise<{ success: boolean; error?: string }>;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Selection>({ mode: "automatic", productSlugs: [] });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const selection = value ?? { mode: "automatic", productSlugs: [] };
  const scoped = products.filter(
    (product) => !categorySlug || product.categorySlug === categorySlug
  );
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const preview =
    selection.mode === "manual"
      ? selection.productSlugs
      : scoped.slice(0, 4).map((product) => product.slug);
  const close = () => {
    if (!pending) {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };
  const toggle = (slug: string) => {
    const current = draft.mode === "manual" ? draft.productSlugs : [];
    const selected = current.includes(slug);
    if (!selected && current.length >= limit) return;
    setDraft({
      mode: "manual",
      productSlugs: selected ? current.filter((item) => item !== slug) : [...current, slug],
    });
    setAnnouncement(`${bySlug.get(slug)?.name ?? slug} ${selected ? "quitado" : "agregado"}.`);
  };
  const move = (index: number, direction: number) => {
    const next = [...draft.productSlugs];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setDraft({ ...draft, productSlugs: next });
    setAnnouncement(
      `${bySlug.get(next[target])?.name ?? "Producto"} en la posición ${target + 1}.`
    );
  };
  const apply = async () => {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const result = onApply ? await onApply(draft) : { success: true };
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar la selección.");
        return;
      }
      onChange(draft);
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    } catch {
      setError("No se pudo conectar. Conservamos tu selección para reintentar.");
    } finally {
      setPending(false);
    }
  };
  const matches = scoped.filter(
    (product) =>
      (!category || product.categorySlug === category) &&
      `${product.name} ${product.brandName ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es"))
  );
  return (
    <>
      <div className={styles.summary}>
        <div className={styles.summaryHead}>
          <div>
            <strong>{placementLabel}</strong>
            <p>
              {selection.mode === "manual"
                ? `${selection.productSlugs.length} productos elegidos · orden personalizado`
                : "Selección automática del catálogo"}
            </p>
          </div>
          <button
            ref={trigger}
            type="button"
            className={styles.edit}
            disabled={disabled}
            onClick={() => {
              setDraft({ ...selection, productSlugs: [...selection.productSlugs] });
              setSearch("");
              setCategory("");
              setError("");
              setOpen(true);
            }}
          >
            Elegir productos <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        {preview.length ? (
          <ol className={styles.preview} aria-label="Vista previa de productos destacados">
            {preview.slice(0, 4).map((slug, index) => (
              <li key={slug}>
                <ProductPhoto product={bySlug.get(slug)} small />
                <span>
                  <small>{index + 1}</small>
                  {bySlug.get(slug)?.name ?? "Producto no disponible"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.quiet}>
            Sin productos destacados. Usa «Elegir productos» para armar esta sección.
          </p>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <SideDrawer
            labelledBy={`${id}-title`}
            onClose={close}
            busy={pending}
            size="wide"
            testId="product-selection-drawer"
          >
            <DrawerHeader
              titleId={`${id}-title`}
              title="Elige los productos"
              eyebrow={placementLabel}
              onClose={close}
              busy={pending}
            />
            <div className={styles.toolbar}>
              <div className={styles.segmented} role="group" aria-label="Modo de selección">
                <button
                  type="button"
                  aria-pressed={draft.mode === "manual"}
                  disabled={pending}
                  onClick={() => setDraft({ ...draft, mode: "manual" })}
                >
                  Elegir y ordenar
                </button>
                <button
                  type="button"
                  aria-pressed={draft.mode === "automatic"}
                  disabled={pending}
                  onClick={() => setDraft({ ...draft, mode: "automatic" })}
                >
                  Automático
                </button>
              </div>
              <p>
                {draft.mode === "manual"
                  ? "Agrega desde el catálogo y ordena la lista de la derecha."
                  : "La tienda usa los productos publicados del catálogo. Elige un producto para personalizar la selección."}
              </p>
            </div>
            <div className={styles.workspace} aria-busy={pending}>
              <section className={styles.catalog} aria-labelledby={`${id}-catalog`}>
                <div className={styles.sectionHead}>
                  <h3 id={`${id}-catalog`}>Catálogo</h3>
                  <span>{scoped.length} productos</span>
                </div>
                <div className={styles.filters}>
                  <label className={styles.search}>
                    <Search size={17} aria-hidden="true" />
                    <input
                      aria-label="Buscar producto"
                      type="search"
                      value={search}
                      placeholder="Buscar por nombre o marca…"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  {!categorySlug && (
                    <select
                      aria-label="Filtrar categoría"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      <option value="">Todas las categorías</option>
                      {[...new Set(products.map((product) => product.categorySlug))].map((slug) => (
                        <option key={slug} value={slug}>
                          {slug}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.productGrid}>
                  {matches.map((product) => {
                    const selected =
                      draft.mode === "manual" && draft.productSlugs.includes(product.slug);
                    return (
                      <button
                        type="button"
                        key={product.slug}
                        className={styles.product}
                        data-selected={selected}
                        aria-pressed={selected}
                        disabled={
                          pending ||
                          (draft.mode === "manual" &&
                            !selected &&
                            draft.productSlugs.length >= limit)
                        }
                        onClick={() => toggle(product.slug)}
                        aria-label={`${selected ? "Quitar" : "Agregar"} ${product.name}`}
                      >
                        <ProductPhoto product={product} />
                        <span className={styles.productCopy}>
                          <small>{product.brandName ?? product.categorySlug}</small>
                          <strong>{product.name}</strong>
                        </span>
                        <span className={styles.check}>
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!matches.length && (
                  <p className={styles.empty}>No encontramos productos con esa búsqueda.</p>
                )}
              </section>
              <section className={styles.ordered} aria-labelledby={`${id}-order`}>
                <div className={styles.sectionHead}>
                  <h3 id={`${id}-order`}>Así se mostrarán</h3>
                  <span>
                    {draft.mode === "manual" ? draft.productSlugs.length : "Auto"}/{limit}
                  </span>
                </div>
                <p className={styles.quiet}>
                  El primero abre la selección. Las flechas cambian su posición.
                </p>
                {draft.mode === "automatic" ? (
                  <p className={styles.empty}>
                    El orden lo define el catálogo. Cambia a «Elegir y ordenar» para personalizarlo.
                  </p>
                ) : (
                  <ol className={styles.orderedList}>
                    {draft.productSlugs.map((slug, index) => {
                      const product = bySlug.get(slug);
                      const name = product?.name ?? slug;
                      return (
                        <li key={slug}>
                          <span className={styles.position}>{index + 1}</span>
                          <ProductPhoto product={product} small />
                          <div className={styles.orderCopy}>
                            <strong>{name}</strong>
                            <small>
                              {product
                                ? (product.brandName ?? product.categorySlug)
                                : "Ya no está disponible"}
                            </small>
                          </div>
                          <div className={styles.orderActions}>
                            <button
                              type="button"
                              aria-label={`Subir ${name}`}
                              disabled={pending || index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Bajar ${name}`}
                              disabled={pending || index === draft.productSlugs.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Quitar de la selección ${name}`}
                              disabled={pending}
                              onClick={() => toggle(slug)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {draft.mode === "manual" && !draft.productSlugs.length && (
                  <div className={styles.empty}>
                    <ImageIcon size={28} />
                    <strong>Arma tu selección</strong>
                    <p>
                      Toca las fotos del catálogo para agregarlas. Si guardas sin elegir productos,
                      esta fila quedará vacía.
                    </p>
                  </div>
                )}
              </section>
            </div>
            <p className={styles.srOnly} aria-live="polite">
              {announcement}
            </p>
            <footer className={styles.footer}>
              <div>
                {error ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : (
                  <p>
                    {onApply
                      ? "Los cambios se publican al guardar."
                      : "Aplica la selección y luego guarda la sección del home."}
                  </p>
                )}
              </div>
              <button type="button" className={styles.cancel} disabled={pending} onClick={close}>
                Cancelar
              </button>
              <button
                type="button"
                className={styles.save}
                disabled={pending}
                onClick={() => void apply()}
              >
                {pending ? "Guardando…" : onApply ? "Guardar selección" : "Aplicar selección"}
              </button>
            </footer>
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}
