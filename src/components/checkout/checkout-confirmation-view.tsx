"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Package } from "lucide-react";
import { Icon } from "@/components/ui";
import type { CheckoutConfirmationDTO } from "@/lib/checkout/types";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import { ManualPaymentCard } from "./manual-payment-card";
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

  return (
    <div className={styles.container} data-testid="checkout-confirmation-view">
      {/* Header Banner */}
      <div className={styles.successHeaderCard}>
        <Icon icon={CheckCircle2} size="xl" className={styles.successIcon} aria-hidden="true" />
        <h1 className={styles.title}>¡Pedido Registrado con Éxito!</h1>
        <div className={styles.orderNumberBadge} data-testid="confirmation-order-number">
          <span>Pedido #{orderNumber}</span>
        </div>
        <p className={styles.statusMessage}>
          Hemos registrado tu compra en nuestro sistema. Hemos enviado una confirmación a{" "}
          <strong>{customerEmail}</strong>.
        </p>
      </div>

      <div className={styles.grid}>
        {/* Dynamic Manual Payment Card (GP-019) or Fallback Next Steps Card */}
        {paymentInstructions ? (
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
    </div>
  );
}
