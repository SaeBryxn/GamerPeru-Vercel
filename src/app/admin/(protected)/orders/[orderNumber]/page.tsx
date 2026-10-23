import Link from "@/components/app-link";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { Stagger, StaggerItem } from "@/components/admin/ui";
import { getAdminOrderDetail, getAdminOrderItemPreviews } from "@/lib/admin/orders/reader";
import type { AdminOrderItemPreview } from "@/lib/admin/orders/types";
import { OrderThumbs } from "../order-thumbs";
import type { AdminOrderDetail, OrderIntegrityIssue } from "@/lib/admin/orders/types";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { ORDER_STATUSES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from "../order-status-options";
import { OrderActivity } from "./order-activity";
import { OrderCancellation } from "./order-cancellation";
import { OrderFulfillment } from "./order-fulfillment";
import { formatLimaDateTime, formatStoredAmount } from "./order-detail-format";
import styles from "./order-detail.module.css";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

const orderLabels = Object.fromEntries(ORDER_STATUSES) as Record<
  AdminOrderDetail["order"]["status"],
  string
>;
const paymentLabels = Object.fromEntries(PAYMENT_STATUSES) as Record<
  NonNullable<AdminOrderDetail["payment"]>["status"],
  string
>;
const shipmentLabels = Object.fromEntries(SHIPMENT_STATUSES) as Record<
  AdminOrderDetail["shipments"][number]["status"],
  string
>;

const integrityLabels: Record<OrderIntegrityIssue, string> = {
  MISSING_PAYMENT: "No existe un registro de pago para este pedido.",
  MISSING_ADDRESS_SNAPSHOT: "Falta la dirección guardada al comprar.",
  MISSING_PRICING_SNAPSHOT: "Falta el resumen de importes guardado al comprar.",
  MULTIPLE_SHIPMENTS: "El pedido tiene múltiples envíos; revísalos por separado.",
  CURRENCY_MISMATCH: "Las monedas registradas no coinciden.",
  UNSUPPORTED_CURRENCY: "La moneda registrada no admite acciones monetarias aquí.",
};

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (["CONFIRMED", "FULFILLED", "PAID", "DELIVERED"].includes(status)) return "success";
  if (["CANCELLED", "EXPIRED", "REJECTED"].includes(status)) return "danger";
  if (["PENDING", "UNPAID", "SUBMITTED"].includes(status)) return "warning";
  if (["PROCESSING", "VERIFYING", "SHIPPED"].includes(status)) return "info";
  return "neutral";
}

function Status({ value, label }: { value: string; label: string }) {
  return (
    <span className={styles.status} data-tone={statusTone(value)}>
      {label}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <StaggerItem>
      <section className={styles.section} aria-label={title} id={id}>
        <h2>{title}</h2>
        {children}
      </section>
    </StaggerItem>
  );
}

function Unavailable() {
  return <p className={styles.unavailable}>Datos de pedido no disponibles</p>;
}

