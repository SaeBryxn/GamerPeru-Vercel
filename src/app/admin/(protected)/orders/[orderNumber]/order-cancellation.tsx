"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOrderDetail } from "@/lib/admin/orders/types";
import {
  cancelAdminPaidOrderAction,
  cancelAdminUnpaidOrderAction,
} from "@/lib/admin/orders/actions";
import {
  clearOrderIntent,
  getOrCreateOrderIntent,
  markOrderIntentSent,
  readOrderIntent,
  type OrderIntentKind,
  type PendingOrderIntent,
} from "./intent-storage";
import styles from "./order-detail.module.css";

type CancellationMode = "unpaid" | "paid";

function intentKind(mode: CancellationMode): OrderIntentKind {
  return mode === "unpaid" ? "unpaid-cancellation" : "paid-cancellation";
}

function safeActionError(code: string): string {
  if (code === "IDEMPOTENCY_CONFLICT") {
    return "Este intento no coincide con el original. No crees otro identificador; revisa el pedido.";
  }
  if (code === "IDEMPOTENCY_EXPIRED") {
    return "El intento expiró. Revisa el pedido antes de cualquier otra operación.";
  }
  if (code === "INVALID_INPUT") return "Revisa la razón y la confirmación requerida.";
  if (code === "SYSTEM_ERROR") {
    return "No se pudo confirmar el resultado. Reintenta con la misma razón y el mismo intento.";
  }
  return "El pedido cambió o ya no cumple las condiciones. Actualiza y revisa antes de continuar.";
}

