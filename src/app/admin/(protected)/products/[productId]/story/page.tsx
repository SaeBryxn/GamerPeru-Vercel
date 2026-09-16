import React from "react";
import { notFound } from "next/navigation";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getAdminProductStory } from "@/lib/admin/catalog/story-reader";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { StoryBuilder } from "./story-builder";

export const dynamic = "force-dynamic";

interface ProductStoryPageProps {
  params: Promise<{
    productId: string;
  }>;
}

export default async function ProductStoryPage({ params }: ProductStoryPageProps) {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const { productId } = await params;
  let story;
  try {
    story = await getAdminProductStory(productId, { authContext });
  } catch (error) {
    if (error instanceof CatalogDomainError && error.code === "PRODUCT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return <StoryBuilder initialStory={story} />;
}
