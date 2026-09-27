"use client";

import React, { useId, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ExternalLink, PackageCheck, PencilLine, Truck } from "lucide-react";
import { DrawerHeader, SideDrawer, ToastViewport, useToasts } from "@/components/admin/ui";
import {
  dispatchOrderAction,
  markDeliveredAction,
  startPreparationAction,
  updateTrackingAction,
} from "@/lib/admin/orders/fulfillment-actions";
import type { AdminOrderDetail } from "@/lib/admin/orders/types";
import { formatLimaDateTime } from "./order-detail-format";
import styles from "./order-fulfillment.module.css";

type Shipment = AdminOrderDetail["shipments"][number];
type DrawerMode = "dispatch" | "tracking";

const STEPS = ["Pago confirmado", "En preparación", "Despachado", "Entregado"] as const;
const COURIERS = ["Olva Courier", "Shalom", "Urbaner", "Motorizado propio"];
const EASE = [0.25, 0.1, 0.25, 1] as const;

/** Index of the step the order has reached, or null when it will not be fulfilled here. */
function reachedStep(detail: AdminOrderDetail, shipment: Shipment | null): number | null {
  const { order, payment } = detail;
  if (order.status === "FULFILLED" || shipment?.status === "DELIVERED") return 3;
  if (order.status !== "CONFIRMED" || payment?.status !== "PAID" || !shipment) return null;
  if (shipment.status === "SHIPPED") return 2;
  if (shipment.status === "READY_TO_PACK" || shipment.status === "PACKED") return 1;
  if (shipment.status === "UNFULFILLED") return 0;
  return null;
}

function blockedReason(detail: AdminOrderDetail): React.ReactNode {
  const { order, payment } = detail;
  if (detail.shipments.length > 1) {
    return "Este pedido tiene más de un envío registrado; revísalo antes de despacharlo.";
  }
  if (detail.shipments.length === 0) return "Este pedido no tiene un envío registrado.";
  if (["CANCELLED", "EXPIRED", "REFUNDED"].includes(order.status)) {
    return "Este pedido está cerrado y no se despacha.";
  }
  if (payment?.status === "SUBMITTED" || payment?.status === "VERIFYING") {
    return (
      <>
        El pago está esperando verificación.{" "}
        <Link href="/admin/pagos" className={styles.inlineLink}>
          Ir a la cola de pagos
        </Link>
      </>
    );
  }
  return "El despacho se habilita cuando el pago está confirmado.";
}

