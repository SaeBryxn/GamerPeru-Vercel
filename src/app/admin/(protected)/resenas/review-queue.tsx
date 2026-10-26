"use client";

import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import { ImageIcon, MessageSquare, ArrowRight } from "lucide-react";
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
  const [selected, setSelected] = useState<AdminReviewRow | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = (reviewId: string, decision: "APPROVED" | "REJECTED") => {
    setBusyId(reviewId);
    setError(null);
    startTransition(async () => {
      try {
        const result = await moderateReviewAction({ reviewId, decision });
        if (!result.success) {
          setError(result.error ?? "No se pudo guardar la decisión.");
          return;
        }
        setSelected(null);
        setNotice(decision === "APPROVED" ? "Reseña publicada." : "Reseña retirada de la tienda.");
        router.refresh();
      } catch {
        setError("No se pudo confirmar la decisión. Vuelve a intentar.");
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <>
      {!selected && error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.caption} role="status">
        {notice}
      </p>
      <ul className={styles.list}>
        {reviews.map((review) => {
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
              <p className={`${styles.body} ${styles.excerpt}`}>{review.body}</p>
              <div className={styles.meta}>
                <span>
                  {review.authorName} · {DATE_FORMAT.format(new Date(review.createdAt))}
                </span>
                {review.verifiedPurchase && (
                  <StatusBadge tone="success">Compra verificada</StatusBadge>
                )}
              </div>
              <div className={styles.queueFooter}>
                <span className={styles.photoCount}>
                  <ImageIcon size={14} aria-hidden="true" />
                  {review.photos?.length ?? 0} fotos
                </span>
                <button
                  type="button"
                  className={styles.reject}
                  onClick={() => {
                    setSelected(review);
                    setPhotoIndex(0);
                    setError(null);
                  }}
                  aria-label={`Revisar reseña de ${review.authorName} sobre ${review.product.name}`}
                >
                  Revisar reseña <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {selected && (
          <SideDrawer
            labelledBy="review-drawer-title"
            onClose={() => setSelected(null)}
            busy={isPending}
            size="wide"
            testId="review-drawer"
          >
            <DrawerHeader
              titleId="review-drawer-title"
              title={selected.product.name}
              eyebrow="Reseñas · revisar publicación"
              onClose={() => setSelected(null)}
              busy={isPending}
            />
            <div className={styles.drawerBody}>
              <aside className={styles.purchasePhotos}>
                <h3>Fotos de la compra</h3>
                {selected.photos?.length ? (
                  <>
                    <div className={styles.largePhoto}>
                      <Image
                        src={selected.photos[photoIndex]!.url}
                        alt={`Foto ${photoIndex + 1} de ${selected.product.name} enviada por el comprador`}
                        width={600}
                        height={600}
                        unoptimized
                      />
                    </div>
                    <div className={styles.photoStrip}>
                      {selected.photos.map((photo, i) => (
                        <button
                          type="button"
                          key={photo.id}
                          aria-label={`Ver foto ${i + 1}`}
                          aria-pressed={photoIndex === i}
                          onClick={() => setPhotoIndex(i)}
                        >
                          <Image src={photo.url} alt="" width={72} height={72} unoptimized />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.noPhotos}>
                    <MessageSquare size={36} aria-hidden="true" />
                    <p>El comprador no adjuntó fotos.</p>
                  </div>
                )}
                <Link
                  href={`/productos/${selected.product.slug}`}
                  className={styles.product}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver producto en la tienda ↗
                </Link>
              </aside>
              <div className={styles.reviewPane}>
                <p className={styles.previewLabel}>Vista previa de la opinión</p>
                <article className={styles.reviewPreview}>
                  <div className={styles.cardHeader}>
                    <strong>{selected.authorName}</strong>
                    <span className={styles.stars} aria-label={`${selected.rating} de 5 estrellas`}>
                      {"★".repeat(selected.rating)}
                      <span className={styles.starsEmpty}>{"★".repeat(5 - selected.rating)}</span>
                    </span>
                  </div>
                  <p className={styles.caption}>
                    {DATE_FORMAT.format(new Date(selected.createdAt))}
                  </p>
                  {selected.verifiedPurchase && (
                    <StatusBadge tone="success">Compra verificada</StatusBadge>
                  )}
                  {selected.title && <h3 className={styles.reviewTitle}>{selected.title}</h3>}
                  <p className={styles.body}>{selected.body}</p>
                </article>
                <div className={styles.moderationContext}>
                  <StatusBadge tone={selected.status === "APPROVED" ? "success" : "neutral"}>
                    {selected.status === "APPROVED"
                      ? "Publicada"
                      : selected.status === "REJECTED"
                        ? "Rechazada"
                        : "Pendiente de revisión"}
                  </StatusBadge>
                  <p>
                    Revisa el texto y las fotos antes de publicar. La opinión conserva las palabras
                    del comprador.
                  </p>
                </div>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </div>
            </div>
            <div className={styles.drawerFooter}>
              <span>
                {isPending && busyId === selected.id
                  ? "Guardando decisión…"
                  : "Publicar la hace visible en la ficha del producto."}
              </span>
              <div className={styles.actions}>
                {selected.status !== "REJECTED" && (
                  <button
                    type="button"
                    className={styles.reject}
                    disabled={isPending}
                    onClick={() => decide(selected.id, "REJECTED")}
                  >
                    {selected.status === "APPROVED" ? "Despublicar" : "Rechazar"}
                  </button>
                )}
                {selected.status !== "APPROVED" && (
                  <button
                    type="button"
                    className={styles.approve}
                    disabled={isPending}
                    onClick={() => decide(selected.id, "APPROVED")}
                  >
                    Publicar reseña
                  </button>
                )}
              </div>
            </div>
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}
