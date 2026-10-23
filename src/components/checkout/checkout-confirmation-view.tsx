"use client";

import React, { useState, useId } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { AlertTriangle, Clock, ListChecks, MapPin, Package, XCircle } from "lucide-react";
import { DomeLink, Icon } from "@/components/ui";
import { OrderTimeline } from "@/components/account/order-timeline";
import { buildOrderTimeline, type CustomerOrderProgressDTO } from "@/lib/account/order-timeline";
import type { CheckoutConfirmationDTO } from "@/lib/checkout/types";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import { ManualPaymentCard } from "./manual-payment-card";
import { cancelUnpaidOrderAction } from "@/lib/orders/actions";
import styles from "./checkout-confirmation-view.module.css";
import { PurchaseProgress } from "./purchase-progress";
import { ReservationNotice } from "./reservation-notice";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
import { loadOrderProgressAction } from "@/lib/checkout/actions";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * One entrance, ordered by `custom` step rather than DOM nesting, so the cascade reads mark,
 * heading, payment form and then the summary column even though they sit in different columns.
 */
const RISE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (step: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE, delay: 0.05 + step * 0.09 },
  }),
};

const STEP = {
  mark: 0,
  title: 1,
  lead: 2,
  payment: 3,
  timeline: 4,
  actions: 5,
  summary: 6,
  delivery: 7,
};

export interface CheckoutConfirmationViewProps {
  confirmation: CheckoutConfirmationDTO;
  paymentInstructions?: PaymentInstructionDTO | null;
}

/** Circle then tick, drawn in sequence: the purchase lands with a single, quiet flourish. */
function SuccessMark() {
  const prefersReducedMotion = useReducedMotion();
  const draw = (delay: number) =>
    prefersReducedMotion
      ? { initial: false as const }
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: 0.5, delay, ease: EASE },
        };

  return (
    <svg className={styles.checkMark} viewBox="0 0 64 64" aria-hidden="true">
      <motion.circle
        cx="32"
        cy="32"
        r="30"
        strokeWidth="2"
        className={styles.checkCircle}
        {...draw(0.15)}
      />
      <motion.path
        d="M20 33 L28.5 41.5 L44.5 24.5"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.checkPath}
        {...draw(0.55)}
      />
    </svg>
  );
}

/**
 * Heading for the order's state. A submitted receipt is not a confirmed payment: until the team
 * verifies it, the page says it was received, never that it was paid.
 */
function heroCopy(
  paymentStatus: string,
  progress: CustomerOrderProgressDTO
): { title: string; lead: string } {
  if (progress.deliveredAt || progress.shipmentStatus === "DELIVERED") {
    return { title: "¡Pedido entregado!", lead: "Gracias por comprar en Gamer Perú." };
  }
  if (progress.shippedAt || progress.shipmentStatus === "SHIPPED") {
    return {
      title: "Tu pedido va en camino",
      lead: "Ya lo entregamos al courier. Abajo puedes ver el seguimiento.",
    };
  }
  switch (paymentStatus) {
    case "PAID":
      return {
        title: "¡Pago confirmado!",
        lead: "Verificamos tu pago y tu pedido ya pasa a preparación.",
      };
    case "SUBMITTED":
    case "VERIFYING":
    case "PENDING_VERIFICATION":
      return {
        title: "Recibimos tu comprobante",
        lead: "Nuestro equipo lo está verificando. Te avisaremos apenas quede confirmado.",
      };
    default:
      return {
        title: "¡Pedido registrado!",
        lead: "Completa el pago para que empecemos a preparar tu pedido.",
      };
  }
}

