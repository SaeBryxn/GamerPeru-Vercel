"use client";

import { ReviewPhotos } from "@/components/product-detail/review-photos";
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/app-link";
import { StatusBadge } from "@/components/admin/ui";
import { moderateReviewAction } from "@/lib/admin/reviews/actions";
import type { AdminReviewRow } from "@/lib/admin/reviews/reader";
import styles from "./resenas.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Lima",
});

export function ReviewQueue({ reviews }: { reviews: AdminReviewRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = (reviewId: string, decision: "APPROVED" | "REJECTED") => {
    setBusyId(reviewId);
    setError(null);
    startTransition(async () => {
      const result = await moderateReviewAction({ reviewId, decision });
      setBusyId(null);
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar la decisión.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {reviews.map((review) => {
          const busy = isPending && busyId === review.id;
          return (
            <li key={review.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <Link href={`/productos/${review.product.slug}`} className={styles.product}>
                  {review.product.name}
                </Link>
                <span className={styles.stars} aria-label={`${review.rating} de 5 estrellas`}>
                  {"★".repeat(review.rating)}
                  <span className={styles.starsEmpty}>{"★".repeat(5 - review.rating)}</span>
                </span>
              </div>
              {review.title && <p className={styles.reviewTitle}>{review.title}</p>}
              <p className={styles.body}>{review.body}</p>
              <ReviewPhotos photos={review.photos ?? []} productName={review.product.name} />
              <div className={styles.meta}>
                <span>
                  {review.authorName} · {DATE_FORMAT.format(new Date(review.createdAt))}
                </span>
                {review.verifiedPurchase && (
                  <StatusBadge tone="success">Compra verificada</StatusBadge>
                )}
              </div>
              <div className={styles.actions}>
                {review.status !== "APPROVED" && (
                  <button
                    type="button"
                    className={styles.approve}
                    disabled={busy}
                    onClick={() => decide(review.id, "APPROVED")}
                  >
                    Publicar
                  </button>
                )}
                {review.status !== "REJECTED" && (
                  <button
                    type="button"
                    className={styles.reject}
                    disabled={busy}
                    onClick={() => decide(review.id, "REJECTED")}
                  >
                    {review.status === "APPROVED" ? "Despublicar" : "Rechazar"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
