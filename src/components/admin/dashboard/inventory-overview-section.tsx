import React from "react";
import Link from "@/components/app-link";
import { PackageCheck } from "lucide-react";
import type { InventoryOverviewResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, EmptyState, SectionLink, StatList, StatusBadge } from "../ui";
import styles from "./inventory-overview-section.module.css";

interface InventoryOverviewSectionProps {
  inventoryOverview: InventoryOverviewResult;
  /** Stock screen, optionally narrowed by `stock` or `variant`. */
  inventoryHref?: ((filters?: Record<string, string>) => string) | null;
  /** Fallback for out-of-stock when the stock screen is not available. */
  outOfStockHref?: string;
}

export function InventoryOverviewSection({
  inventoryOverview,
  inventoryHref,
  outOfStockHref,
}: InventoryOverviewSectionProps) {
  if (inventoryOverview.status === "UNAUTHORIZED") {
    return null;
  }

  const { globalPhysicalBalances, outOfStockActiveSkus, lowStockActivePositions, restockItems } =
    inventoryOverview.data;

  return (
    <AdminSection
      id="inventory-heading"
      title="Inventario"
      caption={
        inventoryHref ? <SectionLink href={inventoryHref()}>Ir a Inventario</SectionLink> : null
      }
    >
      <AdminCard>
        <StatList
          label="Estado del stock en todas las ubicaciones"
          testIdPrefix="inventory"
          items={[
            {
              id: "out-of-stock-skus",
              label: "Variantes agotadas",
              value: formatInteger(outOfStockActiveSkus),
              dot: outOfStockActiveSkus > 0 ? "critical" : "ok",
              href: inventoryHref?.({ stock: "out" }) ?? outOfStockHref ?? null,
            },
            {
              id: "low-stock-positions",
              label: "Ubicaciones con stock bajo",
              value: formatInteger(lowStockActivePositions),
              dot: lowStockActivePositions > 0 ? "attention" : "ok",
              href: inventoryHref?.({ stock: "low" }) ?? null,
            },
            {
              id: "ats-units",
              label: "Unidades disponibles para vender",
              note: `${formatInteger(globalPhysicalBalances.reservedUnits + globalPhysicalBalances.allocatedUnits)} apartadas`,
              value: formatInteger(globalPhysicalBalances.availableToSellUnits),
            },
          ]}
        />
        <div className={styles.restock}>
          <h3 className={styles.restockTitle}>Por reponer</h3>
          {restockItems.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={18} />}
              title="Nada por reponer"
              testId="inventory-restock-empty"
            >
              Todas las variantes activas están por encima de su punto de reorden.
            </EmptyState>
          ) : (
            <ul className={styles.restockList}>
              {restockItems.map((item) => {
                const body = (
                  <>
                    <span className={styles.restockName}>
                      {item.productName}
                      <span className={styles.restockVariant}>
                        {item.variantTitle} · {item.sku}
                      </span>
                    </span>
                    {item.availableUnits === 0 ? (
                      <StatusBadge tone="danger">Agotado</StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">
                        Quedan {formatInteger(item.availableUnits)}
                      </StatusBadge>
                    )}
                  </>
                );
                const href = inventoryHref?.({ variant: item.variantId });
                return (
                  <li key={item.variantId} data-testid={`restock-${item.variantId}`}>
                    {href ? (
                      <Link href={href} className={`${styles.restockRow} ${styles.restockLink}`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={styles.restockRow}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AdminCard>
    </AdminSection>
  );
}
