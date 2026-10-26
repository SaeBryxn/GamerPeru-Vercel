"use client";

import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import { StoreCardPreview } from "./store-card-preview";
import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ImageIcon, Plus } from "lucide-react";
import { StatusBadge } from "@/components/admin/ui";
import {
  createVariantAction,
  reorderProductVariantsAction,
  updateVariantAction,
  reassignProductMediaVariantAction,
} from "@/lib/admin/catalog/actions";
import type { AdminProductDetailVariant, VariantStatus } from "@/lib/admin/catalog/types";
import type { AdminProductUiDetailMedia } from "@/lib/admin/catalog/ui-dto";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import { parsePenInputToCents } from "@/lib/admin/catalog/money";
import { setVariantStockAction } from "@/lib/admin/inventory/actions";
import type { VariantStockRow } from "@/lib/admin/inventory/readers";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./variant-board.module.css";
import { useEditorDirty } from "./editor-safety";

export interface VariantBoardProps {
  productId: string;
  productName?: string;
  variants: AdminProductDetailVariant[];
  media: AdminProductUiDetailMedia[];
  variantStock: Record<string, VariantStockRow>;
  canManageInventory: boolean;
  primaryMediaAssetId?: string | null;
  /** Set when the category sheet has a weight field: weight is edited there, once for the product. */
  weightSpecLabel?: string | null;
  onChanged: () => void;
}

interface Draft {
  variant: AdminProductDetailVariant | null;
  title: string;
  price: string;
  compareAt: string;
  stock: string;
  initialStock: string;
  sku: string;
  weight: string;
  cost: string;
  status: VariantStatus;
  photoId: string;
  initialPhotoId: string;
}

const moneyInput = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const firstFilled = (...values: Array<string | undefined>) => values.find((value) => value?.trim());
const nameOf = (variant: AdminProductDetailVariant) => {
  const { colorway, color, size, talla, tamano } = variant.attributes;
  const parts = [firstFilled(colorway, color), firstFilled(size, talla, tamano)].filter(Boolean);
  return parts.length ? parts.join(" · ") : variant.title;
};

