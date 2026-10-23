import React from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  History,
  ListFilter,
  Package,
  PackageSearch,
  Search,
  TriangleAlert,
  Warehouse,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/admin/ui/admin-ui";
import { getAdminInventoryPage, inventoryQuerySchema } from "@/lib/admin/inventory/page-reader";
import { InventoryCountForm } from "./stock-count";
import { formatDelta, formatUnits, stockStatus } from "./inventory-display";
import styles from "./inventory.module.css";

export const dynamic = "force-dynamic";
const MOVEMENTS: Record<string, string> = {
  RECEIVING: "Recepción",
  MANUAL_ADJUSTMENT: "Conteo o ajuste manual",
  RESERVATION_CREATED: "Reserva de pedido",
  RESERVATION_EXPIRED: "Reserva vencida",
  RESERVATION_RELEASED: "Reserva liberada",
  ALLOCATION_CONFIRMED: "Asignación a pedido pagado",
  ALLOCATION_RELEASED: "Asignación liberada",
  FULFILLMENT_DISPATCHED: "Despacho",
  RETURN_RESTOCKED: "Devolución al almacén",
};
const STOCK_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "low", label: "Stock bajo" },
  { value: "out", label: "Sin disponibilidad" },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = inventoryQuerySchema.safeParse({
    q: typeof params.q === "string" ? params.q : undefined,
    stock: typeof params.stock === "string" ? params.stock : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
    variant: typeof params.variant === "string" ? params.variant : undefined,
  });
  if (!parsed.success)
    return (
      <div className={styles.empty}>
        <ListFilter size={28} aria-hidden="true" />
        <h1>Revisa los filtros de inventario</h1>
        <p>La búsqueda o el número de página no son válidos.</p>
        <Link className={styles.secondaryButton} href="/admin/inventario">
          Restablecer filtros
        </Link>
      </div>
    );
  const result = await getAdminInventoryPage(parsed.data);
  if (!result.configured)
    return (
      <div className={styles.empty}>
        <Warehouse size={28} aria-hidden="true" />
        <h1>Configura tu almacén principal</h1>
        <p>
          El almacén principal aún no está configurado. Revisa la configuración de inventario del
          servidor.
        </p>
      </div>
    );
  const movementsView =
    params.vista === "movimientos" || (params.vista !== "existencias" && !!result.query.variant);
  const href = (changes: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams({
      q: result.query.q,
      stock: result.query.stock,
      page: String(result.query.page),
      ...(result.query.variant ? { variant: result.query.variant } : {}),
      vista: movementsView ? "movimientos" : "existencias",
    });
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === "") query.delete(key);
      else query.set(key, value);
    }
    return `/admin/inventario?${query}`;
  };
  const hasFilters = !!result.query.q || result.query.stock !== "all";
  const counts = { available: 0, low: 0, out: 0, review: 0 };
  for (const row of result.rows) {
    const status = stockStatus(row.available, row.reorder_point);
    if (status.key !== "unknown") counts[status.key]++;
  }
  const start = (result.query.page - 1) * 50 + 1;
  const end = start + result.rows.length - 1;
  const scope = result.query.variant ? result.movements[0]?.sku : undefined;
  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>OPERACIONES</span>
          <h1>Inventario</h1>
          <p>Todo el stock, claro y bajo control.</p>
        </div>
        <div className={styles.location}>
          <Warehouse size={18} aria-hidden="true" />
          <div>
            <span>Almacén principal</span>
            <strong>{result.location}</strong>
          </div>
        </div>
      </header>
      {!movementsView && result.rows.length > 0 && (
        <section className={styles.overview} aria-label="Resumen de esta página">
          <div className={styles.overviewHeading}>
            <h2>Un vistazo a esta página</h2>
            <span>{formatUnits(result.rows.length)} variantes · Según tus filtros</span>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>
                <span className={styles.statusDot} data-tone="success" />
                Stock suficiente
              </dt>
              <dd>{formatUnits(counts.available)}</dd>
              <span>Por encima de reposición</span>
            </div>
            <div>
              <dt>
                <span className={styles.statusDot} data-tone="warning" />
                Stock bajo
              </dt>
              <dd>{formatUnits(counts.low)}</dd>
              <span>Requieren reposición</span>
            </div>
            <div>
              <dt>
                <span className={styles.statusDot} data-tone="danger" />
                Agotadas
              </dt>
              <dd>{formatUnits(counts.out)}</dd>
              <span>Sin unidades disponibles</span>
            </div>
            <div>
              <dt>
                <span
                  className={styles.statusDot}
                  data-tone={counts.review ? "danger" : "neutral"}
                />
                Por revisar
              </dt>
              <dd>{formatUnits(counts.review)}</dd>
              <span>Disponible negativo</span>
            </div>
          </dl>
        </section>
      )}
      {!movementsView && counts.review > 0 && (
        <div className={styles.attention} role="note">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <strong>
              {counts.review === 1
                ? "Hay una variante con disponible negativo"
                : `Hay ${counts.review} variantes con disponible negativo`}
            </strong>
            <p>
              Las unidades comprometidas superan el stock físico. Revisa sus movimientos antes de
              registrar un conteo.
            </p>
          </div>
        </div>
      )}
      <section className={styles.card} aria-label="Control de inventario">
        <div className={styles.toolbar}>
          <nav className={styles.viewTabs} aria-label="Vistas de inventario">
            <Link
              href={href({ vista: "existencias", variant: undefined })}
              aria-current={!movementsView ? "page" : undefined}
            >
              <Package size={16} aria-hidden="true" />
              Existencias
            </Link>
            <Link
              href={href({ vista: "movimientos" })}
              aria-current={movementsView ? "page" : undefined}
            >
              <History size={16} aria-hidden="true" />
              Movimientos
            </Link>
          </nav>
          <span className={styles.caption}>
            {movementsView ? "Trazabilidad del stock" : "Solo variantes activas"}
          </span>
        </div>
        {movementsView ? (
          <>
            <div className={styles.resultsHeader} id="movimientos">
              <div>
                <h2>
                  {result.query.variant ? "Movimientos de la variante" : "Movimientos del almacén"}
                </h2>
                <p>Hasta los 50 más recientes · Del más nuevo al más antiguo</p>
              </div>
              {result.query.variant && (
                <Link className={styles.secondaryButton} href={href({ variant: undefined })}>
                  Ver todo el almacén
                </Link>
              )}
            </div>
            {result.query.variant && (
              <div className={styles.appliedFilters}>
                <span className={styles.filterChip}>Variante: {scope ?? result.query.variant}</span>
                <span>Este historial corresponde únicamente a la variante seleccionada.</span>
              </div>
            )}
            {result.movements.length ? (
              <div
                className={styles.scroll}
                role="region"
                aria-label="Historial de movimientos"
                tabIndex={0}
              >
                <table className={`${styles.table} ${styles.movementsTable}`}>
                  <caption className={styles.srOnly}>
                    Últimos movimientos de inventario. Las cantidades indican cambios de unidades.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha y SKU</th>
                      <th scope="col">Movimiento</th>
                      <th scope="col" className={styles.numeric}>
                        Físico
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Reservado
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Asignado
                      </th>
                      <th scope="col">Motivo y autor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.movements.map((movement) => (
                      <tr key={movement.id}>
                        <th scope="row">
                          <time dateTime={new Date(movement.created_at).toISOString()}>
                            {new Date(movement.created_at).toLocaleDateString("es-PE", {
                              timeZone: "America/Lima",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            <span className={styles.subtext}>
                              {new Date(movement.created_at).toLocaleTimeString("es-PE", {
                                timeZone: "America/Lima",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              · {movement.sku}
                            </span>
                          </time>
                        </th>
                        <td data-label="Movimiento">
                          <span className={styles.movementType}>
                            <span className={styles.movementIcon}>
                              {movement.on_hand_delta > 0 ? (
                                <ArrowDownLeft size={16} aria-hidden="true" />
                              ) : movement.on_hand_delta < 0 ? (
                                <ArrowUpRight size={16} aria-hidden="true" />
                              ) : (
                                <History size={16} aria-hidden="true" />
                              )}
                            </span>
                            {MOVEMENTS[movement.movement_type] ?? movement.movement_type}
                          </span>
                        </td>
                        <td data-label="Cambio físico" className={styles.numeric}>
                          {formatDelta(movement.on_hand_delta)}
                        </td>
                        <td data-label="Cambio reservado" className={styles.numeric}>
                          {formatDelta(movement.reserved_delta)}
                        </td>
                        <td data-label="Cambio asignado" className={styles.numeric}>
                          {formatDelta(movement.allocated_delta)}
                        </td>
                        <td data-label="Motivo y autor">
                          <div className={styles.movementDetail}>
                            <p>
                              {movement.notes?.trim() ? movement.notes : "Sin motivo registrado"}
                            </p>
                            <details>
                              <summary>Ver autor</summary>
                              <span className={styles.subtext}>
                                ID del autor: {movement.actor_id}
                              </span>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <History size={30} aria-hidden="true" />
                <h3>Aún no hay movimientos</h3>
                <p>
                  Los conteos y los cambios de los pedidos aparecerán aquí, con su motivo y autor.
                </p>
              </div>
            )}
            <footer className={styles.footer}>
              <span>
                {formatUnits(result.movements.length)}{" "}
                {result.movements.length === 1 ? "movimiento mostrado" : "movimientos mostrados"} ·
                Máximo 50
              </span>
              <span>+ Entrada · − Salida · 0 Sin cambio</span>
            </footer>
          </>
        ) : (
          <>
            <div className={styles.filterArea}>
              <nav className={styles.stockFilters} aria-label="Filtrar por disponibilidad">
                {STOCK_FILTERS.map((filter) => (
                  <Link
                    key={filter.value}
                    href={href({ stock: filter.value, page: "1", variant: undefined })}
                    aria-current={result.query.stock === filter.value ? "page" : undefined}
                  >
                    {filter.label}
                  </Link>
                ))}
              </nav>
              <form method="get" className={styles.filters} action="/admin/inventario">
                <input type="hidden" name="vista" value="existencias" />
                <input type="hidden" name="stock" value={result.query.stock} />
                <div className={styles.searchField}>
                  <label className={styles.srOnly} htmlFor="inventory-search">
                    Buscar producto o SKU
                  </label>
                  <Search size={17} aria-hidden="true" />
                  <input
                    key={result.query.q}
                    id="inventory-search"
                    className={styles.input}
                    name="q"
                    defaultValue={result.query.q}
                    placeholder="Buscar producto, variante o SKU"
                    maxLength={100}
                    type="search"
                  />
                </div>
                <button className={styles.secondaryButton} type="submit">
                  Buscar
                </button>
              </form>
            </div>
            {hasFilters && (
              <div className={styles.appliedFilters} aria-label="Filtros aplicados">
                {result.query.q && (
                  <Link
                    className={styles.filterChip}
                    href={href({ q: undefined, page: "1" })}
                    aria-label={`Quitar búsqueda: ${result.query.q}`}
                  >
                    Búsqueda: {result.query.q}
                    <X size={13} aria-hidden="true" />
                  </Link>
                )}
                {result.query.stock !== "all" && (
                  <Link
                    className={styles.filterChip}
                    href={href({ stock: "all", page: "1" })}
                    aria-label="Quitar filtro de disponibilidad"
                  >
                    {STOCK_FILTERS.find((filter) => filter.value === result.query.stock)?.label}
                    <X size={13} aria-hidden="true" />
                  </Link>
                )}
                <Link className={styles.textLink} href="/admin/inventario">
                  Limpiar todo
                </Link>
              </div>
            )}
            <div className={styles.resultsHeader}>
              <div>
                <h2>Existencias por variante</h2>
                <p>
                  {result.rows.length
                    ? `${formatUnits(result.rows.length)} ${result.rows.length === 1 ? "variante en esta página" : "variantes en esta página"} · Ordenadas por disponible, de menor a mayor`
                    : "Ajusta la búsqueda para encontrar tus productos"}
                </p>
              </div>
              <details className={styles.help}>
                <summary>
                  <CircleHelp size={15} aria-hidden="true" />
                  Entender las cantidades
                </summary>
                <dl>
                  <div>
                    <dt>Físico</dt>
                    <dd>Unidades que hay en el almacén.</dd>
                  </div>
                  <div>
                    <dt>Reservado</dt>
                    <dd>Separadas para pedidos pendientes de pago.</dd>
                  </div>
                  <div>
                    <dt>Asignado</dt>
                    <dd>Separadas para pedidos pagados, pendientes de despacho.</dd>
                  </div>
                  <div>
                    <dt>Disponible</dt>
                    <dd>Físico menos reservado y asignado.</dd>
                  </div>
                  <div>
                    <dt>Reponer en</dt>
                    <dd>Umbral configurado para avisar de stock bajo.</dd>
                  </div>
                </dl>
              </details>
            </div>
            {result.rows.length ? (
              <div
                className={styles.scroll}
                role="region"
                aria-label="Existencias de productos"
                tabIndex={0}
              >
                <table className={styles.table}>
                  <caption className={styles.srOnly}>
                    Unidades de inventario por variante. Disponible equivale a físico menos
                    reservado y asignado.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Producto / variante</th>
                      <th scope="col">Estado</th>
                      <th scope="col" className={`${styles.numeric} ${styles.availableColumn}`}>
                        Disponible
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Físico
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Reservado
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Asignado
                      </th>
                      <th scope="col" className={styles.numeric}>
                        Reponer en
                      </th>
                      <th scope="col">
                        <span className={styles.srOnly}>Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => {
                      const status = stockStatus(row.available, row.reorder_point);
                      return (
                        <tr key={row.variant_id} data-stock={status.key}>
                          <th scope="row" className={styles.product}>
                            <Link
                              className={styles.productLink}
                              href={`/admin/products/${row.product_id}#variantes`}
                            >
                              {row.product_name}
                            </Link>
                            <span className={styles.variant}>{row.title}</span>
                            <span className={styles.sku}>SKU {row.sku}</span>
                          </th>
                          <td data-label="Estado">
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                            {status.key === "review" && (
                              <span className={styles.issueNote}>Comprometido supera físico</span>
                            )}
                          </td>
                          <td
                            data-label="Disponible"
                            className={`${styles.numeric} ${styles.availableColumn}`}
                          >
                            <strong className={styles.available}>
                              {formatUnits(row.available)}
                            </strong>
                            <span className={styles.unitLabel}>unidades</span>
                          </td>
                          <td data-label="Físico" className={styles.numeric}>
                            {formatUnits(row.on_hand)}
                          </td>
                          <td data-label="Reservado" className={styles.numeric}>
                            {formatUnits(row.reserved)}
                          </td>
                          <td data-label="Asignado" className={styles.numeric}>
                            {formatUnits(row.allocated)}
                          </td>
                          <td data-label="Reponer en" className={styles.numeric}>
                            {formatUnits(row.reorder_point)}
                          </td>
                          <td className={styles.actions}>
                            <InventoryCountForm row={row} />
                            <Link
                              className={styles.textLink}
                              href={href({ vista: "movimientos", variant: row.variant_id })}
                            >
                              Ver movimientos
                              <ArrowRight size={13} aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <PackageSearch size={30} aria-hidden="true" />
                <h3>No hay variantes para mostrar</h3>
                <p>
                  {hasFilters
                    ? "Prueba otro nombre o SKU, o quita un filtro de disponibilidad."
                    : "Aquí aparecerán los productos que tengan variantes activas."}
                </p>
                {hasFilters && (
                  <Link className={styles.secondaryButton} href="/admin/inventario">
                    Restablecer filtros
                  </Link>
                )}
              </div>
            )}
            <footer className={styles.footer}>
              <span>
                {result.rows.length
                  ? `Mostrando ${formatUnits(start)}–${formatUnits(end)}`
                  : "0 variantes"}{" "}
                · Hasta 50 por página
              </span>
              <nav className={styles.pagination} aria-label="Páginas de inventario">
                <span>Página {formatUnits(result.query.page)}</span>
                {result.query.page > 1 ? (
                  <Link
                    className={styles.iconButton}
                    aria-label="Página anterior"
                    href={href({ page: String(result.query.page - 1) })}
                  >
                    <ChevronLeft size={17} aria-hidden="true" />
                  </Link>
                ) : (
                  <button className={styles.iconButton} aria-label="Página anterior" disabled>
                    <ChevronLeft size={17} aria-hidden="true" />
                  </button>
                )}
                {result.hasNext && result.query.page < 1000 ? (
                  <Link
                    className={styles.iconButton}
                    aria-label="Página siguiente"
                    href={href({ page: String(result.query.page + 1) })}
                  >
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                ) : (
                  <button className={styles.iconButton} aria-label="Página siguiente" disabled>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                )}
              </nav>
            </footer>
          </>
        )}
      </section>
      {!movementsView && (
        <p className={styles.bottomNote}>
          <CircleHelp size={14} aria-hidden="true" />
          Registrar un conteo actualiza el stock físico y deja un movimiento con su motivo.
        </p>
      )}
    </div>
  );
}
