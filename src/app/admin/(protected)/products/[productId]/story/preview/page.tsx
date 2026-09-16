import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, FileText } from "lucide-react";
import { z } from "zod";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getAdminProductStoryPreview } from "@/lib/admin/catalog/story-reader";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { ProductStoryRenderer } from "@/components/product-story";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateMetadata(): Metadata {
  return {
    title: "Vista previa privada de historia | Admin | Gamer Perú",
    robots: {
      index: false,
      follow: false,
    },
  };
}

interface ProductStoryPreviewPageProps {
  params: Promise<{
    productId: string;
  }>;
  searchParams: Promise<{
    revision?: string;
  }>;
}

export default async function ProductStoryPreviewPage({
  params,
  searchParams,
}: ProductStoryPreviewPageProps) {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const { productId } = await params;
  const { revision } = await searchParams;

  if (!productId || !z.string().uuid().safeParse(productId).success) {
    notFound();
  }

  if (revision && !z.string().uuid().safeParse(revision).success) {
    notFound();
  }

  let preview;
  try {
    preview = await getAdminProductStoryPreview(productId, revision ?? null, { authContext });
  } catch (error) {
    if (error instanceof CatalogDomainError) {
      notFound();
    }
    throw error;
  }

  const builderHref = `/admin/products/${productId}/story`;

  return (
    <div className={styles.previewContainer} data-testid="story-preview-page">
      <header className={styles.adminBar} data-testid="preview-banner">
        <div className={styles.adminBarInner}>
          <div className={styles.adminBarLeft}>
            <Link href={builderHref} className={styles.backLink} data-testid="story-preview-back">
              <ArrowLeft size={16} aria-hidden="true" />
              Volver al editor de historia
            </Link>
            <div className={styles.badgeRow}>
              <span className={styles.privateBadge} data-testid="story-preview-badge">
                <Eye size={14} aria-hidden="true" />
                Vista previa privada
              </span>
              <span className={styles.unpublishedBadge}>No publicada</span>
            </div>
          </div>
          <div className={styles.adminBarRight}>
            <h1 className={styles.productTitle}>
              {preview.product.name}
              <span className={styles.productSlug}>/{preview.product.slug}</span>
            </h1>
            <p className={styles.revisionInfo}>
              Mostrando borrador guardado{" "}
              <strong data-testid="story-preview-revision">r{preview.draft.revisionNumber}</strong>
            </p>
          </div>
        </div>
      </header>

      <main className={styles.contentRegion}>
        {preview.isEmpty ? (
          <div className={styles.emptyState} data-testid="preview-empty-state">
            <FileText size={40} aria-hidden="true" />
            <h2>El borrador guardado está vacío</h2>
            <p>
              Esta revisión no contiene bloques de historia estructurados. Agrega y guarda bloques
              en el editor para previsualizarlos aquí.
            </p>
            <Link href={builderHref} className={styles.editorLink}>
              Ir al editor de historia
            </Link>
          </div>
        ) : (
          <div className={styles.rendererWrapper}>
            <ProductStoryRenderer
              story={{ blocks: preview.validatedBlocks }}
              currentProductId={preview.product.id}
              productName={preview.product.name}
              relatedProductsMap={preview.relatedProductsMap}
            />
          </div>
        )}
      </main>
    </div>
  );
}