export function OrderCancellation({ detail }: { detail: AdminOrderDetail }) {
  const router = useRouter();
  const orderNumber = detail.order.orderNumber;
  const shipmentEligible =
    detail.shipments.length <= 1 &&
    detail.shipments.every((shipment) => shipment.status === "UNFULFILLED");
  const unpaidEligible =
    detail.order.status === "PENDING" &&
    detail.payment?.status === "UNPAID" &&
    shipmentEligible &&
    detail.integrityIssues.length === 0;
  const paidEligible =
    detail.order.status === "CONFIRMED" &&
    detail.payment?.status === "PAID" &&
    shipmentEligible &&
    detail.moneyActionsAllowed &&
    detail.integrityIssues.length === 0;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(false);
  const [mode, setMode] = useState<CancellationMode | null>(null);
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [dialogFeedback, setDialogFeedback] = useState("");
  const [pendingUnpaid, setPendingUnpaid] = useState<PendingOrderIntent | null>(null);
  const [pendingPaid, setPendingPaid] = useState<PendingOrderIntent | null>(null);

  useEffect(() => {
    setPendingUnpaid(readOrderIntent(orderNumber, "unpaid-cancellation"));
    setPendingPaid(readOrderIntent(orderNumber, "paid-cancellation"));
  }, [orderNumber]);

  function updatePending(nextMode: CancellationMode, intent: PendingOrderIntent | null) {
    if (nextMode === "unpaid") setPendingUnpaid(intent);
    else setPendingPaid(intent);
  }

  function openDialog(nextMode: CancellationMode, trigger: HTMLButtonElement) {
    const intent = getOrCreateOrderIntent(orderNumber, intentKind(nextMode));
    if (!intent) {
      setFeedback("No se pudo conservar un intento seguro. La acción no se inició.");
      return;
    }
    updatePending(nextMode, intent);
    setFeedback("");
    setDialogFeedback("");
    setMode(nextMode);
    triggerRef.current = trigger;
    dialogRef.current?.showModal();
    requestAnimationFrame(() => reasonRef.current?.focus());
  }

  function closeDialog() {
    if (busyRef.current) return;
    dialogRef.current?.close();
    setMode(null);
    setDialogFeedback("");
    triggerRef.current?.focus();
  }

  async function submitCancellation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || busyRef.current) return;
    const normalizedReason = reason.trim();
    if (
      normalizedReason.length < 1 ||
      normalizedReason.length > 255 ||
      /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(normalizedReason)
    ) {
      setDialogFeedback("Ingresa una razón operacional válida de 1 a 255 caracteres.");
      reasonRef.current?.focus();
      return;
    }
    if (mode === "paid" && !attested) {
      setDialogFeedback("Confirma que el reembolso externo ya fue completado.");
      return;
    }

    const kind = intentKind(mode);
    const intent = getOrCreateOrderIntent(orderNumber, kind);
    if (!intent || !markOrderIntentSent(orderNumber, kind, intent)) {
      setDialogFeedback(
        "No se pudo conservar el identificador de reintento. La acción no se envió."
      );
      return;
    }
    updatePending(mode, { ...intent, sent: true });
    busyRef.current = true;
    setBusy(true);
    setDialogFeedback("");
    try {
      const result =
        mode === "unpaid"
          ? await cancelAdminUnpaidOrderAction({
              orderNumber,
              reason: normalizedReason,
              cancellationAttemptId: intent.id,
            })
          : await cancelAdminPaidOrderAction({
              orderNumber,
              reason: normalizedReason,
              cancellationAttemptId: intent.id,
              externalRefundCompleted: true,
            });
      if (result.success) {
        clearOrderIntent(orderNumber, kind);
        updatePending(mode, null);
        setResolved(true);
        setFeedback(
          result.replayed
            ? "La operación ya estaba registrada; no se duplicó."
            : mode === "paid"
              ? "Cancelación y registro del reembolso externo confirmados."
              : "Cancelación confirmada."
        );
        busyRef.current = false;
        dialogRef.current?.close();
        setMode(null);
        triggerRef.current?.focus();
        router.refresh();
      } else {
        setDialogFeedback(safeActionError(result.code));
        if (result.code !== "INVALID_INPUT") router.refresh();
      }
    } catch {
      setDialogFeedback(
        "El resultado es incierto. Reintenta con la misma razón y el mismo intento; no repitas un reembolso externo."
      );
      router.refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const pendingMode = pendingUnpaid?.sent ? "unpaid" : pendingPaid?.sent ? "paid" : null;

  return (
    <section className={styles.actionsPanel} aria-labelledby="order-actions-title">
      <div className={styles.actionsHeading}>
        <h2 id="order-actions-title">Acciones de cancelación</h2>
        <p>
          La elegibilidad final se verifica nuevamente en el servidor antes de cualquier cambio.
        </p>
      </div>
      <div className={styles.actionChoices}>
        {!resolved && unpaidEligible && (
          <button
            type="button"
            className={styles.dangerButton}
            onClick={(event) => openDialog("unpaid", event.currentTarget)}
          >
            Cancelar pedido sin pagar
          </button>
        )}
        {!resolved && paidEligible && (
          <button
            type="button"
            className={styles.dangerButton}
            onClick={(event) => openDialog("paid", event.currentTarget)}
          >
            Registrar cancelación y reembolso externo
          </button>
        )}
        {!resolved &&
          pendingMode &&
          !(pendingMode === "unpaid" ? unpaidEligible : paidEligible) && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={(event) => openDialog(pendingMode, event.currentTarget)}
            >
              Resolver intento pendiente
            </button>
          )}
        {!unpaidEligible && !paidEligible && !pendingMode && (
          <p className={styles.muted}>No hay una cancelación disponible para este estado.</p>
        )}
      </div>
      {feedback && (
        <p role={resolved ? "status" : "alert"} className={styles.feedback}>
          {feedback}
        </p>
      )}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        {mode && (
          <form onSubmit={submitCancellation} className={styles.dialogForm}>
            <div className={styles.dialogHeading}>
              <h2 id="cancel-dialog-title">
                {mode === "paid"
                  ? "Registrar cancelación y reembolso"
                  : "Cancelar pedido sin pagar"}
              </h2>
              <p id="cancel-dialog-description">
                {mode === "paid"
                  ? "Esta acción cambia el estado visible del pedido y registra un reembolso externo ya completado."
                  : "El pedido será cancelado, puede liberarse stock reservado y el estado visible para el cliente cambiará."}
              </p>
            </div>
            {mode === "paid" && (
              <p className={styles.financialWarning}>
                GamerPeru NO está realizando una transferencia bancaria desde esta pantalla. Esta
                operación registra administrativamente que el reembolso externo ya fue completado.
              </p>
            )}
            <div className={styles.formField}>
              <label htmlFor="admin-cancel-reason">Razón operacional obligatoria</label>
              <textarea
                ref={reasonRef}
                id="admin-cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={255}
                rows={3}
                required
                disabled={busy}
              />
              <span>{reason.length}/255 caracteres</span>
            </div>
            {mode === "paid" && (
              <label className={styles.attestation}>
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(event) => setAttested(event.target.checked)}
                  disabled={busy}
                />
                Confirmo que el reembolso externo ya fue completado fuera de GamerPeru.
              </label>
            )}
            {(mode === "unpaid" ? pendingUnpaid : pendingPaid)?.sent && (
              <p className={styles.pendingNotice}>
                Hay un intento enviado pendiente de confirmar. Reutiliza exactamente la misma razón;
                no se generará otro identificador.
              </p>
            )}
            {dialogFeedback && (
              <p role="alert" className={styles.feedbackError}>
                {dialogFeedback}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeDialog}
                disabled={busy}
              >
                Volver sin cambios
              </button>
              <button type="submit" className={styles.dangerButton} disabled={busy}>
                {busy
                  ? "Verificando…"
                  : mode === "paid"
                    ? "Registrar reembolso completado"
                    : "Confirmar cancelación"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