export function OrderFulfillment({ detail }: { detail: AdminOrderDetail }) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const { toasts, notify } = useToasts();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [confirmDelivery, setConfirmDelivery] = useState(false);

  const orderNumber = detail.order.orderNumber;
  const shipment = detail.shipments.length === 1 ? detail.shipments[0]! : null;
  const step = reachedStep(detail, shipment);

  const run = (
    action: () => Promise<Awaited<ReturnType<typeof startPreparationAction>>>,
    successMessage: string,
    onSuccess?: () => void
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        notify("success", result.replayed ? "Ya estaba registrado." : successMessage);
        onSuccess?.();
      } else {
        notify("error", result.error);
      }
    });
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId} data-testid="order-fulfillment">
      <header className={styles.head}>
        <div>
          <h2 id={titleId} className={styles.title}>
            Despacho
          </h2>
          <p className={styles.caption}>
            {step === null
              ? "Sin acciones disponibles por ahora."
              : step === 3
                ? "Pedido entregado. El ciclo está completo."
                : "Prepara, registra el transportista y despacha."}
          </p>
        </div>
        {step !== null && step < 3 && (
          <span className={styles.stepCount}>
            Paso {step + 1} de {STEPS.length}
          </span>
        )}
      </header>

      {step !== null && (
        <ol className={styles.stepper} aria-label="Progreso del despacho">
          {STEPS.map((label, index) => {
            const state = step === 3 || index < step ? "done" : index === step ? "current" : "todo";
            return (
              <li key={label} className={styles.step} data-state={state}>
                <span className={styles.stepMark} aria-hidden="true">
                  {state === "done" ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className={styles.stepLabel}>
                  {label}
                  <span className={styles.srOnly}>
                    {state === "done" ? " (completado)" : state === "current" ? " (actual)" : ""}
                  </span>
                </span>
                {index < STEPS.length - 1 && (
                  <span className={styles.stepTrack} aria-hidden="true">
                    <motion.span
                      className={styles.stepFill}
                      initial={false}
                      animate={{ scaleX: index < step ? 1 : 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className={styles.body}>
        {step === null && <p className={styles.note}>{blockedReason(detail)}</p>}

        {step === 0 && (
          <div className={styles.actionRow}>
            <p className={styles.note}>
              El stock ya está asignado a este pedido. Al iniciar la preparación deja de poder
              cancelarse con reembolso desde esta página.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isPending}
              onClick={() =>
                run(
                  () => startPreparationAction(orderNumber),
                  `Pedido ${orderNumber} en preparación`
                )
              }
            >
              <PackageCheck size={15} aria-hidden="true" />
              {isPending ? "Guardando…" : "Iniciar preparación"}
            </button>
          </div>
        )}

        {step === 1 && shipment && (
          <div className={styles.actionRow}>
            <CourierSummary shipment={shipment} emptyText="Aún sin transportista registrado." />
            <div className={styles.buttons}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setDrawer("tracking")}
              >
                <PencilLine size={15} aria-hidden="true" />
                Datos de envío
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setDrawer("dispatch")}
              >
                <Truck size={15} aria-hidden="true" />
                Despachar pedido
              </button>
            </div>
          </div>
        )}

        {step === 2 && shipment && (
          <div className={styles.actionRow}>
            <CourierSummary shipment={shipment} emptyText="Sin datos de envío." />
            <div className={styles.buttons}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setDrawer("tracking")}
              >
                <PencilLine size={15} aria-hidden="true" />
                Editar datos
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                aria-expanded={confirmDelivery}
                onClick={() => setConfirmDelivery((value) => !value)}
              >
                <Check size={15} aria-hidden="true" />
                Marcar como entregado
              </button>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {step === 2 && confirmDelivery && (
            <motion.div
              key="confirm-delivery"
              className={styles.confirm}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
            >
              <div className={styles.confirmInner}>
                <p className={styles.note}>
                  Confirma solo cuando el transportista reporte la entrega. El pedido quedará
                  cerrado como entregado.
                </p>
                <div className={styles.buttons}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setConfirmDelivery(false)}
                    disabled={isPending}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => markDeliveredAction(orderNumber),
                        `Pedido ${orderNumber} entregado`,
                        () => setConfirmDelivery(false)
                      )
                    }
                  >
                    {isPending ? "Guardando…" : "Confirmar entrega"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {step === 3 && shipment && (
          <CourierSummary shipment={shipment} emptyText="Sin datos de envío." />
        )}
      </div>

      <AnimatePresence>
        {drawer && shipment && (
          <CourierDrawer
            key={drawer}
            mode={drawer}
            detail={detail}
            shipment={shipment}
            busy={isPending}
            onClose={() => setDrawer(null)}
            onSubmit={(tracking) =>
              run(
                () =>
                  drawer === "dispatch"
                    ? dispatchOrderAction({ orderNumber, ...tracking })
                    : updateTrackingAction({ orderNumber, ...tracking }),
                drawer === "dispatch"
                  ? `Pedido ${orderNumber} despachado`
                  : "Datos de envío guardados",
                () => setDrawer(null)
              )
            }
          />
        )}
      </AnimatePresence>

      <ToastViewport toasts={toasts} />
    </section>
  );
}

function CourierSummary({ shipment, emptyText }: { shipment: Shipment; emptyText: string }) {
  if (!shipment.courierName) return <p className={styles.note}>{emptyText}</p>;

  return (
    <dl className={styles.summary}>
      <div>
        <dt>Transportista</dt>
        <dd>{shipment.courierName}</dd>
      </div>
      <div>
        <dt>Seguimiento</dt>
        <dd className={styles.mono}>{shipment.trackingNumber ?? "—"}</dd>
      </div>
      {shipment.shippedAt && (
        <div>
          <dt>Despachado</dt>
          <dd>{formatLimaDateTime(shipment.shippedAt)}</dd>
        </div>
      )}
      {shipment.deliveredAt && (
        <div>
          <dt>Entregado</dt>
          <dd>{formatLimaDateTime(shipment.deliveredAt)}</dd>
        </div>
      )}
      {shipment.trackingUrl && (
        <div>
          <dt>Enlace</dt>
          <dd>
            <a
              className={styles.inlineLink}
              href={shipment.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir seguimiento <ExternalLink size={12} aria-hidden="true" />
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}

function CourierDrawer({
  mode,
  detail,
  shipment,
  busy,
  onClose,
  onSubmit,
}: {
  mode: DrawerMode;
  detail: AdminOrderDetail;
  shipment: Shipment;
  busy: boolean;
  onClose: () => void;
  onSubmit: (tracking: {
    courierName: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }) => void;
}) {
  const titleId = useId();
  const [courierName, setCourierName] = useState(shipment.courierName ?? "");
  const [trackingNumber, setTrackingNumber] = useState(shipment.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(shipment.trackingUrl ?? "");

  const urlInvalid = trackingUrl.trim() !== "" && !/^https:\/\/\S+$/i.test(trackingUrl.trim());
  const canSubmit = courierName.trim().length >= 2 && !urlInvalid && !busy;
  const isDispatch = mode === "dispatch";
  const units = detail.items.reduce((sum, item) => sum + item.quantity, 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim() || null,
      trackingUrl: trackingUrl.trim() || null,
    });
  };

  return (
    <SideDrawer labelledBy={titleId} onClose={onClose} busy={busy} testId="courier-drawer">
      <DrawerHeader
        titleId={titleId}
        title={isDispatch ? "Despachar pedido" : "Datos de envío"}
        eyebrow={`Pedido ${detail.order.orderNumber}`}
        onClose={onClose}
        busy={busy}
      />

      <form className={styles.drawerForm} onSubmit={submit} noValidate>
        <div className={styles.drawerBody}>
          <div className={styles.field}>
            <label htmlFor={`${titleId}-courier`} className={styles.label}>
              Transportista
            </label>
            <div className={styles.chips} role="group" aria-label="Transportistas frecuentes">
              {COURIERS.map((courier) => (
                <button
                  key={courier}
                  type="button"
                  className={styles.chip}
                  aria-pressed={courierName === courier}
                  onClick={() => setCourierName(courier)}
                >
                  {courier}
                </button>
              ))}
            </div>
            <input
              id={`${titleId}-courier`}
              className={styles.input}
              value={courierName}
              maxLength={100}
              onChange={(event) => setCourierName(event.target.value)}
              placeholder="Nombre del transportista"
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${titleId}-tracking`} className={styles.label}>
              Número de seguimiento <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={`${titleId}-tracking`}
              className={`${styles.input} ${styles.mono}`}
              value={trackingNumber}
              maxLength={100}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder="Ej.: OLV-000123"
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${titleId}-url`} className={styles.label}>
              Enlace de seguimiento <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={`${titleId}-url`}
              className={styles.input}
              type="url"
              inputMode="url"
              value={trackingUrl}
              maxLength={500}
              onChange={(event) => setTrackingUrl(event.target.value)}
              placeholder="https://"
              aria-invalid={urlInvalid}
              aria-describedby={`${titleId}-url-hint`}
            />
            <p
              id={`${titleId}-url-hint`}
              className={urlInvalid ? styles.fieldError : styles.fieldHint}
            >
              {urlInvalid
                ? "El enlace debe empezar con https://"
                : "El cliente lo verá en Mis pedidos."}
            </p>
          </div>

          {isDispatch && (
            <div className={styles.dispatchSummary}>
              <p className={styles.label}>
                Sale del almacén · {units} {units === 1 ? "unidad" : "unidades"}
              </p>
              <ul className={styles.itemList}>
                {detail.items.map((item) => (
                  <li key={item.id}>
                    <span className={styles.itemQty}>{item.quantity}×</span>
                    <span>
                      {item.productName}
                      <span className={styles.itemMeta}>
                        {item.variantTitle} · {item.sku}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {detail.address && (
                <p className={styles.note}>
                  Destino: {detail.address.recipientName}, {detail.address.streetAddress},{" "}
                  {detail.address.district}, {detail.address.province}
                </p>
              )}
              <p className={styles.note}>
                Al confirmar, estas unidades se descuentan del stock físico y el cliente verá su
                pedido como enviado.
              </p>
            </div>
          )}
        </div>

        <footer className={styles.drawerFooter}>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
            {isDispatch ? <Truck size={15} aria-hidden="true" /> : null}
            {busy ? "Guardando…" : isDispatch ? "Confirmar despacho" : "Guardar datos"}
            {!busy && !isDispatch ? <ArrowRight size={15} aria-hidden="true" /> : null}
          </button>
        </footer>
      </form>
    </SideDrawer>
  );
}
