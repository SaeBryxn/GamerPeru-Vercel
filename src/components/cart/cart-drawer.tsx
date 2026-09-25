"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Lock,
  Percent,
  RefreshCw,
  StickyNote,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { CartEmptyState } from "./cart-empty-state";
import { CartLine } from "./cart-line";
import { useCart } from "./cart-provider";
import styles from "./cart-drawer.module.css";

/** Matches the mega-menu spring, so every panel in the store settles the same way. */
const PANEL_TRANSITION = { type: "spring", stiffness: 320, damping: 36, mass: 0.9 } as const;

/**
 * Leaving uses a fixed-length tween: a spring's settle time depends on its tail, and the safety
 * timer below must never cut the panel off mid-slide.
 */
const PANEL_EXIT_TRANSITION = { duration: 0.26, ease: [0.4, 0, 1, 1] } as const;

/** Comfortably longer than the exit tween; only reached if the animation never reports back. */
const EXIT_SAFETY_MS = 700;

/**
 * Hiding the body overflow removes the scrollbar, which would shift the whole page sideways as
 * the panel slides in. Padding the body by the scrollbar's width keeps the layout where it was.
 */
function lockPageScroll() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
}

function unlockPageScroll() {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}

type UtilityTab = "note" | "shipping" | "discount";

