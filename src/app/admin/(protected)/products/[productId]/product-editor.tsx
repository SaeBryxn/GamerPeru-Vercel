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
  Upload,
  ArrowUp,
  ArrowDown,
  Star,
  Tag,
  Globe,
} from "lucide-react";
import {
  updateProductAction,
  createVariantAction,
  updateVariantAction,
  duplicateProductAction,
  transitionProductStatusAction,
  requestMediaUploadIntentAction,
  finalizeMediaUploadAction,
  updateMediaAltTextAction,
  reorderProductMediaAction,
  setPrimaryMediaAction,
  reassignProductMediaVariantAction,
} from "@/lib/admin/catalog/actions";
import type { AllowedMediaUploadMimeType } from "@/lib/admin/catalog/media-crypto";
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

export interface PendingFinalizationState {
  signedIntentToken: string;
  mutationRequestId: string;
  productId: string;
  targetVariantId: string | null;
  safeStatus: "ready_to_retry" | "retrying";
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

  // Media Authoring & Management State (CHK3)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTargetVariantId, setUploadTargetVariantId] = useState<string>("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "idle" | "requesting_intent" | "uploading_staging" | "finalizing" | "success" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [clientFileError, setClientFileError] = useState<string | null>(null);
  const [pendingFinalization, setPendingFinalization] = useState<PendingFinalizationState | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Media Operation Feedback State
  const [isSettingPrimary, setIsSettingPrimary] = useState<string | null>(null);
  const [isReorderingMedia, setIsReorderingMedia] = useState(false);
  const [mediaOpError, setMediaOpError] = useState<string | null>(null);
  const [mediaOpSuccess, setMediaOpSuccess] = useState<string | null>(null);

  // Alt Text Modal State
  const [altTextModalMedia, setAltTextModalMedia] = useState<
    AdminProductUiDetail["media"][number] | null
  >(null);
  const [altTextInput, setAltTextInput] = useState("");
  const [isSavingAltText, setIsSavingAltText] = useState(false);
  const [altTextError, setAltTextError] = useState<string | null>(null);
  const altTextDialogRef = useRef<HTMLDivElement | null>(null);
  const altTextTriggerRef = useRef<HTMLElement | null>(null);

  // Variant Reassignment Modal State
  const [variantModalMedia, setVariantModalMedia] = useState<
    AdminProductUiDetail["media"][number] | null
  >(null);
  const [reassignVariantTarget, setReassignVariantTarget] = useState<string>("");
  const [isReassigningVariant, setIsReassigningVariant] = useState(false);
  const [reassignVariantError, setReassignVariantError] = useState<string | null>(null);
  const variantDialogRef = useRef<HTMLDivElement | null>(null);
  const variantTriggerRef = useRef<HTMLElement | null>(null);

  // Lifecycle Transition Confirmation Dialog State
  const [pendingTransition, setPendingTransition] = useState<{
    targetStatus: CatalogStatus;
    title: string;
    message: string;
  } | null>(null);
  const lifecycleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const transitionDialogRef = useRef<HTMLDivElement | null>(null);

  const previousTriggerRef = useRef<HTMLElement | null>(null);

  // Focus trap, containment, and focus restoration for Lifecycle Dialog
  useEffect(() => {
    if (pendingTransition) {
      previousTriggerRef.current =
        lifecycleTriggerRef.current ?? (document.activeElement as HTMLElement | null);
    } else if (previousTriggerRef.current) {
      const target = previousTriggerRef.current;
      previousTriggerRef.current = null;
      setTimeout(() => {
        if (target && document.body.contains(target)) {
          target.focus();
        }
      }, 10);
    }
  }, [pendingTransition]);

  useEffect(() => {
    if (!pendingTransition) return;

    const focusFirst = () => {
      if (transitionDialogRef.current) {
        const focusable = transitionDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0]?.focus();
        }
      }
    };

