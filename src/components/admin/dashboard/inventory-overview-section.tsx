import React from "react";
import type { InventoryOverviewResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricRow, MetricWidget, StaggerItem } from "../ui";
import styles from "./inventory-overview-section.module.css";

interface InventoryOverviewSectionProps {
  inventoryOverview: InventoryOverviewResult;
  outOfStockHref?: string;
}

export function InventoryOverviewSection({
  inventoryOverview,
  outOfStockHref,
}: InventoryOverviewSectionProps) {
  if (inventoryOverview.status === "UNAUTHORIZED") {
    return null;
  }

  const { globalPhysicalBalances, outOfStockActiveSkus, lowStockActivePositions } =
    inventoryOverview.data;

  return (
    <AdminSection
      id="inventory-heading"
      title="Resumen de Inventario"
      caption="Todas las ubicaciones"
    >
      <AdminCard>
        <StaggerItem className={styles.headline}>
          <MetricWidget
            label="Disponible para venta (ATS)"
            value={formatInteger(globalPhysicalBalances.availableToSellUnits)}
            valueTestId="inventory-ats-units"
            size="large"
            footnote="Unidades físicas comercializables inmediatamente"
          />
        </StaggerItem>

        <MetricRow minCellWidth={120}>
          <StaggerItem>
            <MetricWidget
              label="En almacén"
              value={formatInteger(globalPhysicalBalances.onHandUnits)}
              size="small"
              testId="inventory-on-hand"
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Reservadas"
              value={formatInteger(globalPhysicalBalances.reservedUnits)}
              size="small"
              testId="inventory-reserved"
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Asignadas"
              value={formatInteger(globalPhysicalBalances.allocatedUnits)}
              size="small"
              testId="inventory-allocated"
            />
          </StaggerItem>
        </MetricRow>

        <MetricRow>
          <StaggerItem>
            <MetricWidget
              label="SKUs activos agotados"
              value={formatInteger(outOfStockActiveSkus)}
              size="small"
              dot={outOfStockActiveSkus > 0 ? "critical" : "ok"}
              footnote={
                outOfStockActiveSkus === 0
                  ? "Sin SKUs activos con stock cero"
                  : "SKUs con balance ATS igual a 0"
              }
              testId="inventory-out-of-stock-skus"
              href={outOfStockHref}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Posiciones con stock bajo"
              value={formatInteger(lowStockActivePositions)}
              size="small"
              dot={lowStockActivePositions > 0 ? "attention" : "ok"}
              footnote={
                lowStockActivePositions === 0
                  ? "Posiciones por encima del punto de reorden"
                  : "Ubicaciones con ATS menor o igual al reorden"
              }
              testId="inventory-low-stock-positions"
            />
          </StaggerItem>
        </MetricRow>
      </AdminCard>
    </AdminSection>
  );
}
