"use client";
import { useRouter } from "next/navigation";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ImageOff,
  RefreshCw,
  RotateCcw,
  Undo2,
  XCircle,
} from "lucide-react";
import { DrawerHeader, SideDrawer, StatusDot } from "@/components/admin/ui";
import {
  approvePaymentAction,
  getProofViewUrlAction,
  loadVerificationDetailAction,
  rejectPaymentAction,
  recordLatePaymentRefundAction,
  releasePaymentAction,
} from "@/lib/payments/verification-actions";
import type { VerificationDetail, VerificationQueueItem } from "@/lib/payments/verification-queue";
import { formatCurrency } from "@/lib/utils/currency";
import { formatAttempt, formatLimaDateTime, formatRelative } from "./format";
import type { NotifyFn } from "@/components/admin/ui";
import styles from "./verification.module.css";

type Decision = "approve" | "retry" | "terminal" | "refund";

type ProofState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "none" }
  | { status: "error"; message: string };

const EASE = [0.25, 0.1, 0.25, 1] as const;

const RETRY_REASONS = [
  "La captura no se lee con claridad",
  "No se ve el código de operación",
  "El monto no coincide con el pedido",
];

const TERMINAL_REASONS = [
  "El pago no aparece en la cuenta",
  "Comprobante adulterado o reutilizado",
];

const DECISION_COPY: Record<Decision, { title: string; confirm: string; hint: string }> = {
  approve: {
    title: "Aprobar pago",
    confirm: "Confirmar aprobación",
    hint: "El pago queda confirmado, el pedido pasa a preparación y el stock se descuenta.",
  },
  retry: {
    title: "Rechazar y pedir otro comprobante",
    confirm: "Rechazar y reabrir",
    hint: "El cliente podrá reenviar dentro del plazo de gracia (24 h por defecto). El stock sigue reservado.",
  },
  terminal: {
    title: "Rechazo terminal",
    confirm: "Rechazar definitivamente",
    hint: "Úsalo solo si confirmaste que no llegaron fondos. Cancela el pedido y libera el stock.",
  },
  refund: {
    title: "Registrar devolución externa completada",
    confirm: "Registrar pago y reembolso",
    hint: "Solo si verificaste los fondos recibidos y ya devolviste el importe total fuera de Gamer Perú. No confirma el pedido ni asigna stock.",
  },
};

const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Aprobado",
  REJECTED_RETRYABLE: "Rechazado · reenvío",
  REJECTED_TERMINAL: "Rechazo terminal",
};

interface ReviewDrawerProps {
  item: VerificationQueueItem;
  renderedAt: string;
  onClose: () => void;
  notify: NotifyFn;
}

