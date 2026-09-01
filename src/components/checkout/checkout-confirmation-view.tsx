"use client";

import React, { useState, useId } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Package, XCircle, AlertTriangle } from "lucide-react";
import { Icon } from "@/components/ui";
import type { CheckoutConfirmationDTO } from "@/lib/checkout/types";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import { ManualPaymentCard } from "./manual-payment-card";
import { cancelUnpaidOrderAction } from "@/lib/orders/actions";
import { generateUuidV7 } from "@/db/utils/uuid";
import styles from "./checkout-confirmation-view.module.css";

export interface CheckoutConfirmationViewProps {
  confirmation: CheckoutConfirmationDTO;
  paymentInstructions?: PaymentInstructionDTO | null;
}

export function CheckoutConfirmationView({
  confirmation,
  paymentInstructions,
}: CheckoutConfirmationViewProps): React.JSX.Element {
  const {
    orderNumber,
    subtotalCents,
    shippingCents,
    totalCents,
    customerEmail,
    customerPhone,
    shippingMethodName,
    paymentMethodName,
    deliveryAddress,
    items,
  } = confirmation;

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

  const isCancelled = orderStatus === "CANCELLED" || orderStatus === "REFUNDED";
  const isEligibleForCancellation =
    !isCancelled && orderStatus === "PENDING" && paymentStatus === "UNPAID";

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
    <div className={styles.container} data-testid="checkout-confirmation-view">
      {/* Header Banner */}
      <div className={styles.successHeaderCard}>
        {isCancelled ? (
          <>
            <Icon icon={XCircle} size="xl" className={styles.cancelledIcon} aria-hidden="true" />
            <h1 className={styles.title}>Pedido Cancelado</h1>
            <div
              className={`${styles.orderNumberBadge} ${styles.cancelledBadge}`}
              data-testid="confirmation-order-number"
            >
              <span>Pedido #{orderNumber}</span>
            </div>
            <p className={styles.statusMessage} data-testid="confirmation-cancelled-message">
              Este pedido ha sido cancelado. Si deseas adquirir estos productos, puedes realizar una
              nueva orden desde el catálogo.
            </p>
          </>
        ) : (
          <>
            <Icon icon={CheckCircle2} size="xl" className={styles.successIcon} aria-hidden="true" />
            <h1 className={styles.title}>¡Pedido Registrado con Éxito!</h1>
            <div className={styles.orderNumberBadge} data-testid="confirmation-order-number">
              <span>Pedido #{orderNumber}</span>
            </div>
            <p className={styles.statusMessage}>
              Hemos registrado tu compra en nuestro sistema. Hemos enviado una confirmación a{" "}
              <strong>{customerEmail}</strong>.
            </p>
          </>
        )}
      </div>

      <div className={styles.grid}>
        {/* Payment Card / Status Card (Hidden or disabled if cancelled) */}
        {isCancelled ? (
          <div className={styles.nextStepsCard} data-testid="confirmation-payment-status-card">
            <div className={styles.cancelledPaymentBadge} data-testid="confirmation-payment-status">
              <Icon icon={XCircle} size="sm" aria-hidden="true" />
              <span>Estado: Cancelado</span>
            </div>
            <p className={styles.nextStepsText}>
              El pedido ha sido cancelado y los productos reservados han sido liberados.
            </p>
          </div>
        ) : paymentInstructions ? (
          <ManualPaymentCard instructions={paymentInstructions} />
        ) : (
          <div className={styles.nextStepsCard} data-testid="confirmation-payment-status-card">
            <div className={styles.paymentBadge} data-testid="confirmation-payment-status">
              <Icon icon={Clock} size="sm" aria-hidden="true" />
              <span>Estado de Pago: Pendiente de Pago</span>
            </div>
            <p className={styles.nextStepsText}>
              Tu pedido se encuentra registrado correctamente. El método seleccionado es{" "}
              <strong>{paymentMethodName}</strong>. En breve recibirás la coordinación y validación
              de tu comprobante a través de nuestros canales oficiales de Gamer Perú.
            </p>
          </div>
        )}

        {/* 2-Column Details Grid */}
        <div className={styles.gridTwoCol}>
          {/* Delivery & Contact Card */}
          <div className={styles.card} data-testid="confirmation-delivery-card">
            <h2 className={styles.cardTitle}>
              <Icon icon={MapPin} size="sm" aria-hidden="true" style={{ marginRight: "6px" }} />
              Datos de Entrega
            </h2>
            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Destinatario:</span>
                <span>{deliveryAddress.recipientName}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Teléfono:</span>
                <span>{deliveryAddress.phone || customerPhone}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Dirección:</span>
                <span>
                  {deliveryAddress.streetAddress}
                  {deliveryAddress.apartmentSuite ? `, ${deliveryAddress.apartmentSuite}` : ""}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Ubicación:</span>
                <span>
                  {deliveryAddress.district}, {deliveryAddress.province},{" "}
                  {deliveryAddress.department}
                </span>
              </div>
              {deliveryAddress.referenceNotes && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Referencia:</span>
                  <span>{deliveryAddress.referenceNotes}</span>
                </div>
              )}
              <div
                className={styles.infoRow}
                style={{
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--color-border-primary)",
                }}
              >
                <span className={styles.infoLabel}>Método de Envío:</span>
                <span data-testid="confirmation-shipping-method">{shippingMethodName}</span>
              </div>
            </div>
          </div>

          {/* Purchased Items & Totals Card */}
          <div className={styles.card} data-testid="confirmation-summary-card">
            <h2 className={styles.cardTitle}>
              <Icon icon={Package} size="sm" aria-hidden="true" style={{ marginRight: "6px" }} />
              Resumen de Productos
            </h2>

            <div className={styles.itemsTable}>
              {items.map((item, idx) => (
                <div
                  key={`${item.sku}-${idx}`}
                  className={styles.itemRow}
                  data-testid={`confirmation-item-${item.sku}`}
                >
                  <div>
                    <div className={styles.itemName}>
                      {item.productName} × {item.quantity}
                    </div>
                    <div className={styles.itemSku}>SKU: {item.sku}</div>
                  </div>
                  <div className={styles.itemTotal}>{formatCurrency(item.lineTotalCents)}</div>
                </div>
              ))}
            </div>

            <div className={styles.pricingSection}>
              <div className={styles.infoRow}>
                <span>Subtotal</span>
                <span>{formatCurrency(subtotalCents)}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Envío</span>
                <span>{formatCurrency(shippingCents)}</span>
              </div>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total Pagado / Por Pagar</span>
                <span className={styles.totalValue} data-testid="confirmation-total-value">
                  {formatCurrency(totalCents)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Cancellation Trigger (Only when eligible) */}
        {isEligibleForCancellation && (
          <div
            className={styles.cancellationSection}
            data-testid="confirmation-cancellation-section"
          >
            <p className={styles.infoLabel}>¿Deseas anular esta compra antes de pagar?</p>
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

        {/* Navigation Action Buttons */}
        <div className={styles.actionButtons}>
          <Link
            href="/categorias/mouses"
            className={styles.primaryLinkButton}
            data-testid="confirmation-continue-shopping"
          >
            Seguir explorando catálogo
          </Link>
          <Link
            href="/cuenta/pedidos"
            className={styles.secondaryLinkButton}
            data-testid="confirmation-view-orders"
          >
            Ver mis pedidos
          </Link>
        </div>
      </div>

      {/* Accessible Cancellation Dialog Modal */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          aria-describedby={modalDescId}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            data-testid="cancel-order-modal"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon
                icon={AlertTriangle}
                size="md"
                style={{ color: "#faad14" }}
                aria-hidden="true"
              />
              <h2 id={modalTitleId} className={styles.modalTitle}>
                ¿Deseas cancelar tu pedido #{orderNumber}?
              </h2>
            </div>

            <p id={modalDescId} className={styles.modalDescription}>
              Al cancelar este pedido, los productos reservados serán liberados inmediatamente para
              otros compradores. Esta acción es definitiva.
            </p>

            <div>
              <label
                htmlFor="cancel-reason-select"
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "4px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Motivo de cancelación:
              </label>
              <select
                id="cancel-reason-select"
                className={styles.modalSelect}
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                disabled={isCancelling}
                data-testid="cancel-order-reason-select"
              >
                <option value="Cambié de opinión">Cambié de opinión</option>
                <option value="Deseo modificar los productos">Deseo modificar los productos</option>
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
          </div>
        </div>
      )}
    </div>
  );
}
