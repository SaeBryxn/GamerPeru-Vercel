import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getPublishedBrands, getPublishedCategories } from "@/lib/admin/catalog/readers";
import { CreateProductForm } from "./create-product-form";
import styles from "./new-product.module.css";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const [brands, categories] = await Promise.all([
    getPublishedBrands({ authContext }),
    getPublishedCategories({ authContext }),
  ]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/admin/products" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver a productos</span>
        </Link>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Nuevo producto</h1>
          <p className={styles.subtitle}>
            Empieza con lo básico. Fotos, colores, precios y lo demás los completas en el editor.
          </p>
        </div>
      </header>

      <CreateProductForm brands={brands} categories={categories} />
    </div>
  );
}
