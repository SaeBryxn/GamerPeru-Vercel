"use client";

import React, { useCallback, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleCheck, CircleAlert, Inbox } from "lucide-react";
import { AdminCard, MetricRow, MetricWidget, StatusDot } from "@/components/admin/ui";
import { claimPaymentAction } from "@/lib/payments/verification-actions";
import type { VerificationQueueItem } from "@/lib/payments/verification-queue";
import { formatCurrency } from "@/lib/utils/currency";
import { formatAttempt, formatRelative } from "./format";
import { ReviewDrawer } from "./review-drawer";
import styles from "./verification.module.css";

export type ToastTone = "success" | "error";
export type NotifyFn = (tone: ToastTone, message: string) => void;

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

type Filter = "all" | "pending" | "mine";

interface VerificationWorkspaceProps {
  queue: VerificationQueueItem[];
  currentUserId: string;
  renderedAt: string;
}

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function VerificationWorkspace({
  queue,
  currentUserId,
  renderedAt,
}: VerificationWorkspaceProps) {
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, startTransition] = useTransition();

  const notify = useCallback<NotifyFn>((tone, message) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const pendingCount = queue.filter((item) => item.paymentStatus === "SUBMITTED").length;
  const reviewingCount = queue.length - pendingCount;
  const mineCount = queue.filter((item) => item.claimedByAuthUserId === currentUserId).length;
  const queueAmount = queue.reduce((sum, item) => sum + item.amountCents, 0);

  const visible = useMemo(() => {
    if (filter === "pending") return queue.filter((item) => item.paymentStatus === "SUBMITTED");
    if (filter === "mine")
      return queue.filter((item) => item.claimedByAuthUserId === currentUserId);
    return queue;
  }, [currentUserId, filter, queue]);

  // A decision drops the payment from the refreshed queue, which closes the drawer with it.
  const activeItem = queue.find((item) => item.paymentId === activePaymentId) ?? null;

  const review = (item: VerificationQueueItem) => {
    if (item.claimedByAuthUserId === currentUserId) {
      setActivePaymentId(item.paymentId);
      return;
    }
    setClaimingId(item.paymentId);
    startTransition(async () => {
      const result = await claimPaymentAction(item.paymentId);
      setClaimingId(null);
      if (result.success) {
        setActivePaymentId(item.paymentId);
      } else {
        notify("error", result.error);
      }
    });
  };

  // The row button is disabled while its case is being claimed, so focus cannot be captured when
  // the drawer opens; it is restored here to the row, or to the queue once a decision removed it.
  const closeDrawer = useCallback(() => {
    const closedId = activePaymentId;
    setActivePaymentId(null);
    window.requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>(`[data-payment-row="${closedId}"] button`) ??
        document.getElementById("verification-queue-title");
      target?.focus();
    });
  }, [activePaymentId]);

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Todos", count: queue.length },
    { id: "pending", label: "Por revisar", count: pendingCount },
    { id: "mine", label: "Mis casos", count: mineCount },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Verificación de pagos</h1>
        <p className={styles.subtitle}>
          Comprobantes Yape y Plin del más antiguo al más reciente. Toma un caso para revisarlo:
          mientras lo tengas, nadie más puede decidir sobre ese pago.
        </p>
      </header>

      <AdminCard>
        <MetricRow minCellWidth={140}>
          <MetricWidget
            label="Por revisar"
            value={pendingCount}
            dot={pendingCount > 0 ? "attention" : "neutral"}
            valueTestId="verification-pending-count"
          />
          <MetricWidget label="En revisión" value={reviewingCount} />
          <MetricWidget label="Tomados por ti" value={mineCount} />
          <MetricWidget
            label="Monto en cola"
            value={formatCurrency(queueAmount).replace(" ", " ")}
            size="small"
          />
        </MetricRow>
      </AdminCard>

      <section className={styles.queueSection} aria-labelledby="verification-queue-title">
        <div className={styles.queueHead}>
          <h2 id="verification-queue-title" className={styles.sectionTitle} tabIndex={-1}>
            Cola
          </h2>
          <div className={styles.segmented} role="group" aria-label="Filtrar la cola">
            {filters.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.segment}
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {filter === option.id && (
                  <motion.span
                    layoutId="verification-filter"
                    className={styles.segmentThumb}
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
                  />
                )}
                <span className={styles.segmentLabel}>
                  {option.label}
                  <span className={styles.segmentCount}>{option.count}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <AdminCard padded className={styles.empty}>
            <Inbox size={20} aria-hidden="true" />
            <p className={styles.emptyTitle}>
              {queue.length === 0 ? "No hay comprobantes pendientes" : "Nada en este filtro"}
            </p>
            <p className={styles.emptyText}>
              {queue.length === 0
                ? "Cuando un cliente envíe su código de operación aparecerá aquí."
                : "Cambia el filtro para ver el resto de la cola."}
            </p>
          </AdminCard>
        ) : (
          <AdminCard>
            <motion.ul
              className={styles.queueList}
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.04 } },
              }}
            >
              <AnimatePresence initial={false}>
                {visible.map((item) => (
                  <QueueRow
                    key={item.paymentId}
                    item={item}
                    currentUserId={currentUserId}
                    renderedAt={renderedAt}
                    busy={claimingId === item.paymentId}
                    reduceMotion={Boolean(reduceMotion)}
                    onReview={() => review(item)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </AdminCard>
        )}
      </section>

      <AnimatePresence>
        {activeItem && (
          <ReviewDrawer
            key={activeItem.paymentId}
            item={activeItem}
            renderedAt={renderedAt}
            onClose={closeDrawer}
            notify={notify}
          />
        )}
      </AnimatePresence>

      <div className={styles.toastViewport} aria-live="polite" aria-atomic="false">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : ""}`}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
            >
              {toast.tone === "error" ? (
                <CircleAlert size={16} aria-hidden="true" />
              ) : (
                <CircleCheck size={16} aria-hidden="true" />
              )}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QueueRow({
  item,
  currentUserId,
  renderedAt,
  busy,
  reduceMotion,
  onReview,
}: {
  item: VerificationQueueItem;
  currentUserId: string;
  renderedAt: string;
  busy: boolean;
  reduceMotion: boolean;
  onReview: () => void;
}) {
  const isMine = item.claimedByAuthUserId === currentUserId;
  const isTaken = item.paymentStatus === "VERIFYING" && !isMine;
  const hasDuplicates = item.duplicateOrderNumbers.length > 0;

  const statusLabel = isMine
    ? "Revisando tú"
    : isTaken
      ? `Revisando: ${item.claimedByEmail ?? "otro operador"}`
      : "Por revisar";

  return (
    <motion.li
      layout={!reduceMotion}
      className={styles.queueRow}
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 4 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
      }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      data-testid="verification-row"
      data-payment-row={item.paymentId}
    >
      <div className={styles.rowOrder}>
        <span className={styles.orderNumber}>{item.orderNumber}</span>
        <span className={styles.rowMeta}>
          {formatRelative(item.submission.submittedAt, renderedAt)} ·{" "}
          {formatAttempt(item.submission.attemptNumber)}
        </span>
      </div>

      <div className={styles.rowCustomer}>
        <span className={styles.rowPrimary}>{item.customerEmail}</span>
        <span className={styles.rowMeta}>
          {item.methodName} · {item.itemCount} {item.itemCount === 1 ? "producto" : "productos"}
        </span>
      </div>

      <div className={styles.rowAmount}>{formatCurrency(item.amountCents)}</div>

      <div className={styles.rowFlags}>
        {hasDuplicates && (
          <span className={styles.flag} title={item.duplicateOrderNumbers.join(", ")}>
            <StatusDot tone="critical" />
            Código repetido
          </span>
        )}
        {item.submission.isLate && (
          <span className={styles.flag}>
            <StatusDot tone="attention" />
            Tardío
          </span>
        )}
        {!item.submission.hasProof && <span className={styles.flag}>Sin captura</span>}
      </div>

      <div className={styles.rowStatus}>
        <StatusDot tone={isTaken || isMine ? "ok" : "attention"} />
        <span className={styles.rowStatusText}>{statusLabel}</span>
      </div>

      <div className={styles.rowAction}>
        <button
          type="button"
          className={isMine ? styles.primaryButton : styles.secondaryButton}
          onClick={onReview}
          disabled={isTaken || busy}
          aria-label={`${isMine ? "Continuar" : "Revisar"} el pago del pedido ${item.orderNumber}`}
        >
          {busy ? "Tomando…" : isMine ? "Continuar" : isTaken ? "En revisión" : "Revisar"}
          {!isTaken && !busy && <ArrowRight size={15} aria-hidden="true" />}
        </button>
      </div>
    </motion.li>
  );
}