const UTILITY_TABS: { id: UtilityTab; label: string; icon: typeof StickyNote }[] = [
  { id: "note", label: "Nota del pedido", icon: StickyNote },
  { id: "shipping", label: "Envío", icon: Truck },
  { id: "discount", label: "Descuento", icon: Percent },
];

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
  const [openTab, setOpenTab] = useState<UtilityTab | null>(null);
  const [orderNote, setOrderNote] = useState("");

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
      lockPageScroll();
      return unlockPageScroll;
    }

    unlockPageScroll();

    // The exit animation normally closes the dialog. This is the safety net: a modal dialog left
    // open would keep the focus trap and the page inert, so it closes regardless of whether the
    // animation ever reports completion.
    const fallback = setTimeout(() => {
      if (dialog.open) dialog.close();
    }, EXIT_SAFETY_MS);

    return () => {
      clearTimeout(fallback);
      unlockPageScroll();
    };
  }, [isDrawerOpen]);

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
      <AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
        {isDrawerOpen && (
          <>
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={closeDrawer}
              aria-hidden="true"
            />
            <motion.div
              className={styles.drawerPanel}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%", transition: PANEL_EXIT_TRANSITION }}
              transition={PANEL_TRANSITION}
            >
              <header className={styles.header}>
                <div className={styles.headerTitleGroup}>
                  <h2 id="cart-drawer-title" className={styles.title}>
                    Carrito
                    {status === "READY" && itemCount > 0 && (
                      <sup className={styles.countSuperscript} data-testid="cart-drawer-count">
                        {itemCount}
                      </sup>
                    )}
                  </h2>
                  <span className={styles.headerMuted}>Vistos recientemente</span>
                </div>

                <motion.button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeDrawer}
                  className={styles.closeButton}
                  aria-label="Cerrar carrito"
                  data-testid="cart-drawer-close"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <X size={20} aria-hidden="true" />
                </motion.button>
              </header>

              {lastError && (
                <div
                  className={styles.errorAlert}
                  role="alert"
                  data-testid="cart-drawer-error-alert"
                >
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{lastError}</span>
                </div>
              )}

              <div className={styles.body}>
                {status === "LOADING" && (
                  <div
                    className={styles.loadingState}
                    aria-busy="true"
                    data-testid="cart-drawer-loading"
                  >
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLine} />
                    <p className={styles.loadingText}>Cargando carrito...</p>
                  </div>
                )}

                {status === "PROFILE_REQUIRED" && (
                  <div
                    className={styles.profileRequiredState}
                    data-testid="cart-profile-required-state"
                  >
                    <AlertCircle
                      size={32}
                      className={styles.profileRequiredIcon}
                      aria-hidden="true"
                    />
                    <h3 className={styles.profileRequiredTitle}>Completa tu perfil</h3>
                    <p className={styles.profileRequiredText}>
                      Debes completar tu perfil de cliente para poder utilizar el carrito de
                      compras.
                    </p>
                    <Link
                      href="/auth/completar-perfil"
                      onClick={closeDrawer}
                      className={styles.profileActionLink}
                      data-testid="cart-complete-profile-link"
                    >
                      Completar perfil
                    </Link>
                  </div>
                )}

                {status === "ERROR" && (
                  <div className={styles.errorState} data-testid="cart-drawer-error-state">
                    <AlertCircle size={32} className={styles.errorIcon} aria-hidden="true" />
                    <h3 className={styles.errorTitle}>Error al cargar el carrito</h3>
                    <p className={styles.errorText}>
                      No pudimos recuperar tu carrito en este momento.
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => retryBootstrap()}
                      data-testid="cart-retry-button"
                    >
                      <RefreshCw size={14} aria-hidden="true" style={{ marginRight: "6px" }} />
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
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>Algunos productos en tu carrito ya no están disponibles.</span>
                      </div>
                    )}

                    <AnimatePresence initial={false} mode="popLayout">
                      {lines.map((line) => (
                        <motion.div
                          key={line.variantId}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className={styles.lineRow}
                        >
                          <CartLine
                            line={line}
                            onUpdateQuantity={(qty) => updateQuantity(line.variantId, qty)}
                            onRemove={() => removeItem(line.variantId)}
                            disabled={isMutating || pendingVariantIds.has(line.variantId)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {status === "READY" && lines.length > 0 && snapshot && (
                <footer className={styles.footer} data-testid="cart-drawer-footer">
                  <div className={styles.utilityTabs} role="group" aria-label="Opciones del pedido">
                    {UTILITY_TABS.map((tab) => {
                      const TabIcon = tab.icon;
                      const isOpen = openTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setOpenTab(isOpen ? null : tab.id)}
                          className={`${styles.utilityTab} ${isOpen ? styles.utilityTabActive : ""}`}
                          aria-expanded={isOpen}
                          data-testid={`cart-utility-${tab.id}`}
                        >
                          <TabIcon size={15} aria-hidden="true" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false}>
                    {openTab && (
                      <motion.div
                        key={openTab}
                        className={styles.utilityPanel}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {openTab === "note" && (
                          <label className={styles.utilityField}>
                            <span className={styles.utilityLabel}>
                              Instrucciones para tu pedido
                            </span>
                            <textarea
                              value={orderNote}
                              onChange={(event) => setOrderNote(event.target.value)}
                              rows={3}
                              className={styles.utilityTextarea}
                              placeholder="Referencia de entrega, horario preferido..."
                              data-testid="cart-order-note"
                            />
                          </label>
                        )}

                        {openTab === "shipping" && (
                          <p className={styles.utilityNote}>
                            El costo de envío se calcula al finalizar la compra, según tu dirección.
                          </p>
                        )}

                        {openTab === "discount" && (
                          <p className={styles.utilityNote}>
                            Los códigos de descuento se aplican en el checkout.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={styles.subtotalRow}>
                    <p className={styles.taxNote}>
                      Impuestos incluidos. El envío se calcula al finalizar la compra.
                    </p>
                    <div className={styles.subtotalGroup}>
                      <span className={styles.subtotalLabel}>Subtotal</span>
                      <span className={styles.subtotalValue} data-testid="cart-subtotal-value">
                        {formatCurrency(snapshot.subtotalCents)}
                      </span>
                    </div>
                  </div>

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
                    <Link
                      href="/checkout"
                      onClick={closeDrawer}
                      className={styles.checkoutDrawerButton}
                      data-testid="cart-drawer-checkout-button"
                    >
                      <Lock size={15} aria-hidden="true" />
                      <span>Finalizar compra</span>
                    </Link>
                  </motion.div>

                  <Link
                    href="/carrito"
                    onClick={closeDrawer}
                    className={styles.viewCartButton}
                    data-testid="cart-view-full-page"
                  >
                    Ver carrito
                  </Link>
                </footer>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </dialog>
  );
}