export function CheckoutConfirmationView({
  confirmation: initialConfirmation,
  paymentInstructions,
}: CheckoutConfirmationViewProps): React.JSX.Element {
  const [confirmation, setConfirmation] = useState(initialConfirmation);
  const [statusReadError, setStatusReadError] = useState(false);
  const {
    orderNumber,
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents,
    customerEmail,
    customerPhone,
    shippingMethodName,
    paymentMethodName,
    deliveryAddress,
    items,
  } = confirmation;

  const prefersReducedMotion = useReducedMotion();
  const [orderStatus, setOrderStatus] = useState<string>(confirmation.status);
  const [paymentStatus, setPaymentStatus] = useState<string>(
    paymentInstructions?.paymentStatus ?? confirmation.paymentStatus
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState("Cambié de opinión");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const modalTitleId = useId();
  const modalDescId = useId();
  const reasonSelectId = useId();

  const isCancelled = ["CANCELLED", "REFUNDED", "EXPIRED"].includes(orderStatus);
  useVisiblePolling(
    orderNumber,
    !isCancelled && confirmation.progress.shipmentStatus !== "DELIVERED",
    async () => {
      const result = await loadOrderProgressAction(orderNumber);
      if (!result?.success) {
        setStatusReadError(true);
        return false;
      }
      setStatusReadError(false);
      const previous = JSON.stringify([
        orderStatus,
        paymentStatus,
        confirmation.progress,
        confirmation.reservationExpiresAt,
      ]);
      const next = JSON.stringify([
        result.data.status,
        result.data.paymentStatus,
        result.data.progress,
        result.data.reservationExpiresAt,
      ]);
      setConfirmation((current) => ({ ...current, ...result.data }));
      setOrderStatus(result.data.status);
      setPaymentStatus(result.data.paymentStatus);
      return previous !== next;
    }
  );
  const isEligibleForCancellation =
    !isCancelled && orderStatus === "PENDING" && paymentStatus === "UNPAID";
  const hero = heroCopy(paymentStatus, confirmation.progress);
  const timeline = buildOrderTimeline(confirmation.progress, orderStatus, paymentStatus);
  const totalLabel = isCancelled
    ? "Total"
    : paymentStatus === "PAID"
      ? "Total pagado"
      : "Total a pagar";

  const handleOpenModal = () => {
    setCancelError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!isCancelling) {
      setIsModalOpen(false);
      setCancelError(null);
    }
  };

  const handleConfirmCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);

    try {
      const attemptId = crypto.randomUUID();
      const result = await cancelUnpaidOrderAction({
        orderNumber,
        cancellationAttemptId: attemptId,
        reason: selectedReason,
      });

      if (result.success) {
        setOrderStatus("CANCELLED");
        setPaymentStatus("UNPAID");
        setIsModalOpen(false);
      } else {
        if (result.code === "PAYMENT_REVIEW_IN_PROGRESS") {
          setCancelError("El pago ya ha sido enviado y se encuentra en revisión.");
          setPaymentStatus("SUBMITTED");
        } else if (result.code === "ALREADY_CANCELLED") {
          setOrderStatus("CANCELLED");
          setIsModalOpen(false);
        } else {
          setCancelError(result.error || "No se pudo cancelar el pedido.");
        }
      }
    } catch {
      setCancelError("Ocurrió un error inesperado al cancelar el pedido.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <motion.div
      className={styles.container}
      data-testid="checkout-confirmation-view"
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
    >
      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={`${styles.card} ${styles.hero}`} aria-live="polite">
            {isCancelled ? (
              <>
                <motion.span
                  className={styles.cancelMark}
                  variants={RISE_VARIANTS}
                  custom={STEP.mark}
                >
                  <Icon icon={XCircle} size="xl" aria-hidden="true" />
                </motion.span>
                <motion.h1 className={styles.title} variants={RISE_VARIANTS} custom={STEP.title}>
                  Pedido Cancelado
                </motion.h1>
                <motion.div
                  className={`${styles.orderNumberBadge} ${styles.cancelledBadge}`}
                  data-testid="confirmation-order-number"
                  variants={RISE_VARIANTS}
                  custom={STEP.lead}
                >
                  <span>Pedido #{orderNumber}</span>
                </motion.div>
                <motion.p
                  className={styles.statusMessage}
                  data-testid="confirmation-cancelled-message"
                  variants={RISE_VARIANTS}
                  custom={STEP.lead}
                >
                  Este pedido ha sido cancelado. Si deseas adquirir estos productos, puedes realizar
                  una nueva orden desde el catálogo.
                </motion.p>
              </>
            ) : (
              <>
                <motion.span
                  className={styles.markSlot}
                  variants={RISE_VARIANTS}
                  custom={STEP.mark}
                >
                  <SuccessMark />
                </motion.span>
                <motion.h1 className={styles.title} variants={RISE_VARIANTS} custom={STEP.title}>
                  {hero.title}
                </motion.h1>
                <motion.div
                  className={styles.orderNumberBadge}
                  data-testid="confirmation-order-number"
                  variants={RISE_VARIANTS}
                  custom={STEP.lead}
                >
                  <span>Pedido #{orderNumber}</span>
                </motion.div>
                <motion.p
                  className={styles.statusMessage}
                  variants={RISE_VARIANTS}
                  custom={STEP.lead}
                >
                  {hero.lead} Enviamos la confirmación a <strong>{customerEmail}</strong>.
                </motion.p>
              </>
            )}
          </section>

          <PurchaseProgress current={paymentStatus === "UNPAID" ? 3 : 4} />
          {statusReadError && (
            <p role="status" className={styles.bodyText}>
              No se pudo actualizar el estado. Lo reintentaremos; también puedes recargar la página.
            </p>
          )}
          {paymentStatus === "UNPAID" && !isCancelled && (
            <ReservationNotice
              expiresAt={confirmation.reservationExpiresAt}
              serverNow={confirmation.serverNow}
            />
          )}
          <motion.div variants={RISE_VARIANTS} custom={STEP.payment}>
            {isCancelled ? (
              <div
                className={`${styles.card} ${styles.statusRow}`}
                data-testid="confirmation-payment-status-card"
              >
                <span
                  className={`${styles.statusPill} ${styles.statusCancelled}`}
                  data-testid="confirmation-payment-status"
                >
                  <Icon icon={XCircle} size="sm" aria-hidden="true" />
                  Estado: Cancelado
                </span>
                <p className={styles.bodyText}>
                  El pedido ha sido cancelado y los productos reservados han sido liberados.
                </p>
              </div>
            ) : paymentInstructions ? (
              <ManualPaymentCard
                key={paymentStatus}
                instructions={{ ...paymentInstructions, paymentStatus }}
                onStatusChange={setPaymentStatus}
              />
            ) : (
              <div
                className={`${styles.card} ${styles.statusRow}`}
                data-testid="confirmation-payment-status-card"
              >
                <span
                  className={`${styles.statusPill} ${styles.statusPending}`}
                  data-testid="confirmation-payment-status"
                >
                  <Icon icon={Clock} size="sm" aria-hidden="true" />
                  Estado de Pago: Pendiente de Pago
                </span>
                <p className={styles.bodyText}>
                  Tu pedido se encuentra registrado correctamente. El método seleccionado es{" "}
                  <strong>{paymentMethodName}</strong>. En breve recibirás la coordinación y
                  validación de tu comprobante a través de nuestros canales oficiales de Gamer Perú.
                </p>
              </div>
            )}
          </motion.div>

          <motion.section
            className={styles.card}
            aria-labelledby="order-timeline-title"
            variants={RISE_VARIANTS}
            custom={STEP.timeline}
          >
            <h2 id="order-timeline-title" className={styles.summaryTitle}>
              <Icon icon={ListChecks} size="sm" aria-hidden="true" />
              Seguimiento del pedido
            </h2>
            <OrderTimeline steps={timeline} trackingUrl={confirmation.progress.trackingUrl} />
          </motion.section>

          <motion.div className={styles.actions} variants={RISE_VARIANTS} custom={STEP.actions}>
            <DomeLink
              href="/categorias/mouses"
              tone="light"
              className={styles.ghostButton}
              data-testid="confirmation-continue-shopping"
            >
              Seguir explorando
            </DomeLink>
            <DomeLink
              href="/cuenta/pedidos"
              tone="light"
              className={styles.ghostButton}
              data-testid="confirmation-view-orders"
            >
              Ver mis pedidos
            </DomeLink>
          </motion.div>

          {isEligibleForCancellation && (
            <div className={styles.cancelRow} data-testid="confirmation-cancellation-section">
              <p className={styles.cancelPrompt}>¿Deseas anular esta compra antes de pagar?</p>
              <button
                type="button"
                className={styles.cancelOrderButton}
                onClick={handleOpenModal}
                data-testid="confirmation-cancel-order-button"
              >
                Cancelar Pedido
              </button>
            </div>
          )}
        </div>

        <aside className={styles.summaryColumn} aria-label="Resumen del pedido">
          <motion.section
            className={styles.card}
            data-testid="confirmation-summary-card"
            variants={RISE_VARIANTS}
            custom={STEP.summary}
          >
            <h2 className={styles.summaryTitle}>
              <Icon icon={Package} size="sm" aria-hidden="true" />
              Resumen de Productos
            </h2>

            <ul className={styles.itemsList}>
              {items.map((item, idx) => (
                <li
                  key={`${item.sku}-${idx}`}
                  className={styles.itemRow}
                  data-testid={`confirmation-item-${item.sku}`}
                >
                  <div className={styles.itemMain}>
                    <span className={styles.itemQty} aria-label={`Cantidad: ${item.quantity}`}>
                      {item.quantity}×
                    </span>
                    <div>
                      <div className={styles.itemName}>{item.productName}</div>
                      <div className={styles.itemSku}>SKU: {item.sku}</div>
                    </div>
                  </div>
                  <span className={styles.itemTotal}>{formatCurrency(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>

            <div className={styles.pricing}>
              <div className={styles.priceRow}>
                <span>Subtotal</span>
                <span>{formatCurrency(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className={styles.priceRow}>
                  <span>Descuento</span>
                  <span>−{formatCurrency(discountCents)}</span>
                </div>
              )}
              <div className={styles.priceRow}>
                <span>Envío</span>
                <span>{formatCurrency(shippingCents)}</span>
              </div>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>{totalLabel}</span>
                <span className={styles.totalValue} data-testid="confirmation-total-value">
                  {formatCurrency(totalCents)}
                </span>
              </div>
            </div>
          </motion.section>

          <motion.section
            className={styles.card}
            data-testid="confirmation-delivery-card"
            variants={RISE_VARIANTS}
            custom={STEP.delivery}
          >
            <h2 className={styles.summaryTitle}>
              <Icon icon={MapPin} size="sm" aria-hidden="true" />
              Datos de Entrega
            </h2>
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Destinatario</dt>
                <dd className={styles.infoValue}>{deliveryAddress.recipientName}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Teléfono</dt>
                <dd className={styles.infoValue}>{deliveryAddress.phone || customerPhone}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Dirección</dt>
                <dd className={styles.infoValue}>
                  {deliveryAddress.streetAddress}
                  {deliveryAddress.apartmentSuite ? `, ${deliveryAddress.apartmentSuite}` : ""}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Ubicación</dt>
                <dd className={styles.infoValue}>
                  {deliveryAddress.district}, {deliveryAddress.province},{" "}
                  {deliveryAddress.department}
                </dd>
              </div>
              {deliveryAddress.referenceNotes && (
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Referencia</dt>
                  <dd className={styles.infoValue}>{deliveryAddress.referenceNotes}</dd>
                </div>
              )}
              <div className={styles.infoDivider} aria-hidden="true" />
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Envío</dt>
                <dd className={styles.infoValue} data-testid="confirmation-shipping-method">
                  {shippingMethodName}
                </dd>
              </div>
            </dl>
          </motion.section>
        </aside>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className={styles.modalBackdrop}
            onClick={handleCloseModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={modalDescId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
              data-testid="cancel-order-modal"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <div className={styles.modalHead}>
                <Icon
                  icon={AlertTriangle}
                  size="md"
                  className={styles.modalIcon}
                  aria-hidden="true"
                />
                <h2 id={modalTitleId} className={styles.modalTitle}>
                  ¿Deseas cancelar tu pedido #{orderNumber}?
                </h2>
              </div>

              <p id={modalDescId} className={styles.modalDescription}>
                Al cancelar este pedido, los productos reservados serán liberados inmediatamente
                para otros compradores. Esta acción es definitiva.
              </p>

              <div>
                <label htmlFor={reasonSelectId} className={styles.modalLabel}>
                  Motivo de cancelación:
                </label>
                <select
                  id={reasonSelectId}
                  className={styles.modalSelect}
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  disabled={isCancelling}
                  data-testid="cancel-order-reason-select"
                >
                  <option value="Cambié de opinión">Cambié de opinión</option>
                  <option value="Deseo modificar los productos">
                    Deseo modificar los productos
                  </option>
                  <option value="Deseo cambiar el método de pago">
                    Deseo cambiar el método de pago
                  </option>
                  <option value="Otro motivo">Otro motivo</option>
                </select>
              </div>

              {cancelError && (
                <p className={styles.modalErrorText} data-testid="cancel-order-error">
                  {cancelError}
                </p>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalDismissButton}
                  onClick={handleCloseModal}
                  disabled={isCancelling}
                  data-testid="dismiss-cancel-order-button"
                >
                  Mantener pedido
                </button>
                <button
                  type="button"
                  className={styles.modalCancelConfirmButton}
                  onClick={handleConfirmCancel}
                  disabled={isCancelling}
                  data-testid="confirm-cancel-order-button"
                >
                  {isCancelling ? "Cancelando..." : "Sí, cancelar pedido"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