export function ReviewDrawer({ item, renderedAt, onClose, notify }: ReviewDrawerProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const titleId = `review-title-${item.paymentId}`;

  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofState>(
    item.submission.hasProof ? { status: "loading" } : { status: "none" }
  );
  const [zoomed, setZoomed] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [externalRefundCompleted, setExternalRefundCompleted] = useState(false);
  const [notes, setNotes] = useState("");
  const [stockBlocked, setStockBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const attemptRef = useRef<{ key: string; id: string } | null>(null);
  const proofRetriedRef = useRef(false);

  const isMine = item.paymentStatus === "VERIFYING";
  const submissionId = item.submission.id;

  const loadDetail = useCallback(async () => {
    const result = await loadVerificationDetailAction(item.paymentId);
    if (result.success) {
      setDetail(result.detail);
      setDetailError(null);
      setStockBlocked(result.detail.lateStock ? !result.detail.lateStock.available : false);
    } else {
      setDetailError(result.error);
    }
  }, [item.paymentId]);

  const loadProof = useCallback(async () => {
    if (!item.submission.hasProof) return;
    setProof({ status: "loading" });
    const result = await getProofViewUrlAction(submissionId);
    setProof(
      result.success
        ? { status: "ready", url: result.url }
        : { status: "error", message: result.error }
    );
  }, [item.submission.hasProof, submissionId]);

  useEffect(() => {
    void loadDetail();
    void loadProof();
  }, [loadDetail, loadProof]);

  const chooseDecision = (next: Decision) => {
    setDecision((current) => (current === next ? null : next));
    setReason("");
    setExternalRefundCompleted(false);
  };

  // One attempt id per exact payload: a retry after a network failure replays safely, while an
  // edited reason or note is a new request instead of an idempotency conflict.
  const attemptIdFor = (payloadKey: string): string => {
    if (attemptRef.current?.key !== payloadKey) {
      attemptRef.current = { key: payloadKey, id: crypto.randomUUID() };
    }
    return attemptRef.current.id;
  };

  const submitDecision = () => {
    if (!decision) return;
    const trimmedReason = reason.trim();
    const trimmedNotes = notes.trim() || null;
    const trimmedReference = externalReference.trim();
    if ((decision === "retry" || decision === "terminal") && !trimmedReason) {
      notify("error", "Indica el motivo del rechazo.");
      return;
    }
    if (decision === "refund" && (!externalRefundCompleted || !trimmedReference)) {
      notify("error", "Confirma la devolución externa e ingresa su referencia.");
      return;
    }

    const verificationAttemptId = attemptIdFor(
      [decision, submissionId, trimmedReason, trimmedReference, trimmedNotes ?? ""].join("|")
    );

    startTransition(async () => {
      const result =
        decision === "approve"
          ? await approvePaymentAction({
              paymentId: item.paymentId,
              submissionId,
              verificationAttemptId,
              notes: trimmedNotes,
            })
          : decision === "refund"
            ? await recordLatePaymentRefundAction({
                paymentId: item.paymentId,
                submissionId,
                verificationAttemptId,
                externalRefundCompleted,
                externalReference: trimmedReference,
                notes: trimmedNotes,
              })
            : await rejectPaymentAction({
                paymentId: item.paymentId,
                submissionId,
                verificationAttemptId,
                mode: decision === "terminal" ? "TERMINAL" : "RETRYABLE",
                reason: trimmedReason,
                notes: trimmedNotes,
              });

      router.refresh();
      if (result.success) {
        const message =
          result.paymentStatus === "REFUNDED"
            ? `Pago recibido y reembolso registrado · pedido ${item.orderNumber}`
            : result.decision === "APPROVED"
              ? `Pago aprobado · pedido ${item.orderNumber} confirmado`
              : result.decision === "REJECTED_RETRYABLE"
                ? `Rechazado · ${item.orderNumber} puede reenviar su comprobante`
                : `Rechazo terminal · pedido ${item.orderNumber} cancelado`;
        notify("success", message);
        onClose();
        return;
      }

      notify("error", result.error);
      if (result.code === "LATE_PAYMENT_STOCK_UNAVAILABLE") {
        setStockBlocked(true);
        setDecision(null);
      } else if (result.code === "CLAIMED_BY_OTHER" || result.code === "INVALID_PAYMENT_STATE") {
        onClose();
      } else if (result.code === "STALE_SUBMISSION") {
        void loadDetail();
      }
    });
  };

  const releaseCase = () => {
    startTransition(async () => {
      const result = await releasePaymentAction(item.paymentId);
      router.refresh();
      if (result.success) {
        notify("success", `Caso ${item.orderNumber} devuelto a la cola`);
        onClose();
      } else {
        notify("error", result.error);
      }
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(item.submission.operationCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify("error", "No se pudo copiar el código.");
    }
  };

  const onProofError = () => {
    // A signed URL lives 5 minutes; if the drawer stayed open longer, sign a fresh one once.
    if (proofRetriedRef.current) {
      setProof({ status: "error", message: "No se pudo mostrar el comprobante." });
      return;
    }
    proofRetriedRef.current = true;
    void loadProof();
  };

  const reasons = decision === "terminal" ? TERMINAL_REASONS : RETRY_REASONS;

  return (
    <SideDrawer
      labelledBy={titleId}
      onClose={onClose}
      busy={isPending}
      size="wide"
      testId="review-drawer"
    >
      <DrawerHeader
        titleId={titleId}
        title={`Pedido ${item.orderNumber}`}
        eyebrow={`${item.methodName} · ${formatAttempt(item.submission.attemptNumber)}`}
        onClose={onClose}
        busy={isPending}
      />

      <div className={styles.drawerBody}>
        <section className={styles.proofPane} aria-label="Comprobante del cliente">
          <ProofViewer
            proof={proof}
            zoomed={zoomed}
            onToggleZoom={() => setZoomed((value) => !value)}
            onReload={() => {
              proofRetriedRef.current = false;
              void loadProof();
            }}
            onImageError={onProofError}
            orderNumber={item.orderNumber}
          />
        </section>

        <div className={styles.detailPane}>
          <section className={styles.amountBlock} aria-label="Monto">
            <span className={styles.label}>Monto esperado</span>
            <span className={styles.amount}>{formatCurrency(item.amountCents)}</span>
            <span className={styles.helpText}>
              El cliente no declara un monto: compáralo con el importe que muestra la captura.
            </span>
            {detail && (
              <dl className={styles.breakdown}>
                <div>
                  <dt>Productos</dt>
                  <dd>{formatCurrency(detail.subtotalCents)}</dd>
                </div>
                {detail.discountCents > 0 && (
                  <div>
                    <dt>Descuento</dt>
                    <dd>−{formatCurrency(detail.discountCents)}</dd>
                  </div>
                )}
                <div>
                  <dt>Envío</dt>
                  <dd>{formatCurrency(detail.shippingCents)}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className={styles.detailSection} aria-label="Código de operación">
            <span className={styles.label}>Código de operación</span>
            <div className={styles.codeRow}>
              <span className={styles.operationCode}>{item.submission.operationCode}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={copyCode}
                aria-label="Copiar código de operación"
              >
                {copied ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
              </button>
            </div>
            {item.duplicateOrderNumbers.length > 0 && (
              <p className={styles.alertLine} role="note">
                <StatusDot tone="critical" />
                <span>
                  Este código también se usó en{" "}
                  {item.duplicateOrderNumbers.length === 1 ? "el pedido" : "los pedidos"}{" "}
                  <strong>{item.duplicateOrderNumbers.join(", ")}</strong>. Verifica que no sea un
                  comprobante reutilizado.
                </span>
              </p>
            )}
            <p className={styles.metaLine}>
              Enviado {formatRelative(item.submission.submittedAt, renderedAt)} ·{" "}
              {formatLimaDateTime(item.submission.submittedAt)}
            </p>
          </section>

          {(item.submission.isLate || stockBlocked) && (
            <section
              className={`${styles.notice} ${stockBlocked ? styles.noticeCritical : ""}`}
              aria-label="Pago tardío"
            >
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <p className={styles.noticeTitle}>
                  {stockBlocked
                    ? "Sin stock disponible para este pago tardío"
                    : "Pago tardío: la reserva ya había vencido"}
                </p>
                <p className={styles.noticeText}>
                  {stockBlocked
                    ? "Si recibiste los fondos y ya completaste la devolución externa, registra su referencia. Si no llegaron fondos, usa el rechazo terminal. No rechaces como impago un dinero recibido."
                    : "Al aprobar se vuelve a tomar el stock; hoy está disponible."}
                </p>
                {detail?.lateStock?.shortfalls.map((shortfall) => (
                  <p key={shortfall.sku} className={styles.noticeText}>
                    {shortfall.sku}: necesita {shortfall.needed}, disponible {shortfall.available}
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className={styles.detailSection} aria-label="Cliente">
            <span className={styles.label}>Cliente</span>
            <p className={styles.detailPrimary}>{item.customerEmail}</p>
            <p className={styles.metaLine}>{item.customerPhone}</p>
            {detail?.submissionNotes && <p className={styles.quote}>“{detail.submissionNotes}”</p>}
          </section>

          {detailError && (
            <p className={styles.alertLine} role="alert">
              {detailError}
            </p>
          )}

          {!detail && !detailError && (
            <div className={styles.detailSkeleton} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}

          {detail && (
            <>
              <section className={styles.detailSection} aria-label="Productos">
                <span className={styles.label}>Productos</span>
                <ul className={styles.itemList}>
                  {detail.items.map((line) => (
                    <li key={line.id} className={styles.itemLine}>
                      <span className={styles.itemQty}>{line.quantity}×</span>
                      <span className={styles.itemName}>
                        {line.productName}
                        <span className={styles.metaLine}>
                          {line.variantTitle} · {line.sku}
                        </span>
                      </span>
                      <span className={styles.itemTotal}>
                        {formatCurrency(line.lineTotalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {detail.address && (
                <section className={styles.detailSection} aria-label="Entrega">
                  <span className={styles.label}>Entrega</span>
                  <p className={styles.detailPrimary}>{detail.address.recipientName}</p>
                  <p className={styles.metaLine}>
                    {detail.address.streetAddress}
                    {detail.address.apartmentSuite ? `, ${detail.address.apartmentSuite}` : ""}
                  </p>
                  <p className={styles.metaLine}>
                    {detail.address.district}, {detail.address.province},{" "}
                    {detail.address.department}
                  </p>
                </section>
              )}

              {detail.history.length > 1 && (
                <section className={styles.detailSection} aria-label="Envíos anteriores">
                  <span className={styles.label}>Envíos anteriores</span>
                  <ol className={styles.history}>
                    {detail.history.slice(1).map((entry) => (
                      <li key={entry.submissionId} className={styles.historyEntry}>
                        <span className={styles.historyAttempt}>
                          {formatAttempt(entry.attemptNumber)}
                        </span>
                        <span className={styles.historyBody}>
                          <span className={styles.mono}>{entry.operationCode}</span>
                          {entry.decision ? (
                            <span className={styles.metaLine}>
                              {DECISION_LABEL[entry.decision] ?? entry.decision}
                              {entry.rejectionReason ? ` · ${entry.rejectionReason}` : ""}
                              {entry.verifierEmail ? ` · ${entry.verifierEmail}` : ""}
                            </span>
                          ) : (
                            <span className={styles.metaLine}>Sin decisión registrada</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <footer className={styles.drawerFooter}>
        <AnimatePresence initial={false}>
          {decision && (
            <m.div
              key="decision-form"
              className={styles.decisionForm}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
            >
              <div className={styles.decisionInner}>
                <p className={styles.decisionTitle}>{DECISION_COPY[decision].title}</p>
                <p className={styles.helpText}>{DECISION_COPY[decision].hint}</p>

                {(decision === "retry" || decision === "terminal") && (
                  <>
                    <div
                      className={styles.reasonChips}
                      role="group"
                      aria-label="Motivos frecuentes"
                    >
                      {reasons.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={styles.chip}
                          aria-pressed={reason === preset}
                          onClick={() => setReason(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <label className={styles.field}>
                      <span className={styles.label}>Motivo del rechazo</span>
                      <input
                        className={styles.input}
                        value={reason}
                        maxLength={255}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Escribe el motivo del rechazo"
                      />
                    </label>
                  </>
                )}

                {decision === "refund" && (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Referencia de la devolución externa</span>
                      <input
                        className={styles.input}
                        value={externalReference}
                        maxLength={100}
                        required
                        onChange={(event) => setExternalReference(event.target.value)}
                        placeholder="Código de operación del banco o billetera"
                      />
                    </label>
                    <label className={styles.refundDeclaration}>
                      <input
                        type="checkbox"
                        checked={externalRefundCompleted}
                        required
                        onChange={(event) => setExternalRefundCompleted(event.target.checked)}
                      />
                      <span>
                        Declaro que verifiqué la recepción del pago, que faltaba stock al decidir la
                        devolución y que el importe total ya fue devuelto al cliente fuera de Gamer
                        Perú.
                      </span>
                    </label>
                    <p className={styles.helpText}>
                      El sistema registrará tu identidad, el importe y la referencia. Avisa al
                      cliente por un canal seguro: este registro no envía un correo automático de
                      reembolso.
                    </p>
                  </>
                )}

                <label className={styles.field}>
                  <span className={styles.label}>Notas internas (opcional)</span>
                  <textarea
                    className={styles.textarea}
                    value={notes}
                    maxLength={2000}
                    rows={2}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Ej.: verificado en el app a las 10:32"
                  />
                </label>

                <div className={styles.decisionActions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setDecision(null)}
                    disabled={isPending}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    className={decision === "terminal" ? styles.dangerButton : styles.primaryButton}
                    onClick={submitDecision}
                    disabled={
                      isPending ||
                      ((decision === "retry" || decision === "terminal") && !reason.trim()) ||
                      (decision === "refund" &&
                        (!externalRefundCompleted || !externalReference.trim()))
                    }
                  >
                    {isPending ? "Guardando…" : DECISION_COPY[decision].confirm}
                  </button>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <div className={styles.actionBar}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={releaseCase}
            disabled={isPending || !isMine}
          >
            <Undo2 size={15} aria-hidden="true" />
            Soltar caso
          </button>
          <div className={styles.actionGroup}>
            {(item.submission.isLate || stockBlocked) && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => chooseDecision("refund")}
                aria-pressed={decision === "refund"}
                disabled={isPending}
              >
                <Check size={15} aria-hidden="true" />
                Pago recibido · reembolso completado
              </button>
            )}
            <button
              type="button"
              className={styles.dangerOutlineButton}
              onClick={() => chooseDecision("terminal")}
              aria-pressed={decision === "terminal"}
              disabled={isPending}
            >
              <XCircle size={15} aria-hidden="true" />
              Rechazo terminal
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => chooseDecision("retry")}
              aria-pressed={decision === "retry"}
              disabled={isPending || stockBlocked}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Rechazar (reintentar)
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => chooseDecision("approve")}
              aria-pressed={decision === "approve"}
              disabled={isPending || stockBlocked}
              title={stockBlocked ? "Sin stock disponible" : undefined}
            >
              <Check size={15} aria-hidden="true" />
              Aprobar
            </button>
          </div>
        </div>
      </footer>
    </SideDrawer>
  );
}

function ProofViewer({
  proof,
  zoomed,
  onToggleZoom,
  onReload,
  onImageError,
  orderNumber,
}: {
  proof: ProofState;
  zoomed: boolean;
  onToggleZoom: () => void;
  onReload: () => void;
  onImageError: () => void;
  orderNumber: string;
}) {
  if (proof.status === "none") {
    return (
      <div className={styles.proofEmpty}>
        <ImageOff size={22} aria-hidden="true" />
        <p>El cliente envió solo el código de operación, sin captura.</p>
      </div>
    );
  }

  if (proof.status === "error") {
    return (
      <div className={styles.proofEmpty}>
        <ImageOff size={22} aria-hidden="true" />
        <p>{proof.message}</p>
        <button type="button" className={styles.secondaryButton} onClick={onReload}>
          <RefreshCw size={15} aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  if (proof.status === "loading") {
    return <div className={styles.proofSkeleton} aria-label="Cargando comprobante" role="status" />;
  }

  return (
    <div className={styles.proofFrame}>
      <button
        type="button"
        className={`${styles.proofImageButton} ${zoomed ? styles.proofZoomed : ""}`}
        onClick={onToggleZoom}
        aria-label={zoomed ? "Ajustar comprobante a la vista" : "Ampliar comprobante"}
      >
        {/* A short-lived private URL must not pass through the image optimizer or its cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proof.url}
          alt={`Comprobante de pago del pedido ${orderNumber}`}
          className={styles.proofImage}
          onError={onImageError}
          referrerPolicy="no-referrer"
        />
      </button>
      <div className={styles.proofToolbar}>
        <span className={styles.helpText}>Enlace válido por 5 minutos</span>
        <div className={styles.proofTools}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onReload}
            aria-label="Volver a firmar el comprobante"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <a
            className={styles.iconButton}
            href={proof.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir comprobante en otra pestaña"
          >
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
