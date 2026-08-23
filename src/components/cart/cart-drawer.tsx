"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button, Icon } from "@/components/ui";
import { CartEmptyState } from "./cart-empty-state";
import { CartLine } from "./cart-line";
import { useCart } from "./cart-provider";
import { CartSummary } from "./cart-summary";
import styles from "./cart-drawer.module.css";

export function CartDrawer(): React.JSX.Element | null {
  const {
    status,
    snapshot,
    isDrawerOpen,
    isMutating,
    pendingVariantIds,
    lastError,
    closeDrawer,
    updateQuantity,
    removeItem,
    retryBootstrap,
  } = useCart();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Sync native dialog showModal / close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isDrawerOpen) {
      if (!dialog.open) {
        dialog.showModal();
        requestAnimationFrame(() => {
          closeButtonRef.current?.focus();
        });
      }
      document.body.style.overflow = "hidden";
    } else {
      if (dialog.open) {
        dialog.close();
      }
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  // Handle native Escape and backdrop clicks
  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    closeDrawer();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      closeDrawer();
    }
  };

  if (!isDrawerOpen && status === "UNINITIALIZED") {
    return null;
  }

  const lines = snapshot?.lines ?? [];
  const itemCount = snapshot?.itemCount ?? 0;
  const hasUnavailable = snapshot?.hasUnavailableItems ?? false;

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={styles.dialog}
      aria-labelledby="cart-drawer-title"
      data-testid="cart-drawer"
    >
      <div className={styles.drawerPanel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <h2 id="cart-drawer-title" className={styles.title}>
              Tu Carrito
            </h2>
            {status === "READY" && itemCount > 0 && (
              <span className={styles.countBadge} data-testid="cart-drawer-count">
                {itemCount} {itemCount === 1 ? "producto" : "productos"}
              </span>
            )}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            className={styles.closeButton}
            aria-label="Cerrar carrito"
            data-testid="cart-drawer-close"
          >
            <Icon icon={X} size="lg" aria-hidden="true" />
          </button>
        </div>

        {/* Inline Error if present */}
        {lastError && (
          <div className={styles.errorAlert} role="alert" data-testid="cart-drawer-error-alert">
            <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
            <span>{lastError}</span>
          </div>
        )}

        {/* Body Content */}
        <div className={styles.body}>
          {status === "LOADING" && (
            <div className={styles.loadingState} aria-busy="true" data-testid="cart-drawer-loading">
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
              <p className={styles.loadingText}>Cargando carrito...</p>
            </div>
          )}

          {status === "PROFILE_REQUIRED" && (
            <div className={styles.profileRequiredState} data-testid="cart-profile-required-state">
              <Icon
                icon={AlertCircle}
                size="xl"
                className={styles.profileRequiredIcon}
                aria-hidden="true"
              />
              <h3 className={styles.profileRequiredTitle}>Completa tu perfil</h3>
              <p className={styles.profileRequiredText}>
                Debes completar tu perfil de cliente para poder utilizar el carrito de compras.
              </p>
              <Link
                href="/auth/completar-perfil"
                onClick={closeDrawer}
                className={styles.profileActionLink}
                data-testid="cart-complete-profile-link"
              >
                Completar Perfil
              </Link>
            </div>
          )}

          {status === "ERROR" && (
            <div className={styles.errorState} data-testid="cart-drawer-error-state">
              <Icon icon={AlertCircle} size="xl" className={styles.errorIcon} aria-hidden="true" />
              <h3 className={styles.errorTitle}>Error al cargar el carrito</h3>
              <p className={styles.errorText}>No pudimos recuperar tu carrito en este momento.</p>
              <Button
                variant="secondary"
                onClick={() => retryBootstrap()}
                data-testid="cart-retry-button"
              >
                <Icon
                  icon={RefreshCw}
                  size="sm"
                  aria-hidden="true"
                  style={{ marginRight: "6px" }}
                />
                Reintentar
              </Button>
            </div>
          )}

          {status === "READY" && lines.length === 0 && (
            <CartEmptyState onActionClick={closeDrawer} />
          )}

          {status === "READY" && lines.length > 0 && (
            <div className={styles.linesList}>
              {hasUnavailable && (
                <div
                  className={styles.unavailableWarning}
                  role="alert"
                  data-testid="cart-unavailable-warning"
                >
                  <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                  <span>Algunos productos en tu carrito ya no están disponibles.</span>
                </div>
              )}

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
          )}
        </div>

        {/* Footer */}
        {status === "READY" && lines.length > 0 && snapshot && (
          <div className={styles.footer} data-testid="cart-drawer-footer">
            <CartSummary subtotalCents={snapshot.subtotalCents} />

            <div className={styles.ctaGroup}>
              <Link
                href="/carrito"
                onClick={closeDrawer}
                className={styles.viewCartButton}
                data-testid="cart-view-full-page"
              >
                Ver carrito
              </Link>

              <Button
                variant="ghost"
                fullWidth
                onClick={closeDrawer}
                data-testid="cart-continue-shopping"
              >
                Seguir comprando
              </Button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
