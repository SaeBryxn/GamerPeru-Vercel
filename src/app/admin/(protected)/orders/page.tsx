import Link from "next/link";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getAdminOrderList } from "@/lib/admin/orders/reader";
import type { AdminOrderListRow } from "@/lib/admin/orders/types";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { formatCentsToPen } from "@/lib/admin/dashboard-format";
import { OrderFilters } from "./order-filters";
import { ORDER_STATUSES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from "./order-status-options";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface OrdersPageProps {
  searchParams?: Promise<SearchParams>;
}

const orderLabels = Object.fromEntries(ORDER_STATUSES) as Record<
  AdminOrderListRow["orderStatus"],
  string
>;
const paymentLabels = Object.fromEntries(PAYMENT_STATUSES) as Record<
  AdminOrderListRow["paymentStatus"],
  string
>;
const shipmentLabels = {
  ...Object.fromEntries(SHIPMENT_STATUSES),
  MULTIPLE: "Múltiples envíos",
} as Record<AdminOrderListRow["shipmentStatus"], string>;

const limaDateTime = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function value(params: SearchParams, name: string): string {
  const raw = params[name];
  return typeof raw === "string" ? raw : "";
}

function formatMoney(row: AdminOrderListRow): string {
  if (!Number.isSafeInteger(row.totalCents) || row.totalCents < 0) return "Importe no disponible";
  if (row.currency === "PEN") return formatCentsToPen(BigInt(row.totalCents));
  const cents = BigInt(row.totalCents);
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${row.currency} ${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function tone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (["CONFIRMED", "FULFILLED", "PAID", "DELIVERED"].includes(status)) return "success";
  if (["CANCELLED", "EXPIRED", "REJECTED"].includes(status)) return "danger";
  if (["PENDING", "UNPAID", "SUBMITTED"].includes(status)) return "warning";
  if (["PROCESSING", "VERIFYING", "SHIPPED", "MULTIPLE"].includes(status)) return "info";
  return "neutral";
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span className={styles.badge} data-tone={tone(status)}>
      {label}
    </span>
  );
}

function buildListHref(params: SearchParams, cursor?: string): string {
  const next = new URLSearchParams();
  for (const key of ["q", "orderStatus", "paymentStatus", "shipmentStatus", "from", "to"]) {
    const current = value(params, key);
    if (current) next.set(key, current);
  }
  next.set("pageSize", value(params, "pageSize") || "25");
  if (cursor) next.set("cursor", cursor);
  return `/admin/orders?${next.toString()}`;
}

function AppliedFilters({ params }: { params: SearchParams }) {
  const items: string[] = [];
  const search = value(params, "q");
  if (search) items.push(search.includes("@") ? "Búsqueda: email exacto" : `Búsqueda: ${search}`);
  for (const [key, labels, title] of [
    ["orderStatus", orderLabels, "Pedido"],
    ["paymentStatus", paymentLabels, "Pago"],
    ["shipmentStatus", shipmentLabels, "Envío"],
  ] as const) {
    const selected = value(params, key);
    if (selected) items.push(`${title}: ${labels[selected as keyof typeof labels]}`);
  }
  const from = value(params, "from");
  const to = value(params, "to");
  if (from && to) items.push(`Fechas Lima: ${from} a ${to}`);
  if (items.length === 0) return null;
  return (
    <section className={styles.appliedFilters} aria-label="Filtros aplicados">
      <strong>Filtros aplicados</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function StatePanel({
  kind,
  title,
  description,
  action,
  href,
}: {
  kind: "empty" | "warning";
  title: string;
  description?: string;
  action?: string;
  href?: string;
}) {
  const Icon = kind === "warning" ? AlertCircle : Inbox;
  return (
    <section className={styles.statePanel} role={kind === "warning" ? "alert" : "status"}>
      <Icon size={32} aria-hidden="true" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && href && (
        <Link href={href} className={styles.secondaryButton}>
          {action}
        </Link>
      )}
    </section>
  );
}

function OrderTable({ rows }: { rows: AdminOrderListRow[] }) {
  return (
    <div className={styles.tableScroll} data-testid="orders-desktop-list">
      <table className={styles.table}>
        <caption>Listado de pedidos</caption>
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Cliente</th>
            <th scope="col">Estado</th>
            <th scope="col">Pago</th>
            <th scope="col">Envío</th>
            <th scope="col">Total</th>
            <th scope="col">Artículos</th>
            <th scope="col">Método</th>
            <th scope="col">Creado</th>
            <th scope="col">Actividad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.orderNumber} data-testid={`order-row-${row.orderNumber}`}>
              <td className={styles.orderNumber}>
                <Link href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}>
                  {row.orderNumber}
                </Link>
              </td>
              <td>
                <span className={styles.customerEmail}>{row.customerEmailMasked}</span>
                <span className={styles.secondaryText}>
                  {row.accountLinkState === "LINKED" ? "Cuenta vinculada" : "Sin cuenta vinculada"}
                </span>
              </td>
              <td>
                <StatusBadge label={orderLabels[row.orderStatus]} status={row.orderStatus} />
              </td>
              <td>
                <StatusBadge label={paymentLabels[row.paymentStatus]} status={row.paymentStatus} />
              </td>
              <td>
                <StatusBadge
                  label={shipmentLabels[row.shipmentStatus]}
                  status={row.shipmentStatus}
                />
              </td>
              <td>
                <span className={styles.money}>{formatMoney(row)}</span>
                {row.integrityIssues.length > 0 && (
                  <span className={styles.integrityWarning}>Revisar datos</span>
                )}
              </td>
              <td className={styles.numeric}>{row.unitCount}</td>
              <td>{row.paymentMethod?.label ?? "Sin método registrado"}</td>
              <td className={styles.dateTime}>{limaDateTime.format(new Date(row.createdAt))}</td>
              <td className={styles.dateTime}>
                {limaDateTime.format(new Date(row.latestOperationalAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderCards({ rows }: { rows: AdminOrderListRow[] }) {
  return (
    <div className={styles.cardList} data-testid="orders-mobile-list">
      {rows.map((row) => (
        <article
          key={row.orderNumber}
          className={styles.orderCard}
          data-testid={`order-card-${row.orderNumber}`}
        >
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.orderNumber}>
                <Link href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}>
                  {row.orderNumber}
                </Link>
              </p>
              <p className={styles.customerEmail}>{row.customerEmailMasked}</p>
            </div>
            <StatusBadge label={orderLabels[row.orderStatus]} status={row.orderStatus} />
          </div>
          <dl className={styles.cardFacts}>
            <div>
              <dt>Pago</dt>
              <dd>
                <StatusBadge label={paymentLabels[row.paymentStatus]} status={row.paymentStatus} />
              </dd>
            </div>
            <div>
              <dt>Envío</dt>
              <dd>
                <StatusBadge
                  label={shipmentLabels[row.shipmentStatus]}
                  status={row.shipmentStatus}
                />
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className={styles.money}>{formatMoney(row)}</dd>
            </div>
            <div>
              <dt>Artículos</dt>
              <dd>{row.unitCount}</dd>
            </div>
            <div>
              <dt>Método</dt>
              <dd>{row.paymentMethod?.label ?? "Sin método registrado"}</dd>
            </div>
            <div>
              <dt>Creado</dt>
              <dd>{limaDateTime.format(new Date(row.createdAt))}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{limaDateTime.format(new Date(row.latestOperationalAt))}</dd>
            </div>
          </dl>
          {row.integrityIssues.length > 0 && (
            <p className={styles.integrityWarning}>Revisar datos del pedido</p>
          )}
        </article>
      ))}
    </div>
  );
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("orders:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const params = searchParams ? await searchParams : {};
  const result = await getAdminOrderList(params);
  const filterValues = {
    q: value(params, "q"),
    orderStatus: value(params, "orderStatus"),
    paymentStatus: value(params, "paymentStatus"),
    shipmentStatus: value(params, "shipmentStatus"),
    from: value(params, "from"),
    to: value(params, "to"),
  };
  const hasFilters = Object.values(filterValues).some(Boolean);
  const hasCursor = Boolean(value(params, "cursor"));
  const header = (
    <header className={styles.pageHeader}>
      <div>
        <h1>Pedidos</h1>
        <p>Consulta el estado y la actividad de los pedidos registrados.</p>
      </div>
    </header>
  );

  if (result.status !== "READY") {
    const panel =
      result.status === "INVALID_INPUT" ? (
        <StatePanel
          kind="warning"
          title="Los filtros o la paginación no son válidos."
          description="Revisa los criterios de búsqueda y vuelve a intentarlo."
          action="Restablecer filtros"
          href="/admin/orders"
        />
      ) : result.status === "SYSTEM_ERROR" ? (
        <StatePanel
          kind="warning"
          title="No pudimos cargar los pedidos."
          description="Intenta actualizar la página."
          action="Reintentar"
          href={buildListHref(params, value(params, "cursor") || undefined)}
        />
      ) : (
        <StatePanel kind="warning" title="Listado no disponible." />
      );
    return (
      <div className={styles.page}>
        {header}
        {panel}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}
      <OrderFilters values={filterValues} hasFilters={hasFilters} />
      <AppliedFilters params={params} />
      {result.rows.length === 0 ? (
        <StatePanel
          kind="empty"
          title={
            hasFilters || hasCursor
              ? "No encontramos pedidos con estos filtros."
              : "No hay pedidos registrados."
          }
          action={hasFilters || hasCursor ? "Limpiar filtros" : undefined}
          href={hasFilters || hasCursor ? "/admin/orders" : undefined}
        />
      ) : (
        <section className={styles.results} aria-label="Resultados de pedidos">
          <div className={styles.resultsHeader}>
            <h2>Pedidos registrados</h2>
            <p>Mostrando {result.rows.length} pedidos en esta página</p>
          </div>
          <OrderTable rows={result.rows} />
          <OrderCards rows={result.rows} />
        </section>
      )}
      {(result.nextCursor !== null || hasCursor) && (
        <nav className={styles.pagination} aria-label="Paginación de pedidos">
          <span>
            Mostrando hasta {params.pageSize === undefined ? "25" : value(params, "pageSize")}{" "}
            pedidos por página.
          </span>
          <div className={styles.paginationActions}>
            {hasCursor && (
              <Link href={buildListHref(params)} className={styles.secondaryButton}>
                <RotateCcw size={16} aria-hidden="true" />
                Volver al inicio
              </Link>
            )}
            {result.nextCursor && (
              <Link
                href={buildListHref(params, result.nextCursor)}
                className={styles.primaryButton}
              >
                Siguiente
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
