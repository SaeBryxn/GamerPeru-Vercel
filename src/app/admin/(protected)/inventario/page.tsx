import React from "react";
import Link from "next/link";
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
  const href = (page: number) =>
    `/admin/inventario?${new URLSearchParams({ q: result.query.q, stock: result.query.stock, page: String(page), ...(result.query.variant ? { variant: result.query.variant } : {}) })}`;
  return (
    <div className={styles.root}>
      <h1>Inventario</h1>
      <p>
        Almacén principal: {result.location}. Disponible = físico − reservado − asignado. Solo
        variantes activas.
      </p>
      <form method="get" className={styles.filters}>
        <label>
          Buscar producto o SKU
          <input name="q" defaultValue={result.query.q} maxLength={100} />
        </label>
        <label>
          Stock
          <select name="stock" defaultValue={result.query.stock}>
            <option value="all">Todos</option>
            <option value="low">Stock bajo</option>
            <option value="out">Agotados</option>
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>
      <div className={styles.scroll}>
        <table>
          <thead>
            <tr>
              <th>Producto / SKU</th>
              <th>Físico</th>
              <th>Reservado</th>
              <th>Asignado</th>
              <th>Disponible</th>
              <th>Punto de reposición</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.variant_id}>
                <th>
                  <Link href={`/admin/products/${row.product_id}#variantes`}>
                    {row.product_name} · {row.title}
                  </Link>
                  <small>{row.sku}</small>
                </th>
                <td>{row.on_hand}</td>
                <td>{row.reserved}</td>
                <td>{row.allocated}</td>
                <td>{row.available}</td>
                <td>{row.reorder_point}</td>
                <td>
                  <InventoryCountForm row={row} />
                  <Link href={`/admin/inventario?variant=${row.variant_id}#movimientos`}>
                    Ver movimientos
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.rows.length === 0 && <p>No hay variantes para esos filtros.</p>}
      <nav aria-label="Páginas de inventario">
        {result.query.page > 1 && <Link href={href(result.query.page - 1)}>Anterior</Link>}{" "}
        <span>Página {result.query.page}</span>{" "}
        {result.hasNext && result.query.page < 1000 && (
          <Link href={href(result.query.page + 1)}>Siguiente</Link>
        )}
      </nav>
      <section id="movimientos">
        <h2>
          Últimos movimientos
          {result.query.variant ? " de la variante seleccionada" : " del almacén"}
        </h2>
        <p>
          Se muestran hasta 50 movimientos recientes. Los conteos físicos conservan sus motivos y
          autor en el registro.
        </p>
        {result.query.variant && (
          <Link href="/admin/inventario#movimientos">Ver todas las variantes</Link>
        )}
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>SKU</th>
                <th>Movimiento</th>
                <th>Cambio físico</th>
                <th>Cambio reservado</th>
                <th>Cambio asignado</th>
                <th>Motivo / autor</th>
              </tr>
            </thead>
            <tbody>
              {result.movements.map((movement) => (
                <tr key={movement.id}>
                  <td>
                    {new Date(movement.created_at).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}
                  </td>
                  <td>{movement.sku}</td>
                  <td>{MOVEMENTS[movement.movement_type] ?? movement.movement_type}</td>
                  <td>{movement.on_hand_delta}</td>
                  <td>{movement.reserved_delta}</td>
                  <td>{movement.allocated_delta}</td>
                  <td>
                    {movement.notes ?? "Sin nota"}
                    <small>{movement.actor_id}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.movements.length === 0 && <p>Aún no hay movimientos registrados.</p>}
      </section>
    </div>
  );
}
