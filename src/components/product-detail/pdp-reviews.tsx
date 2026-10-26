import React from "react";
import type { PublicReview, ReviewSummary } from "@/lib/reviews/types";
import { PdpReviewForm } from "./pdp-review-form";
import styles from "./pdp-reviews.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});

function Stars({ rating, label }: { rating: number; label?: string }) {
  const filled = Math.round(rating);
  return (
    <span className={styles.stars} role="img" aria-label={label ?? `${rating} de 5 estrellas`}>
      <span aria-hidden="true">
        {"★".repeat(filled)}
        <span className={styles.starsEmpty}>{"★".repeat(5 - filled)}</span>
      </span>
    </span>
  );
}

export interface PdpReviewsProps {
  productId: string;
  productName: string;
  reviews: PublicReview[];
  summary: ReviewSummary;
}

/**
 * "Opiniones": the rating of approved reviews, the newest of them, and the form for verified
 * buyers. Below the complementary products, as the reasons other customers give.
 */
export function PdpReviews({
  productId,
  productName,
  reviews,
  summary,
}: PdpReviewsProps): React.JSX.Element {
  return (
    <section className={styles.section} id="opiniones" aria-labelledby="pdp-reviews-title">
      <h2 id="pdp-reviews-title" className={styles.title}>
        Opiniones
      </h2>

      <div className={styles.layout}>
        <div className={styles.summary}>
          {summary.count > 0 && summary.average !== null ? (
            <>
              <p className={styles.average}>{summary.average.toFixed(1)}</p>
              <Stars
                rating={summary.average}
                label={`${summary.average.toFixed(1)} de 5 estrellas`}
              />
              <p className={styles.count}>
                {summary.count} {summary.count === 1 ? "opinión" : "opiniones"} de compradores
              </p>
              <ul className={styles.bars} aria-label="Opiniones por estrellas">
                {[5, 4, 3, 2, 1].map((star) => {
                  const value = summary.distribution[star - 1] ?? 0;
                  return (
                    <li key={star} className={styles.barRow}>
                      <span>{star} ★</span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{ width: `${(value / summary.count) * 100}%` }}
                        />
                      </span>
                      <span className={styles.barValue}>{value}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className={styles.empty}>
              Todavía no hay opiniones de {productName}. Si ya lo recibiste, cuéntanos qué tal.
            </p>
          )}

          <PdpReviewForm productId={productId} />
        </div>

        {reviews.length > 0 && (
          <ol className={styles.list}>
            {reviews.map((review) => (
              <li key={review.id} className={styles.review}>
                <div className={styles.reviewHeader}>
                  <Stars rating={review.rating} />
                  <span className={styles.verified}>Compra verificada</span>
                </div>
                {review.title && <h3 className={styles.reviewTitle}>{review.title}</h3>}
                <p className={styles.reviewBody}>{review.body}</p>
                <p className={styles.reviewMeta}>
                  {review.authorName} ·{" "}
                  <time dateTime={review.createdAt}>
                    {DATE_FORMAT.format(new Date(review.createdAt))}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
