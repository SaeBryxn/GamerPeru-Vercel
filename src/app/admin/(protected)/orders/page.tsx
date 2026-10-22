import Link from "next/link";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { SegmentedNav } from "@/components/admin/ui";
import { getAdminOrderList } from "@/lib/admin/orders/reader";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { OrderFilters } from "./order-filters";
import { orderLabels, paymentLabels, shipmentLabels } from "./order-list-format";
import { OrderCards, OrderTable } from "./order-results";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface OrdersPageProps {
  searchParams?: Promise<SearchParams>;
}

function value(params: SearchParams, name: string): string {
  const raw = params[name];
  return typeof raw === "string" ? raw : "";
}

function buildListHref(params: SearchParams, cursor?: string): string {
  const next = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const current = value(params, key);
    if (current) next.set(key, current);
  }
  next.set("pageSize", value(params, "pageSize") || "25");
  if (cursor) next.set("cursor", cursor);
  return `/admin/orders?${next.toString()}`;
}

const FILTER_KEYS = ["q", "orderStatus", "paymentStatus", "shipmentStatus", "from", "to"] as const;

// Shortcuts built only from filters the list already accepts.
const QUICK_FILTERS: {
  label: string;
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string>>;
}[] = [
  { label: "Todos", filters: {} },
  { label: "Por validar pago", filters: { paymentStatus: "SUBMITTED" } },
  {
    label: "Listos para preparar",
    filters: { orderStatus: "CONFIRMED", shipmentStatus: "UNFULFILLED" },
  },
  { label: "Completados", filters: { orderStatus: "FULFILLED" } },
];

function QuickFilters({ params }: { params: SearchParams }) {
  return (
    <SegmentedNav
      label="Filtros rápidos de pedidos"
      options={QUICK_FILTERS.map(({ label, filters }) => {
        const query = new URLSearchParams(filters);
        return {
          label,
          href: query.size > 0 ? `/admin/orders?${query.toString()}` : "/admin/orders",
          active: FILTER_KEYS.every((key) => (filters[key] ?? "") === value(params, key)),
        };
      })}
    />
  );
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
  // Receipt images are only signed for staff who verify payments.
  const canVerify = authContext.permissions.has("orders:verify");
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
      <QuickFilters params={params} />
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
          <OrderTable rows={result.rows} canVerify={canVerify} />
          <OrderCards rows={result.rows} canVerify={canVerify} />
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
