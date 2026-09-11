"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import type { AdminProductUiDetail } from "@/lib/admin/catalog/ui-dto";
import type {
  AdminProductDetailVariant,
  BrandReference,
  CategoryReference,
  CatalogStatus,
  VariantStatus,
} from "@/lib/admin/catalog/types";
import styles from "./product-editor.module.css";

interface ProductEditorProps {
  initialDetail: AdminProductUiDetail;
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

  const [detail, setDetail] = useState<AdminProductUiDetail>(initialDetail);

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

  // UI Feedback State
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

  // Lifecycle Transition Confirmation Dialog State
  const [pendingTransition, setPendingTransition] = useState<{
    targetStatus: CatalogStatus;
    title: string;
    message: string;
  } | null>(null);
  const lifecycleTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Stable Mutation Request Trackers
  const detailsTracker = useRef(new MutationRequestTracker());
  const specsTracker = useRef(new MutationRequestTracker());
  const createVarTracker = useRef(new MutationRequestTracker());
  const editVarTracker = useRef(new MutationRequestTracker());
  const duplicateTracker = useRef(new MutationRequestTracker());
  const transitionTracker = useRef(new MutationRequestTracker());

  // Authoritative State Resynchronization:
  // When initialDetail updates (from router refresh, category reconciliation, or identity change),
  // synchronize ALL client state from the authoritative server payload.
  useEffect(() => {
    setDetail(initialDetail);
    setName(initialDetail.product.name);
    setSlug(initialDetail.product.slug);
    setBrandId(initialDetail.product.brandId);
    setCategoryId(initialDetail.product.categoryId);
    setSubtitle(initialDetail.product.subtitle ?? "");
    setDescription(initialDetail.product.description ?? "");
    setIsFeatured(initialDetail.product.isFeatured);
    setSpecValues((initialDetail.specifications?.specValues as Record<string, unknown>) ?? {});
    setDuplicateName(`${initialDetail.product.name} (Copia)`);
    setDuplicateSlug(`${initialDetail.product.slug}-copia`);
  }, [initialDetail]);

  // --- Handlers ---

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDetails(true);
    setGeneralError(null);
    setGeneralSuccess(null);
    setStaleConflict(false);

    const payload = {
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      name: name.trim(),
      slug: slug.trim(),
      brandId,
      categoryId,
      subtitle: subtitle.trim() ? subtitle.trim() : null,
      description: description.trim() ? description.trim() : null,
      isFeatured,
    };

    const mutationRequestId = detailsTracker.current.getRequestId(payload);

    try {
      const res = await updateProductAction({
        ...payload,
        mutationRequestId,
      });

      detailsTracker.current.complete();

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
    } catch {
      setGeneralError("Error de conexión al enviar la solicitud. Puedes reintentar.");
    } finally {
      setIsSavingDetails(false);
    }
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

    const payload = {
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      specValues: cleaned,
    };

    const mutationRequestId = specsTracker.current.getRequestId(payload);

