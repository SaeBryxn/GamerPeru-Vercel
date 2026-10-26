"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import Link from "@/components/app-link";
import { ExternalLink, Eye, ImageIcon } from "lucide-react";
import Image from "next/image";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import {
  getQuickProductDetailAction,
  type QuickProductDetail,
} from "@/lib/admin/catalog/quick-view-action";
import { updateVariantAction } from "@/lib/admin/catalog/actions";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import { parsePenInputToCents } from "@/lib/admin/catalog/money";
import { formatCurrency } from "@/lib/utils/currency";
import { useUnsavedDraft } from "@/components/admin/use-unsaved-draft";
import { StoreCardPreview } from "./store-card-preview";
import styles from "./product-quick-view.module.css";

const money = (value: number | null) => (value === null ? "" : (value / 100).toFixed(2));
export function ProductQuickView({ productId, name }: { productId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<QuickProductDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [before, setBefore] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const savingRef = useRef(false);
  const tracker = useRef(new MutationRequestTracker());
  const router = useRouter();
  const variant = detail?.variants.find((v) => v.id === selected);
  const dirty =
    !!variant &&
    (price !== money(variant.priceCents) || before !== money(variant.compareAtPriceCents));
  useUnsavedDraft(open && dirty);
  const canDiscard = () =>
    !dirty || window.confirm("Tienes cambios de precio sin guardar. ¿Descartarlos?");
  const close = () => {
    if (savingRef.current || !canDiscard()) return;
    request.current++;
    setOpen(false);
  };
  const choose = (v: NonNullable<typeof variant>) => {
    setSelected(v.id);
    setPrice(money(v.priceCents));
    setBefore(money(v.compareAtPriceCents));
    setError(null);
  };
  const load = async () => {
    const seq = ++request.current;
    setOpen(true);
    setLoading(true);
    setDetail(null);
    setError(null);
    setNotice("");
    try {
      const result = await getQuickProductDetailAction(productId);
      if (request.current !== seq) return;
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudo cargar el producto.");
        return;
      }
      setDetail(result.data);
      const first =
        result.data.variants.find((v) => v.status === "ACTIVE") ?? result.data.variants[0];
      if (first) choose(first);
      else setSelected(null);
    } catch {
      if (request.current === seq) setError("No se pudo cargar el producto. Vuelve a intentar.");
    } finally {
      if (request.current === seq) setLoading(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!variant || savingRef.current) return;
    setError(null);
    setNotice("");
    const parsed = parsePenInputToCents(price, "price_cents");
    const compared = parsePenInputToCents(before, "compare_at_price_cents");
    if (!parsed.success) return setError(parsed.error);
    if (!compared.success) return setError(compared.error);
    if (compared.cents !== null && compared.cents <= parsed.cents!)
      return setError(
        "El precio antes debe ser mayor al precio de venta. Déjalo vacío para quitar la oferta."
      );
    savingRef.current = true;
    setSaving(true);
    const payload = {
      productId,
      variantId: variant.id,
      expectedUpdatedAt: variant.updatedAt,
      pricePen: price.trim(),
      compareAtPricePen: before.trim() || null,
    };
    try {
      const result = await updateVariantAction({
        ...payload,
        mutationRequestId: tracker.current.getRequestId(payload),
      });
      tracker.current.complete();
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudo guardar el precio.");
        return;
      }
      const saved = result.data.variant;
      setDetail((current) =>
        current
          ? {
              ...current,
              variants: current.variants.map((v) =>
                v.id === saved.id
                  ? {
                      ...v,
                      priceCents: saved.priceCents,
                      compareAtPriceCents: saved.compareAtPriceCents,
                      updatedAt: new Date(saved.updatedAt).toISOString(),
                    }
                  : v
              ),
            }
          : current
      );
      setPrice(money(saved.priceCents));
      setBefore(money(saved.compareAtPriceCents));
      setNotice("Precio guardado. La vista previa muestra el precio actualizado.");
      router.refresh();
    } catch {
      setError("No se pudo confirmar el guardado. Reintenta para comprobar el resultado.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={load}
        aria-label={`Vista rápida de ${name}`}
      >
        <Eye size={15} aria-hidden="true" /> Vista rápida
      </button>
      <AnimatePresence>
        {open && (
          <SideDrawer
            size="wide"
            labelledBy={`product-quick-${productId}`}
            onClose={close}
            busy={saving}
            testId="product-quick-drawer"
          >
            <DrawerHeader
              titleId={`product-quick-${productId}`}
              title={detail?.name ?? name}
              eyebrow="Producto · vista rápida y oferta"
              onClose={close}
              busy={saving}
            />
            {loading ? (
              <p className={styles.message} role="status">
                Cargando producto…
              </p>
            ) : detail ? (
              <div className={styles.layout}>
                <aside className={styles.preview}>
                  <p className={styles.caption}>Así se verá el precio</p>
                  <StoreCardPreview
                    name={detail.name}
                    brand={detail.brand}
                    variant={variant?.title}
                    imageUrl={variant?.imageUrl ?? detail.imageUrl}
                    price={price}
                    compareAt={before}
                    status={
                      detail.status === "PUBLISHED"
                        ? "Publicado en la tienda"
                        : detail.status === "ARCHIVED"
                          ? "Producto archivado"
                          : "Producto oculto"
                    }
                  />
                  <p className={styles.hint}>
                    La oferta corresponde a la versión seleccionada. El producto conserva su estado
                    actual.
                  </p>
                </aside>
                <div className={styles.inspector}>
                  <div className={styles.context}>
                    <span>{detail.category}</span>
                    <Link href={`/admin/products/${detail.id}`}>
                      Editor completo <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                  </div>
                  <h3>Elige la versión</h3>
                  <div className={styles.versions}>
                    {detail.variants.map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        className={styles.version}
                        aria-pressed={v.id === selected}
                        disabled={saving}
                        onClick={() => {
                          if (v.id !== selected && canDiscard()) choose(v);
                        }}
                      >
                        <span className={styles.thumbnail}>
                          {v.imageUrl || detail.imageUrl ? (
                            <Image
                              src={(v.imageUrl ?? detail.imageUrl)!}
                              alt=""
                              width={48}
                              height={48}
                              unoptimized
                            />
                          ) : (
                            <ImageIcon size={22} aria-hidden="true" />
                          )}
                        </span>
                        <span>
                          <strong>{v.title}</strong>
                          <small>
                            {formatCurrency(v.priceCents)} ·{" "}
                            {v.status === "ACTIVE"
                              ? "Activa"
                              : v.status === "ARCHIVED"
                                ? "Archivada"
                                : "Inactiva"}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {variant ? (
                    <form onSubmit={save} className={styles.form}>
                      <h3>Precio y oferta</h3>
                      <label>
                        Precio de venta (S/)
                        <input
                          inputMode="decimal"
                          required
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          disabled={saving}
                        />
                      </label>
                      <label>
                        Precio antes, tachado (S/)
                        <input
                          inputMode="decimal"
                          value={before}
                          onChange={(e) => setBefore(e.target.value)}
                          placeholder="Sin oferta"
                          disabled={saving}
                        />
                      </label>
                      <p className={styles.hint}>
                        Para una oferta, coloca el precio anterior por encima del precio de venta.
                        Para quitarla, deja el precio anterior vacío.
                      </p>
                      {error && (
                        <p className={styles.error} role="alert">
                          {error}
                        </p>
                      )}
                      {notice && (
                        <p className={styles.hint} role="status">
                          {notice}
                        </p>
                      )}
                      <div className={styles.actions}>
                        <button type="button" onClick={close} disabled={saving}>
                          Cerrar
                        </button>
                        <button
                          type="submit"
                          className={styles.primary}
                          disabled={saving || !dirty}
                        >
                          {saving ? "Guardando…" : "Guardar precio"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className={styles.hint}>
                      Agrega una versión en el editor completo para asignarle precio.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.message}>
                <p role="alert">{error}</p>
                <button type="button" className={styles.trigger} onClick={load}>
                  Reintentar
                </button>
              </div>
            )}
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}
