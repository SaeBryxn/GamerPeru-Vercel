"use client";
import React, { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Package,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import type { InventoryPageRow } from "@/lib/admin/inventory/page-reader";
import { setVariantStockAction, type VariantStockSnapshot } from "@/lib/admin/inventory/actions";
import { formatDelta, formatUnits } from "./inventory-display";
import styles from "./inventory.module.css";

const REASONS = ["Conteo periódico", "Diferencia de conteo", "Producto dañado"];
const snapshotOf = (row: InventoryPageRow): VariantStockSnapshot => ({
  onHand: row.on_hand,
  reserved: row.reserved,
  allocated: row.allocated,
  available: row.available,
});

export function InventoryCountForm({ row }: { row: InventoryPageRow }) {
  const router = useRouter();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(row));
  const [quantity, setQuantity] = useState(String(row.on_hand));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [canRefresh, setCanRefresh] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedBalances, setSavedBalances] = useState<VariantStockSnapshot | null>(null);
  const [staleResponse, setStaleResponse] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [pending, start] = useTransition();
  const validQuantity = /^\d+$/.test(quantity.trim()) && Number.isSafeInteger(Number(quantity));
  const counted = Number(quantity);
  const difference = counted - snapshot.onHand;
  const availableAfter = counted - snapshot.reserved - snapshot.allocated;
  const externalChange =
    !saved &&
    (snapshot.onHand !== row.on_hand ||
      snapshot.reserved !== row.reserved ||
      snapshot.allocated !== row.allocated);
  const conflict = !saved && (staleResponse || externalChange);
  const dirty = !saved && (quantity !== String(snapshot.onHand) || !!reason.trim());
  useEffect(() => {
    if (discard) discardRef.current?.focus();
  }, [discard]);
  useEffect(() => {
    if (conflict) conflictRef.current?.focus();
  }, [conflict]);
  useEffect(() => {
    if (message && !conflict) feedbackRef.current?.focus();
  }, [message, conflict]);
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.secondaryButton}
        aria-haspopup="dialog"
        onClick={() => {
          setSnapshot(snapshotOf(row));
          setQuantity(String(row.on_hand));
          setReason("");
          setMessage("");
          setCanRefresh(false);
          setSaved(false);
          setSavedBalances(null);
          setStaleResponse(false);
          setDiscard(false);
          setOpen(true);
        }}
      >
        <ClipboardCheck size={14} aria-hidden="true" />
        Registrar conteo
      </button>
      <AnimatePresence onExitComplete={() => triggerRef.current?.focus()}>
        {open && (
          <SideDrawer labelledBy={titleId} onClose={close} busy={pending}>
            <DrawerHeader
              titleId={titleId}
              title="Registrar conteo"
              eyebrow="CONTROL DE INVENTARIO"
              onClose={close}
              busy={pending}
            />
            <form
              className={styles.countForm}
              aria-busy={pending}
              onSubmit={(event) => {
                event.preventDefault();
                if (pending || saved || conflict || !validQuantity || !reason.trim()) return;
                setMessage("");
                setCanRefresh(false);
                start(async () => {
                  try {
                    const result = await setVariantStockAction({
                      productId: row.product_id,
                      variantId: row.variant_id,
                      quantity: counted,
                      expectedOnHand: snapshot.onHand,
                      reason,
                    });
                    if (result.success) {
                      setMessage(
                        difference === 0
                          ? "El conteo coincide con el stock actual; no se generó un movimiento."
                          : "Conteo guardado y movimiento registrado."
                      );
                      setSaved(true);
                      setSavedBalances(result.data ?? null);
                      router.refresh();
                    } else {
                      setMessage(
                        result.error ?? "No se pudo guardar. Revisa los datos e inténtalo de nuevo."
                      );
                      setStaleResponse(result.code === "STALE_INVENTORY");
                    }
                  } catch {
                    setCanRefresh(true);
                    setMessage(
                      "No se pudo conectar. Actualiza el inventario antes de reintentar; conservamos lo que escribiste."
                    );
                  }
                });
              }}
            >
              <div className={styles.countBody}>
                <div className={styles.countProduct}>
                  <Package size={20} aria-hidden="true" />
                  <div>
                    <strong>{row.product_name}</strong>
                    <p>
                      {row.title}
                      <br />
                      SKU {row.sku}
                    </p>
                  </div>
                </div>
                {discard && (
                  <div
                    ref={discardRef}
                    tabIndex={-1}
                    className={styles.feedback}
                    data-tone="warning"
                    role="alert"
                  >
                    <TriangleAlert size={18} aria-hidden="true" />
                    <div>
                      <p>
                        <strong>¿Descartar este conteo?</strong>
                        <br />
                        Tienes cambios que todavía no se han guardado.
                      </p>
                      <div className={styles.countActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setDiscard(false)}
                        >
                          Seguir editando
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setOpen(false)}
                        >
                          Descartar cambios
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {conflict && (
                  <div
                    ref={conflictRef}
                    tabIndex={-1}
                    className={styles.feedback}
                    data-tone="warning"
                    role="alert"
                  >
                    <TriangleAlert size={18} aria-hidden="true" />
                    <div>
                      <p>
                        <strong>El inventario cambió</strong>
                        <br />
                        {externalChange
                          ? "Revisa los valores actualizados antes de guardar. Tu conteo y motivo se conservaron."
                          : message || "Actualiza el inventario para revisar sus valores."}
                      </p>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          if (externalChange) {
                            setSnapshot(snapshotOf(row));
                            setStaleResponse(false);
                            setMessage("");
                          } else router.refresh();
                        }}
                      >
                        {externalChange ? "Usar valores actualizados" : "Actualizar inventario"}
                      </button>
                    </div>
                  </div>
                )}
                <section
                  className={styles.countSection}
                  aria-labelledby={`${titleId}-quantity-heading`}
                >
                  <h3 id={`${titleId}-quantity-heading`}>
                    <span className={styles.stepNumber}>1</span>Cuenta las unidades físicas
                  </h3>
                  <label className={styles.countLabel} htmlFor={`${titleId}-quantity`}>
                    Unidades físicas
                  </label>
                  <div className={styles.quantityControl}>
                    <input
                      id={`${titleId}-quantity`}
                      aria-describedby={`${titleId}-quantity-help`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(event.target.value);
                        setDiscard(false);
                      }}
                      required
                      disabled={pending || saved}
                    />
                    <span>unidades</span>
                  </div>
                  <p className={styles.fieldHint} id={`${titleId}-quantity-help`}>
                    Ingresa el total contado en el almacén, incluyendo las unidades reservadas y
                    asignadas.
                  </p>
                </section>
                <section
                  className={styles.countSection}
                  aria-labelledby={`${titleId}-reason-heading`}
                >
                  <h3 id={`${titleId}-reason-heading`}>
                    <span className={styles.stepNumber}>2</span>Deja el motivo del conteo
                  </h3>
                  <label className={styles.countLabel}>
                    Motivo
                    <textarea
                      className={styles.input}
                      maxLength={500}
                      value={reason}
                      placeholder="Ej.: conteo de cierre; se encontraron dos unidades adicionales."
                      onChange={(event) => {
                        setReason(event.target.value);
                        setDiscard(false);
                      }}
                      required
                      disabled={pending || saved}
                    />
                  </label>
                  {!saved && (
                    <div className={styles.reasonOptions} aria-label="Motivos frecuentes">
                      {REASONS.map((value) => (
                        <button
                          type="button"
                          key={value}
                          disabled={pending}
                          onClick={() => {
                            setReason(value);
                            setDiscard(false);
                          }}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section
                  className={styles.countSection}
                  aria-labelledby={`${titleId}-review-heading`}
                >
                  <h3 id={`${titleId}-review-heading`}>
                    <span className={styles.stepNumber}>3</span>
                    {saved ? "Resultado del conteo" : "Revisa antes de guardar"}
                  </h3>
                  <div className={styles.comparison}>
                    <div>
                      <p>Físico anterior</p>
                      <strong>{formatUnits(snapshot.onHand)}</strong>
                    </div>
                    <ArrowRight size={18} aria-hidden="true" />
                    <div>
                      <p>Tu conteo</p>
                      <strong>{validQuantity ? formatUnits(counted) : "Sin dato"}</strong>
                    </div>
                    <div className={styles.difference} aria-live="polite">
                      <span>Diferencia</span>
                      <strong>
                        {validQuantity
                          ? `${formatDelta(difference)} unidades`
                          : "Ingresa una cantidad válida"}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.commitments}>
                    <span>
                      Reservado{" "}
                      <strong>{formatUnits(savedBalances?.reserved ?? snapshot.reserved)}</strong>
                    </span>
                    <span>
                      Asignado{" "}
                      <strong>{formatUnits(savedBalances?.allocated ?? snapshot.allocated)}</strong>
                    </span>
                    <span>
                      Disponible {savedBalances ? "tras el conteo" : "previsto"}{" "}
                      <strong>
                        {savedBalances
                          ? formatUnits(savedBalances.available)
                          : validQuantity
                            ? formatUnits(availableAfter)
                            : "Sin dato"}
                      </strong>
                    </span>
                  </div>
                  <p className={styles.fieldHint}>
                    Disponible = físico − reservado − asignado. Las reservas y asignaciones no se
                    modifican con este conteo.
                  </p>
                </section>
                {validQuantity && availableAfter < 0 && !saved && (
                  <div className={styles.feedback} data-tone="warning" role="note">
                    <TriangleAlert size={18} aria-hidden="true" />
                    <p>
                      El conteo es menor que las unidades reservadas y asignadas. Revisa las
                      cantidades y los pedidos comprometidos.
                    </p>
                  </div>
                )}
                {message && !conflict && (
                  <div
                    ref={feedbackRef}
                    tabIndex={-1}
                    className={styles.feedback}
                    data-tone={saved ? "success" : "danger"}
                    role={saved ? "status" : "alert"}
                  >
                    {saved ? (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    ) : (
                      <TriangleAlert size={18} aria-hidden="true" />
                    )}
                    <div>
                      <p>{message}</p>
                      {canRefresh && (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => router.refresh()}
                        >
                          Actualizar inventario
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <footer className={styles.countFooter}>
                <p>
                  <ShieldCheck size={13} aria-hidden="true" /> El conteo queda registrado con tu
                  usuario y su motivo.
                </p>
                <div className={styles.countActions}>
                  {saved ? (
                    <button type="button" className={styles.primaryButton} onClick={close}>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      Listo
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={close}
                        disabled={pending}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={pending || conflict || !reason.trim() || !validQuantity}
                      >
                        {pending ? (
                          <>
                            <LoaderCircle
                              className={styles.savingIcon}
                              size={15}
                              aria-hidden="true"
                            />
                            Guardando…
                          </>
                        ) : (
                          "Guardar conteo"
                        )}
                      </button>
                    </>
                  )}
                </div>
              </footer>
            </form>
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}