    try {
      const res = await updateProductAction({
        ...payload,
        mutationRequestId,
      });

      specsTracker.current.complete();

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
    } catch {
      setGeneralError("Error de conexión al enviar la solicitud. Puedes reintentar.");
    } finally {
      setIsSavingSpecs(false);
    }
  };

  const handleSpecFieldChange = (key: string, value: unknown) => {
    setSpecValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const executeTransitionStatus = async (targetStatus: CatalogStatus) => {
    setIsTransitioning(true);
    setGeneralError(null);
    setGeneralSuccess(null);
    setStaleConflict(false);

    const payload = {
      productId: product.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
      targetStatus,
    };

    const mutationRequestId = transitionTracker.current.getRequestId(payload);

    try {
      const res = await transitionProductStatusAction({
        productId: product.id,
        expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
        targetStatus,
        mutationRequestId,
      });

      transitionTracker.current.complete();

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
    } catch {
      setGeneralError("Error de conexión al procesar la transición. Puedes reintentar.");
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDuplicating(true);
    setGeneralError(null);

    const payload = {
      sourceProductId: product.id,
      options: {
        customName: duplicateName.trim() ? duplicateName.trim() : undefined,
        customSlug: duplicateSlug.trim() ? duplicateSlug.trim() : undefined,
      },
    };

    const mutationRequestId = duplicateTracker.current.getRequestId(payload);

    try {
      const res = await duplicateProductAction({
        ...payload,
        mutationRequestId,
      });

      duplicateTracker.current.complete();

      if (res.success && res.data?.product) {
        router.push(`/admin/products/${res.data.product.id}`);
      } else {
        setGeneralError(res.error ?? "No se pudo duplicar el producto.");
        setIsDuplicating(false);
        setShowDuplicateModal(false);
      }
    } catch {
      setGeneralError("Error de conexión al duplicar el producto.");
      setIsDuplicating(false);
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

    const payload = {
      productId: product.id,
      sku: newVarSku.trim(),
      title: newVarTitle.trim(),
      pricePen: newVarPrice.trim(),
      compareAtPricePen: newVarCompareAt.trim() ? newVarCompareAt.trim() : null,
      costPen: newVarCost.trim() ? newVarCost.trim() : null,
      weightGrams: newVarWeight ? parseInt(newVarWeight, 10) : null,
      status: newVarStatus,
    };

    const mutationRequestId = createVarTracker.current.getRequestId(payload);

    try {
      const res = await createVariantAction({
        ...payload,
        mutationRequestId,
      });

      createVarTracker.current.complete();

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
    } catch {
      setVariantFormError("Error de conexión al crear la variante.");
    } finally {
      setIsCreatingVariant(false);
    }
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

    const payload = {
      productId: product.id,
      variantId: editingVariant.id,
      expectedUpdatedAt: new Date(editingVariant.updatedAt).toISOString(),
      sku: editVarSku.trim(),
      title: editVarTitle.trim(),
      pricePen: editVarPrice.trim(),
      compareAtPricePen: editVarCompareAt.trim() ? editVarCompareAt.trim() : null,
      costPen: editVarCost.trim() ? editVarCost.trim() : null,
      weightGrams: editVarWeight ? parseInt(editVarWeight, 10) : null,
      status: editVarStatus,
    };

    const mutationRequestId = editVarTracker.current.getRequestId(payload);

    try {
      const res = await updateVariantAction({
        ...payload,
        mutationRequestId,
      });

      editVarTracker.current.complete();

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
    } catch {
      setEditVariantError("Error de conexión al actualizar la variante.");
    } finally {
      setIsUpdatingVariant(false);
    }
  };

  const primaryThumbUrl = primaryMedia?.publicUrl ?? null;

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
                  ref={lifecycleTriggerRef}
                  disabled={
                    !publishReadiness.isPublishable || !hasPublishPermission || isTransitioning
                  }
                  onClick={(e) => {
                    lifecycleTriggerRef.current = e.currentTarget;
                    setPendingTransition({
                      targetStatus: "PUBLISHED",
                      title: "Confirmar Publicación",
                      message:
                        "¿Estás seguro de que deseas publicar este producto? Será visible inmediatamente para los clientes en la tienda.",
                    });
                  }}
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
                  onClick={(e) => {
                    lifecycleTriggerRef.current = e.currentTarget;
                    setPendingTransition({
                      targetStatus: "ARCHIVED",
                      title: "Confirmar Archivado",
                      message:
                        "¿Estás seguro de que deseas archivar este borrador? Se desactivará de la gestión ordinaria.",
                    });
                  }}
                  className={styles.archiveButton}
                  data-testid="btn-transition-archive"
                >
                  <span>Archivar</span>
                </button>
              </>
            )}

            {product.status === "PUBLISHED" && (
              <>
                <button
                  type="button"
                  disabled={!hasPublishPermission || isTransitioning}
                  onClick={(e) => {
                    lifecycleTriggerRef.current = e.currentTarget;
                    setPendingTransition({
                      targetStatus: "DRAFT",
                      title: "Confirmar Despublicación",
                      message:
                        "¿Estás seguro de que deseas despublicar este producto? Dejará de ser visible en la tienda y volverá a estado Borrador.",
                    });
                  }}
                  className={styles.secondaryButton}
                  data-testid="btn-transition-unpublish"
                  title={
                    !hasPublishPermission
                      ? "Despublicar un producto requiere catalog:publish."
                      : "Despublicar y volver a borrador"
                  }
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>Despublicar a Borrador</span>
                </button>
                <button
                  type="button"
                  disabled={!hasPublishPermission || isTransitioning}
                  onClick={(e) => {
                    lifecycleTriggerRef.current = e.currentTarget;
                    setPendingTransition({
                      targetStatus: "ARCHIVED",
                      title: "Confirmar Archivado",
                      message:
                        "¿Estás seguro de que deseas archivar este producto publicado? Se retirará de la tienda.",
                    });
                  }}
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
              </>
            )}

            {product.status === "ARCHIVED" && (
              <button
                type="button"
                disabled={isTransitioning}
                onClick={(e) => {
                  lifecycleTriggerRef.current = e.currentTarget;
                  setPendingTransition({
                    targetStatus: "DRAFT",
                    title: "Confirmar Restauración",
                    message:
                      "¿Estás seguro de que deseas restaurar este producto archivado a estado Borrador?",
                  });
                }}
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
        <div className={styles.alertConflict} data-testid="alert-stale-conflict" role="alert">
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
                  <span>No Publicable ({publishReadiness.blockers.length} bloqueadores)</span>
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
          <div className={styles.issuesList} data-testid="readiness-blockers-list">
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

      {/* Section: General Details */}
      <section className={styles.card} data-testid="section-general-details">
        <h2 className={styles.cardTitle}>Información General</h2>
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
                  Advertencia: Al cambiar la categoría, las especificaciones técnicas se
                  reconciliarán según el esquema de la nueva categoría.
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
              placeholder="Breve descripción complementaria"
              className={styles.input}
              data-testid="input-subtitle"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-description" className={styles.label}>
              Descripción Detallada (Opcional)
            </label>
            <textarea
              id="edit-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles sobre el producto, tecnología, materiales..."
              className={styles.textarea}
              data-testid="input-description"
            />
          </div>

          <div className={styles.checkboxField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                data-testid="input-featured"
              />
              <span>Marcar como producto destacado en la tienda</span>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSavingDetails}
              className={styles.primaryButton}
              data-testid="btn-save-details"
            >
              {isSavingDetails ? (
                <>
                  <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Cambios</span>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Section: Category Specifications */}
      <section className={styles.card} data-testid="section-specifications">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className={styles.cardTitle}>Especificaciones Técnicas ({category.name})</h2>
            <p className={styles.cardDescription}>
              {currentSpecSchema
                ? `Esquema activo v${currentSpecSchema.schemaVersion}. Puedes guardar especificaciones parciales.`
                : "Esta categoría no tiene un esquema de especificaciones técnicas configurado."}
            </p>
          </div>
        </div>

        {currentSpecSchema && currentSpecSchema.fieldDefinitions ? (
          <form
            onSubmit={handleSaveSpecs}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1rem" }}
          >
            <div className={styles.grid2}>
              {currentSpecSchema.fieldDefinitions.map((field) => {
                const val = specValues[field.key];

                return (
                  <div key={field.key} className={styles.field}>
                    <label htmlFor={`spec-${field.key}`} className={styles.label}>
                      {field.label}
                      {field.unit && (
                        <span style={{ color: "#a1a1aa", fontWeight: 400, marginLeft: 4 }}>
                          ({field.unit})
                        </span>
                      )}
                    </label>

                    {/* STRING / TEXT Field */}
                    {field.dataType === "string" && (
                      <input
                        id={`spec-${field.key}`}
                        type="text"
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => handleSpecFieldChange(field.key, e.target.value)}
                        className={styles.input}
                        data-testid={`spec-input-${field.key}`}
                      />
                    )}

                    {/* NUMBER Field */}
                    {field.dataType === "number" && (
                      <input
                        id={`spec-${field.key}`}
                        type="number"
                        min={field.min ?? undefined}
                        max={field.max ?? undefined}
                        step="any"
                        value={val !== undefined && val !== null ? String(val) : ""}
                        onChange={(e) => {
                          const num = e.target.value === "" ? "" : Number(e.target.value);
                          handleSpecFieldChange(field.key, num);
                        }}
                        className={styles.input}
                        data-testid={`spec-input-${field.key}`}
                      />
                    )}

                    {/* BOOLEAN Field */}
                    {field.dataType === "boolean" && (
                      <select
                        id={`spec-${field.key}`}
                        value={val === true ? "true" : val === false ? "false" : ""}
                        onChange={(e) => {
                          const boolVal =
                            e.target.value === "true"
                              ? true
                              : e.target.value === "false"
                                ? false
                                : "";
                          handleSpecFieldChange(field.key, boolVal);
                        }}
                        className={styles.select}
                        data-testid={`spec-input-${field.key}`}
                      >
                        <option value="">(No especificado)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    )}

                    {/* ENUM Single Field */}
                    {field.dataType === "enum" && field.filterKind !== "ENUM_MULTI" && (
                      <select
                        id={`spec-${field.key}`}
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => handleSpecFieldChange(field.key, e.target.value)}
                        className={styles.select}
                        data-testid={`spec-input-${field.key}`}
                      >
                        <option value="">(Seleccionar opción)</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* ENUM Multi Field */}
                    {field.dataType === "enum" && field.filterKind === "ENUM_MULTI" && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          padding: "0.5rem",
                          border: "1px solid var(--color-border-subtle, #e4e4e7)",
                          borderRadius: 6,
                        }}
                        data-testid={`spec-input-${field.key}`}
                      >
                        {field.options?.map((opt) => {
                          const currentArr = Array.isArray(val) ? (val as string[]) : [];
                          const isChecked = currentArr.includes(opt.value);

                          return (
                            <label
                              key={opt.value}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.375rem",
                                fontSize: "0.8125rem",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    handleSpecFieldChange(field.key, [...currentArr, opt.value]);
                                  } else {
                                    handleSpecFieldChange(
                                      field.key,
                                      currentArr.filter((item) => item !== opt.value)
                                    );
                                  }
                                }}
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
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
                    <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
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
            Selecciona una categoría con especificaciones técnicas para configurar sus valores.
          </p>
        )}
      </section>

      {/* Section: Variants Management */}
      <section className={styles.card} data-testid="section-variants">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className={styles.cardTitle}>Variantes de Producto</h2>
            <p className={styles.cardDescription}>
              Cada variante posee un SKU único, precio de venta y estado para la gestión de stock.
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

        <div className={styles.tableWrapper} style={{ marginTop: "1rem" }}>
          <table className={styles.table} data-testid="table-variants">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Precio Venta</th>
                <th>Precio Tachado</th>
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
                        title="SKU inmutable: posee inventario o pedidos históricos"
                        style={{
                          marginLeft: 6,
                          fontSize: "0.6875rem",
                          color: "#b45309",
                          fontWeight: 600,
                        }}
                        data-testid={`variant-immutable-badge-${v.id}`}
                      >
                        (Inmutable)
                      </span>
                    )}
                  </td>
                  <td>
                    <strong>{v.title}</strong>
                  </td>
                  <td>
                    <span className={styles.pricePositive}>
                      {formatCentsToPenDisplay(v.priceCents)}
                    </span>
                  </td>
                  <td>
                    {v.compareAtPriceCents ? (
                      <span className={styles.priceCompare}>
                        {formatCentsToPenDisplay(v.compareAtPriceCents)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {v.costCents ? (
                      <span className={styles.costConfidential}>
                        {formatCentsToPenDisplay(v.costCents)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{v.weightGrams ? `${v.weightGrams}g` : "-"}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        v.status === "ACTIVE"
                          ? styles.badgePublished
                          : v.status === "INACTIVE"
                            ? styles.badgeDraft
                            : styles.badgeArchived
                      }`}
                    >
                      {v.status === "ACTIVE"
                        ? "Activa"
                        : v.status === "INACTIVE"
                          ? "Inactiva"
                          : "Archivada"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEditVariant(v)}
                      className={styles.actionBtn}
                      data-testid="btn-edit-variant"
                      id={`btn-edit-variant-${v.id}`}
                      title="Editar variante"
                    >
                      <Edit2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: Read-Only Media Gallery */}
      <section className={styles.card} data-testid="section-media">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className={styles.cardTitle}>Medios Multimedia (Solo Lectura)</h2>
            <p className={styles.cardDescription} data-testid="media-readonly-notice">
              Visualización de activos multimedia asociados. La subida y administración de archivos
              se gestiona en el módulo de almacenamiento correspondiente.
            </p>
          </div>
        </div>

        {/* Primary Media Banner */}
        {primaryMedia && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              border: "1px solid var(--color-border-subtle, #e4e4e7)",
              backgroundColor: "#fafafa",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginTop: "1rem",
            }}
            data-testid="primary-media-display"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
                <span style={{ fontWeight: 600 }}>
                  {primaryMedia.altText ?? "Imagen Principal"}
                </span>
                <span style={{ color: "var(--color-text-secondary, #71717a)" }}>
                  Clase: {primaryMedia.securityClass} | Tipo: {primaryMedia.mimeType}
                </span>
                {!primaryMedia.publicUrl && (
                  <span
                    style={{ color: "#b45309", fontSize: "0.7rem" }}
                    data-testid="non-public-primary-notice"
                  >
                    Asset no público (solo metadatos) [Privado]
                  </span>
                )}
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
              const url = m.publicUrl;

              return (
                <div key={m.id} className={styles.mediaCard} data-testid={`media-card-${m.id}`}>
                  <div className={styles.mediaPreviewBox}>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.altText ?? product.name}
                        className={styles.mediaPreviewImg}
                      />
                    ) : (
                      <ImageIcon size={32} style={{ color: "#a1a1aa" }} aria-hidden="true" />
                    )}
                  </div>
                  <div className={styles.mediaInfo}>
                    <span className={styles.mediaKey}>
                      {m.altText ?? `Asset Multimedia ${m.displayOrder}`}
                    </span>
                    <span className={styles.mediaClass}>
                      Orden: {m.displayOrder} | {m.securityClass}
                    </span>
                    {!url && (
                      <span
                        style={{ color: "#b45309", fontSize: "0.7rem" }}
                        data-testid="non-public-media-badge"
                      >
                        Asset no público (solo metadatos) [Privado]
                      </span>
                    )}
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
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-duplicate-title"
        >
          <div className={styles.modalContent} data-testid="modal-duplicate-product">
            <div className={styles.modalHeader}>
              <h3 id="modal-duplicate-title" className={styles.modalTitle}>
                Duplicar Producto
              </h3>
            </div>
            <form
              onSubmit={handleDuplicate}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className={styles.field}>
                <label htmlFor="duplicate-name" className={styles.label}>
                  Nombre del Nuevo Producto <span className={styles.required}>*</span>
                </label>
                <input
                  id="duplicate-name"
                  type="text"
                  required
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className={styles.input}
                  data-testid="input-duplicate-name"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="duplicate-slug" className={styles.label}>
                  Slug del Nuevo Producto <span className={styles.required}>*</span>
                </label>
                <input
                  id="duplicate-slug"
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
                  data-testid="btn-cancel-duplicate"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDuplicating}
                  className={styles.primaryButton}
                  data-testid="btn-confirm-duplicate"
                >
                  {isDuplicating ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                      <span>Duplicando...</span>
                    </>
                  ) : (
                    <span>Crear Copia</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Variant Modal */}
      {showCreateVariantModal && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-create-variant-title"
        >
          <div className={styles.modalContent} data-testid="modal-create-variant">
            <div className={styles.modalHeader}>
              <h3 id="modal-create-variant-title" className={styles.modalTitle}>
                Agregar Variante
              </h3>
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
                    onChange={(e) => setNewVarSku(e.target.value)}
                    placeholder="Ej: WLM-BX-RED"
                    className={styles.input}
                    data-testid="input-new-sku"
                  />
                  <p className={styles.helpText}>Código único para la variante.</p>
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
                    placeholder="Ej: Rojo / Edición Limitada"
                    className={styles.input}
                    data-testid="input-new-title"
                  />
                </div>
              </div>

              <div className={styles.grid3}>
                <div className={styles.field}>
                  <label htmlFor="modal-price" className={styles.label}>
                    Precio de Venta (PEN) <span className={styles.required}>*</span>
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
                  <label htmlFor="modal-compare-at" className={styles.label}>
                    Precio Tachado (PEN)
                  </label>
                  <input
                    id="modal-compare-at"
                    type="text"
                    inputMode="decimal"
                    value={newVarCompareAt}
                    onChange={(e) => setNewVarCompareAt(e.target.value)}
                    placeholder="149.90"
                    className={styles.input}
                    data-testid="input-new-compare-at"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="modal-cost" className={styles.label}>
                    Costo Unitario (PEN)
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
                    min="1"
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
                    <option value="ACTIVE">Activa</option>
                    <option value="INACTIVE">Inactiva</option>
                    <option value="ARCHIVED">Archivada</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowCreateVariantModal(false)}
                  className={styles.secondaryButton}
                  data-testid="btn-cancel-new-variant"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingVariant}
                  className={styles.primaryButton}
                  data-testid="btn-confirm-new-variant"
                >
                  {isCreatingVariant ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                      <span>Creando...</span>
                    </>
                  ) : (
                    <span>Crear Variante</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {editingVariant && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-edit-variant-title"
        >
          <div className={styles.modalContent} data-testid="modal-edit-variant">
            <div className={styles.modalHeader}>
              <h3 id="modal-edit-variant-title" className={styles.modalTitle}>
                Editar Variante
              </h3>
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
                    disabled={editingVariant.isSkuImmutable}
                    readOnly={editingVariant.isSkuImmutable}
                    onChange={(e) => setEditVarSku(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-sku"
                  />
                  {editingVariant.isSkuImmutable && (
                    <p
                      className={styles.helpText}
                      style={{ color: "#b45309" }}
                      data-testid="sku-immutable-notice"
                    >
                      El SKU es permanentemente inmutable porque existen registros de inventario o
                      historial de pedidos. Para utilizar un SKU comercial diferente, crea una nueva
                      variante.
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
                  <label htmlFor="edit-var-compare-at" className={styles.label}>
                    Precio Tachado (PEN)
                  </label>
                  <input
                    id="edit-var-compare-at"
                    type="text"
                    inputMode="decimal"
                    value={editVarCompareAt}
                    onChange={(e) => setEditVarCompareAt(e.target.value)}
                    className={styles.input}
                    data-testid="input-edit-compare-at"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="edit-var-cost" className={styles.label}>
                    Costo (PEN)
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
                    min="1"
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
                    <option value="ACTIVE">Activa</option>
                    <option value="INACTIVE">Inactiva</option>
                    <option value="ARCHIVED">Archivada</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  className={styles.secondaryButton}
                  data-testid="btn-cancel-edit-variant"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingVariant}
                  className={styles.primaryButton}
                  data-testid="btn-confirm-edit-variant"
                >
                  {isUpdatingVariant ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Cambios</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lifecycle Transition Confirmation Dialog */}
      {pendingTransition && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="transition-dialog-title"
          aria-describedby="transition-dialog-desc"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPendingTransition(null);
              lifecycleTriggerRef.current?.focus();
            }
          }}
        >
          <div className={styles.modalContent} data-testid="dialog-confirm-transition">
            <div className={styles.modalHeader}>
              <h3 id="transition-dialog-title" className={styles.modalTitle}>
                {pendingTransition.title}
              </h3>
            </div>
            <p
              id="transition-dialog-desc"
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-muted, #94a3b8)",
                margin: "0 0 1.5rem",
              }}
            >
              {pendingTransition.message}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setPendingTransition(null);
                  lifecycleTriggerRef.current?.focus();
                }}
                className={styles.secondaryButton}
                data-testid="btn-cancel-transition-action"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isTransitioning}
                onClick={async () => {
                  const target = pendingTransition.targetStatus;
                  setPendingTransition(null);
                  await executeTransitionStatus(target);
                  lifecycleTriggerRef.current?.focus();
                }}
                className={styles.primaryButton}
                data-testid="btn-confirm-transition-action"
                autoFocus
              >
                {isTransitioning ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <span>Confirmar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
