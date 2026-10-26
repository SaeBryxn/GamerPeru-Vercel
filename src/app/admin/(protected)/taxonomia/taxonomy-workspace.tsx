"use client";
import { useRouter } from "next/navigation";

import React, { useState, useTransition, useRef } from "react";
import Link from "@/components/app-link";
import { AnimatePresence } from "framer-motion";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import { Check, Pencil, Plus, Folder, Tag } from "lucide-react";
import { useUnsavedDraft } from "@/components/admin/use-unsaved-draft";
import { createTaxonomyAction, updateTaxonomyAction } from "@/lib/admin/taxonomy/actions";
import type { TaxonomyKind, TaxonomyRow, TaxonomyStatus } from "@/lib/admin/taxonomy/service";
import styles from "./taxonomy.module.css";

interface TaxonomyWorkspaceProps {
  categories: TaxonomyRow[];
  brands: TaxonomyRow[];
}

interface DraftState {
  name: string;
  slug: string;
  status: TaxonomyStatus;
  displayOrder: string;
}

const EMPTY_DRAFT: DraftState = { name: "", slug: "", status: "PUBLISHED", displayOrder: "0" };

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const STATUS_LABEL: Record<TaxonomyStatus, string> = {
  PUBLISHED: "Publicada",
  DRAFT: "Borrador",
  ARCHIVED: "Archivada",
};

