import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PackageSearch, Search, Warehouse } from "lucide-react";
import { SegmentedNav, StatusBadge } from "@/components/admin/ui/admin-ui";
import { getAdminInventoryPage, inventoryQuerySchema } from "@/lib/admin/inventory/page-reader";
import { InventoryCountForm } from "./stock-count";
import styles from "./inventory.module.css";

export const dynamic = "force-dynamic";
const MOVEMENTS: Record<string, string> = {
  RECEIVING: "Recepción",
  MANUAL_ADJUSTMENT: "Conteo o ajuste manual",
  RESERVATION_CREATED: "Reserva de pedido",
  RESERVATION_EXPIRED: "Reserva vencida",
  RESERVATION_RELEASED: "Reserva liberada",
  ALLOCATION_CONFIRMED: "Stock asignado a pedido pagado",
  ALLOCATION_RELEASED: "Asignación liberada",
  FULFILLMENT_DISPATCHED: "Despacho",
  RETURN_RESTOCKED: "Devolución al almacén",
};
const delta = (value: number) =>
  value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "—";

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
      <p>
        Los filtros no son válidos. <Link href="/admin/inventario">Restablecer filtros</Link>
      </p>
    );
  const result = await getAdminInventoryPage(parsed.data);
  if (!result.configured)
    return (
      <p>
        El almacén principal aún no está configurado. Revisa la configuración de inventario del
        servidor.
      </p>
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
  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Inventario</h1>
          <p>Consulta las unidades disponibles y registra los conteos de tu almacén.</p>
        </div>
        <span className={styles.location}>
          <Warehouse size={16} aria-hidden="true" />
          {result.location}
        </span>
      </header>
      <section className={styles.card} aria-label="Control de inventario">
        <div className={styles.toolbar}>
          <SegmentedNav
            label="Vistas de inventario"
            options={[
              {
                href: href({ vista: "existencias", variant: undefined }),
                label: "Existencias",
                active: !movementsView,
              },
              { href: href({ vista: "movimientos" }), label: "Movimientos", active: movementsView },
            ]}
          />
          <span className={styles.caption}>
            {movementsView ? "Historial del almacén" : "Solo variantes activas"}
          </span>
        </div>
        {movementsView ? (
          <>
            <div className={styles.resultsHeader} id="movimientos">
              <div>
                <h2>
                  {result.query.variant ? "Movimientos de la variante" : "Movimientos del almacén"}
                </h2>
                <p>Hasta los 50 más recientes, ordenados del más nuevo al más antiguo.</p>
              </div>
              {result.query.variant && (
                <Link className={styles.secondaryButton} href={href({ variant: undefined })}>
                  Ver todo el almacén
                </Link>
              )}
            </div>
            {result.movements.length ? (
              <div
                className={styles.scroll}
                role="region"
                aria-label="Historial de movimientos"
                tabIndex={0}
              >
                <table className={`${styles.table} ${styles.movementsTable}`}>
                  <caption className={styles.srOnly}>Últimos movimientos de inventario</caption>
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
                      <th scope="col">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.movements.map((movement) => (
                      <tr key={movement.id}>
                        <th scope="row">
                          <time dateTime={new Date(movement.created_at).toISOString()}>
                            {new Date(movement.created_at).toLocaleString("es-PE", {
                              timeZone: "America/Lima",
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </time>
                          <span className={styles.subtext}>{movement.sku}</span>
                        </th>
                        <td data-label="Movimiento">
                          {MOVEMENTS[movement.movement_type] ?? movement.movement_type}
                        </td>
                        <td data-label="Cambio físico" className={styles.numeric}>
                          {delta(movement.on_hand_delta)}
                        </td>
                        <td data-label="Cambio reservado" className={styles.numeric}>
                          {delta(movement.reserved_delta)}
                        </td>
                        <td data-label="Cambio asignado" className={styles.numeric}>
                          {delta(movement.allocated_delta)}
                        </td>
                        <td data-label="Detalle">
                          <details className={styles.movementDetail}>
                            <summary>Motivo y autor</summary>
                            <p>{movement.notes ?? "Sin nota"}</p>
                            <span className={styles.subtext}>
                              ID del autor: {movement.actor_id}
                            </span>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <PackageSearch size={28} aria-hidden="true" />
                <h3>Aún no hay movimientos</h3>
                <p>Los conteos y los cambios de los pedidos aparecerán aquí.</p>
              </div>
            )}
            <footer className={styles.footer}>
              <span>{result.movements.length} movimientos mostrados</span>
              <span>Los números indican el cambio de unidades.</span>
            </footer>
          </>
        ) : (
          <>
            <form method="get" className={styles.filters} action="/admin/inventario">
              <input type="hidden" name="vista" value="existencias" />
              <div className={styles.searchField}>
                <label className={styles.srOnly} htmlFor="inventory-search">
                  Buscar producto o SKU
                </label>
                <Search size={16} aria-hidden="true" />
                <input
                  id="inventory-search"
                  className={styles.input}
                  name="q"
                  defaultValue={result.query.q}
                  placeholder="Buscar producto o SKU…"
                  maxLength={100}
                  type="search"
                />
              </div>
              <label className={styles.srOnly} htmlFor="inventory-stock">
                Stock
              </label>
              <select
                id="inventory-stock"
                className={styles.select}
                name="stock"
                defaultValue={result.query.stock}
              >
                <option value="all">Todos los estados</option>
                <option value="low">Stock bajo</option>
                <option value="out">Agotados</option>
              </select>
              <button type="submit" className={styles.primaryButton}>
                Filtrar
              </button>
              {hasFilters && (
                <Link className={styles.textLink} href="/admin/inventario">
                  Limpiar
                </Link>
              )}
            </form>
            <div className={styles.resultsHeader}>
              <div>
                <h2>Existencias por variante</h2>
                <p>
                  {result.rows.length}{" "}
                  {result.rows.length === 1
                    ? "variante en esta página"
                    : "variantes en esta página"}
                  {hasFilters ? " · Filtros aplicados" : ""}
                </p>
              </div>
              <details className={styles.help}>
                <summary>¿Cómo se calcula el stock?</summary>
                <p>
                  Disponible = físico − reservado − asignado. El stock reservado corresponde a
                  pedidos pendientes; el asignado, a pedidos pagados pendientes de despacho.
                </p>
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
                  <caption className={styles.srOnly}>Unidades de inventario por variante</caption>
                  <thead>
                    <tr>
                      <th scope="col">Producto</th>
                      <th scope="col">Estado</th>
                      <th scope="col" className={styles.numeric}>
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
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.variant_id}>
                        <th scope="row" className={styles.product}>
                          <Link
                            className={styles.productLink}
                            href={`/admin/products/${row.product_id}#variantes`}
                          >
                            {row.product_name}
                          </Link>
                          <span className={styles.subtext}>
                            {row.title} · {row.sku}
                          </span>
                        </th>
                        <td data-label="Estado">
                          <StatusBadge
                            tone={
                              row.available <= 0
                                ? "danger"
                                : row.available <= row.reorder_point
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {row.available <= 0
                              ? "Agotado"
                              : row.available <= row.reorder_point
                                ? "Stock bajo"
                                : "Disponible"}
                          </StatusBadge>
                        </td>
                        <td
                          data-label="Disponible"
                          className={`${styles.numeric} ${styles.available}`}
                        >
                          {row.available}
                        </td>
                        <td data-label="Físico" className={styles.numeric}>
                          {row.on_hand}
                        </td>
                        <td data-label="Reservado" className={styles.numeric}>
                          {row.reserved}
                        </td>
                        <td data-label="Asignado" className={styles.numeric}>
                          {row.allocated}
                        </td>
                        <td data-label="Reponer en" className={styles.numeric}>
                          {row.reorder_point}
                        </td>
                        <td className={styles.actions}>
                          <InventoryCountForm row={row} />
                          <Link
                            className={styles.textLink}
                            href={href({ vista: "movimientos", variant: row.variant_id })}
                          >
                            Ver movimientos
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <PackageSearch size={28} aria-hidden="true" />
                <h3>No hay variantes para mostrar</h3>
                <p>
                  {hasFilters
                    ? "Prueba otro nombre, SKU o estado de stock."
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
              <span>Hasta 50 variantes por página</span>
              <nav className={styles.pagination} aria-label="Páginas de inventario">
                <span>Página {result.query.page}</span>
                {result.query.page > 1 ? (
                  <Link
                    className={styles.iconButton}
                    aria-label="Página anterior"
                    href={href({ page: String(result.query.page - 1) })}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </Link>
                ) : (
                  <button className={styles.iconButton} aria-label="Página anterior" disabled>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                )}
                {result.hasNext && result.query.page < 1000 ? (
                  <Link
                    className={styles.iconButton}
                    aria-label="Página siguiente"
                    href={href({ page: String(result.query.page + 1) })}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                ) : (
                  <button className={styles.iconButton} aria-label="Página siguiente" disabled>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )}
              </nav>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
