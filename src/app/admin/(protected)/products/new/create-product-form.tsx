"use client";

import React, { useState, useRef } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createProductAction } from "@/lib/admin/catalog/actions";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import type { BrandReference, CategoryReference } from "@/lib/admin/catalog/types";
import styles from "./new-product.module.css";

interface CreateProductFormProps {
  brands: BrandReference[];
  categories: CategoryReference[];
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Only what a product needs to exist. It is created as a draft and opens in the editor,
 * where photos, colors and prices, specifications and the web autofill take over.
 */
export function CreateProductForm({ brands, categories }: CreateProductFormProps) {
  const router = useRouter();
  const mutationTracker = useRef(new MutationRequestTracker());

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!slugManuallyEdited) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      brandId,
      categoryId,
      subtitle: null,
      description: null,
      isFeatured: false,
    };

    const mutationRequestId = mutationTracker.current.getRequestId(payload);

    try {
      const result = await createProductAction({
        ...payload,
        mutationRequestId,
      });

      // Definitive structured response completes attempt
      mutationTracker.current.complete();

      if (result.success && result.data?.product) {
        router.push(`/admin/products/${result.data.product.id}`);
      } else {
        setErrorMessage(result.error ?? "No se pudo crear el producto.");
        setIsSubmitting(false);
      }
    } catch {
      // Transport exception: tracker keeps active ID for retry with same payload
      setErrorMessage("Error de conexión al enviar la solicitud. Puedes reintentar.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form} data-testid="form-create-product">
      {errorMessage && (
        <div className={styles.alertError} data-testid="form-error" role="alert">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} aria-hidden="true" />
            <strong>No se pudo crear el producto</strong>
          </div>
          <p style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.field}>
          <label htmlFor="name" className={styles.label}>
            Nombre o modelo <span className={styles.required}>*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={handleNameChange}
            placeholder="Ej: WLmouse Beast X Mini"
            className={styles.input}
            data-testid="input-name"
          />
          <p className={styles.helpText}>
            Escribe el modelo exacto: en el editor puedes buscar sus datos en la web.
          </p>
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="brandId" className={styles.label}>
              Marca <span className={styles.required}>*</span>
            </label>
            <select
              id="brandId"
              required
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={styles.select}
              data-testid="select-brand"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="categoryId" className={styles.label}>
              Categoría <span className={styles.required}>*</span>
            </label>
            <select
              id="categoryId"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={styles.select}
              data-testid="select-category"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details className={styles.slugDetails}>
          <summary>gamerperu.com/productos/{slug || "…"}</summary>
          <div className={styles.field}>
            <label htmlFor="slug" className={styles.label}>
              Dirección en la tienda
            </label>
            <input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={handleSlugChange}
              className={styles.input}
              data-testid="input-slug"
            />
            <p className={styles.helpText}>Solo minúsculas, números y guiones.</p>
          </div>
        </details>
      </div>

      <div className={styles.actions}>
        <Link href="/admin/products" className={styles.cancelButton} data-testid="btn-cancel">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isSubmitting || !slug}
          className={styles.submitButton}
          data-testid="btn-submit-product"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Creando...</span>
            </>
          ) : (
            <span>Crear y continuar</span>
          )}
        </button>
      </div>
    </form>
  );
}