function TaxonomyPanel({
  kind,
  title,
  description,
  rows,
}: {
  kind: TaxonomyKind;
  title: string;
  description: string;
  rows: TaxonomyRow[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const baseline = useRef(EMPTY_DRAFT);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useUnsavedDraft(
    (isCreating || editingId !== null) && JSON.stringify(draft) !== JSON.stringify(baseline.current)
  );
  const openCreate = () => {
    baseline.current = EMPTY_DRAFT;
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setIsCreating(true);
  };

  const openEdit = (row: TaxonomyRow) => {
    setIsCreating(false);
    setEditingId(row.id);
    setError(null);
    baseline.current = {
      name: row.name,
      slug: row.slug,
      status: row.status,
      displayOrder: String(row.displayOrder ?? 0),
    };
    setDraft(baseline.current);
  };

  const close = () => {
    if (isPending) return;
    setIsCreating(false);
    setEditingId(null);
    setError(null);
  };

  const requestClose = () => {
    if (isPending) return;
    if (
      JSON.stringify(draft) !== JSON.stringify(baseline.current) &&
      !window.confirm("Tienes cambios sin guardar. ¿Descartarlos y cerrar?")
    )
      return;
    close();
  };
  const submit = () => {
    setError(null);
    const input = {
      name: draft.name,
      slug: draft.slug || slugify(draft.name),
      status: draft.status,
      displayOrder: Number(draft.displayOrder) || 0,
    };

    startTransition(async () => {
      try {
        const result = editingId
          ? await updateTaxonomyAction(kind, editingId, input)
          : await createTaxonomyAction(kind, input);
        if (!result.success) {
          setError(result.error ?? "No se pudo guardar.");
          return;
        }
        router.refresh();
        close();
      } catch {
        setError("No se pudo confirmar el guardado. Vuelve a intentar.");
      }
    });
  };

  const editing = rows.find((row) => row.id === editingId);
  const previewSlug = draft.slug || slugify(draft.name);
  const form = (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={isPending} className={styles.drawerFieldset}>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Nombre</span>
            <input
              className={styles.input}
              value={draft.name}
              onChange={(event) => {
                const name = event.target.value;
                setDraft((prev) => ({
                  ...prev,
                  name,
                  slug: editingId ? prev.slug : slugify(name),
                }));
              }}
              placeholder={kind === "category" ? "Ej: Teclados Gaming" : "Ej: Logitech"}
              data-testid={`${kind}-name-input`}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>URL</span>
            <input
              className={styles.input}
              value={draft.slug}
              onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="teclados-gaming"
              data-testid={`${kind}-slug-input`}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Estado</span>
            <select
              className={styles.input}
              value={draft.status}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, status: event.target.value as TaxonomyStatus }))
              }
            >
              <option value="PUBLISHED">Publicada</option>
              <option value="DRAFT">Borrador</option>
              <option value="ARCHIVED">Archivada</option>
            </select>
          </label>

          {kind === "category" && (
            <label className={styles.field}>
              <span className={styles.label}>Orden</span>
              <input
                className={styles.input}
                type="number"
                value={draft.displayOrder}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, displayOrder: event.target.value }))
                }
              />
            </label>
          )}
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </fieldset>
      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryButton} onClick={close}>
          Cancelar
        </button>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isPending}
          data-testid={`${kind}-submit`}
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );

  return (
    <section className={styles.panel} aria-labelledby={`${kind}-title`}>
      <header className={styles.panelHeader}>
        <div>
          <h2 id={`${kind}-title`} className={styles.panelTitle}>
            {title}
          </h2>
          <p className={styles.panelDescription}>{description}</p>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={openCreate}
          data-testid={`${kind}-new`}
        >
          <Plus size={14} aria-hidden="true" />
          <span>Nueva</span>
        </button>
      </header>

      <AnimatePresence>
        {(isCreating || editingId) && (
          <SideDrawer
            labelledBy={`${kind}-drawer-title`}
            onClose={requestClose}
            busy={isPending}
            size="wide"
            testId={`${kind}-drawer`}
          >
            <DrawerHeader
              titleId={`${kind}-drawer-title`}
              title={
                isCreating
                  ? `Nueva ${kind === "category" ? "categoría" : "marca"}`
                  : `Editar ${editing?.name ?? title}`
              }
              eyebrow="Categorías y marcas"
              onClose={requestClose}
              busy={isPending}
            />
            <div className={styles.drawerLayout}>
              <aside className={styles.previewPane}>
                <p className={styles.previewLabel}>Vista previa de la colección</p>
                <div className={styles.collectionPreview}>
                  <div className={styles.collectionNav}>
                    Gamer Perú <span>Productos</span>
                  </div>
                  <div className={styles.collectionBody}>
                    {kind === "category" ? (
                      <Folder size={28} aria-hidden="true" />
                    ) : (
                      <Tag size={28} aria-hidden="true" />
                    )}
                    <small>{kind === "category" ? "Categoría" : "Marca"}</small>
                    <h3>
                      {draft.name ||
                        (kind === "category" ? "Nombre de la categoría" : "Nombre de la marca")}
                    </h3>
                    <p>{editing?.productCount ?? 0} productos asociados</p>
                    <span className={styles.collectionStatus}>{STATUS_LABEL[draft.status]}</span>
                  </div>
                </div>
                <p className={styles.previewPath}>
                  /{kind === "category" ? "categorias" : "marcas"}/{previewSlug || "nombre"}
                </p>
                <p className={styles.panelDescription}>
                  {draft.status === "PUBLISHED"
                    ? "Disponible para organizar los productos del catálogo."
                    : "Esta colección no se publica en la tienda con este estado."}
                </p>
                {editing && editing.productCount > 0 && (
                  <Link
                    className={styles.itemCountLink}
                    href={`/admin/products?${kind === "category" ? "categoryId" : "brandId"}=${editing.id}`}
                  >
                    Ver productos asociados →
                  </Link>
                )}
              </aside>
              <div className={styles.drawerFields}>{form}</div>
            </div>
          </SideDrawer>
        )}
      </AnimatePresence>

      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.item}>
            <div className={styles.itemRow}>
              <div className={styles.itemMain}>
                <span className={styles.itemName}>{row.name}</span>
                <span className={styles.itemSlug}>/{row.slug}</span>
              </div>
              <span className={`${styles.badge} ${styles[`badge${row.status}`]}`}>
                {STATUS_LABEL[row.status]}
              </span>
              {row.productCount > 0 ? (
                <Link
                  href={`/admin/products?${kind === "category" ? "categoryId" : "brandId"}=${row.id}`}
                  className={styles.itemCountLink}
                  data-testid={`${kind}-count-${row.slug}`}
                >
                  {row.productCount} producto{row.productCount === 1 ? "" : "s"}
                </Link>
              ) : (
                <span className={styles.itemCount}>Sin productos</span>
              )}
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => openEdit(row)}
                aria-label={`Editar ${row.name}`}
                data-testid={`${kind}-edit-${row.slug}`}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}

        {rows.length === 0 && <li className={styles.empty}>Todavía no hay registros.</li>}
      </ul>
    </section>
  );
}

export function TaxonomyWorkspace({ categories, brands }: TaxonomyWorkspaceProps) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Categorías y marcas</h1>
        <p className={styles.subtitle}>
          Define el árbol del catálogo. Lo que publiques aquí es lo que puedes elegir al crear un
          producto y lo que ve la tienda.
        </p>
      </header>

      <TaxonomyPanel
        kind="category"
        title="Categorías"
        description="Secciones de la tienda. El orden decide cómo se listan."
        rows={categories}
      />

      <TaxonomyPanel
        kind="brand"
        title="Marcas"
        description="Cada producto pertenece a una marca y esta tiene su propia página."
        rows={brands}
      />

      <p className={styles.note}>
        <Check size={14} aria-hidden="true" /> Archivar solo está permitido cuando no queda ningún
        producto asociado.
      </p>
    </div>
  );
}
