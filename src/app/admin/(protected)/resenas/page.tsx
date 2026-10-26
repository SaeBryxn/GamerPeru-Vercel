import React from "react";
import type { Metadata } from "next";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { EmptyState, SegmentedNav } from "@/components/admin/ui";
import type { ReviewStatus } from "@/db/schema";
import { listReviewsForAdmin } from "@/lib/admin/reviews/reader";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { ReviewQueue } from "./review-queue";
import styles from "./resenas.module.css";

export const metadata: Metadata = {
  title: "Reseñas | Administración",
};

export const dynamic = "force-dynamic";

const TABS: { status: ReviewStatus; label: string }[] = [
  { status: "PENDING", label: "Por revisar" },
  { status: "APPROVED", label: "Publicadas" },
  { status: "REJECTED", label: "Rechazadas" },
];

interface ReviewsPageProps {
  searchParams: Promise<{ estado?: string }>;
}

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const { estado } = await searchParams;
  const status = TABS.find((tab) => tab.status.toLowerCase() === estado)?.status ?? "PENDING";
  const reviews = await listReviewsForAdmin(status);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Reseñas</h1>
          <p className={styles.caption}>
            Solo opinan quienes recibieron el producto. Nada se publica hasta que lo apruebes.
          </p>
        </div>
        <SegmentedNav
          label="Estado de las reseñas"
          options={TABS.map((tab) => ({
            href: `/admin/resenas?estado=${tab.status.toLowerCase()}`,
            label: tab.label,
            active: tab.status === status,
          }))}
        />
      </header>

      {reviews === null ? (
        <EmptyState title="Las reseñas todavía no están activadas">
          Falta aplicar la migración 0025_product_reviews en Supabase.
        </EmptyState>
      ) : reviews.length === 0 ? (
        <EmptyState title={status === "PENDING" ? "No hay reseñas por revisar" : "Sin reseñas"}>
          {status === "PENDING" ? "Cuando un comprador opine, aparecerá aquí." : null}
        </EmptyState>
      ) : (
        <ReviewQueue reviews={reviews} />
      )}
    </div>
  );
}