function DetailBody({
  detail,
  itemPreviews,
}: {
  detail: AdminOrderDetail;
  itemPreviews: AdminOrderItemPreview[];
}) {
  const { order, contact, items, address, pricing, payment, refunds, shipments } = detail;
  const moneyConflict = detail.integrityIssues.some(
    (issue) => issue === "CURRENCY_MISMATCH" || issue === "UNSUPPORTED_CURRENCY"
  );

  return (
    <Stagger className={styles.page}>
      <StaggerItem className={styles.pageHeading}>
        <Link href="/admin/orders" className={styles.backLink}>
          Volver a pedidos
        </Link>
        <div className={styles.titleRow}>
          <div>
            <h1>Pedido {order.orderNumber}</h1>
            <p>Datos registrados al momento de la compra y actividad operativa.</p>
          </div>
          <Status value={order.status} label={orderLabels[order.status]} />
        </div>
      </StaggerItem>

      {detail.integrityIssues.length > 0 && (
        <StaggerItem>
          <section
            className={styles.integrityAlert}
            role="alert"
            aria-label="Advertencias del pedido"
          >
            <strong>Este pedido requiere revisión de datos</strong>
            <ul>
              {detail.integrityIssues.map((issue) => (
                <li key={issue}>{integrityLabels[issue]}</li>
              ))}
            </ul>
          </section>
        </StaggerItem>
      )}

      <StaggerItem>
        <OrderFulfillment key={`fulfillment:${order.orderNumber}`} detail={detail} />
      </StaggerItem>

      <div className={styles.contentGrid}>
        <Stagger className={styles.mainColumn}>
          <Section title="Resumen del pedido">
            <dl className={styles.factGrid}>
              <Fact label="Número">{order.orderNumber}</Fact>
              <Fact label="Estado">
                <Status value={order.status} label={orderLabels[order.status]} />
              </Fact>
              <Fact label="Creado">{formatLimaDateTime(order.createdAt)}</Fact>
              <Fact label="Actualizado">{formatLimaDateTime(order.updatedAt)}</Fact>
              <Fact label="Cuenta">
                {contact.accountLinkState === "LINKED"
                  ? "Cuenta vinculada"
                  : "Sin cuenta vinculada"}
              </Fact>
              {order.cancelledAt && (
                <Fact label="Cancelado">{formatLimaDateTime(order.cancelledAt)}</Fact>
              )}
              {order.cancelReason && <Fact label="Razón de cancelación">{order.cancelReason}</Fact>}
            </dl>
          </Section>

          <Section title="Productos comprados">
            {items.length === 0 ? (
              <Unavailable />
            ) : (
              <>
                <p className={styles.tableHint}>Desliza la tabla para ver precios y cantidades.</p>
                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Productos comprados, desplazamiento horizontal"
                  tabIndex={0}
                >
                  <table className={styles.itemsTable}>
                    <caption>Productos guardados en este pedido</caption>
                    <thead>
                      <tr>
                        <th scope="col">Producto</th>
                        <th scope="col">SKU</th>
                        <th scope="col">Precio unitario</th>
                        <th scope="col">Cantidad</th>
                        <th scope="col">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={item.id}>
                          <td>
                            <span className={styles.itemProduct}>
                              <OrderThumbs
                                items={itemPreviews[index] ? [itemPreviews[index]] : []}
                                lineCount={1}
                              />
                              <span>
                                <strong>{item.productName}</strong>
                                <span className={styles.muted}>{item.variantTitle}</span>
                              </span>
                            </span>
                          </td>
                          <td>{item.sku}</td>
                          <td>
                            {moneyConflict
                              ? "Datos de pedido no disponibles"
                              : formatStoredAmount(item.unitPriceCents, order.currency)}
                          </td>
                          <td>{item.quantity}</td>
                          <td>
                            {moneyConflict
                              ? "Datos de pedido no disponibles"
                              : formatStoredAmount(item.lineTotalCents, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>

          <Section title="Entrega">
            {address ? (
              <dl className={styles.factGrid}>
                <Fact label="Destinatario">{address.recipientName}</Fact>
                <Fact label="Teléfono">{address.phone}</Fact>
                <Fact label="Dirección">{address.streetAddress}</Fact>
                {address.apartmentSuite && <Fact label="Interior">{address.apartmentSuite}</Fact>}
                <Fact label="Ubicación">
                  {address.district}, {address.province}, {address.department}
                </Fact>
                {address.postalCode && <Fact label="Código postal">{address.postalCode}</Fact>}
                {address.referenceNotes && <Fact label="Referencia">{address.referenceNotes}</Fact>}
              </dl>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Envíos">
            {shipments.length === 0 ? (
              <p className={styles.muted}>Sin envío registrado.</p>
            ) : (
              <div className={styles.recordList}>
                {shipments.map((shipment, index) => (
                  <article className={styles.record} key={shipment.id}>
                    <div className={styles.recordHeading}>
                      <h3>Envío {index + 1}</h3>
                      <Status value={shipment.status} label={shipmentLabels[shipment.status]} />
                    </div>
                    <dl className={styles.factGrid}>
                      <Fact label="Transportista">{shipment.courierName ?? "No registrado"}</Fact>
                      <Fact label="Número de seguimiento">
                        {shipment.trackingNumber ?? "No registrado"}
                      </Fact>
                      {shipment.shippedAt && (
                        <Fact label="Despachado">{formatLimaDateTime(shipment.shippedAt)}</Fact>
                      )}
                      {shipment.deliveredAt && (
                        <Fact label="Entregado">{formatLimaDateTime(shipment.deliveredAt)}</Fact>
                      )}
                    </dl>
                    {shipment.trackingUrl && (
                      <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Abrir seguimiento del envío {index + 1}
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Section>
        </Stagger>

        <Stagger className={styles.sideColumn}>
          <Section title="Contacto de compra">
            <dl className={styles.factGrid}>
              <Fact label="Correo electrónico">{contact.customerEmail}</Fact>
              <Fact label="Teléfono">{contact.customerPhone}</Fact>
              {order.customerNote && (
                <Fact label="Nota de compra">
                  <span className={styles.multiline}>{order.customerNote}</span>
                </Fact>
              )}
            </dl>
          </Section>

          <Section title="Importes">
            {pricing && !moneyConflict ? (
              <dl className={styles.factGrid}>
                <Fact label="Subtotal">
                  {formatStoredAmount(pricing.subtotalCents, pricing.currency)}
                </Fact>
                <Fact label="Descuento">
                  {formatStoredAmount(pricing.discountCents, pricing.currency)}
                </Fact>
                <Fact label="Envío">
                  {formatStoredAmount(pricing.shippingCents, pricing.currency)}
                </Fact>
                <Fact label="Total">
                  <strong>{formatStoredAmount(pricing.totalCents, pricing.currency)}</strong>
                </Fact>
                <Fact label="Moneda">{pricing.currency}</Fact>
              </dl>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Pago">
            {payment ? (
              <dl className={styles.factGrid}>
                <Fact label="Método">{payment.methodLabel}</Fact>
                <Fact label="Estado">
                  <Status value={payment.status} label={paymentLabels[payment.status]} />
                </Fact>
                {moneyConflict ? (
                  <Fact label="Importes">
                    <Unavailable />
                  </Fact>
                ) : (
                  <>
                    <Fact label="Importe">
                      {formatStoredAmount(payment.amountCents, payment.currency)}
                    </Fact>
                    <Fact label="Reembolsado">
                      {formatStoredAmount(payment.refundedAmountCents, payment.currency)}
                    </Fact>
                  </>
                )}
                <Fact label="Moneda">{payment.currency}</Fact>
                <Fact label="Registrado">{formatLimaDateTime(payment.createdAt)}</Fact>
                <Fact label="Actividad">{formatLimaDateTime(payment.updatedAt)}</Fact>
              </dl>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Reembolsos">
            {refunds.length === 0 ? (
              <p className={styles.muted}>Sin reembolsos registrados.</p>
            ) : (
              <div className={styles.recordList}>
                {refunds.map((refund) => (
                  <article className={styles.record} key={refund.id}>
                    <dl className={styles.factGrid}>
                      <Fact label="Importe">
                        {moneyConflict
                          ? "Datos de pedido no disponibles"
                          : formatStoredAmount(refund.amountCents, order.currency)}
                      </Fact>
                      <Fact label="Razón">{refund.reason}</Fact>
                      <Fact label="Registrado">{formatLimaDateTime(refund.createdAt)}</Fact>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </Stagger>
      </div>

      <StaggerItem>
        <OrderActivity
          key={`activity:${order.orderNumber}`}
          orderNumber={order.orderNumber}
          initialNotes={detail.notes}
          initialTimeline={detail.timeline}
        />
      </StaggerItem>
      {/* The native dialog opens in the top layer, so this wrapper never offsets it. */}
      <StaggerItem>
        <OrderCancellation key={`cancellation:${order.orderNumber}`} detail={detail} />
      </StaggerItem>
    </Stagger>
  );
}

export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const auth = await getVerifiedAuthContext();
  if (auth.status !== "READY" || !auth.permissions.has("orders:manage")) {
    return <AdminForbidden email={auth.status === "READY" ? auth.email : undefined} />;
  }

  const { orderNumber } = await params;
  const result = await getAdminOrderDetail(orderNumber);
  if (result.status !== "READY") {
    return (
      <div className={styles.page}>
        <Link href="/admin/orders" className={styles.backLink}>
          Volver a pedidos
        </Link>
        <section className={styles.statePanel} role="alert">
          <h1>
            {result.status === "SYSTEM_ERROR"
              ? "No pudimos cargar el pedido"
              : "Pedido no disponible"}
          </h1>
          <p>
            {result.status === "SYSTEM_ERROR"
              ? "Intenta actualizar la página."
              : "Revisa el número de pedido o vuelve al listado."}
          </p>
          {result.status === "SYSTEM_ERROR" && (
            <a href={`/admin/orders/${encodeURIComponent(orderNumber)}`}>Reintentar</a>
          )}
        </section>
      </div>
    );
  }

  const itemPreviews = (await getAdminOrderItemPreviews(orderNumber)) ?? [];
  return <DetailBody detail={result.detail} itemPreviews={itemPreviews} />;
}
