"use client";
import React from "react";
import Image from "next/image";
import Link from "@/components/app-link";
import { Package } from "lucide-react";
import type { CheckoutCartItemDTO } from "@/lib/checkout/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./checkout-page-client.module.css";

export function CheckoutItems({ items }: { items: CheckoutCartItemDTO[] }) {
  return (
    <div className={styles.itemsList}>
      {items.map((item) => {
        const image = item.primaryMedia && resolvePublicMediaUrl(item.primaryMedia.objectKey);
        const variant =
          item.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
            ? Object.values(item.attributes)
                .filter((value) => typeof value === "string" || typeof value === "number")
                .join(" / ")
            : "";
        return (
          <div
            key={item.variantId}
            className={styles.itemRow}
            data-testid={`checkout-item-${item.sku}`}
          >
            <span className={styles.itemPhoto}>
              {image ? (
                <Image src={image} width={64} height={64} alt="" />
              ) : (
                <Package size={24} aria-hidden="true" />
              )}
            </span>
            <div className={styles.itemDetails}>
              <Link href={`/productos/${item.productSlug}`} className={styles.itemName}>
                {item.productName}
              </Link>
              {variant && <span className={styles.itemMeta}>{variant}</span>}
              <span className={styles.itemMeta}>
                Cantidad {item.quantity} · {formatCurrency(item.priceCents)} c/u
              </span>
            </div>
            <span className={styles.itemPrice}>{formatCurrency(item.lineTotalCents)}</span>
          </div>
        );
      })}
    </div>
  );
}