/** Independent step: the parent owns refreshed server data and navigation. */
export function VariantBoard({
  productId,
  productName = "Producto",
  variants,
  media,
  variantStock,
  canManageInventory,
  primaryMediaAssetId = null,
  weightSpecLabel = null,
  onChanged,
}: VariantBoardProps) {
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const initialDraft = useRef("");
  useEditorDirty("variant", draft !== null && JSON.stringify(draft) !== initialDraft.current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<"variant" | "stock" | "photo">("variant");
  const [notice, setNotice] = useState<string | null>(null);
  const saving = useRef(false);
  const variantTracker = useRef(new MutationRequestTracker());
  const photoTracker = useRef(new MutationRequestTracker());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const photos = media
    .filter((item) => item.publicUrl && item.mimeType.startsWith("image/"))
    .toSorted((a, b) => a.displayOrder - b.displayOrder);

  const open = (variant: AdminProductDetailVariant | null) => {
    const photo = variant ? photos.find((item) => item.variantId === variant.id) : undefined;
    const stock = variant ? String(variantStock[variant.id]?.onHand ?? 0) : "0";
    const next: Draft = {
      variant,
      title: variant?.title ?? "",
      price: variant ? moneyInput(variant.priceCents) : "",
      compareAt: variant ? moneyInput(variant.compareAtPriceCents) : "",
      stock,
      initialStock: stock,
      sku: variant?.sku ?? "",
      weight: variant?.weightGrams ? String(variant.weightGrams) : "",
      cost: variant ? moneyInput(variant.costCents) : "",
      status: variant?.status ?? "ACTIVE",
      photoId: photo?.id ?? "",
      initialPhotoId: photo?.id ?? "",
    };
    initialDraft.current = JSON.stringify(next);
    setDraft(next);
    setError(null);
    setNotice(null);
  };
  // The first version is the one the store selects and lists first (e.g. black before white).
  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= variants.length || saving.current) return;
    const ordered = variants.map((variant) => variant.id);
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    saving.current = true;
    setPending(true);
    setNotice(null);
    const result = await reorderProductVariantsAction({ productId, orderedVariantIds: ordered });
    saving.current = false;
    setPending(false);
    if (!result.success) {
      setNotice(result.error ?? "No se pudo cambiar el orden. Intenta de nuevo.");
      return;
    }
    onChanged();
  };
  const closeEditor = () => {
    if (pending) return;
    if (
      draft &&
      JSON.stringify(draft) !== initialDraft.current &&
      !window.confirm("Tienes cambios sin guardar. ¿Descartarlos y cerrar?")
    )
      return;
    setDraft(null);
    setError(null);
  };
  const patch = (value: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...value } : current));

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || saving.current) return;
    setError(null);
    setErrorStage("variant");
    setNotice(null);
    // Validate all stages before saving the first one, using the existing money parser.
    const parsedMoney = {
      price_cents: null,
      compare_at_price_cents: null,
      cost_cents: null,
    } as Record<"price_cents" | "compare_at_price_cents" | "cost_cents", number | null>;
    for (const [input, field] of [
      [draft.price, "price_cents"],
      [draft.compareAt, "compare_at_price_cents"],
      [draft.cost, "cost_cents"],
    ] as const) {
      const result = parsePenInputToCents(input, field);
      if (!result.success) {
        setError(result.error);
        return;
      }
      parsedMoney[field] = result.cents;
    }
    const quantity = Number(draft.stock);
    if (
      canManageInventory &&
      (!draft.stock.trim() || !Number.isInteger(quantity) || quantity < 0)
    ) {
      setError("Usa un número entero de 0 o más.");
      setErrorStage("stock");
      return;
    }
    if (!draft.sku.trim()) {
      if (moreRef.current) moreRef.current.open = true;
      skuRef.current?.focus();
      setError("Completa el código SKU en Más opciones.");
      return;
    }
    saving.current = true;
    setPending(true);
    let changed = false;
    let stage: "variant" | "stock" | "photo" = "variant";
    try {
      const fields = {
        productId,
        sku: draft.sku.trim(),
        title: draft.title.trim(),
        pricePen: draft.price.trim(),
        compareAtPricePen: draft.compareAt.trim() || null,
        costPen: draft.cost.trim() || null,
        weightGrams: draft.weight ? Number(draft.weight) : null,
        status: draft.status,
      };
      const metadataChanged =
        !draft.variant ||
        fields.sku !== draft.variant.sku ||
        fields.title !== draft.variant.title ||
        parsedMoney.price_cents !== draft.variant.priceCents ||
        parsedMoney.compare_at_price_cents !== draft.variant.compareAtPriceCents ||
        parsedMoney.cost_cents !== draft.variant.costCents ||
        fields.weightGrams !== draft.variant.weightGrams ||
        fields.status !== draft.variant.status;
      let saved = draft.variant ? { ...draft.variant } : null;
      if (metadataChanged) {
        const payload = draft.variant
          ? {
              ...fields,
              variantId: draft.variant.id,
              expectedUpdatedAt: new Date(draft.variant.updatedAt).toISOString(),
            }
          : fields;
        const mutationRequestId = variantTracker.current.getRequestId(payload);
        const result =
          "variantId" in payload
            ? await updateVariantAction({ ...payload, mutationRequestId })
            : await createVariantAction({
                ...payload,
                // A new version goes last, so it never displaces the one shown first.
                displayOrder: Math.max(-1, ...variants.map((variant) => variant.displayOrder)) + 1,
                // When the other versions are colours, the new name is its colour too, so the
                // store keeps the colour picker with photos.
                ...(variants.length > 0 &&
                variants.every((variant) => firstFilled(variant.attributes.color))
                  ? { attributes: { color: payload.title } }
                  : {}),
                mutationRequestId,
              });
        variantTracker.current.complete();
        if (!result.success || !result.data) {
          setError(
            result.error ??
              (draft.variant
                ? "No se pudo actualizar la variante."
                : "No se pudo crear la variante.")
          );
          return;
        }
        changed = true;
        saved = {
          ...result.data.variant,
          isSkuImmutable: draft.variant?.isSkuImmutable ?? false,
        };
        // Retain the saved identity/timestamp even if a later independent action fails.
        patch({ variant: saved });
      }
      if (!saved) return;
      if (canManageInventory && quantity !== Number(draft.initialStock)) {
        stage = "stock";
        setErrorStage("stock");
        const stockResult = await setVariantStockAction({
          expectedOnHand: Number(draft.initialStock),
          productId,
          variantId: saved.id,
          quantity,
        });
        if (!stockResult.success || !stockResult.data) {
          setError(stockResult.error ?? "No se pudo guardar.");
          if (changed)
            setNotice(
              "El precio y los datos ya se guardaron. Falta guardar las unidades y, si la cambiaste, la foto."
            );
          return;
        }
        saved.isSkuImmutable = true;
        changed = true;
        patch({ variant: { ...saved }, initialStock: String(stockResult.data.onHand) });
      }
      if (draft.photoId && draft.photoId !== draft.initialPhotoId) {
        stage = "photo";
        setErrorStage("photo");
        const photoPayload = {
          productId,
          productMediaId: draft.photoId,
          targetVariantId: saved.id,
        };
        const photoResult = await reassignProductMediaVariantAction({
          ...photoPayload,
          mutationRequestId: photoTracker.current.getRequestId(photoPayload),
        });
        photoTracker.current.complete();
        if (!photoResult.success) {
          setError(photoResult.error ?? "No se pudo actualizar la variante de la foto.");
          if (changed) setNotice("Los datos ya se guardaron. Falta asignar la foto.");
          return;
        }
        patch({ initialPhotoId: draft.photoId });
        changed = true;
      }
      setDraft(null);
      setNotice(draft.variant ? "Color o talla actualizado." : "Color o talla agregado.");
    } catch {
      setErrorStage(stage);
      setError(
        stage === "variant"
          ? draft.variant
            ? "Error de conexión al actualizar la variante."
            : "Error de conexión al crear la variante."
          : "Error de conexión al enviar la solicitud. Puedes reintentar."
      );
      if (changed)
        setNotice(
          "Los datos del color o talla ya se guardaron. Reintenta para completar lo pendiente."
        );
    } finally {
      saving.current = false;
      setPending(false);
      if (changed) onChanged();
    }
  };

  const errorMessage = error ? (
    <p ref={errorRef} id={`${id}-error`} role="alert" tabIndex={-1} className={styles.error}>
      {error}
    </p>
  ) : null;
  const selectedPhoto = draft
    ? photos.find((photo) => photo.id === (draft.photoId || draft.initialPhotoId))
    : undefined;
  const totalAvailable = variants.reduce(
    (sum, variant) => sum + (variantStock[variant.id]?.available ?? 0),
    0
  );

  const editor = draft ? (
    <form
      id={`${id}-form`}
      className={styles.form}
      onSubmit={save}
      aria-label={draft.variant ? "Editar color o talla" : "Agregar color o talla"}
    >
      <fieldset disabled={pending} className={styles.fields}>
        <legend className={styles.legend}>
          {draft.variant ? "Editar color o talla" : "Nuevo color o talla"}
        </legend>
        <label className={styles.field}>
          <span>Color o talla</span>
          <input
            required
            maxLength={150}
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Ej. Negro · Mediano"
          />
        </label>
        <div className={styles.editorGrid}>
          <section className={styles.group} aria-label="Precios de esta versión">
            <h4>Precio de venta</h4>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Precio</span>
                <div className={styles.money}>
                  <span aria-hidden="true">S/</span>
                  <input
                    aria-label="Precio"
                    required
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(event) => patch({ price: event.target.value })}
                    placeholder="329.00"
                  />
                </div>
              </label>
              <label className={styles.field}>
                <span>Precio antes (tachado)</span>
                <div className={styles.money}>
                  <span aria-hidden="true">S/</span>
                  <input
                    aria-label="Precio antes (tachado)"
                    inputMode="decimal"
                    value={draft.compareAt}
                    onChange={(event) => patch({ compareAt: event.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </label>
            </div>
          </section>
          <section className={styles.group} aria-label="Inventario de esta versión">
            <h4>Inventario</h4>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>Unidades en stock</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  disabled={!canManageInventory}
                  value={draft.stock}
                  aria-invalid={Boolean(error && errorStage === "stock")}
                  aria-describedby={`${id}-stock-help${error && errorStage === "stock" ? ` ${id}-error` : ""}`}
                  onChange={(event) => patch({ stock: event.target.value })}
                />
              </label>
            </div>
            <p id={`${id}-stock-help`} className={styles.hint}>
              {canManageInventory
                ? "Cuenta las unidades físicas. Las reservadas siguen separadas."
                : "Puedes consultar el stock. Para cambiarlo necesitas permisos de inventario."}
            </p>
            {errorStage === "stock" && errorMessage}
          </section>
        </div>
        <section className={styles.group} aria-label="Estado y fotografía">
          <h4>Cómo se muestra</h4>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Estado</span>
              <select
                value={draft.status}
                onChange={(event) => patch({ status: event.target.value as VariantStatus })}
              >
                <option value="ACTIVE">Activa</option>
                <option value="INACTIVE">Inactiva</option>
                <option value="ARCHIVED">Archivada</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Asignar una foto</span>
              <select
                value={draft.photoId}
                onChange={(event) => patch({ photoId: event.target.value })}
              >
                <option value="">Conservar las fotos actuales</option>
                {photos
                  .filter((photo) => !photo.variantId || photo.variantId === draft.variant?.id)
                  .map((photo, index) => (
                    <option
                      key={photo.id}
                      value={photo.id}
                      disabled={photo.mediaAssetId === primaryMediaAssetId}
                    >
                      {photo.altText?.trim() ? photo.altText : `Foto ${index + 1}`}
                      {photo.mediaAssetId === primaryMediaAssetId
                        ? " · Foto principal (general)"
                        : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {selectedPhoto?.publicUrl && (
            <div className={styles.photoPreview}>
              <Image
                src={selectedPhoto.publicUrl}
                alt={`Foto elegida para ${draft.title}`}
                width={64}
                height={64}
                unoptimized
              />
              <span>Foto de esta versión</span>
            </div>
          )}
          <p className={styles.hint}>
            Usa una foto de la galería. La foto principal debe conservarse como foto general del
            producto.
          </p>
          {errorStage === "photo" && errorMessage}
        </section>
        <details ref={moreRef} className={styles.more}>
          <summary>Más opciones{!draft.sku.trim() ? " · Falta el código SKU" : ""}</summary>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Código SKU</span>
              <input
                ref={skuRef}
                maxLength={50}
                disabled={draft.variant?.isSkuImmutable}
                value={draft.sku}
                onChange={(event) => patch({ sku: event.target.value })}
              />
              {draft.variant?.isSkuImmutable && (
                <small>Este código no puede cambiar porque ya tiene inventario o pedidos.</small>
              )}
            </label>
            {weightSpecLabel ? (
              <p className={styles.hint}>
                El peso se edita en Especificaciones, campo «{weightSpecLabel}».
              </p>
            ) : (
              <label className={styles.field}>
                <span>Peso (gramos)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.weight}
                  onChange={(event) => patch({ weight: event.target.value })}
                />
              </label>
            )}
            <label className={styles.field}>
              <span>Costo (S/)</span>
              <input
                inputMode="decimal"
                value={draft.cost}
                onChange={(event) => patch({ cost: event.target.value })}
              />
            </label>
          </div>
        </details>
      </fieldset>
      {errorStage === "variant" && errorMessage}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={closeEditor}>
          Cancelar
        </button>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Guardando…" : "Guardar color o talla"}
        </button>
      </div>
    </form>
  ) : null;

  return (
    <section className={styles.root} aria-label="Colores, tallas y precios" aria-busy={pending}>
      <header className={styles.boardHeader}>
        <div>
          <h3>Versiones del producto</h3>
          <p className={styles.hint}>
            {variants.length} {variants.length === 1 ? "versión" : "versiones"} · {totalAvailable}{" "}
            unidades disponibles en inventario
          </p>
        </div>
        <button type="button" className={styles.add} disabled={pending} onClick={() => open(null)}>
          <Plus size={16} aria-hidden="true" />
          Agregar color o talla
        </button>
      </header>
      <div className={styles.board}>
        {variants.map((variant, index) => {
          const variantPhoto = photos.find((item) => item.variantId === variant.id);
          const photo = variantPhoto ?? photos.find((item) => item.variantId === null);
          const stock = variantStock[variant.id];
          const expanded = draft?.variant?.id === variant.id;
          return (
            <article
              key={variant.id}
              className={styles.card}
              data-expanded={expanded}
              data-testid={`variant-card-${variant.id}`}
            >
              <div className={styles.cardRow}>
                <button
                  type="button"
                  className={styles.cardButton}
                  disabled={pending}
                  aria-expanded={expanded}
                  aria-controls={expanded ? `${id}-form` : undefined}
                  aria-label={`Editar ${nameOf(variant)}`}
                  onClick={() => open(variant)}
                >
                  <span className={styles.photoGroup}>
                    <span className={styles.thumbnail}>
                      {photo?.publicUrl ? (
                        <Image src={photo.publicUrl} alt="" width={64} height={64} unoptimized />
                      ) : (
                        <ImageIcon size={24} aria-hidden="true" />
                      )}
                    </span>
                    {photo && !variantPhoto && (
                      <span className={styles.photoCaption}>Foto general</span>
                    )}
                  </span>
                  <span className={styles.cardInfo}>
                    <strong>{nameOf(variant)}</strong>
                    {index === 0 && variants.length > 1 && (
                      <span className={styles.defaultTag}>Se muestra primero</span>
                    )}
                    <span className={styles.price}>{formatCurrency(variant.priceCents)}</span>
                    <span className={styles.hint}>
                      {stock?.onHand ?? 0} unidades · {stock?.available ?? 0} disponibles
                    </span>
                  </span>
                  <span className={styles.cardState}>
                    <StatusBadge tone={variant.status === "ACTIVE" ? "success" : "neutral"}>
                      {variant.status === "ACTIVE"
                        ? "Activa"
                        : variant.status === "ARCHIVED"
                          ? "Archivada"
                          : "Inactiva"}
                    </StatusBadge>
                    {variant.status === "ACTIVE" && stock?.available === 0 && (
                      <StatusBadge tone="warning">Sin stock</StatusBadge>
                    )}
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </button>
                {variants.length > 1 && (
                  <span className={styles.orderControls}>
                    <button
                      type="button"
                      className={styles.orderButton}
                      disabled={pending || index === 0}
                      onClick={() => void move(index, -1)}
                      aria-label={`Subir ${nameOf(variant)}`}
                      title="Subir"
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.orderButton}
                      disabled={pending || index === variants.length - 1}
                      onClick={() => void move(index, 1)}
                      aria-label={`Bajar ${nameOf(variant)}`}
                      title="Bajar"
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!variants.length && (
        <p className={styles.empty}>Agrega el primer color o talla y su precio.</p>
      )}
      <AnimatePresence>
        {draft && (
          <SideDrawer
            labelledBy={`${id}-drawer-title`}
            onClose={closeEditor}
            busy={pending}
            size="wide"
            testId="variant-drawer"
          >
            <DrawerHeader
              titleId={`${id}-drawer-title`}
              title={draft.variant ? `Editar ${nameOf(draft.variant)}` : "Agregar color o talla"}
              eyebrow={productName}
              onClose={closeEditor}
              busy={pending}
            />
            <div className={styles.drawerLayout}>
              <aside className={styles.storePreview}>
                <p className={styles.hint}>Vista previa · precio y fotografía</p>
                <StoreCardPreview
                  name={productName}
                  variant={draft.title}
                  imageUrl={
                    selectedPhoto?.publicUrl ??
                    photos.find((p) => p.mediaAssetId === primaryMediaAssetId)?.publicUrl ??
                    photos[0]?.publicUrl
                  }
                  price={draft.price}
                  compareAt={draft.compareAt}
                  status={
                    draft.status === "ACTIVE"
                      ? "Versión activa"
                      : draft.status === "ARCHIVED"
                        ? "Versión archivada"
                        : "Versión inactiva"
                  }
                />
                <p className={styles.hint}>Los cambios se aplican a esta versión al guardar.</p>
              </aside>
              <div className={styles.drawerFields}>{editor}</div>
            </div>
          </SideDrawer>
        )}
      </AnimatePresence>
      {!draft && notice && (
        <p role="status" className={styles.hint}>
          {notice}
        </p>
      )}
    </section>
  );
}
