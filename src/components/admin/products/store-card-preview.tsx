"use client";

import React from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { parsePenInputToCents } from "@/lib/admin/catalog/money";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./store-card-preview.module.css";

export function StoreCardPreview({
  name,
  brand,
  variant,
  imageUrl,
  price,
  compareAt,
  status,
}: {
  name: string;
  brand?: string;
  variant?: string;
  imageUrl?: string | null;
  price: string;
  compareAt: string;
  status?: string;
}) {
  const parsed = parsePenInputToCents(price, "price_cents");
  const before = parsePenInputToCents(compareAt, "compare_at_price_cents");
  const cents = parsed.success ? parsed.cents : null;
  const previous = before.success ? before.cents : null;
  const discounted = cents !== null && previous !== null && previous > cents;
  const discount = discounted ? Math.round((1 - cents / previous) * 100) : 0;
  return (
    <figure
      className={styles.preview}
      aria-label="Vista previa del producto"
      data-testid="store-card-preview"
    >
      <div className={styles.photo}>
        {imageUrl ? (
          <Image src={imageUrl} alt={name} width={420} height={420} unoptimized />
        ) : (
          <ImageIcon size={48} aria-hidden="true" />
        )}
        {discount > 0 && <span className={styles.discount}>−{discount}%</span>}
      </div>
      <figcaption className={styles.caption}>
        {brand && <small>{brand}</small>}
        <strong>{name || "Nombre del producto"}</strong>
        {variant && <span className={styles.variant}>{variant}</span>}
        <div className={styles.prices}>
          <b className={discounted ? styles.sale : undefined}>
            {cents !== null ? formatCurrency(cents) : "Completa el precio"}
          </b>
          {discounted && <s>{formatCurrency(previous)}</s>}
        </div>
        {status && <span className={styles.status}>{status}</span>}
      </figcaption>
    </figure>
  );
}