    focusFirst();
    const timer = setTimeout(focusFirst, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!transitionDialogRef.current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        const trigger = lifecycleTriggerRef.current ?? previousTriggerRef.current;
        setPendingTransition(null);
        setTimeout(() => {
          trigger?.focus();
        }, 10);
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          transitionDialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: moving backwards
          if (
            document.activeElement === firstElement ||
            !transitionDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: moving forwards
          if (
            document.activeElement === lastElement ||
            !transitionDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    // Keep focus inside dialog if focus moves outside
    const handleFocusIn = (e: FocusEvent) => {
      if (transitionDialogRef.current && !transitionDialogRef.current.contains(e.target as Node)) {
        e.stopPropagation();
        focusFirst();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [pendingTransition]);

  // Stable Mutation Request Trackers
  const detailsTracker = useRef(new MutationRequestTracker());
  const specsTracker = useRef(new MutationRequestTracker());
  const createVarTracker = useRef(new MutationRequestTracker());
  const editVarTracker = useRef(new MutationRequestTracker());
  const duplicateTracker = useRef(new MutationRequestTracker());
  const transitionTracker = useRef(new MutationRequestTracker());
  const mediaUploadTracker = useRef(new MutationRequestTracker());
  const mediaAltTracker = useRef(new MutationRequestTracker());
  const mediaReorderTracker = useRef(new MutationRequestTracker());
  const mediaPrimaryTracker = useRef(new MutationRequestTracker());
  const mediaVariantTracker = useRef(new MutationRequestTracker());

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

  // Focus, Trap & Escape management for Alt-Text Modal
  useEffect(() => {
    if (!altTextModalMedia) return;

    const focusFirst = () => {
      if (altTextDialogRef.current) {
        const input = altTextDialogRef.current.querySelector<HTMLInputElement>("input");
        input?.focus();
      }
    };
    focusFirst();
    const timer = setTimeout(focusFirst, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!altTextDialogRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setAltTextModalMedia(null);
        setTimeout(() => altTextTriggerRef.current?.focus(), 10);
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          altTextDialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !altTextDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !altTextDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [altTextModalMedia]);

  // Focus, Trap & Escape management for Variant Reassignment Modal
  useEffect(() => {
    if (!variantModalMedia) return;

    const focusFirst = () => {
      if (variantDialogRef.current) {
        const select = variantDialogRef.current.querySelector<HTMLSelectElement>("select");
        select?.focus();
      }
    };
    focusFirst();
    const timer = setTimeout(focusFirst, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!variantDialogRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setVariantModalMedia(null);
        setTimeout(() => variantTriggerRef.current?.focus(), 10);
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          variantDialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !variantDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !variantDialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [variantModalMedia]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    setUploadSuccess(null);
    setPendingFinalization(null);
    if (!file) {
      setSelectedFile(null);
      setClientFileError(null);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      setClientFileError(
        "Formato de archivo no permitido. Solo se aceptan JPEG, PNG, WebP o AVIF."
      );
      setSelectedFile(null);
      return;
    }

    if (file.size > 10485760) {
      setClientFileError(
        "El archivo seleccionado excede el límite máximo de 10 MiB (10485760 bytes)."
      );
      setSelectedFile(null);
      return;
    }

    setClientFileError(null);
    setSelectedFile(file);
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    setIsUploadingMedia(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadStage("requesting_intent");

    let signedToken = "";
    let putUrl = "";
    let reqHeaders: Record<string, string> = {};

    try {
      const intentRes = await requestMediaUploadIntentAction({
        productId: product.id,
        variantId: uploadTargetVariantId ? uploadTargetVariantId : null,
        mimeType: selectedFile.type as AllowedMediaUploadMimeType,
      });

      if (!intentRes.success || !intentRes.data) {
        setUploadError(intentRes.error ?? "No se pudo generar la autorización de subida.");
        setUploadStage("error");
        setIsUploadingMedia(false);
        return;
      }

      signedToken = intentRes.data.signedIntentToken;
      putUrl = intentRes.data.presignedPutUrl;
      reqHeaders = intentRes.data.requiredHeaders;
    } catch {
      setUploadError("Error al solicitar autorización de subida.");
      setUploadStage("error");
      setIsUploadingMedia(false);
      return;
    }

    try {
      setUploadStage("uploading_staging");
      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: reqHeaders,
        body: selectedFile,
      });

      if (!putRes.ok) {
        setUploadError("Error al transferir el archivo al almacenamiento temporal.");
        setUploadStage("error");
        setIsUploadingMedia(false);
        return;
      }
    } catch {
      setUploadError("Error de conexión durante la transferencia al almacenamiento temporal.");
      setUploadStage("error");
      setIsUploadingMedia(false);
      return;
    }

    setUploadStage("finalizing");
    const finalPayload = {
      productId: product.id,
      signedIntentToken: signedToken,
    };
    const mutationRequestId = mediaUploadTracker.current.getRequestId(finalPayload);

    const pendingState: PendingFinalizationState = {
      signedIntentToken: signedToken,
      mutationRequestId,
      productId: product.id,
      targetVariantId: uploadTargetVariantId ? uploadTargetVariantId : null,
      safeStatus: "ready_to_retry",
    };

    try {
      const finalRes = await finalizeMediaUploadAction({
        productId: product.id,
        signedIntentToken: signedToken,
        mutationRequestId,
      });

      if (finalRes.success) {
        mediaUploadTracker.current.complete();
        setPendingFinalization(null);
        setUploadSuccess("Imagen subida y normalizada a WebP exitosamente.");
        setUploadStage("success");
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } else {
        mediaUploadTracker.current.complete();
        setPendingFinalization(null);
        setUploadError(finalRes.error ?? "Error al finalizar el registro del activo multimedia.");
        setUploadStage("error");
      }
    } catch {
      setPendingFinalization(pendingState);
      setUploadError(
        "Error de conexión durante la finalización del activo. Puede reintentar la confirmación sin volver a transferir el archivo."
      );
      setUploadStage("error");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleRetryFinalization = async () => {
    if (!pendingFinalization) return;
    setIsUploadingMedia(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadStage("finalizing");
    setPendingFinalization((prev) => (prev ? { ...prev, safeStatus: "retrying" } : null));

    try {
      const finalRes = await finalizeMediaUploadAction({
        productId: pendingFinalization.productId,
        signedIntentToken: pendingFinalization.signedIntentToken,
        mutationRequestId: pendingFinalization.mutationRequestId,
      });

      if (finalRes.success) {
        mediaUploadTracker.current.complete();
        setPendingFinalization(null);
        setUploadSuccess("Imagen subida y normalizada a WebP exitosamente.");
        setUploadStage("success");
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } else {
        mediaUploadTracker.current.complete();
        setPendingFinalization(null);
        setUploadError(finalRes.error ?? "Error al finalizar el registro del activo multimedia.");
        setUploadStage("error");
      }
    } catch {
      setPendingFinalization((prev) => (prev ? { ...prev, safeStatus: "ready_to_retry" } : null));
      setUploadError(
        "Error de conexión durante el reintento de finalización. Puede volver a intentar."
      );
      setUploadStage("error");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSetPrimary = async (item: AdminProductUiDetail["media"][number]) => {
    if (item.variantId !== null) return;
    setIsSettingPrimary(item.id);
    setMediaOpError(null);
    setMediaOpSuccess(null);

    const payload = {
      productId: product.id,
      productMediaId: item.id,
      expectedUpdatedAt: new Date(product.updatedAt).toISOString(),
    };
    const mutationRequestId = mediaPrimaryTracker.current.getRequestId(payload);

    try {
      const res = await setPrimaryMediaAction({
        ...payload,
        mutationRequestId,
      });
      mediaPrimaryTracker.current.complete();

      if (res.success) {
        setMediaOpSuccess("Imagen principal actualizada exitosamente.");
        router.refresh();
      } else {
        setMediaOpError(res.error ?? "No se pudo actualizar la imagen principal.");
      }
    } catch {
      setMediaOpError("Error de conexión al asignar imagen principal.");
    } finally {
      setIsSettingPrimary(null);
    }
  };

  const handleOpenAltTextModal = (
    m: AdminProductUiDetail["media"][number],
    triggerElement: HTMLElement | null
  ) => {
    altTextTriggerRef.current = triggerElement;
    setAltTextModalMedia(m);
    setAltTextInput(m.altText ?? "");
    setAltTextError(null);
  };

  const handleSaveAltText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!altTextModalMedia) return;
    setIsSavingAltText(true);
    setAltTextError(null);

    const payload = {
      productId: product.id,
      mediaAssetId: altTextModalMedia.mediaAssetId,
      altText: altTextInput.trim() ? altTextInput.trim() : null,
    };
    const mutationRequestId = mediaAltTracker.current.getRequestId(payload);

    try {
      const res = await updateMediaAltTextAction({
        ...payload,
        mutationRequestId,
      });
      mediaAltTracker.current.complete();

      if (res.success) {
        const trigger = altTextTriggerRef.current;
        setAltTextModalMedia(null);
        setMediaOpSuccess("Texto alternativo actualizado exitosamente en todas sus referencias.");
        if (trigger) trigger.focus();
        router.refresh();
      } else {
        setAltTextError(res.error ?? "No se pudo actualizar el texto alternativo.");
      }
    } catch {
      setAltTextError("Error de conexión al actualizar texto alternativo.");
    } finally {
      setIsSavingAltText(false);
    }
  };

  const handleMoveMedia = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= media.length) return;

    setIsReorderingMedia(true);
    setMediaOpError(null);
    setMediaOpSuccess(null);

    const reordered = [...media];
    const temp = reordered[index]!;
    reordered[index] = reordered[targetIndex]!;
    reordered[targetIndex] = temp;

    const orderedIds = reordered.map((m) => m.id);
    const payload = {
      productId: product.id,
      orderedProductMediaIds: orderedIds,
    };
    const mutationRequestId = mediaReorderTracker.current.getRequestId(payload);

    try {
      const res = await reorderProductMediaAction({
        ...payload,
        mutationRequestId,
      });
      mediaReorderTracker.current.complete();

      if (res.success) {
        setMediaOpSuccess("Orden de medios actualizado exitosamente.");
        router.refresh();
      } else {
        setMediaOpError(res.error ?? "No se pudo reordenar los medios multimedia.");
      }
    } catch {
      setMediaOpError("Error de conexión al reordenar medios multimedia.");
    } finally {
      setIsReorderingMedia(false);
    }
  };

  const handleOpenVariantModal = (
    m: AdminProductUiDetail["media"][number],
    triggerElement: HTMLElement | null
  ) => {
    variantTriggerRef.current = triggerElement;
    setVariantModalMedia(m);
    setReassignVariantTarget(m.variantId ?? "");
    setReassignVariantError(null);
  };

  const handleSaveVariantAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantModalMedia) return;
    setIsReassigningVariant(true);
    setReassignVariantError(null);

    const payload = {
      productId: product.id,
      productMediaId: variantModalMedia.id,
      targetVariantId: reassignVariantTarget ? reassignVariantTarget : null,
    };
    const mutationRequestId = mediaVariantTracker.current.getRequestId(payload);

    try {
      const res = await reassignProductMediaVariantAction({
        ...payload,
        mutationRequestId,
      });
      mediaVariantTracker.current.complete();

      if (res.success) {
        const trigger = variantTriggerRef.current;
        setVariantModalMedia(null);
        setMediaOpSuccess("Asociación de variante actualizada exitosamente.");
        if (trigger) trigger.focus();
        router.refresh();
      } else {
        setReassignVariantError(res.error ?? "No se pudo reasignar la variante.");
      }
    } catch {
      setReassignVariantError("Error de conexión al reasignar variante.");
    } finally {
      setIsReassigningVariant(false);
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
                        step={field.step ?? "any"}
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

                    {/* ENUM Field (Always single-choice string selection for all enum specifications) */}
                    {field.dataType === "enum" && (
                      <select
                        id={`spec-${field.key}`}
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => handleSpecFieldChange(field.key, e.target.value || "")}
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

      {/* Section: Product Media Authoring Gallery */}
      <section className={styles.card} data-testid="section-media">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className={styles.cardTitle}>Medios Multimedia</h2>
            <p className={styles.cardDescription}>
              Gestione las imágenes del catálogo. Las subidas se firman criptográficamente, se
              cargan directamente a Cloudflare R2 y se normalizan automáticamente a formato WebP
              optimizado.
            </p>
          </div>
        </div>

        {/* Upload Control Box */}
        <div className={styles.mediaUploadBox} data-testid="media-upload-area">
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-text-primary, #18181b)",
            }}
          >
            Subir Nueva Imagen
          </span>
          <div className={styles.mediaUploadLimits} data-testid="media-upload-limits">
            Formatos admitidos: JPEG, PNG, WebP, AVIF. Tamaño máximo: 10 MiB (10,485,760 bytes).
            Normalización automática a WebP optimizado y direccionamiento por contenido SHA-256.
          </div>

          <div className={styles.mediaUploadControls}>
            <input
              id="media-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              ref={fileInputRef}
              onChange={handleFileChange}
              className={styles.mediaFileInput}
              data-testid="input-media-file"
              disabled={isUploadingMedia}
            />

            <select
              id="media-upload-variant"
              value={uploadTargetVariantId}
              onChange={(e) => {
                setUploadTargetVariantId(e.target.value);
                setPendingFinalization(null);
              }}
              className={styles.mediaVariantSelect}
              data-testid="select-media-upload-variant"
              disabled={isUploadingMedia}
            >
              <option value="">Global (Todo el producto)</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Variante: {v.title} ({v.sku})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleStartUpload}
              disabled={!selectedFile || isUploadingMedia}
              className={styles.primaryButton}
              data-testid="btn-upload-media"
            >
              {isUploadingMedia ? (
                <>
                  <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                  <span>
                    {uploadStage === "requesting_intent"
                      ? "Autorizando..."
                      : uploadStage === "uploading_staging"
                        ? "Subiendo a R2..."
                        : uploadStage === "finalizing"
                          ? "Normalizando WebP..."
                          : "Procesando..."}
                  </span>
                </>
              ) : (
                <>
                  <Upload size={14} aria-hidden="true" />
                  <span>Subir Imagen</span>
                </>
              )}
            </button>
          </div>

          {pendingFinalization && (
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={handleRetryFinalization}
                disabled={isUploadingMedia}
                className={styles.secondaryButton}
                data-testid="btn-retry-finalization"
              >
                {isUploadingMedia && uploadStage === "finalizing" ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                    <span>Reintentando finalización...</span>
                  </>
                ) : (
                  <span>Reintentar Finalización</span>
                )}
              </button>
            </div>
          )}

          {clientFileError && (
            <div
              className={styles.mediaUploadError}
              data-testid="media-client-error"
              role="alert"
              aria-live="assertive"
            >
              {clientFileError}
            </div>
          )}

          {uploadError && (
            <div
              className={styles.mediaUploadError}
              data-testid="media-upload-error"
              role="alert"
              aria-live="assertive"
            >
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div
              className={styles.mediaUploadSuccess}
              data-testid="media-upload-success"
              role="status"
              aria-live="polite"
            >
              {uploadSuccess}
            </div>
          )}
        </div>

        {/* Operational Notifications */}
        {mediaOpError && (
          <div
            className={styles.mediaUploadError}
            data-testid="media-op-error"
            role="alert"
            aria-live="assertive"
            style={{ marginTop: "1rem" }}
          >
            {mediaOpError}
          </div>
        )}
        {mediaOpSuccess && (
          <div
            className={styles.mediaUploadSuccess}
            data-testid="media-op-success"
            role="status"
            aria-live="polite"
            style={{ marginTop: "1rem" }}
          >
            {mediaOpSuccess}
          </div>
        )}

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

        {/* Media Gallery Grid */}
        {media.length > 0 ? (
          <div className={styles.mediaGrid}>
            {media.map((m, idx) => {
              const url = m.publicUrl;
              const isPrimary = m.mediaAssetId === product.primaryMediaId;
              const isVariantScoped = m.variantId !== null;
              const assignedVariant = m.variantId
                ? variants.find((v) => v.id === m.variantId)
                : null;

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

                  <div className={styles.mediaCardBadges}>
                    {isPrimary && (
                      <span className={styles.badgePrimary} data-testid={`badge-primary-${m.id}`}>
                        <Star size={10} fill="currentColor" aria-hidden="true" />
                        <span>Principal</span>
                      </span>
                    )}
                    {isVariantScoped ? (
                      <span className={styles.badgeVariant} data-testid={`badge-variant-${m.id}`}>
                        <Tag size={10} aria-hidden="true" />
                        <span>
                          Variante: {assignedVariant ? assignedVariant.title : m.variantId}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.badgeGlobal} data-testid={`badge-global-${m.id}`}>
                        <Globe size={10} aria-hidden="true" />
                        <span>Global</span>
                      </span>
                    )}
                  </div>

                  <div className={styles.mediaInfo}>
                    <span className={styles.mediaKey}>
                      {m.altText ?? `Asset Multimedia (Pos. ${m.displayOrder})`}
                    </span>
                    <span className={styles.mediaClass}>
                      Orden: {m.displayOrder} · {m.mimeType}
                      {m.width && m.height ? ` · ${m.width}×${m.height}px` : ""}
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

                  {/* Actions Toolbar */}
                  <div className={styles.mediaActionsToolbar}>
                    <button
                      type="button"
                      disabled={isPrimary || isVariantScoped || isSettingPrimary === m.id}
                      onClick={() => handleSetPrimary(m)}
                      className={styles.mediaActionButton}
                      title={
                        isVariantScoped
                          ? "Las imágenes de variante no pueden ser asignadas como principal global"
                          : isPrimary
                            ? "Ya es la imagen principal"
                            : "Asignar como imagen principal"
                      }
                      data-testid={`btn-set-primary-${m.id}`}
                    >
                      {isSettingPrimary === m.id ? (
                        <Loader2 size={12} className={styles.spinner} aria-hidden="true" />
                      ) : (
                        <Star
                          size={12}
                          fill={isPrimary ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      )}
                      <span>{isPrimary ? "Principal" : "Hacer Principal"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenAltTextModal(m, e.currentTarget)}
                      className={styles.mediaActionButton}
                      title="Editar texto alternativo (alt text)"
                      data-testid={`btn-edit-alt-${m.id}`}
                    >
                      <Edit2 size={12} aria-hidden="true" />
                      <span>Alt Text</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenVariantModal(m, e.currentTarget)}
                      className={styles.mediaActionButton}
                      title="Asignar o cambiar variante"
                      data-testid={`btn-reassign-variant-${m.id}`}
                    >
                      <Tag size={12} aria-hidden="true" />
                      <span>Variante</span>
                    </button>

                    <div className={styles.mediaReorderButtons}>
                      <button
                        type="button"
                        disabled={idx === 0 || isReorderingMedia}
                        onClick={() => handleMoveMedia(idx, "up")}
                        className={styles.mediaReorderButton}
                        aria-label="Mover hacia arriba"
                        title="Mover hacia arriba"
                        data-testid={`btn-move-up-${m.id}`}
                      >
                        <ArrowUp size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === media.length - 1 || isReorderingMedia}
                        onClick={() => handleMoveMedia(idx, "down")}
                        className={styles.mediaReorderButton}
                        aria-label="Mover hacia abajo"
                        title="Mover hacia abajo"
                        data-testid={`btn-move-down-${m.id}`}
                      >
                        <ArrowDown size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.cardDescription} data-testid="media-empty-state">
            Este producto no tiene medios multimedia registrados. Seleccione una imagen arriba para
            subirla.
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
        >
          <div
            ref={transitionDialogRef}
            className={styles.modalContent}
            data-testid="dialog-confirm-transition"
            tabIndex={-1}
          >
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

      {/* Alt-Text Editor Modal */}
      {altTextModalMedia && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-alt-title"
        >
          <div
            ref={altTextDialogRef}
            className={styles.modalContent}
            data-testid="modal-alt-text"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <h3 id="modal-alt-title" className={styles.modalTitle}>
                Editar Texto Alternativo
              </h3>
            </div>
            <p className={styles.sharedAltNotice} data-testid="notice-shared-alt-text">
              El texto alternativo describe la imagen para accesibilidad y SEO. Al actualizarse a
              nivel de MediaAsset, se comparte con cualquier otra referencia a esta misma imagen.
            </p>
            <form
              onSubmit={handleSaveAltText}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className={styles.field}>
                <label htmlFor="media-alt-input" className={styles.label}>
                  Texto Alternativo (máx. 255 caracteres)
                </label>
                <input
                  id="media-alt-input"
                  type="text"
                  maxLength={255}
                  value={altTextInput}
                  onChange={(e) => setAltTextInput(e.target.value)}
                  className={styles.input}
                  placeholder="Ej: Mouse inalámbrico blanco vista lateral"
                  data-testid="input-media-alt-text"
                />
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary, #71717a)",
                    textAlign: "right",
                  }}
                >
                  {altTextInput.length}/255
                </div>
              </div>

              {altTextError && (
                <div className={styles.mediaUploadError} data-testid="alt-text-error">
                  {altTextError}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setAltTextModalMedia(null);
                    altTextTriggerRef.current?.focus();
                  }}
                  className={styles.secondaryButton}
                  data-testid="btn-cancel-alt-text"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAltText}
                  className={styles.primaryButton}
                  data-testid="btn-save-alt-text"
                >
                  {isSavingAltText ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Texto</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Variant Reassignment Modal */}
      {variantModalMedia && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-variant-title"
        >
          <div
            ref={variantDialogRef}
            className={styles.modalContent}
            data-testid="modal-reassign-variant"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <h3 id="modal-variant-title" className={styles.modalTitle}>
                Asignar Imagen a Variante
              </h3>
            </div>
            <form
              onSubmit={handleSaveVariantAssignment}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className={styles.field}>
                <label htmlFor="select-reassign-variant" className={styles.label}>
                  Ámbito de Asociación
                </label>
                <select
                  id="select-reassign-variant"
                  value={reassignVariantTarget}
                  onChange={(e) => setReassignVariantTarget(e.target.value)}
                  className={styles.select}
                  data-testid="select-media-variant"
                >
                  <option value="">Global (Todo el producto)</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      Variante: {v.title} ({v.sku})
                    </option>
                  ))}
                </select>
              </div>

              {variantModalMedia.mediaAssetId === product.primaryMediaId &&
                reassignVariantTarget !== "" && (
                  <div
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "#fffbeb",
                      border: "1px solid #fef3c7",
                      borderRadius: "6px",
                      color: "#92400e",
                      fontSize: "0.75rem",
                      lineHeight: "1.4",
                    }}
                    data-testid="variant-primary-warning"
                  >
                    Atención: Esta imagen es la imagen principal actual del producto. Para asignarla
                    a una variante específica, el producto debe conservar otra imagen global o
                    designar otra imagen como principal antes del cambio.
                  </div>
                )}

              {reassignVariantError && (
                <div className={styles.mediaUploadError} data-testid="reassign-variant-error">
                  {reassignVariantError}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setVariantModalMedia(null);
                    variantTriggerRef.current?.focus();
                  }}
                  className={styles.secondaryButton}
                  data-testid="btn-cancel-reassign-variant"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReassigningVariant}
                  className={styles.primaryButton}
                  data-testid="btn-save-reassign-variant"
                >
                  {isReassigningVariant ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Asignación</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
