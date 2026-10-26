"use client";

import React, { useOptimistic, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  ImageIcon,
  Search,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { ProductSelection, type ProductOption } from "@/components/admin/product-selection";
import type { ProductSelection as Selection } from "@/lib/catalog/curated-products";
import { defaultMenuContent, type EditableMenuContent } from "@/lib/navigation/menu-content-schema";
import {
  reorderMenuEntriesAction,
  setMenuEntryVisibilityAction,
  setMenuProductSelectionAction,
} from "@/lib/admin/menu/actions";
import { MenuContentEditor } from "./menu-content-editor";
import styles from "./menu.module.css";

export interface MenuEntryView {
  productSelection?: Selection;
  content?: EditableMenuContent;
  layout?: string;
  id: string;
  label: string;
  description: string;
  isVisible: boolean;
  categorySlug: string | null;
  publishedProducts: number | null;
  missingDestinations: string[];
}
interface MenuWorkspaceProps {
  products?: readonly ProductOption[];
  entries: MenuEntryView[];
}

export function MenuWorkspace({ entries, products = [] }: MenuWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(
    entries.find((entry) => entry.isVisible && entry.categorySlug)?.id ?? entries[0]?.id ?? ""
  );
  const [edits, setEdits] = useState<Record<string, EditableMenuContent>>({});
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [optimistic, applyOptimistic] = useOptimistic(
    entries,
    (_current: MenuEntryView[], next: MenuEntryView[]) => next
  );
  const active = optimistic.find((entry) => entry.id === activeId);
  const index = optimistic.findIndex((entry) => entry.id === activeId);
  const contentOf = (entry: MenuEntryView) =>
    edits[entry.id] ?? entry.content ?? defaultMenuContent(entry.id);
  const mutate = (
    run: () => Promise<{ success: boolean; error?: string }>,
    next: MenuEntryView[]
  ) => {
    setError(null);
    startTransition(async () => {
      applyOptimistic(next);
      try {
        const result = await run();
        if (!result.success) setError(result.error ?? "No se pudo guardar.");
        router.refresh();
      } catch {
        setError("No se pudo conectar. Inténtalo de nuevo.");
        router.refresh();
      }
    });
  };
  const move = (direction: -1 | 1) => {
    const next = [...optimistic];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    mutate(() => reorderMenuEntriesAction(next.map((entry) => entry.id)), next);
  };
  const selection = active ? (selections[active.id] ?? active.productSelection) : undefined;
  const categoryProducts = active?.categorySlug
    ? products.filter((product) => product.categorySlug === active.categorySlug)
    : [];
  const selectedProducts =
    selection?.mode === "manual"
      ? selection.productSlugs.flatMap((slug) => {
          const product = categoryProducts.find((product) => product.slug === slug);
          return product ? [product] : [];
        })
      : categoryProducts;
  const content = active ? contentOf(active) : null;
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Menú de la tienda</h1>
          <p className={styles.subtitle}>
            Elige una sección de la barra para ver y editar lo que encontrará el cliente.
          </p>
        </div>
        <span className={styles.liveBadge}>
          {optimistic.filter((entry) => entry.isVisible).length} secciones visibles
        </span>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.sectionRail} role="tablist" aria-label="Secciones del menú">
        {optimistic.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            tabIndex={entry.id === activeId ? 0 : -1}
            id={`menu-tab-${entry.id}`}
            aria-controls="menu-editor-preview"
            aria-selected={entry.id === activeId}
            onClick={() => setActiveId(entry.id)}
          >
            {contentOf(entry).label}
            {!entry.isVisible && <EyeOff size={13} aria-label="Oculta" />}
          </button>
        ))}
      </div>
      {active && content && (
        <section
          role="tabpanel"
          id="menu-editor-preview"
          aria-labelledby={`menu-tab-${active.id}`}
          className={styles.editor}
        >
          <div className={styles.previewHeading}>
            <div>
              <span className={styles.kicker}>VISTA DEL CLIENTE</span>
              <h2>{content.label}</h2>
            </div>
            <span className={styles.previewTag}>Vista previa del menú</span>
          </div>
          <div className={styles.storePreview}>
            <div className={styles.storeBar}>
              <strong>
                Gamer Perú<span>.</span>
              </strong>
              <div>
                {optimistic
                  .filter((entry) => entry.isVisible)
                  .map((entry) => (
                    <span key={entry.id} data-active={entry.id === active.id}>
                      {contentOf(entry).label}
                    </span>
                  ))}
              </div>
              <span className={styles.storeIcons}>
                <Search size={17} />
                <UserRound size={17} />
                <ShoppingCart size={17} />
              </span>
            </div>
            <div className={styles.scene} data-layout={active.categorySlug ? "catalog" : "links"}>
              {active.categorySlug ? (
                <>
                  <div className={styles.sceneLinks}>
                    <small>PRODUCTOS DESTACADOS</small>
                    {selectedProducts.slice(0, 6).map((product) => (
                      <span key={product.slug}>{product.name}</span>
                    ))}
                    <span className={styles.seeMore}>Ver más →</span>
                  </div>
                  <div className={styles.scenePromos}>
                    {selectedProducts.slice(0, 2).map((product, i) => (
                      <div key={product.slug}>
                        <div>
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              width={260}
                              height={200}
                            />
                          ) : (
                            <ImageIcon size={32} />
                          )}
                        </div>
                        <span>
                          <small>{i + 1}</small>
                          {product.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!selectedProducts.length && (
                    <p className={styles.blank}>Aquí aparecerán los productos que elijas.</p>
                  )}
                </>
              ) : (
                <div className={styles.sceneLinkGrid}>
                  {content.links
                    .filter((link) => link.isVisible)
                    .map((link) => (
                      <span key={link.id}>{link.label}</span>
                    ))}
                  {!content.links.some((link) => link.isVisible) && (
                    <p className={styles.blank}>Sin enlaces visibles.</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className={styles.controls}>
            <div className={styles.visibility}>
              <button
                type="button"
                role="switch"
                aria-checked={active.isVisible}
                aria-label={`${active.isVisible ? "Ocultar" : "Mostrar"} ${content.label} en el menú`}
                className={styles.secondaryButton}
                disabled={pending}
                onClick={() =>
                  mutate(
                    () => setMenuEntryVisibilityAction(active.id, !active.isVisible),
                    optimistic.map((entry) =>
                      entry.id === active.id ? { ...entry, isVisible: !entry.isVisible } : entry
                    )
                  )
                }
              >
                {active.isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                {active.isVisible ? "Visible en la tienda" : "Oculta en la tienda"}
              </button>
              <span>
                Posición {index + 1} de {optimistic.length}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Subir ${content.label}`}
                disabled={pending || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Bajar ${content.label}`}
                disabled={pending || index === optimistic.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown size={16} />
              </button>
            </div>
            <MenuContentEditor
              value={content}
              tileLayout={active.layout === "grid"}
              onSaved={(next) => {
                setEdits((current) => ({ ...current, [active.id]: next }));
                router.refresh();
              }}
            />
          </div>
          {active.categorySlug && (
            <ProductSelection
              products={products}
              categorySlug={active.categorySlug}
              value={selection}
              placementLabel={`Menú · ${content.label}`}
              disabled={pending}
              onChange={(next) => setSelections((current) => ({ ...current, [active.id]: next }))}
              onApply={async (next) => {
                const result = await setMenuProductSelectionAction(active.id, next);
                if (result.success) router.refresh();
                return result;
              }}
            />
          )}
          <p className={styles.hint}>
            <ChevronDown size={14} aria-hidden="true" /> Los cambios del menú se reflejan en la
            barra superior y en la navegación móvil.
          </p>
        </section>
      )}
    </div>
  );
}
