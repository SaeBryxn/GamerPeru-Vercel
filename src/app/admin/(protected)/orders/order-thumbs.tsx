import { Package } from "lucide-react";
import type { AdminOrderItemPreview } from "@/lib/admin/orders/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./orders.module.css";

/** Overlapping product photos for an order, with "+N" for the lines not shown. */
export function OrderThumbs({
  items,
  lineCount,
}: {
  items: AdminOrderItemPreview[];
  lineCount: number;
}) {
  const hidden = Math.max(0, lineCount - items.length);
  const names = items.map((item) => item.productName).join(", ");

  return (
    <span className={styles.thumbStack} title={names || undefined}>
      {items.length === 0 ? (
        <span className={styles.thumb} aria-hidden="true">
          <Package size={16} />
        </span>
      ) : (
        items.map((item, index) => {
          const url = resolvePublicMediaUrl(item.imageObjectKey);
          return (
            <span key={`${item.productName}-${index}`} className={styles.thumb}>
              {url ? (
                // Admin thumbnails are tiny and many; next/image would add a Worker transform each.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={item.productName} width={36} height={36} loading="lazy" />
              ) : (
                <Package size={16} aria-label={item.productName} />
              )}
            </span>
          );
        })
      )}
      {hidden > 0 && (
        <span className={`${styles.thumb} ${styles.thumbMore}`} aria-label={`${hidden} más`}>
          +{hidden}
        </span>
      )}
    </span>
  );
}
