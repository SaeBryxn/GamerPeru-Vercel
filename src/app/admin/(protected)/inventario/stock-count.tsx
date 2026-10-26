"use client";
import React, { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  History,
  LoaderCircle,
  Package,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import type { InventoryMovementRow, InventoryPageRow } from "@/lib/admin/inventory/page-reader";
import {
  getInventoryMovementsAction,
  setVariantStockAction,
  type VariantStockSnapshot,
} from "@/lib/admin/inventory/actions";
import { formatDelta, formatUnits, stockStatus } from "./inventory-display";
import { StatusBadge } from "@/components/admin/ui/admin-ui";
import styles from "./inventory.module.css";

const REASONS = ["Conteo periódico", "Diferencia de conteo", "Producto dañado"];
const snapshotOf = (row: InventoryPageRow): VariantStockSnapshot => ({
  onHand: row.on_hand,
  reserved: row.reserved,
  allocated: row.allocated,
  available: row.available,
});

export function InventoryCountForm({
  row,
  workspace = false,
}: {
  row: InventoryPageRow;
  workspace?: boolean;
}) {
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
  const [view, setView] = useState<"summary" | "count" | "history">("count");
  const [history, setHistory] = useState<InventoryMovementRow[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const historyRequest = useRef(0);
  const loadHistory = async () => {
    const request = ++historyRequest.current;
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const result = await getInventoryMovementsAction(row.variant_id);
      if (request !== historyRequest.current) return;
      if (result.success) setHistory(result.data ?? []);
      else setHistoryError(result.error ?? "No se pudieron cargar los movimientos.");
    } catch {
      if (request === historyRequest.current)
        setHistoryError("No se pudo conectar. Vuelve a intentar.");
    } finally {
      if (request === historyRequest.current) setLoadingHistory(false);
    }
  };
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
    if (dirty) {
      setView("count");
      setDiscard(true);
    } else {
      historyRequest.current++;
      setOpen(false);
    }
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
          setView(workspace ? "summary" : "count");
          setHistory(null);
          setHistoryError("");
          setLoadingHistory(false);
          historyRequest.current++;
          setOpen(true);
        }}
      >
        {workspace ? (
          <Eye size={14} aria-hidden="true" />
        ) : (
          <ClipboardCheck size={14} aria-hidden="true" />
        )}
        {workspace ? "Ver inventario" : "Registrar conteo"}
      </button>
      <AnimatePresence onExitComplete={() => triggerRef.current?.focus()}>
        {open && (
          <SideDrawer labelledBy={titleId} onClose={close} busy={pending}>
            <DrawerHeader
              titleId={titleId}
              title={workspace ? row.product_name : "Registrar conteo"}
              eyebrow="CONTROL DE INVENTARIO"
              onClose={close}
              busy={pending}
            />
            {workspace && (
              <>
                <div className={styles.workspaceProduct}>
                  <div className={styles.workspacePhoto}>
                    {row.image_url ? (
                      <Image
                        src={row.image_url}
                        alt={row.product_name}
                        width={112}
                        height={112}
                        sizes="112px"
                      />
                    ) : (
                      <Package size={32} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <span className={styles.eyebrow}>VARIANTE SELECCIONADA</span>
                    <h3>{row.title}</h3>
                    <p>SKU {row.sku}</p>
                    <StatusBadge
                      tone={
                        stockStatus(savedBalances?.available ?? row.available, row.reorder_point)
                          .tone
                      }
                    >
                      {
                        stockStatus(savedBalances?.available ?? row.available, row.reorder_point)
                          .label
                      }
                    </StatusBadge>
                  </div>
                </div>
                <nav className={styles.workspaceTabs} aria-label="Detalle de inventario">
                  {(
                    [
                      ["summary", "Existencias"],
                      ["count", "Registrar conteo"],
                      ["history", "Movimientos"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-current={view === key ? "page" : undefined}
                      disabled={pending}
                      onClick={() => {
                        setView(key);
                        if (key === "history" && !history && !loadingHistory) void loadHistory();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {view === "summary" && (
                  <div className={styles.workspaceBody}>
                    <div className={styles.availableHero}>
                      <span>Disponible para vender</span>
                      <strong>
                        {formatUnits(savedBalances?.available ?? row.available)}{" "}
                        <small>unidades</small>
                      </strong>
                      <p>Físico menos reservado y asignado.</p>
                    </div>
                    <dl className={styles.balanceGrid}>
                      {(
                        [
                          [
                            "Físico",
                            savedBalances?.onHand ?? row.on_hand,
                            "Unidades en el almacén",
                          ],
                          [
                            "Reservado",
                            savedBalances?.reserved ?? row.reserved,
                            "Pedidos pendientes de pago",
                          ],
                          [
                            "Asignado",
                            savedBalances?.allocated ?? row.allocated,
                            "Pedidos pagados por despachar",
                          ],
                          ["Reponer en", row.reorder_point, "Umbral de stock bajo"],
                        ] as const
                      ).map(([label, value, hint]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{formatUnits(value)}</dd>
                          <p>{hint}</p>
                        </div>
                      ))}
                    </dl>
                    <div className={styles.workspaceHint}>
                      <ClipboardCheck size={20} aria-hidden="true" />
                      <div>
                        <h3>¿Recibiste o contaste mercadería?</h3>
                        <p>
                          Registra el total físico. Podrás revisar la diferencia antes de guardar.
                        </p>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => setView("count")}
                        >
                          Registrar conteo
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {view === "history" && (
                  <div className={styles.workspaceBody} aria-busy={loadingHistory}>
                    <div className={styles.historyHeading}>
                      <div>
                        <h3>Movimientos de esta variante</h3>
                        <p>Los 30 más recientes del almacén principal.</p>
                      </div>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={loadingHistory}
                        onClick={() => void loadHistory()}
                      >
                        Actualizar
                      </button>
                    </div>
                    {loadingHistory ? (
                      <p role="status">Cargando movimientos…</p>
                    ) : historyError ? (
                      <p role="alert" className={styles.historyError}>
                        {historyError}
                      </p>
                    ) : history?.length ? (
                      <ol className={styles.historyList}>
                        {history.map((entry) => (
                          <li key={entry.id}>
                            <History size={17} aria-hidden="true" />
                            <div>
                              <strong>
                                {entry.notes?.trim() ? entry.notes : "Movimiento de inventario"}
                              </strong>
                              <time dateTime={String(entry.created_at)}>
                                {new Date(entry.created_at).toLocaleString("es-PE", {
                                  timeZone: "America/Lima",
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </time>
                              <p>
                                Físico {formatDelta(entry.on_hand_delta)} · Reservado{" "}
                                {formatDelta(entry.reserved_delta)} · Asignado{" "}
                                {formatDelta(entry.allocated_delta)}
                              </p>
                              <details>
                                <summary>Ver registro</summary>
                                <p>
                                  Tipo: {entry.movement_type}
                                  <br />
                                  Autor: {entry.actor_id}
                                </p>
                              </details>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className={styles.empty}>
                        <History size={28} aria-hidden="true" />
                        <h3>Aún no hay movimientos</h3>
                        <p>Los conteos y cambios de pedidos aparecerán aquí.</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <form
              className={styles.countForm}
              hidden={workspace && view !== "count"}
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
                      historyRequest.current++;
                      setLoadingHistory(false);
                      setHistory(null);
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
                {!workspace && (
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
                )}
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
