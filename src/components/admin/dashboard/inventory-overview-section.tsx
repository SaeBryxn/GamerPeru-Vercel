import React from "react";
import type { InventoryOverviewResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { Boxes, AlertTriangle, CheckCircle2, Layers } from "lucide-react";
import styles from "./inventory-overview-section.module.css";

interface InventoryOverviewSectionProps {
  inventoryOverview: InventoryOverviewResult;
}

export function InventoryOverviewSection({ inventoryOverview }: InventoryOverviewSectionProps) {
  if (inventoryOverview.status === "UNAUTHORIZED") {
    return null;
  }

  const { globalPhysicalBalances, outOfStockActiveSkus, lowStockActivePositions } =
    inventoryOverview.data;

  return (
    <section className={styles.section} aria-labelledby="inventory-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.titleWrapper}>
          <Boxes className={styles.sectionIcon} aria-hidden="true" />
          <h2 id="inventory-heading" className={styles.sectionTitle}>
            Resumen de Inventario
          </h2>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Card 1: Balances Físicos Globales */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <Layers className={styles.cardIconBalances} aria-hidden="true" />
              <h3 className={styles.cardTitle}>Balances físicos globales</h3>
            </div>
            <span className={styles.subtext}>Todas las ubicaciones</span>
          </div>

          <div className={styles.balanceHighlight}>
            <span className={styles.highlightLabel}>Disponible para venta (ATS)</span>
            <span className={styles.highlightValue} data-testid="inventory-ats-units">
              {formatInteger(globalPhysicalBalances.availableToSellUnits)}
            </span>
            <span className={styles.highlightFooter}>
              Unidades físicas comercializables inmediatamente
            </span>
          </div>

          <div className={styles.balanceGrid}>
            <div className={styles.balanceItem} data-testid="inventory-on-hand">
              <span className={styles.balanceLabel}>En mano (On Hand)</span>
              <span className={styles.balanceValue}>
                {formatInteger(globalPhysicalBalances.onHandUnits)}
              </span>
            </div>

            <div className={styles.balanceItem} data-testid="inventory-reserved">
              <span className={styles.balanceLabel}>Reservadas</span>
              <span className={styles.balanceValue}>
                {formatInteger(globalPhysicalBalances.reservedUnits)}
              </span>
            </div>

            <div className={styles.balanceItem} data-testid="inventory-allocated">
              <span className={styles.balanceLabel}>Asignadas</span>
              <span className={styles.balanceValue}>
                {formatInteger(globalPhysicalBalances.allocatedUnits)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Alertas de Existencias */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleGroup}>
              <AlertTriangle className={styles.cardIconAlerts} aria-hidden="true" />
              <h3 className={styles.cardTitle}>Alertas de existencias</h3>
            </div>
          </div>

          <div className={styles.alertsGrid}>
            {/* Out of stock SKUs */}
            <div
              className={`${styles.alertItem} ${outOfStockActiveSkus > 0 ? styles.alertDanger : ""}`}
              data-testid="inventory-out-of-stock-skus"
            >
              <div className={styles.alertItemHeader}>
                <span className={styles.alertLabel}>SKUs activos agotados</span>
                {outOfStockActiveSkus === 0 && (
                  <CheckCircle2 className={styles.cleanIcon} aria-hidden="true" />
                )}
              </div>
              <span className={styles.alertValue}>{formatInteger(outOfStockActiveSkus)}</span>
              <span className={styles.alertFooter}>
                {outOfStockActiveSkus === 0
                  ? "Sin SKUs activos con stock cero"
                  : "SKUs con balance ATS igual a 0"}
              </span>
            </div>

            {/* Low stock active positions */}
            <div
              className={`${styles.alertItem} ${
                lowStockActivePositions > 0 ? styles.alertWarning : ""
              }`}
              data-testid="inventory-low-stock-positions"
            >
              <div className={styles.alertItemHeader}>
                <span className={styles.alertLabel}>Posiciones con stock bajo</span>
                {lowStockActivePositions === 0 && (
                  <CheckCircle2 className={styles.cleanIcon} aria-hidden="true" />
                )}
              </div>
              <span className={styles.alertValue}>{formatInteger(lowStockActivePositions)}</span>
              <span className={styles.alertFooter}>
                {lowStockActivePositions === 0
                  ? "Posiciones por encima del punto de reorden"
                  : "Ubicaciones con ATS menor o igual al reorden"}
              </span>
            </div>
          </div>

          <div className={styles.cardFooter}>
            Monitoreo en tiempo real de niveles críticos de existencias
          </div>
        </div>
      </div>
    </section>
  );
}
