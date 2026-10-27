"use client";

import React, { useState, useId } from "react";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion, type Variants } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Headphones,
  MapPin,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { DomeLink, Icon } from "@/components/ui";
import { OrderTimeline } from "@/components/account/order-timeline";
import { buildOrderTimeline } from "@/lib/account/order-timeline";
import type { CheckoutConfirmationDTO } from "@/lib/checkout/types";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import { ManualPaymentCard } from "./manual-payment-card";
import { cancelUnpaidOrderAction } from "@/lib/orders/actions";
import styles from "./checkout-confirmation-view.module.css";
import { CopyPaymentValue } from "./copy-payment-value";
import { describeConfirmation } from "@/lib/checkout/confirmation-presentation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { buildWhatsAppHref } from "@/lib/support/whatsapp";
import { ReservationNotice } from "./reservation-notice";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
import { loadOrderProgressAction } from "@/lib/checkout/actions";

const EASE = [0.22, 1, 0.36, 1] as const;

/** A short entrance shared by the status, tracking and purchase details. */
const RISE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (step: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE, delay: Math.min(step * 0.035, 0.18) },
  }),
};

const STEP = {
  title: 1,
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

const ORDER_DATE = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});

function safeTrackingHref(value: string | null) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
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
    !isCancelled &&
      orderStatus !== "FULFILLED" &&
      !confirmation.progress.deliveredAt &&
      confirmation.progress.shipmentStatus !== "DELIVERED",
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
  const hero = describeConfirmation(orderStatus, paymentStatus, confirmation.progress);
  const supportHref =
    buildWhatsAppHref(`Hola, necesito ayuda con mi pedido ${orderNumber}.`) ?? "/contacto";
  const trackingHref = safeTrackingHref(confirmation.progress.trackingUrl);
  const timeline = buildOrderTimeline(confirmation.progress, orderStatus, paymentStatus);
  const totalLabel = isCancelled ? "Total" : hero.paid ? "Total pagado" : "Total a pagar";

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
    <m.div
      className={styles.container}
      data-testid="checkout-confirmation-view"
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
    >
      <div className={styles.pageHeading}>
        <a href="/cuenta/pedidos" className={styles.backLink}>
          <ArrowLeft size={16} aria-hidden="true" /> Mis pedidos
        </a>
        <span>Tu compra, paso a paso</span>
      </div>
      <section className={styles.hero} aria-live="polite" data-tone={hero.tone}>
        <div className={styles.heroContent}>
          <span className={styles.heroEyebrow}>GAMER PERÚ · TU PEDIDO</span>
          <m.h1 className={styles.title} variants={RISE_VARIANTS} custom={STEP.title}>
            {hero.title}
          </m.h1>
          <p
            className={styles.statusMessage}
            data-testid={isCancelled ? "confirmation-cancelled-message" : undefined}
          >
            {hero.lead}
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.orderNumberBadge} data-testid="confirmation-order-number">
              <span>Pedido #{orderNumber}</span>
              <CopyPaymentValue value={orderNumber} label="número de pedido" />
            </div>
            <time dateTime={confirmation.createdAt}>
              {ORDER_DATE.format(new Date(confirmation.createdAt))}
            </time>
          </div>
        </div>
        <div className={styles.heroStatus}>
          <span className={styles.heroIcon} aria-hidden="true">
            {hero.closed ? (
              <XCircle size={36} />
            ) : hero.delivered ? (
              <CheckCircle2 size={36} />
            ) : hero.shipped ? (
              <Truck size={36} />
            ) : hero.paid ? (
              <Package size={36} />
            ) : (
              <Clock size={36} />
            )}
          </span>
          <span className={styles.heroBadge}>{hero.label}</span>
          <span className={styles.heroTotal}>{formatCurrency(totalCents)}</span>
          <span className={styles.heroTotalLabel}>{totalLabel}</span>
        </div>
      </section>
      <div className={styles.layout}>
        <div className={styles.mainColumn} data-payment-needed={hero.needsPayment}>
          <m.section
            className={styles.card}
            aria-labelledby="order-journey-title"
            variants={RISE_VARIANTS}
            custom={STEP.timeline}
          >
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>ESTADO DE TU COMPRA</p>
                <h2 id="order-journey-title" className={styles.sectionTitle}>
                  Seguimiento del pedido
                </h2>
              </div>
              <span className={styles.liveNote}>
                {hero.closed || hero.delivered ? "Estado final" : "Se actualiza automáticamente"}
              </span>
            </div>
            {!hero.closed && (
              <ol className={styles.journey} aria-label="Progreso de entrega">
                {timeline
                  .filter((step) =>
                    ["payment", "preparing", "shipped", "delivered"].includes(step.key)
                  )
                  .map((step) => {
                    const state =
                      step.key === "payment" && !hero.paid && !hero.shipped
                        ? "current"
                        : step.state;
                    const current =
                      step.key === "payment" && !hero.paid && !hero.shipped
                        ? hero.review
                          ? "Pago en revisión"
                          : "Pago pendiente"
                        : step.label;
                    return (
                      <li
                        key={step.key}
                        data-state={state}
                        aria-current={state === "current" ? "step" : undefined}
                      >
                        <span className={styles.journeyMarker} aria-hidden="true">
                          {step.state === "done" ? (
                            <Check size={16} />
                          ) : step.key === "shipped" ? (
                            <Truck size={16} />
                          ) : step.key === "delivered" ? (
                            <MapPin size={16} />
                          ) : step.key === "payment" ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <Package size={16} />
                          )}
                        </span>
                        <strong>{current}</strong>
                        {step.at && (
                          <time dateTime={step.at}>{ORDER_DATE.format(new Date(step.at))}</time>
                        )}
                      </li>
                    );
                  })}
              </ol>
            )}
            {(Boolean(confirmation.progress.courierName) ||
              Boolean(confirmation.progress.trackingNumber)) && (
              <div className={styles.shippingStrip}>
                <Truck size={20} aria-hidden="true" />
                <div>
                  <strong>{confirmation.progress.courierName ?? "Información del envío"}</strong>
                  {confirmation.progress.trackingNumber && (
                    <span>Guía: {confirmation.progress.trackingNumber}</span>
                  )}
                </div>
                {trackingHref && (
                  <a href={trackingHref} target="_blank" rel="noopener noreferrer">
                    Rastrear envío <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
            <details className={styles.activity}>
              <summary>
                Ver historial del pedido <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className={styles.activityBody}>
                <OrderTimeline steps={timeline} trackingUrl={trackingHref} />
              </div>
            </details>
          </m.section>
          {statusReadError && (
            <p role="status" className={styles.bodyText}>
              No se pudo actualizar el estado. Lo reintentaremos; también puedes recargar la página.
            </p>
          )}
          {paymentStatus === "UNPAID" && hero.needsPayment && (
            <div className={styles.reservation}>
              <ReservationNotice
                expiresAt={confirmation.reservationExpiresAt}
                serverNow={confirmation.serverNow}
              />
            </div>
          )}
          <m.div className={styles.paymentSlot} variants={RISE_VARIANTS} custom={STEP.payment}>
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
                  Estado: {hero.label}
                </span>
                <p className={styles.bodyText}>{hero.lead}</p>
              </div>
            ) : !hero.needsPayment ? (
              <div
                className={`${styles.card} ${styles.paymentReceipt}`}
                data-testid="confirmation-payment-status-card"
              >
                <span className={styles.receiptIcon} aria-hidden="true">
                  {hero.paid ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                </span>
                <div>
                  <strong data-testid="confirmation-payment-status">
                    {hero.paid
                      ? "Pago confirmado"
                      : hero.review
                        ? "En revisión"
                        : "Información del pago"}
                  </strong>
                  <p className={styles.bodyText}>
                    {paymentMethodName} · {formatCurrency(totalCents)}
                    {hero.review
                      ? ". Tu comprobante está en revisión; no vuelvas a pagar."
                      : hero.paid
                        ? ". No tienes que realizar otro pago por este pedido."
                        : ". Si tienes alguna consulta sobre el pago, contacta al equipo con tu número de pedido."}
                  </p>
                </div>
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
                  Estado de Pago:{" "}
                  {paymentStatus === "REJECTED" ? "Pago rechazado" : "Pendiente de Pago"}
                </span>
                <p className={styles.bodyText}>
                  Tu pedido se encuentra registrado correctamente. El método seleccionado es{" "}
                  <strong>{paymentMethodName}</strong>. No pudimos cargar las instrucciones de pago.
                  Recarga esta página o usa «Ayuda con mi pedido» para consultar al equipo.
                </p>
              </div>
            )}
          </m.div>

          <section className={`${styles.card} ${styles.helpCard}`}>
            <Headphones size={24} aria-hidden="true" />
            <div>
              <h2 className={styles.sectionTitle}>Estamos para ayudarte</h2>
              <p className={styles.bodyText}>
                ¿Una consulta sobre el envío o tus productos? Ten a mano tu número de pedido.
              </p>
            </div>
            <a
              href={supportHref}
              target={supportHref.startsWith("https:") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              Ayuda con mi pedido <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </section>
          <m.div className={styles.actions} variants={RISE_VARIANTS} custom={STEP.actions}>
            {confirmation.isGuestOrder && (
              <DomeLink href="/checkout/recuperar" tone="light" className={styles.ghostButton}>
                Recuperar acceso por correo
              </DomeLink>
            )}
            <DomeLink
              href="/productos"
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
          </m.div>

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
          <m.section
            className={styles.card}
            data-testid="confirmation-summary-card"
            variants={RISE_VARIANTS}
            custom={STEP.summary}
          >
            <h2 className={styles.summaryTitle}>
              <Icon icon={Package} size="sm" aria-hidden="true" />
              Tu compra
            </h2>

            <ul className={styles.itemsList}>
              {items.map((item, idx) => (
                <li
                  key={`${item.sku}-${idx}`}
                  className={styles.itemRow}
                  data-testid={`confirmation-item-${item.sku}`}
                >
                  <div className={styles.itemMain}>
                    <span className={styles.itemPhoto}>
                      {resolvePublicMediaUrl(item.imageObjectKey) ? (
                        <Image
                          src={resolvePublicMediaUrl(item.imageObjectKey)!}
                          alt=""
                          width={64}
                          height={64}
                        />
                      ) : (
                        <Package size={24} aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <div className={styles.itemName}>{item.productName}</div>
                      {item.variantTitle && (
                        <div className={styles.itemVariant}>{item.variantTitle}</div>
                      )}
                      <div className={styles.itemMeta}>
                        Cantidad {item.quantity} · {formatCurrency(item.unitPriceCents)} c/u
                      </div>
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
          </m.section>

          <m.section
            className={styles.card}
            data-testid="confirmation-delivery-card"
            variants={RISE_VARIANTS}
            custom={STEP.delivery}
          >
            <h2 className={styles.summaryTitle}>
              <Icon icon={MapPin} size="sm" aria-hidden="true" />
              Entrega y contacto
            </h2>
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Correo</dt>
                <dd className={styles.infoValue}>{customerEmail}</dd>
              </div>
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
          </m.section>
        </aside>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <m.div
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
            <m.div
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
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}
