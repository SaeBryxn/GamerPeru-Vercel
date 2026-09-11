"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createProductAction } from "@/lib/admin/catalog/actions";
import type { BrandReference, CategoryReference } from "@/lib/admin/catalog/types";
import styles from "./new-product.module.css";

interface CreateProductFormProps {
  brands: BrandReference[];
  categories: CategoryReference[];
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CreateProductForm({ brands, categories }: CreateProductFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);

  // Initial Variant fields (raw strings for currency)
  const [sku, setSku] = useState("");
  const [variantTitle, setVariantTitle] = useState("Estándar");
  const [pricePen, setPricePen] = useState("");
  const [compareAtPricePen, setCompareAtPricePen] = useState("");
  const [costPen, setCostPen] = useState("");
  const [weightGrams, setWeightGrams] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

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
    setErrorCode(null);

    const mutationRequestId = crypto.randomUUID();

    const result = await createProductAction({
      name: name.trim(),
      slug: slug.trim(),
      brandId,
      categoryId,
      subtitle: subtitle.trim() ? subtitle.trim() : null,
      description: description.trim() ? description.trim() : null,
      isFeatured,
      initialVariant: sku.trim()
        ? {
            sku: sku.trim().toUpperCase(),
            title: variantTitle.trim() ? variantTitle.trim() : "Estándar",
            pricePen: pricePen.trim(),
            compareAtPricePen: compareAtPricePen.trim() ? compareAtPricePen.trim() : null,
            costPen: costPen.trim() ? costPen.trim() : null,
            weightGrams: weightGrams ? parseInt(weightGrams, 10) : null,
          }
        : undefined,
      mutationRequestId,
    });

    if (result.success && result.data?.product) {
      router.push(`/admin/products/${result.data.product.id}`);
    } else {
      setErrorMessage(result.error ?? "No se pudo crear el producto.");
      setErrorCode(result.code ?? null);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form} data-testid="form-create-product">
      {errorMessage && (
        <div className={styles.alertError} data-testid="form-error" role="alert">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={18} aria-hidden="true" />
            <strong>Error al crear el producto:</strong>
          </div>
          <p style={{ margin: 0 }}>{errorMessage}</p>
          {errorCode && <span className={styles.errorCode}>Código: {errorCode}</span>}
        </div>
      )}

      {/* Main Details Card */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Información General</h2>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="name" className={styles.label}>
              Nombre del Producto <span className={styles.required}>*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="Ej: Mouse Gamer Inalámbrico WLmouse Beast X"
              className={styles.input}
              data-testid="input-name"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="slug" className={styles.label}>
              Slug URL <span className={styles.required}>*</span>
            </label>
            <input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={handleSlugChange}
              placeholder="ej: mouse-gamer-wlmouse-beast-x"
              className={styles.input}
              data-testid="input-slug"
            />
            <p className={styles.helpText}>
              Identificador URL único (3 a 200 caracteres en minúsculas y guiones).
            </p>
          </div>
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

        <div className={styles.field}>
          <label htmlFor="subtitle" className={styles.label}>
            Subtítulo (Opcional)
          </label>
          <input
            id="subtitle"
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Ej: Sensor PAW3395 de 26,000 DPI con estructura de magnesio ultraligera"
            className={styles.input}
            data-testid="input-subtitle"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="description" className={styles.label}>
            Descripción Detallada
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción completa del producto para la tienda y optimización de motores de búsqueda..."
            className={styles.textarea}
            data-testid="input-description"
          />
        </div>

        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
            className={styles.checkbox}
            data-testid="checkbox-featured"
          />
          <span className={styles.checkboxLabel}>Destacar en la página de inicio (isFeatured)</span>
        </label>
      </div>

      {/* Initial Variant Card */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Variante Inicial</h2>
        <p className={styles.cardDescription}>
          Crea la variante predeterminada del producto (SKU, precios en Soles y peso).
        </p>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="sku" className={styles.label}>
              SKU <span className={styles.required}>*</span>
            </label>
            <input
              id="sku"
              type="text"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="Ej: WLM-BX-BLK"
              className={styles.input}
              data-testid="input-variant-sku"
            />
            <p className={styles.helpText}>
              Código único e inmutable para control de stock y pedidos.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="variantTitle" className={styles.label}>
              Nombre de la Variante <span className={styles.required}>*</span>
            </label>
            <input
              id="variantTitle"
              type="text"
              required
              value={variantTitle}
              onChange={(e) => setVariantTitle(e.target.value)}
              placeholder="Ej: Estándar / Negro"
              className={styles.input}
              data-testid="input-variant-title"
            />
          </div>
        </div>

        <div className={styles.grid3}>
          <div className={styles.field}>
            <label htmlFor="pricePen" className={styles.label}>
              Precio de Venta (PEN) <span className={styles.required}>*</span>
            </label>
            <input
              id="pricePen"
              type="text"
              inputMode="decimal"
              required
              value={pricePen}
              onChange={(e) => setPricePen(e.target.value)}
              placeholder="129.90"
              className={styles.input}
              data-testid="input-variant-price"
            />
            <p className={styles.helpText}>Formato: 129.90 (Soles)</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="compareAtPricePen" className={styles.label}>
              Precio Tachado (PEN)
            </label>
            <input
              id="compareAtPricePen"
              type="text"
              inputMode="decimal"
              value={compareAtPricePen}
              onChange={(e) => setCompareAtPricePen(e.target.value)}
              placeholder="149.90"
              className={styles.input}
              data-testid="input-variant-compare-at"
            />
            <p className={styles.helpText}>Precio original de comparación.</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="costPen" className={styles.label}>
              Costo Unitario (PEN)
            </label>
            <input
              id="costPen"
              type="text"
              inputMode="decimal"
              value={costPen}
              onChange={(e) => setCostPen(e.target.value)}
              placeholder="75.00"
              className={styles.input}
              data-testid="input-variant-cost"
            />
            <p className={styles.helpText}>Costo confidencial interno.</p>
          </div>
        </div>

        <div className={styles.field} style={{ maxWidth: 280 }}>
          <label htmlFor="weightGrams" className={styles.label}>
            Peso (gramos)
          </label>
          <input
            id="weightGrams"
            type="number"
            min="0"
            step="1"
            value={weightGrams}
            onChange={(e) => setWeightGrams(e.target.value)}
            placeholder="Ej: 39"
            className={styles.input}
            data-testid="input-variant-weight"
          />
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Link href="/admin/products" className={styles.cancelButton} data-testid="btn-cancel">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.submitButton}
          data-testid="btn-submit-product"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Guardando...</span>
            </>
          ) : (
            <span>Crear Producto</span>
          )}
        </button>
      </div>
    </form>
  );
}
