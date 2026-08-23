"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Container, Icon } from "@/components/ui";
import { CartEmptyState } from "./cart-empty-state";
import { CartLine } from "./cart-line";
import { useCart } from "./cart-provider";
import { CartSummary } from "./cart-summary";
import styles from "./cart-page-client.module.css";

export function CartPageClient(): React.JSX.Element {
  const {
    status,
    snapshot,
    isMutating,
    pendingVariantIds,
    updateQuantity,
    removeItem,
    retryBootstrap,
  } = useCart();

  const lines = snapshot?.lines ?? [];
  const itemCount = snapshot?.itemCount ?? 0;
  const hasUnavailable = snapshot?.hasUnavailableItems ?? false;

  return (
    <div className={styles.pageWrapper} data-testid="cart-full-page">
      <Container size="default">
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Tu Carrito de Compras</h1>
          {status === "READY" && itemCount > 0 && (
            <p className={styles.pageSubtitle}>
              Tienes {itemCount} {itemCount === 1 ? "producto" : "productos"} en tu carrito.
            </p>
          )}
        </div>

        {/* Loading State */}
        {status === "LOADING" && (
          <div className={styles.loadingContainer} aria-busy="true" data-testid="cart-page-loading">
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
            <p className={styles.loadingText}>Cargando los productos de tu carrito...</p>
          </div>
        )}

        {/* Profile Required State */}
        {status === "PROFILE_REQUIRED" && (
          <div className={styles.statusBox} data-testid="cart-page-profile-required">
            <Icon icon={AlertCircle} size="xl" className={styles.statusIcon} aria-hidden="true" />
            <h2 className={styles.statusTitle}>Completa tu perfil</h2>
            <p className={styles.statusText}>
              Debes completar tu perfil de cliente para poder gestionar tu carrito de compras.
            </p>
            <Link href="/auth/completar-perfil" className={styles.statusLink}>
              <Button variant="primary">Completar Perfil</Button>
            </Link>
          </div>
        )}

        {/* Error State */}
        {status === "ERROR" && (
          <div className={styles.statusBox} data-testid="cart-page-error">
            <Icon icon={AlertCircle} size="xl" className={styles.statusIcon} aria-hidden="true" />
            <h2 className={styles.statusTitle}>Error al cargar el carrito</h2>
            <p className={styles.statusText}>No pudimos recuperar tu carrito en este momento.</p>
            <Button variant="secondary" onClick={() => retryBootstrap()}>
              <Icon icon={RefreshCw} size="sm" aria-hidden="true" style={{ marginRight: "6px" }} />
              Reintentar
            </Button>
          </div>
        )}

        {/* Empty State */}
        {status === "READY" && lines.length === 0 && (
          <div className={styles.emptyCard}>
            <CartEmptyState />
          </div>
        )}

        {/* Populated Two-Column Layout */}
        {status === "READY" && lines.length > 0 && snapshot && (
          <div className={styles.cartGrid}>
            {/* Left Column: Lines List */}
            <div className={styles.linesColumn}>
              {hasUnavailable && (
                <div className={styles.unavailableWarning} role="alert">
                  <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                  <span>Algunos productos en tu carrito ya no están disponibles.</span>
                </div>
              )}

              <div className={styles.linesList}>
                {lines.map((line) => (
                  <CartLine
                    key={line.variantId}
                    line={line}
                    onUpdateQuantity={(qty) => updateQuantity(line.variantId, qty)}
                    onRemove={() => removeItem(line.variantId)}
                    disabled={isMutating || pendingVariantIds.has(line.variantId)}
                  />
                ))}
              </div>

              <div className={styles.continueShoppingRow}>
                <Link href="/categorias/mouses" className={styles.continueShoppingLink}>
                  <Button variant="ghost">← Seguir explorando catálogo</Button>
                </Link>
              </div>
            </div>

            {/* Right Column: Order Summary */}
            <div className={styles.summaryColumn}>
              <div className={styles.stickySummary}>
                <h2 className={styles.summaryHeading}>Resumen del Carrito</h2>
                <CartSummary subtotalCents={snapshot.subtotalCents} />
              </div>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
