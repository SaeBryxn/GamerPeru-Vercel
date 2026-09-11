"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Edit2,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import {
  updateProductAction,
  createVariantAction,
  updateVariantAction,
  duplicateProductAction,
  transitionProductStatusAction,
} from "@/lib/admin/catalog/actions";
import { formatCentsToPenDisplay } from "@/lib/admin/catalog/money";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import type {
  AdminProductDetail,
  AdminProductDetailVariant,
  BrandReference,
  CategoryReference,
  CatalogStatus,
  VariantStatus,
} from "@/lib/admin/catalog/types";
import styles from "./product-editor.module.css";

interface ProductEditorProps {
  initialDetail: AdminProductDetail;
  brands: BrandReference[];
  categories: CategoryReference[];
  actorPermissions: string[];
}

function centsToInputString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function ProductEditor({
  initialDetail,
  brands,
  categories,
  actorPermissions,
}: ProductEditorProps) {
  const router = useRouter();

  const [detail, setDetail] = useState<AdminProductDetail>(initialDetail);
  useEffect(() => {
    setDetail(initialDetail);
  }, [initialDetail]);

  const {
    product,
    category,
    currentSpecSchema,
    specifications,
    variants,
    media,
    primaryMedia,
    publishReadiness,
  } = detail;

  const hasPublishPermission = actorPermissions.includes("catalog:publish");

  // General Details State
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [brandId, setBrandId] = useState(product.brandId);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [subtitle, setSubtitle] = useState(product.subtitle ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);

  // Specifications State
  const [specValues, setSpecValues] = useState<Record<string, unknown>>(() => {
    return (specifications?.specValues as Record<string, unknown>) ?? {};
  });

  // UI State
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingSpecs, setIsSavingSpecs] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);

  // Modals State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState(`${product.name} (Copia)`);
  const [duplicateSlug, setDuplicateSlug] = useState(`${product.slug}-copia`);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const [showCreateVariantModal, setShowCreateVariantModal] = useState(false);
  const [newVarSku, setNewVarSku] = useState("");
  const [newVarTitle, setNewVarTitle] = useState("");
  const [newVarPrice, setNewVarPrice] = useState("");
  const [newVarCompareAt, setNewVarCompareAt] = useState("");
  const [newVarCost, setNewVarCost] = useState("");
  const [newVarWeight, setNewVarWeight] = useState("");
  const [newVarStatus, setNewVarStatus] = useState<VariantStatus>("ACTIVE");
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);
  const [variantFormError, setVariantFormError] = useState<string | null>(null);

  const [editingVariant, setEditingVariant] = useState<AdminProductDetailVariant | null>(null);
  const [editVarSku, setEditVarSku] = useState("");
  const [editVarTitle, setEditVarTitle] = useState("");
  const [editVarPrice, setEditVarPrice] = useState("");
  const [editVarCompareAt, setEditVarCompareAt] = useState("");
  const [editVarCost, setEditVarCost] = useState("");
  const [editVarWeight, setEditVarWeight] = useState("");
  const [editVarStatus, setEditVarStatus] = useState<VariantStatus>("ACTIVE");
  const [isUpdatingVariant, setIsUpdatingVariant] = useState(false);
  const [editVariantError, setEditVariantError] = useState<string | null>(null);

  // --- Handlers ---

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDetails(true);
    setGeneralError(null);
    setGeneralSuccess(null);
    setStaleConflict(false);

    const res = await updateProductAction({
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      name: name.trim(),
      slug: slug.trim(),
      brandId,
      categoryId,
      subtitle: subtitle.trim() ? subtitle.trim() : null,
      description: description.trim() ? description.trim() : null,
      isFeatured,
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.product) {
      setDetail((prev) => ({
        ...prev,
        product: res.data!.product,
      }));
      setGeneralSuccess("Información general actualizada exitosamente.");
      router.refresh();
    } else {
      if (res.code === "STALE_WRITE_CONFLICT") {
        setStaleConflict(true);
      }
      setGeneralError(res.error ?? "No se pudo actualizar el producto.");
    }
    setIsSavingDetails(false);
  };

  const handleSaveSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSpecs(true);
    setGeneralError(null);
    setGeneralSuccess(null);
    setStaleConflict(false);

    // Clean spec values: remove empty strings / undefined
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(specValues)) {
      if (v !== "" && v !== null && v !== undefined) {
        cleaned[k] = v;
      }
    }

    const res = await updateProductAction({
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      specValues: cleaned,
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.product) {
      setDetail((prev) => ({
        ...prev,
        product: res.data!.product,
      }));
      setGeneralSuccess("Especificaciones técnicas guardadas exitosamente.");
      router.refresh();
    } else {
      if (res.code === "STALE_WRITE_CONFLICT") {
        setStaleConflict(true);
      }
      setGeneralError(res.error ?? "No se pudieron guardar las especificaciones.");
    }
    setIsSavingSpecs(false);
  };

  const handleTransitionStatus = async (targetStatus: CatalogStatus) => {
    setIsTransitioning(true);
    setGeneralError(null);
    setGeneralSuccess(null);
    setStaleConflict(false);

    const res = await transitionProductStatusAction({
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      targetStatus,
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.product) {
      setDetail((prev) => ({
        ...prev,
        product: res.data!.product,
      }));
      setGeneralSuccess(`Estado del producto actualizado a ${targetStatus}.`);
      router.refresh();
    } else {
      if (res.code === "STALE_WRITE_CONFLICT") {
        setStaleConflict(true);
      }
      setGeneralError(res.error ?? "No se pudo cambiar el estado del producto.");
    }
    setIsTransitioning(false);
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDuplicating(true);
    setGeneralError(null);

    const res = await duplicateProductAction({
      sourceProductId: product.id,
      options: {
        customName: duplicateName.trim() ? duplicateName.trim() : undefined,
        customSlug: duplicateSlug.trim() ? duplicateSlug.trim() : undefined,
      },
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.product) {
      router.push(`/admin/products/${res.data.product.id}`);
    } else {
      setGeneralError(res.error ?? "No se pudo duplicar el producto.");
      setIsDuplicating(false);
      setShowDuplicateModal(false);
    }
  };

  const handleOpenCreateVariant = () => {
    setNewVarSku("");
    setNewVarTitle("");
    setNewVarPrice("");
    setNewVarCompareAt("");
    setNewVarCost("");
    setNewVarWeight("");
    setNewVarStatus("ACTIVE");
    setVariantFormError(null);
    setShowCreateVariantModal(true);
  };

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingVariant(true);
    setVariantFormError(null);

    const res = await createVariantAction({
      productId: product.id,
      sku: newVarSku.trim().toUpperCase(),
      title: newVarTitle.trim(),
      pricePen: newVarPrice.trim(),
      compareAtPricePen: newVarCompareAt.trim() ? newVarCompareAt.trim() : null,
      costPen: newVarCost.trim() ? newVarCost.trim() : null,
      weightGrams: newVarWeight ? parseInt(newVarWeight, 10) : null,
      status: newVarStatus,
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.variant) {
      const createdVariant: AdminProductDetailVariant = {
        ...res.data.variant,
        isSkuImmutable: false,
      };
      setDetail((prev) => ({
        ...prev,
        variants: [...prev.variants, createdVariant],
      }));
      setShowCreateVariantModal(false);
      setGeneralSuccess("Variante creada exitosamente.");
      router.refresh();
    } else {
      setVariantFormError(res.error ?? "No se pudo crear la variante.");
    }
    setIsCreatingVariant(false);
  };

  const handleOpenEditVariant = (v: AdminProductDetailVariant) => {
    setEditingVariant(v);
    setEditVarSku(v.sku);
    setEditVarTitle(v.title);
    setEditVarPrice(centsToInputString(v.priceCents));
    setEditVarCompareAt(centsToInputString(v.compareAtPriceCents));
    setEditVarCost(centsToInputString(v.costCents));
    setEditVarWeight(v.weightGrams ? String(v.weightGrams) : "");
    setEditVarStatus(v.status);
    setEditVariantError(null);
  };

  const handleUpdateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVariant) return;

    setIsUpdatingVariant(true);
    setEditVariantError(null);

    const res = await updateVariantAction({
      productId: product.id,
      variantId: editingVariant.id,
      expectedUpdatedAt: new Date(editingVariant.updatedAt).toISOString(),
      sku: editVarSku.trim().toUpperCase(),
      title: editVarTitle.trim(),
      pricePen: editVarPrice.trim(),
      compareAtPricePen: editVarCompareAt.trim() ? editVarCompareAt.trim() : null,
      costPen: editVarCost.trim() ? editVarCost.trim() : null,
      weightGrams: editVarWeight ? parseInt(editVarWeight, 10) : null,
      status: editVarStatus,
      mutationRequestId: crypto.randomUUID(),
    });

    if (res.success && res.data?.variant) {
      setDetail((prev) => ({
        ...prev,
        variants: prev.variants.map((v) =>
          v.id === res.data!.variant.id
            ? { ...res.data!.variant, isSkuImmutable: v.isSkuImmutable }
            : v
        ),
      }));
      setEditingVariant(null);
      setGeneralSuccess("Variante actualizada exitosamente.");
      router.refresh();
    } else {
      if (res.code === "STALE_WRITE_CONFLICT") {
        setStaleConflict(true);
      }
      setEditVariantError(res.error ?? "No se pudo actualizar la variante.");
    }
    setIsUpdatingVariant(false);
  };

  const primaryThumbUrl =
    primaryMedia && primaryMedia.securityClass === "PUBLIC_MEDIA"
      ? resolvePublicMediaUrl(primaryMedia.objectKey)
      : null;

  return (
    <div className={styles.container}>
      {/* Top Bar / Breadcrumb */}
      <div className={styles.topBar}>
        <Link href="/admin/products" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver a Productos</span>
        </Link>
      </div>

      {/* Header with Title, Status & Primary Actions */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleWithBadge}>
            <h1 className={styles.title} data-testid="product-editor-title">
              {product.name}
            </h1>
            <span
              className={`${styles.badge} ${
                product.status === "PUBLISHED"
                  ? styles.badgePublished
                  : product.status === "ARCHIVED"
                    ? styles.badgeArchived
                    : styles.badgeDraft
              }`}
              data-testid="badge-product-status"
            >
              {product.status === "PUBLISHED"
                ? "Publicado"
                : product.status === "ARCHIVED"
                  ? "Archivado"
                  : "Borrador"}
            </span>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => setShowDuplicateModal(true)}
              className={styles.secondaryButton}
              data-testid="btn-duplicate-product"
              title="Duplicar producto maestro con variantes"
            >
              <Copy size={14} aria-hidden="true" />
              <span>Duplicar</span>
            </button>

            {/* Lifecycle Transitions */}
            {product.status === "DRAFT" && (
              <>
                <button
                  type="button"
                  disabled={
                    !publishReadiness.isPublishable || !hasPublishPermission || isTransitioning
                  }
                  onClick={() => handleTransitionStatus("PUBLISHED")}
                  className={styles.publishButton}
                  data-testid="btn-transition-publish"
                  title={
                    !hasPublishPermission
                      ? "Requiere permiso catalog:publish para publicar."
                      : !publishReadiness.isPublishable
                        ? "El producto tiene bloqueadores activos."
                        : "Publicar en la tienda"
                  }
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>Publicar</span>
                </button>
                <button
                  type="button"
                  disabled={isTransitioning}
                  onClick={() => handleTransitionStatus("ARCHIVED")}
                  className={styles.archiveButton}
                  data-testid="btn-transition-archive"
                >
                  <span>Archivar</span>
                </button>
              </>
            )}

            {product.status === "PUBLISHED" && (
              <button
                type="button"
                disabled={!hasPublishPermission || isTransitioning}
                onClick={() => handleTransitionStatus("ARCHIVED")}
                className={styles.archiveButton}
                data-testid="btn-transition-archive"
                title={
                  !hasPublishPermission
                    ? "Archivar un producto publicado requiere catalog:publish."
                    : "Archivar producto"
                }
              >
                <span>Archivar</span>
              </button>
            )}

            {product.status === "ARCHIVED" && (
              <button
                type="button"
                disabled={isTransitioning}
                onClick={() => handleTransitionStatus("DRAFT")}
                className={styles.secondaryButton}
                data-testid="btn-transition-restore"
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>Restaurar a Borrador</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Stale Write Conflict Alert */}
      {staleConflict && (
        <div className={styles.alertConflict} data-testid="alert-stale-write" role="alert">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>Conflicto de concurrencia:</strong>
          </div>
          <p style={{ margin: 0 }}>
            Este producto o variante cambió desde que abriste la página. Recarga la versión más
            reciente antes de guardar nuevamente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={styles.secondaryButton}
            style={{ width: "fit-content", marginTop: "0.25rem" }}
            data-testid="btn-reload-stale"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Recargar Página</span>
          </button>
        </div>
      )}

      {/* General Feedback Banners */}
      {generalError && (
        <div className={styles.alertError} data-testid="alert-general-error" role="alert">
          <p style={{ margin: 0 }}>{generalError}</p>
        </div>
      )}
      {generalSuccess && (
        <div className={styles.alertSuccess} data-testid="alert-general-success" role="status">
          <p style={{ margin: 0 }}>{generalSuccess}</p>
        </div>
      )}

      {/* Section: Publish Readiness */}
      <section
        className={`${styles.card} ${styles.readinessCard} ${
          publishReadiness.isPublishable ? styles.readinessCardReady : styles.readinessCardBlocked
        }`}
        aria-label="Estado de publicación"
        data-testid="section-publish-readiness"
      >
        <div className={styles.readinessStatusHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h2 className={styles.cardTitle}>Estado de Publicación</h2>
            <span
              className={`${styles.readinessBadge} ${
                publishReadiness.isPublishable
                  ? styles.readinessBadgeReady
                  : styles.readinessBadgeBlocked
              }`}
              data-testid="readiness-badge"
            >
              {publishReadiness.isPublishable ? (
                <>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>Listo para publicar</span>
                </>
              ) : (
                <>
                  <XCircle size={14} aria-hidden="true" />
                  <span>No publicable ({publishReadiness.blockers.length} bloqueadores)</span>
                </>
              )}
            </span>
          </div>

          {!hasPublishPermission && (
            <span className={styles.permissionNotice} data-testid="publish-permission-notice">
              <Lock size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
              Solo lectura de publicación (requiere permiso <code>catalog:publish</code>).
            </span>
          )}
        </div>

        {/* Blockers */}
        {publishReadiness.blockers.length > 0 && (
          <div className={styles.issuesList} data-testid="publish-blockers">
            <strong style={{ fontSize: "0.8125rem", color: "#991b1b" }}>Bloqueadores:</strong>
            {publishReadiness.blockers.map((b) => (
              <div key={b.code} className={styles.blockerItem} data-testid={`blocker-${b.code}`}>
                <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <div>
                  <span className={styles.issueCode}>[{b.code}]</span> {b.message}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {publishReadiness.warnings.length > 0 && (
          <div className={styles.issuesList} data-testid="publish-warnings">
            <strong style={{ fontSize: "0.8125rem", color: "#92400e" }}>Advertencias:</strong>
            {publishReadiness.warnings.map((w) => (
              <div key={w.code} className={styles.warningItem} data-testid={`warning-${w.code}`}>
                <AlertTriangle
                  size={14}
                  style={{ flexShrink: 0, marginTop: 2 }}
                  aria-hidden="true"
                />
                <div>
                  <span className={styles.issueCode}>[{w.code}]</span> {w.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section: General Details Form */}
      <section className={styles.card} aria-label="Información general">
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Información General</h2>
          <span className={styles.cardDescription}>
            Actualizado el {new Date(product.updatedAt).toLocaleString("es-PE")}
          </span>
        </div>

        <form
          onSubmit={handleSaveDetails}
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-name" className={styles.label}>
                Nombre del Producto <span className={styles.required}>*</span>
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={styles.input}
                data-testid="input-name"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit-slug" className={styles.label}>
                Slug URL <span className={styles.required}>*</span>
              </label>
              <input
                id="edit-slug"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={styles.input}
                data-testid="input-slug"
              />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-brand" className={styles.label}>
                Marca <span className={styles.required}>*</span>
              </label>
              <select
                id="edit-brand"
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
              <label htmlFor="edit-category" className={styles.label}>
                Categoría <span className={styles.required}>*</span>
              </label>
              <select
                id="edit-category"
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                }}
                className={styles.select}
                data-testid="select-category"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {categoryId !== product.categoryId && (
                <p className={styles.helpText} style={{ color: "#b45309" }}>
                  Advertencia: Al cambiar la categoría, las especificaciones técnicas deberán
                  revisarse.
                </p>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-subtitle" className={styles.label}>
              Subtítulo (Opcional)
            </label>
            <input
              id="edit-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={styles.input}
              data-testid="input-subtitle"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-description" className={styles.label}>
              Descripción Detallada
            </label>
            <textarea
              id="edit-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            <span className={styles.checkboxLabel}>
              Destacar en la página de inicio (isFeatured)
            </span>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSavingDetails}
              className={styles.primaryButton}
              data-testid="btn-save-details"
            >
              {isSavingDetails ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Información General</span>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Section: Specifications */}
      <section className={styles.card} aria-label="Especificaciones técnicas">
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Especificaciones Técnicas</h2>
          <span className={styles.cardDescription}>
            Esquema: {currentSpecSchema ? `v${currentSpecSchema.schemaVersion}` : "Sin esquema"}{" "}
            (Categoría: {category.name})
          </span>
        </div>

        {currentSpecSchema && currentSpecSchema.fieldDefinitions.length > 0 ? (
          <form
            onSubmit={handleSaveSpecs}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <div className={styles.grid2}>
              {currentSpecSchema.fieldDefinitions.map((field) => {
                const currentVal = specValues[field.key];

                if (field.dataType === "enum") {
                  return (
                    <div key={field.key} className={styles.field}>
                      <label htmlFor={`spec-${field.key}`} className={styles.label}>
                        {field.label} {field.unit ? `(${field.unit})` : ""}
                      </label>
                      <select
                        id={`spec-${field.key}`}
                        value={typeof currentVal === "string" ? currentVal : ""}
                        onChange={(e) =>
                          setSpecValues((prev) => ({
                            ...prev,
                            [field.key]: e.target.value || undefined,
                          }))
                        }
                        className={styles.select}
                        data-testid={`spec-input-${field.key}`}
                      >
                        <option value="">-- No especificado --</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (field.dataType === "number") {
                  return (
                    <div key={field.key} className={styles.field}>
                      <label htmlFor={`spec-${field.key}`} className={styles.label}>
                        {field.label} {field.unit ? `(${field.unit})` : ""}
                      </label>
                      <input
                        id={`spec-${field.key}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={typeof currentVal === "number" ? currentVal : ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? undefined : Number(e.target.value);
                          setSpecValues((prev) => ({
                            ...prev,
                            [field.key]: val,
                          }));
                        }}
                        className={styles.input}
                        data-testid={`spec-input-${field.key}`}
                      />
                    </div>
                  );
                }

                if (field.dataType === "boolean") {
                  return (
                    <div key={field.key} className={styles.field}>
                      <label htmlFor={`spec-${field.key}`} className={styles.label}>
                        {field.label}
                      </label>
                      <select
                        id={`spec-${field.key}`}
                        value={
                          typeof currentVal === "boolean" ? (currentVal ? "true" : "false") : ""
                        }
                        onChange={(e) => {
                          const val =
                            e.target.value === "true"
                              ? true
                              : e.target.value === "false"
                                ? false
                                : undefined;
                          setSpecValues((prev) => ({
                            ...prev,
                            [field.key]: val,
                          }));
                        }}
                        className={styles.select}
                        data-testid={`spec-input-${field.key}`}
                      >
                        <option value="">-- No especificado --</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  );
                }

                // Default string
                return (
                  <div key={field.key} className={styles.field}>
                    <label htmlFor={`spec-${field.key}`} className={styles.label}>
                      {field.label} {field.unit ? `(${field.unit})` : ""}
                    </label>
                    <input
                      id={`spec-${field.key}`}
                      type="text"
                      value={typeof currentVal === "string" ? currentVal : ""}
                      onChange={(e) =>
                        setSpecValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                      className={styles.input}
                      data-testid={`spec-input-${field.key}`}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={isSavingSpecs}
                className={styles.primaryButton}
                data-testid="btn-save-specs"
              >
                {isSavingSpecs ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Especificaciones</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <p className={styles.cardDescription}>
            Esta categoría no tiene un esquema de especificaciones técnicas configurado.
          </p>
        )}
      </section>

      {/* Section: Variants */}
      <section className={styles.card} aria-label="Variantes del producto">
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Variantes ({variants.length})</h2>
            <p className={styles.cardDescription}>
              Control de SKUs, precios en Soles, peso y estado por variante.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateVariant}
            className={styles.primaryButton}
            data-testid="btn-add-variant"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Agregar Variante</span>
          </button>
        </div>

        <div className={styles.variantTableContainer}>
          <table className={styles.variantTable} data-testid="table-variants">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Precio (PEN)</th>
                <th>Tachado</th>
                <th>Costo</th>
                <th>Peso</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} data-testid={`variant-row-${v.id}`}>
                  <td>
                    <span className={styles.skuBadge} data-testid={`variant-sku-${v.id}`}>
                      {v.sku}
                    </span>
                    {v.isSkuImmutable && (
                      <span
                        className={styles.immutablePill}
                        title="SKU inmutable por historial transaccional"
                        data-testid={`badge-immutable-${v.id}`}
                      >
                        Inmutable
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }} data-testid={`variant-title-${v.id}`}>
                    {v.title}
                  </td>
                  <td data-testid={`variant-price-${v.id}`}>
                    {formatCentsToPenDisplay(v.priceCents)}
                  </td>
                  <td style={{ color: "var(--color-text-secondary, #71717a)" }}>
                    {formatCentsToPenDisplay(v.compareAtPriceCents) ?? "-"}
                  </td>
                  <td style={{ color: "var(--color-text-secondary, #71717a)" }}>
                    {formatCentsToPenDisplay(v.costCents) ?? "-"}
                  </td>
                  <td>{v.weightGrams ? `${v.weightGrams}g` : "-"}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        v.status === "ACTIVE"
                          ? styles.badgePublished
                          : v.status === "ARCHIVED"
                            ? styles.badgeArchived
                            : styles.badgeDraft
                      }`}
                      data-testid={`variant-status-${v.id}`}
                    >
                      {v.status === "ACTIVE"
                        ? "Activa"
                        : v.status === "ARCHIVED"
                          ? "Archivada"
                          : "Inactiva"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEditVariant(v)}
                      className={styles.secondaryButton}
                      data-testid={`btn-edit-variant-${v.id}`}
                    >
                      <Edit2 size={12} aria-hidden="true" />
                      <span>Editar</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Media (Read Only per Amendment 5) */}
      <section className={styles.card} aria-label="Medios asociados">
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Medios e Imágenes</h2>
            <p className={styles.cardDescription}>
              Activos multimedia asociados al producto y sus variantes.
            </p>
          </div>
        </div>

        <div className={styles.readOnlyNotice} data-testid="media-readonly-notice">
          La gestión y carga de imágenes se habilitará en la siguiente fase (CHK3). Los medios
          actuales se muestran en modo de solo lectura.
        </div>

        {/* Primary Media Card */}
        {primaryMedia && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.8125rem", color: "var(--color-text-primary, #09090b)" }}>
              Imagen Principal:
            </strong>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 6,
                  backgroundColor: "#f4f4f5",
                  border: "1px solid var(--color-border-subtle, #e4e4e7)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {primaryThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primaryThumbUrl}
                    alt={primaryMedia.altText ?? product.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    data-testid="primary-media-img"
                  />
                ) : (
                  <ImageIcon size={24} style={{ color: "#a1a1aa" }} aria-hidden="true" />
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.125rem",
                  fontSize: "0.75rem",
                }}
              >
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                  {primaryMedia.objectKey}
                </span>
                <span style={{ color: "var(--color-text-secondary, #71717a)" }}>
                  Clase: {primaryMedia.securityClass} | Tipo: {primaryMedia.mimeType}
                </span>
                {primaryMedia.width && primaryMedia.height && (
                  <span style={{ color: "var(--color-text-secondary, #71717a)" }}>
                    Dimensiones: {primaryMedia.width} x {primaryMedia.height} px
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Media Gallery */}
        {media.length > 0 ? (
          <div className={styles.mediaGrid}>
            {media.map((m) => {
              const url =
                m.mediaAsset.securityClass === "PUBLIC_MEDIA"
                  ? resolvePublicMediaUrl(m.mediaAsset.objectKey)
                  : null;

              return (
                <div key={m.id} className={styles.mediaCard} data-testid={`media-card-${m.id}`}>
                  <div className={styles.mediaPreviewBox}>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.mediaAsset.altText ?? product.name}
                        className={styles.mediaPreviewImg}
                      />
                    ) : (
                      <ImageIcon size={32} style={{ color: "#a1a1aa" }} aria-hidden="true" />
                    )}
                  </div>
                  <div className={styles.mediaInfo}>
                    <span className={styles.mediaKey} title={m.mediaAsset.objectKey}>
                      {m.mediaAsset.objectKey}
                    </span>
                    <span className={styles.mediaClass}>
                      Orden: {m.displayOrder} | {m.mediaAsset.securityClass}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.cardDescription}>
            Este producto no tiene medios multimedia registrados.
          </p>
        )}
      </section>

      {/* --- Modals --- */}

      {/* Duplicate Product Modal */}
      {showDuplicateModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent} data-testid="modal-duplicate-product">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Duplicar Producto</h3>
            </div>
            <form
              onSubmit={handleDuplicate}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <p className={styles.cardDescription}>
                Se creará una copia completa en estado Borrador (DRAFT) incluyendo variantes y
                especificaciones.
              </p>

              <div className={styles.field}>
                <label htmlFor="dup-name" className={styles.label}>
                  Nuevo Nombre
                </label>
                <input
                  id="dup-name"
                  type="text"
                  required
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className={styles.input}
                  data-testid="input-duplicate-name"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="dup-slug" className={styles.label}>
                  Nuevo Slug URL
                </label>
                <input
                  id="dup-slug"
                  type="text"
                  required
                  value={duplicateSlug}
                  onChange={(e) => setDuplicateSlug(e.target.value.toLowerCase())}
                  className={styles.input}
                  data-testid="input-duplicate-slug"
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className={styles.secondaryButton}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDuplicating}
                  className={styles.primaryButton}
                  data-testid="btn-confirm-duplicate"
                >
                  {isDuplicating ? "Duplicando..." : "Confirmar y Duplicar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Variant Modal */}
      {showCreateVariantModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent} data-testid="modal-create-variant">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Nueva Variante</h3>
            </div>
            <form
              onSubmit={handleCreateVariant}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {variantFormError && (
                <div className={styles.alertError} data-testid="variant-form-error" role="alert">
                  {variantFormError}
                </div>
              )}

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="modal-sku" className={styles.label}>
                    SKU <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="modal-sku"
                    type="text"
                    required
                    value={newVarSku}
                    onChange={(e) => setNewVarSku(e.target.value.toUpperCase())}
                    placeholder="Ej: WLM-BX-RED"
                    className={styles.input}
                    data-testid="input-new-sku"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="modal-title" className={styles.label}>
                    Nombre de la Variante <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="modal-title"
                    type="text"
                    required
                    value={newVarTitle}
                    onChange={(e) => setNewVarTitle(e.target.value)}
                    placeholder="Ej: Rojo / Edición Especial"
                    className={styles.input}
                    data-testid="input-new-title"
                  />
                </div>
              </div>

              <div className={styles.grid3}>
                <div className={styles.field}>
                  <label htmlFor="modal-price" className={styles.label}>
                    Precio (PEN) <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="modal-price"
                    type="text"
                    inputMode="decimal"
                    required
                    value={newVarPrice}
                    onChange={(e) => setNewVarPrice(e.target.value)}
                    placeholder="129.90"
                    className={styles.input}
                    data-testid="input-new-price"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="modal-compare" className={styles.label}>
                    Precio Tachado
                  </label>
                  <input
                    id="modal-compare"
                    type="text"
                    inputMode="decimal"
                    value={newVarCompareAt}
                    onChange={(e) => setNewVarCompareAt(e.target.value)}
                    placeholder="149.90"
                    className={styles.input}
                    data-testid="input-new-compare"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="modal-cost" className={styles.label}>
                    Costo Unitario
                  </label>
                  <input
                    id="modal-cost"
                    type="text"
                    inputMode="decimal"
                    value={newVarCost}
                    onChange={(e) => setNewVarCost(e.target.value)}
                    placeholder="75.00"
                    className={styles.input}
                    data-testid="input-new-cost"
                  />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="modal-weight" className={styles.label}>
                    Peso (gramos)
                  </label>
                  <input
                    id="modal-weight"
                    type="number"
                    min="0"
                    step="1"
                    value={newVarWeight}
                    onChange={(e) => setNewVarWeight(e.target.value)}
                    placeholder="Ej: 39"
                    className={styles.input}
                    data-testid="input-new-weight"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="modal-status" className={styles.label}>
                    Estado
                  </label>
                  <select
                    id="modal-status"
                    value={newVarStatus}
                    onChange={(e) => setNewVarStatus(e.target.value as VariantStatus)}
                    className={styles.select}
                    data-testid="select-new-status"
                  >
                    <option value="ACTIVE">Activa (ACTIVE)</option>
                    <option value="INACTIVE">Inactiva (INACTIVE)</option>
                    <option value="ARCHIVED">Archivada (ARCHIVED)</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCreateVariantModal(false)}
                  className={styles.secondaryButton}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingVariant}
                  className={styles.primaryButton}
                  data-testid="btn-save-new-variant"
                >
                  {isCreatingVariant ? "Creando..." : "Guardar Variante"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {editingVariant && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent} data-testid="modal-edit-variant">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Editar Variante</h3>
            </div>
            <form
              onSubmit={handleUpdateVariant}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {editVariantError && (
                <div className={styles.alertError} data-testid="edit-variant-error" role="alert">
                  {editVariantError}
                </div>
              )}

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="edit-var-sku" className={styles.label}>
                    SKU <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="edit-var-sku"
                    type="text"
                    required
                    value={editVarSku}
                    onChange={(e) => setEditVarSku(e.target.value.toUpperCase())}
                    className={styles.input}
                    data-testid="input-edit-sku"
                  />
                  {editingVariant.isSkuImmutable && (
                    <p className={styles.helpText} style={{ color: "#b45309" }}>
                      Este SKU tiene movimientos de stock/pedidos. Modificarlo causará un error de
                      inmutabilidad.
                    </p>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="edit-var-title" className={styles.label}>
                    Nombre de la Variante <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="edit-var-title"
                    type="text"
                    required
                    value={editVarTitle}
                    onChange={(e) => setEditVarTitle(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-title"
                  />
                </div>
              </div>

              <div className={styles.grid3}>
                <div className={styles.field}>
                  <label htmlFor="edit-var-price" className={styles.label}>
                    Precio (PEN) <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="edit-var-price"
                    type="text"
                    inputMode="decimal"
                    required
                    value={editVarPrice}
                    onChange={(e) => setEditVarPrice(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-price"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="edit-var-compare" className={styles.label}>
                    Precio Tachado
                  </label>
                  <input
                    id="edit-var-compare"
                    type="text"
                    inputMode="decimal"
                    value={editVarCompareAt}
                    onChange={(e) => setEditVarCompareAt(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-compare"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="edit-var-cost" className={styles.label}>
                    Costo Unitario
                  </label>
                  <input
                    id="edit-var-cost"
                    type="text"
                    inputMode="decimal"
                    value={editVarCost}
                    onChange={(e) => setEditVarCost(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-cost"
                  />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="edit-var-weight" className={styles.label}>
                    Peso (gramos)
                  </label>
                  <input
                    id="edit-var-weight"
                    type="number"
                    min="0"
                    step="1"
                    value={editVarWeight}
                    onChange={(e) => setEditVarWeight(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-weight"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="edit-var-status" className={styles.label}>
                    Estado
                  </label>
                  <select
                    id="edit-var-status"
                    value={editVarStatus}
                    onChange={(e) => setEditVarStatus(e.target.value as VariantStatus)}
                    className={styles.select}
                    data-testid="select-edit-status"
                  >
                    <option value="ACTIVE">Activa (ACTIVE)</option>
                    <option value="INACTIVE">Inactiva (INACTIVE)</option>
                    <option value="ARCHIVED">Archivada (ARCHIVED)</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  className={styles.secondaryButton}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingVariant}
                  className={styles.primaryButton}
                  data-testid="btn-save-variant"
                >
                  {isUpdatingVariant ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
