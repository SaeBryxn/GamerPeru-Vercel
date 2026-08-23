"use client";

import React from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button, Icon } from "@/components/ui";
import styles from "./cart-empty-state.module.css";

export interface CartEmptyStateProps {
  onActionClick?: () => void;
  actionHref?: string;
  actionText?: string;
  className?: string;
}

export function CartEmptyState({
  onActionClick,
  actionHref = "/categorias/mouses",
  actionText = "Explorar catálogo",
  className,
}: CartEmptyStateProps): React.JSX.Element {
  return (
    <div
      className={[styles.emptyContainer, className].filter(Boolean).join(" ")}
      data-testid="cart-empty-state"
    >
      <div className={styles.iconCircle}>
        <Icon icon={ShoppingBag} size="xl" className={styles.icon} aria-hidden="true" />
      </div>

      <h2 className={styles.title}>Tu carrito está vacío</h2>

      <p className={styles.description}>
        No tienes productos agregados actualmente. Explora nuestras categorías y encuentra el
        equipamiento gamer ideal.
      </p>

      {actionHref.startsWith("/") ? (
        <Link
          href={actionHref}
          onClick={onActionClick}
          className={styles.actionLink}
          data-testid="cart-empty-action-link"
        >
          {actionText}
        </Link>
      ) : (
        <Button variant="primary" onClick={onActionClick}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
