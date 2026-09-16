import React from "react";
import { notFound } from "next/navigation";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import {
  getAdminProductDetail,
  getPublishedBrands,
  getPublishedCategories,
} from "@/lib/admin/catalog/readers";
import { getAdminProductStory } from "@/lib/admin/catalog/story-reader";
import { sanitizeProductDetailForUi } from "@/lib/admin/catalog/ui-dto";
import { ProductEditor } from "./product-editor";

export const dynamic = "force-dynamic";

interface ProductDetailPageProps {
  params: Promise<{
    productId: string;
  }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const resolvedParams = await params;
  const productId = resolvedParams.productId;

  const [detail, brands, categories] = await Promise.all([
    getAdminProductDetail(productId, { authContext }),
    getPublishedBrands({ authContext }),
    getPublishedCategories({ authContext }),
  ]);

  if (!detail) {
    notFound();
  }

  const story = await getAdminProductStory(productId, { authContext });
  const sanitizedDetail = sanitizeProductDetailForUi(detail);

  return (
    <ProductEditor
      key={sanitizedDetail.product.id}
      initialDetail={sanitizedDetail}
      brands={brands}
      categories={categories}
      actorPermissions={Array.from(authContext.permissions)}
      storySummary={{
        lifecycle: story.lifecycle,
        draftRevisionNumber: story.draft?.revisionNumber ?? null,
        publishedRevisionNumber: story.published?.revisionNumber ?? null,
        publishedAt: story.published?.publishedAt ?? null,
      }}
    />
  );
}
