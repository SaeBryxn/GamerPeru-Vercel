"use client";

import React, { useState, useId } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { AlertTriangle, Clock, MapPin, Package, XCircle } from "lucide-react";
import { DomeLink, Icon } from "@/components/ui";
import type { CheckoutConfirmationDTO } from "@/lib/checkout/types";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import { ManualPaymentCard } from "./manual-payment-card";
import { cancelUnpaidOrderAction } from "@/lib/orders/actions";
import { generateUuidV7 } from "@/db/utils/uuid";
import styles from "./checkout-confirmation-view.module.css";

const EASE = [0.22, 1, 0.36, 1] as const;

const PAGE_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const COLUMN_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
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
 * Heading for the order's payment state. A submitted receipt is not a confirmed payment: until
 * the team verifies it, the page says it was received, never that it was paid.
 */
function heroCopy(paymentStatus: string): { title: string; lead: string } {
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
  confirmation,
  paymentInstructions,
}: CheckoutConfirmationViewProps): React.JSX.Element {
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

  const isCancelled = orderStatus === "CANCELLED" || orderStatus === "REFUNDED";
  const isEligibleForCancellation =
    !isCancelled && orderStatus === "PENDING" && paymentStatus === "UNPAID";
  const hero = heroCopy(paymentStatus);
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
      const attemptId = generateUuidV7();
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
      variants={PAGE_VARIANTS}
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
    >
      <div className={styles.layout}>
        <motion.div className={styles.mainColumn} variants={COLUMN_VARIANTS}>
          <section className={`${styles.card} ${styles.hero}`} aria-live="polite">
            {isCancelled ? (
              <>
                <span className={styles.cancelMark}>
                  <Icon icon={XCircle} size="xl" aria-hidden="true" />
                </span>
                <h1 className={styles.title}>Pedido Cancelado</h1>
                <div
                  className={`${styles.orderNumberBadge} ${styles.cancelledBadge}`}
                  data-testid="confirmation-order-number"
                >
                  <span>Pedido #{orderNumber}</span>
                </div>
                <p className={styles.statusMessage} data-testid="confirmation-cancelled-message">
                  Este pedido ha sido cancelado. Si deseas adquirir estos productos, puedes realizar
                  una nueva orden desde el catálogo.
                </p>
              </>
            ) : (
              <>
                <SuccessMark />
                <h1 className={styles.title}>{hero.title}</h1>
                <div className={styles.orderNumberBadge} data-testid="confirmation-order-number">
                  <span>Pedido #{orderNumber}</span>
                </div>
                <p className={styles.statusMessage}>
                  {hero.lead} Enviamos la confirmación a <strong>{customerEmail}</strong>.
                </p>
              </>
            )}
          </section>

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
              instructions={paymentInstructions}
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

          <div className={styles.actions}>
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
          </div>

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
        </motion.div>

        <motion.aside
          className={styles.summaryColumn}
          variants={COLUMN_VARIANTS}
          aria-label="Resumen del pedido"
        >
          <section className={styles.card} data-testid="confirmation-summary-card">
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
          </section>

          <section className={styles.card} data-testid="confirmation-delivery-card">
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
          </section>
        </motion.aside>
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
