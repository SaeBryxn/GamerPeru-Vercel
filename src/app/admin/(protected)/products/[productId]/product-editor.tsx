"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "@/components/app-link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Lock,
  Upload,
  Check,
  ChevronDown,
  ExternalLink,
  X,
} from "lucide-react";
import {
  updateProductAction,
  duplicateProductAction,
  transitionProductStatusAction,
  updateMediaAltTextAction,
  reorderProductMediaAction,
  detachProductMediaAction,
  setPrimaryMediaAction,
  reassignProductMediaVariantAction,
} from "@/lib/admin/catalog/actions";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import { type StoryLifecycleSummary } from "@/lib/admin/catalog/story-builder-model";
import {
  getReadinessGuidance,
  type ProductEditorSection,
} from "@/lib/admin/catalog/readiness-guidance";
import { QualityChecklist } from "@/components/admin/products/quality-checklist";
import { FeaturedToggle } from "@/components/admin/products/featured-toggle";
import { MediaTile } from "@/components/admin/products/media-tile";
import type { AdminProductUiDetail } from "@/lib/admin/catalog/ui-dto";
import type { BrandReference, CategoryReference, CatalogStatus } from "@/lib/admin/catalog/types";
import type { VariantStockRow } from "@/lib/admin/inventory/readers";
import { findWeightSpecField } from "@/lib/admin/catalog/weight-spec";
import { VariantBoard } from "@/components/admin/products/variant-board";
import { AutofillBar } from "@/components/admin/products/autofill-bar";
import type { ProductAutofillContextDto } from "@/lib/ai/admin/readers";
import {
  EditorSafetyProvider,
  useEditorDirty,
  useEditorSafety,
} from "@/components/admin/products/editor-safety";
import {
  productEditorVersion,
  specificationDraftVersion,
} from "@/lib/admin/catalog/editor-version";
import { ProductPageStep } from "@/components/admin/products/product-page-step";
import { uploadDirect, type DirectUploadStage } from "@/lib/media/direct-upload-client";
import { requestUpload, completeUpload } from "@/lib/media/upload-api-client";
import styles from "./product-editor.module.css";
import { DeleteProductButton } from "./delete-product-button";

interface ProductEditorProps {
  initialDetail: AdminProductUiDetail;
  brands: BrandReference[];
  categories: CategoryReference[];
  actorPermissions: string[];
  storySummary: StoryLifecycleSummary;
  /** Stock per variant at the primary location. */
  variantStock: Record<string, VariantStockRow>;
  /** Null when the actor cannot run AI research. */
  autofill: ProductAutofillContextDto | null;
}

interface ToastMessage {
  id: number;
  tone: "success" | "error";
  text: string;
}

/** Long enough to read a short confirmation, short enough to stay out of the way. */
const TOAST_LIFETIME_MS = 3600;

/** Reordering is a burst of clicks; one save after the burst beats one save per click. */
const REORDER_DEBOUNCE_MS = 700;

interface UploadQueueItem {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** The editor as five steps in the order a product is filled in; "resumen" is the side panel. */
const EDITOR_STEPS: Array<{ section: ProductEditorSection; title: string; hint: string }> = [
  { section: "informacion", title: "Lo básico", hint: "Nombre, marca, categoría y descripción" },
  { section: "imagenes", title: "Fotos", hint: "La foto principal y la galería" },
  {
    section: "variantes",
    title: "Colores, tallas y precios",
    hint: "Precio y stock de cada versión",
  },
  {
    section: "especificaciones",
    title: "Especificaciones",
    hint: "Datos técnicos de la categoría",
  },
  {
    section: "historia",
    title: "Página del producto",
    hint: "Historia, regalo, accesorios y soporte",
  },
];
const EDITOR_SECTION_ORDER: ProductEditorSection[] = EDITOR_STEPS.map((step) => step.section);

export function ProductEditor(props: ProductEditorProps) {
  return (
    <EditorSafetyProvider
      productId={props.initialDetail.product.id}
      version={productEditorVersion(
        props.initialDetail.product,
        props.initialDetail.variants,
        props.initialDetail.media
      )}
    >
      <ProductEditorBody {...props} />
    </EditorSafetyProvider>
  );
}
function ProductEditorBody({
  initialDetail,
  brands,
  categories,
  actorPermissions,
  storySummary,
  variantStock,
  autofill,
}: ProductEditorProps) {
  const router = useRouter();
  const safety = useEditorSafety();
  const uploadController = useRef<AbortController | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  useEffect(() => () => uploadController.current?.abort(), []);

  const [detail, setDetail] = useState<AdminProductUiDetail>(initialDetail);

  const {
    product,
    category,
    currentSpecSchema,
    specifications,
    variants,
    media,
    publishReadiness,
  } = detail;

  const hasPublishPermission = actorPermissions.includes("catalog:publish");

  // One step open at a time: the first one with something missing, or the basics.
  const [activeSection, setActiveSection] = useState<ProductEditorSection>(() => {
    const firstMissing = initialDetail.publishReadiness.blockers
      .map((blocker) => getReadinessGuidance(blocker.code).section)
      .find((section) => EDITOR_SECTION_ORDER.includes(section));
    return firstMissing ?? "informacion";
  });
  // When the category's technical sheet has a weight field, weight is edited only there.
  const weightSpecField = findWeightSpecField(currentSpecSchema?.fieldDefinitions);

  const stepStorageKey = `gp:product-step:${product.id}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(stepStorageKey);
      if (!location.hash && EDITOR_SECTION_ORDER.includes(saved as ProductEditorSection))
        setActiveSection(saved as ProductEditorSection);
    } catch {
      /* Optional per-tab memory. */
    }
  }, [stepStorageKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(stepStorageKey, activeSection);
    } catch {
      /* Optional per-tab memory. */
    }
  }, [stepStorageKey, activeSection]);

  // A deep link from the product list ("#imagenes") opens that step.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (EDITOR_SECTION_ORDER.includes(hash as ProductEditorSection)) {
      setActiveSection(hash as ProductEditorSection);
    }
  }, []);

  const pushToast = useCallback((tone: ToastMessage["tone"], text: string) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current, { id, tone, text }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  // Server state wins whenever the set of images changes; a pending local reorder is not lost
  // because the debounced save always sends the order the operator can see.
  // Keyed on the id list rather than the array: a new array identity arrives on every server
  // render and would otherwise discard a reorder the operator can already see on screen.
  const mediaSignature = media.map((m) => m.id).join("|");
  const mediaRef = useRef(media);
  mediaRef.current = media;
  useEffect(() => {
    setMediaOrder(mediaRef.current);
  }, [mediaSignature]);

  useEffect(() => {
    return () => {
      if (reorderTimer.current) clearTimeout(reorderTimer.current);
    };
  }, []);

  const missingBySection = publishReadiness.blockers.reduce<
    Partial<Record<ProductEditorSection, number>>
  >((counts, blocker) => {
    const section = getReadinessGuidance(blocker.code).section;
    counts[section] = (counts[section] ?? 0) + 1;
    return counts;
  }, {});

  /** Opens a step and brings it into view; the summary panel uses it to jump to what is missing. */
  const openStep = useCallback(
    (section: ProductEditorSection) => {
      if (safety && !safety.canLeave()) return;
      setActiveSection(section);
      window.requestAnimationFrame(() => {
        document
          .getElementById(`panel-${section}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [safety]
  );

  const renderStepHeader = (section: ProductEditorSection) => {
    const index = EDITOR_STEPS.findIndex((step) => step.section === section);
    const step = EDITOR_STEPS[index];
    if (!step) return null;
    const missing = missingBySection[section] ?? 0;
    const isOpen = activeSection === section;
    return (
      <button
        type="button"
        className={styles.stepHeader}
        onClick={() => {
          if (isOpen) {
            if (!safety || safety.canLeave()) setActiveSection("resumen");
          } else openStep(section);
        }}
        aria-expanded={isOpen}
        data-testid={`section-nav-${section}`}
      >
        <span
          className={`${styles.stepNumber} ${missing === 0 && section !== "historia" ? styles.stepNumberDone : ""}`}
          aria-hidden="true"
        >
          {missing === 0 && section !== "historia" ? <Check size={14} /> : index + 1}
        </span>
        <span className={styles.stepText}>
          <span className={styles.stepTitle}>{step.title}</span>
          <span className={styles.stepHint}>{step.hint}</span>
        </span>
        {missing === 0 && (
          <span className={styles.stepHint}>
            {section === "historia"
              ? "Opcional: solo se muestran bloques con datos"
              : "Requisitos de publicación completos"}
          </span>
        )}
        {missing > 0 && (
          <span className={styles.stepMissing}>
            {missing === 1 ? "Falta 1 cosa" : `Faltan ${missing} cosas`}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`${styles.stepChevron} ${isOpen ? styles.stepChevronOpen : ""}`}
          aria-hidden="true"
        />
      </button>
    );
  };

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

  const [savedSpecValues, setSavedSpecValues] = useState(specValues);
  const dirtyDetails =
    JSON.stringify([
      name.trim(),
      slug.trim(),
      brandId,
      categoryId,
      subtitle.trim(),
      description.trim(),
      isFeatured,
    ]) !==
    JSON.stringify([
      product.name,
      product.slug,
      product.brandId,
      product.categoryId,
      product.subtitle ?? "",
      product.description ?? "",
      product.isFeatured,
    ]);
  const dirtySpecs =
    specificationDraftVersion(specValues) !== specificationDraftVersion(savedSpecValues);
  useEditorDirty("basics", dirtyDetails);
  useEditorDirty("specifications", dirtySpecs);
  const dirtyAuthoring = dirtyDetails || dirtySpecs;

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

  // Media Authoring & Management State (CHK3)
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastSeq = useRef(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadTargetVariantId, setUploadTargetVariantId] = useState<string>("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadStage, setUploadStage] = useState<DirectUploadStage | "idle" | "success" | "error">(
    "idle"
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [clientFileError, setClientFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Media Operation Feedback State
  const [isSettingPrimary, setIsSettingPrimary] = useState<string | null>(null);
  const [detachingMediaId, setDetachingMediaId] = useState<string | null>(null);
  const [confirmDetachId, setConfirmDetachId] = useState<string | null>(null);
  const [mediaOrder, setMediaOrder] = useState(media);
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReorderingMedia, setIsReorderingMedia] = useState(false);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [mediaOpError, setMediaOpError] = useState<string | null>(null);

  useEditorDirty("media", isUploadingMedia || selectedFiles.length > 0 || isReorderingMedia);

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
  const duplicateTracker = useRef(new MutationRequestTracker());
  const transitionTracker = useRef(new MutationRequestTracker());
  const mediaAltTracker = useRef(new MutationRequestTracker());
  const mediaReorderTracker = useRef(new MutationRequestTracker());
  const mediaPrimaryTracker = useRef(new MutationRequestTracker());
  const mediaVariantTracker = useRef(new MutationRequestTracker());

  // Authoritative State Resynchronization:
  // When initialDetail updates (from router refresh, category reconciliation, or identity change),
  // synchronize ALL client state from the authoritative server payload.
  useEffect(() => {
    if (dirtyAuthoring && initialDetail.product.id === product.id) {
      setStaleConflict(true);
      return;
    }
    setDetail(initialDetail);
    setName(initialDetail.product.name);
    setSlug(initialDetail.product.slug);
    setBrandId(initialDetail.product.brandId);
    setCategoryId(initialDetail.product.categoryId);
    setSubtitle(initialDetail.product.subtitle ?? "");
    setDescription(initialDetail.product.description ?? "");
    setIsFeatured(initialDetail.product.isFeatured);
    setSpecValues((initialDetail.specifications?.specValues as Record<string, unknown>) ?? {});
    setSavedSpecValues((initialDetail.specifications?.specValues as Record<string, unknown>) ?? {});
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
        setSpecValues(cleaned);
        setSavedSpecValues(cleaned);
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
    const files = Array.from(e.target.files ?? []);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadQueue([]);

    if (files.length === 0) {
      setSelectedFiles([]);
      setClientFileError(null);
      return;
    }

    const rejected: string[] = [];
    const accepted = files.filter((file) => {
      if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
        rejected.push(
          `${file.name}: ${/\.hei[cf]$/i.test(file.name) ? "HEIC no es compatible; conviértelo a JPEG o PNG" : "formato no permitido"}`
        );
        return false;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        rejected.push(`${file.name}: supera los 20 MB`);
        return false;
      }
      return true;
    });

    setClientFileError(
      rejected.length > 0
        ? `No se pueden subir ${rejected.length} archivo${rejected.length === 1 ? "" : "s"}. ${rejected.join(". ")}.`
        : null
    );
    setSelectedFiles(accepted);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
    setUploadQueue([]);
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setUploadQueue([]);
    setClientFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Uploads one photo straight to R2 (ADR-013): the browser re-encodes it (no EXIF, upright, at
   * most 2400 px), the server signs the PUT and then attaches the stored object after a HEAD
   * check. Confirm is idempotent, so a retry never adds the photo twice.
   */
  const uploadSingleFile = async (file: File): Promise<{ ok: boolean; error?: string }> => {
    const variantId = uploadTargetVariantId ? uploadTargetVariantId : null;
    const mutationRequestId = crypto.randomUUID();
    const result = await uploadDirect({
      purpose: "gallery_image",
      file,
      request: (input) =>
        requestUpload({ purpose: "gallery_image", productId: product.id, variantId, ...input }),
      confirm: (input) =>
        completeUpload({
          purpose: "gallery_image",
          productId: product.id,
          mutationRequestId,
          ...input,
        }),
      onStage: setUploadStage,
      signal: uploadController.current?.signal,
      onProgress: setUploadProgress,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  const handleStartUpload = async () => {
    if (selectedFiles.length === 0) return;

    uploadController.current = new AbortController();
    setUploadProgress(0);
    setIsUploadingMedia(true);
    setUploadError(null);
    setUploadSuccess(null);

    const queue: UploadQueueItem[] = selectedFiles.map((file) => ({
      name: file.name,
      status: "pending",
    }));
    setUploadQueue(queue);

    let uploaded = 0;

    for (const [index, file] of selectedFiles.entries()) {
      if (uploadController.current.signal.aborted) break;
      setUploadProgress(0);
      setUploadQueue((current) =>
        current.map((item, i) => (i === index ? { ...item, status: "uploading" } : item))
      );

      const result = await uploadSingleFile(file);

      setUploadQueue((current) =>
        current.map((item, i) =>
          i === index
            ? { ...item, status: result.ok ? "done" : "error", error: result.error }
            : item
        )
      );

      if (result.ok) uploaded += 1;
    }

    if (uploadController.current.signal.aborted) {
      setUploadQueue((current) =>
        current.map((item) =>
          item.status === "pending"
            ? { ...item, status: "error", error: "Subida cancelada." }
            : item
        )
      );
    }
    const failed = selectedFiles.length - uploaded;
    if (uploaded > 0) {
      setUploadSuccess(
        `${uploaded} foto${uploaded === 1 ? "" : "s"} subida${uploaded === 1 ? "" : "s"}.`
      );
      setUploadStage("success");
    }
    if (failed > 0) {
      setUploadError(
        `${failed} foto${failed === 1 ? "" : "s"} no se pudo subir. Revisa el detalle debajo.`
      );
      setUploadStage("error");
    }

    if (uploaded > 0) {
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    }

    uploadController.current = null;
    setIsUploadingMedia(false);
  };

  const handleSetPrimary = async (item: AdminProductUiDetail["media"][number]) => {
    if (item.variantId !== null) return;
    setIsSettingPrimary(item.id);
    setMediaOpError(null);

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
        pushToast("success", "Foto principal actualizada");
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
        pushToast("success", "Texto alternativo actualizado");
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

  /**
   * Persists whatever order is on screen. Called on a debounce so a run of arrow clicks results in
   * one write instead of one per click, which is what made the grid feel frozen.
   */
  const persistMediaOrder = async (ordered: AdminProductUiDetail["media"]) => {
    setIsReorderingMedia(true);
    setMediaOpError(null);

    const payload = {
      productId: product.id,
      orderedProductMediaIds: ordered.map((m) => m.id),
    };
    const mutationRequestId = mediaReorderTracker.current.getRequestId(payload);

    try {
      const res = await reorderProductMediaAction({ ...payload, mutationRequestId });
      mediaReorderTracker.current.complete();

      if (res.success) {
        pushToast("success", "Orden guardado");
      } else {
        setMediaOpError(res.error ?? "No se pudo reordenar las fotos.");
        pushToast("error", res.error ?? "No se pudo guardar el orden");
        router.refresh();
      }
    } catch {
      setMediaOpError("Error de conexión al reordenar las fotos.");
      pushToast("error", "Se perdió la conexión al guardar el orden");
      router.refresh();
    } finally {
      setIsReorderingMedia(false);
    }
  };

  const reorderMedia = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= mediaOrder.length) return;

    const reordered = [...mediaOrder];
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(toIndex, 0, moved);

    setMediaOrder(reordered);

    if (reorderTimer.current) clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(() => {
      void persistMediaOrder(reordered);
    }, REORDER_DEBOUNCE_MS);
  };

  const handleDetachMedia = async (mediaItem: AdminProductUiDetail["media"][number]) => {
    setConfirmDetachId(null);
    setDetachingMediaId(mediaItem.id);
    setMediaOpError(null);

    try {
      const res = await detachProductMediaAction({
        productId: product.id,
        productMediaId: mediaItem.id,
        mutationRequestId: crypto.randomUUID(),
      });

      if (res.success) {
        setMediaOrder((current) => current.filter((m) => m.id !== mediaItem.id));
        pushToast("success", "Foto quitada del producto");
        router.refresh();
      } else {
        setMediaOpError(res.error ?? "No se pudo quitar la foto.");
        pushToast("error", res.error ?? "No se pudo quitar la foto");
      }
    } catch {
      setMediaOpError("Error de conexión al quitar la foto.");
      pushToast("error", "Se perdió la conexión al quitar la foto");
    } finally {
      setDetachingMediaId(null);
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
        pushToast("success", "Variante de la foto actualizada");
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

  return (
    <div className={styles.container}>
      {/* Top Bar / Breadcrumb */}
      <div className={styles.topBar}>
        <Link href="/admin/products" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver a productos</span>
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
                <a
                  href={`/productos/${product.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.secondaryButton}
                  data-testid="btn-view-on-storefront"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  <span>Ver en la tienda</span>
                </a>
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
                  <span>Quitar de la tienda</span>
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
            <DeleteProductButton
              productId={product.id}
              productName={product.name}
              status={product.status}
              updatedAt={product.updatedAt}
              canDeleteLive={hasPublishPermission}
            />
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

      {autofill && (
        <AutofillBar
          productId={product.id}
          productName={product.name}
          isDraft={product.status === "DRAFT"}
          context={autofill}
        />
      )}

      <div className={styles.editorLayout}>
        <div className={styles.stepList}>
          <section
            id="panel-informacion"
            className={`${styles.step} ${activeSection === "informacion" ? styles.stepOpen : ""}`}
          >
            {renderStepHeader("informacion")}
            {activeSection === "informacion" && (
              <section
                id="informacion"
                className={styles.card}
                data-testid="section-general-details"
              >
                <p className={styles.cardDescription}>
                  Esto es lo que el cliente lee en la tienda.
                </p>
                <form
                  onSubmit={handleSaveDetails}
                  style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
                >
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label htmlFor="edit-name" className={styles.label}>
                        Nombre del producto <span className={styles.required}>*</span>
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
                        Dirección en la tienda <span className={styles.required}>*</span>
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
                      <p className={styles.helpText}>gamerperu.com/productos/{slug || "…"}</p>
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
                          Al cambiar la categoría, las especificaciones pasan a los campos de la
                          nueva categoría.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="edit-subtitle" className={styles.label}>
                      Subtítulo
                    </label>
                    <input
                      id="edit-subtitle"
                      type="text"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="Ej. Edición de rendimiento"
                      className={styles.input}
                      data-testid="input-subtitle"
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="edit-description" className={styles.label}>
                      Descripción
                    </label>
                    <textarea
                      id="edit-description"
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Qué lo hace distinto: construcción, sensor, para qué tipo de juego sirve..."
                      className={styles.textarea}
                      data-testid="input-description"
                    />
                  </div>

                  <FeaturedToggle checked={isFeatured} onChange={setIsFeatured} />

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
                        <span>Guardar</span>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </section>
          <section
            id="panel-imagenes"
            className={`${styles.step} ${activeSection === "imagenes" ? styles.stepOpen : ""}`}
          >
            {renderStepHeader("imagenes")}
            {activeSection === "imagenes" && (
              <section id="imagenes" className={styles.card} data-testid="section-media">
                {isUploadingMedia && (
                  <div aria-live="polite">
                    <progress
                      className={styles.uploadProgress}
                      role="progressbar"
                      aria-label="Progreso de subida"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadProgress}
                      value={uploadProgress}
                      max={100}
                    />{" "}
                    {uploadProgress}%
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => uploadController.current?.abort()}
                    >
                      Cancelar subida
                    </button>
                  </div>
                )}
                <p className={styles.cardDescription}>
                  La foto principal se ve en la tienda y en los listados. Arrastra las demás para
                  ordenar la galería.
                </p>

                {/* Upload Control Box */}
                <div className={styles.mediaUploadBox} data-testid="media-upload-area">
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--color-text-primary, #18181b)",
                    }}
                  >
                    Agregar una foto
                  </span>
                  <div className={styles.mediaUploadLimits} data-testid="media-upload-limits">
                    JPG, PNG, WebP o AVIF de hasta 20 MB. Mejor cuadradas, de 1200 × 1200 px o más.
                  </div>

                  <div className={styles.mediaUploadControls}>
                    <input
                      id="media-file-input"
                      type="file"
                      multiple
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
                      }}
                      className={styles.mediaVariantSelect}
                      data-testid="select-media-upload-variant"
                      disabled={isUploadingMedia}
                    >
                      <option value="">Para todo el producto</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          Solo para {v.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleStartUpload}
                      disabled={selectedFiles.length === 0 || isUploadingMedia}
                      className={styles.primaryButton}
                      data-testid="btn-upload-media"
                    >
                      {isUploadingMedia ? (
                        <>
                          <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                          <span>
                            {uploadStage === "preparing"
                              ? "Preparando foto..."
                              : uploadStage === "authorizing"
                                ? "Autorizando..."
                                : uploadStage === "uploading"
                                  ? "Subiendo..."
                                  : "Registrando..."}
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload size={14} aria-hidden="true" />
                          <span>
                            {selectedFiles.length > 1
                              ? `Subir ${selectedFiles.length} fotos`
                              : "Subir foto"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  {selectedFiles.length > 0 && uploadQueue.length === 0 && (
                    <ul className={styles.mediaSelectedList} data-testid="media-selected-list">
                      {selectedFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`} className={styles.mediaSelectedItem}>
                          <ImageIcon size={14} aria-hidden="true" />
                          <span className={styles.mediaSelectedName}>{file.name}</span>
                          <span className={styles.mediaSelectedSize}>
                            {(file.size / 1048576).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(index)}
                            className={styles.mediaSelectedRemove}
                            aria-label={`Quitar ${file.name} de la lista`}
                            disabled={isUploadingMedia}
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          onClick={clearSelectedFiles}
                          className={styles.mediaSelectedClear}
                          disabled={isUploadingMedia}
                        >
                          Quitar todas
                        </button>
                      </li>
                    </ul>
                  )}

                  {uploadQueue.length > 0 && (
                    <ul className={styles.mediaSelectedList} data-testid="media-upload-queue">
                      {uploadQueue.map((item, index) => (
                        <li
                          key={`${item.name}-${index}`}
                          className={styles.mediaSelectedItem}
                          data-testid={`media-queue-item-${index}`}
                        >
                          {item.status === "uploading" ? (
                            <Loader2 size={14} className={styles.spinner} aria-hidden="true" />
                          ) : item.status === "done" ? (
                            <CheckCircle2
                              size={14}
                              className={styles.queueDone}
                              aria-hidden="true"
                            />
                          ) : item.status === "error" ? (
                            <XCircle size={14} className={styles.queueError} aria-hidden="true" />
                          ) : (
                            <ImageIcon size={14} aria-hidden="true" />
                          )}
                          <span className={styles.mediaSelectedName}>{item.name}</span>
                          <span className={styles.mediaSelectedSize}>
                            {item.status === "done"
                              ? "Lista"
                              : item.status === "uploading"
                                ? "Subiendo..."
                                : item.status === "error"
                                  ? (item.error ?? "Error")
                                  : "En espera"}
                          </span>
                        </li>
                      ))}
                    </ul>
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

                {mediaOrder.length > 0 ? (
                  <div
                    className={styles.mediaGrid}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDropTargetIndex(null);
                      }
                    }}
                  >
                    {mediaOrder.map((m, idx) => {
                      const assignedVariant = m.variantId
                        ? variants.find((v) => v.id === m.variantId)
                        : null;

                      return (
                        <MediaTile
                          key={m.id}
                          media={m}
                          index={idx}
                          count={mediaOrder.length}
                          productName={product.name}
                          isPrimary={m.mediaAssetId === product.primaryMediaId}
                          variantLabel={assignedVariant?.title ?? null}
                          isSettingPrimary={isSettingPrimary === m.id}
                          isDetaching={detachingMediaId === m.id}
                          isConfirmingDetach={confirmDetachId === m.id}
                          isReordering={isReorderingMedia}
                          isDragSource={dragSourceIndex === idx}
                          isDropTarget={dragSourceIndex !== null && dropTargetIndex === idx}
                          onSetPrimary={() => handleSetPrimary(m)}
                          onEditAlt={(trigger) => handleOpenAltTextModal(m, trigger)}
                          onEditVariant={(trigger) => handleOpenVariantModal(m, trigger)}
                          onRequestDetach={() => setConfirmDetachId(m.id)}
                          onCancelDetach={() => setConfirmDetachId(null)}
                          onConfirmDetach={() => void handleDetachMedia(m)}
                          onMove={(direction) =>
                            reorderMedia(idx, direction === "up" ? idx - 1 : idx + 1)
                          }
                          onDragStart={() => setDragSourceIndex(idx)}
                          onDragEnter={() => setDropTargetIndex(idx)}
                          onDragEnd={() => {
                            setDragSourceIndex(null);
                            setDropTargetIndex(null);
                          }}
                          onDrop={() => {
                            if (dragSourceIndex !== null && !isReorderingMedia) {
                              reorderMedia(dragSourceIndex, idx);
                            }
                            setDragSourceIndex(null);
                            setDropTargetIndex(null);
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.cardDescription} data-testid="media-empty-state">
                    Todavía no hay fotos. Sube la primera arriba.
                  </p>
                )}
              </section>
            )}
          </section>
          <section
            id="panel-variantes"
            className={`${styles.step} ${activeSection === "variantes" ? styles.stepOpen : ""}`}
          >
            {renderStepHeader("variantes")}
            {activeSection === "variantes" && (
              <section id="variantes" className={styles.card} data-testid="section-variants">
                <VariantBoard
                  productId={product.id}
                  productName={product.name}
                  variants={variants}
                  media={media}
                  variantStock={variantStock}
                  primaryMediaAssetId={detail.primaryMedia?.mediaAssetId ?? null}
                  canManageInventory={actorPermissions.includes("inventory:manage")}
                  weightSpecLabel={weightSpecField?.label ?? null}
                  onChanged={() => router.refresh()}
                />
              </section>
            )}
          </section>
          <section
            id="panel-especificaciones"
            className={`${styles.step} ${activeSection === "especificaciones" ? styles.stepOpen : ""}`}
          >
            {renderStepHeader("especificaciones")}
            {activeSection === "especificaciones" && (
              <section
                id="especificaciones"
                className={styles.card}
                data-testid="section-specifications"
              >
                <p className={styles.cardDescription}>
                  {currentSpecSchema
                    ? `Datos técnicos de ${category.name}. Puedes guardar aunque falten algunos.`
                    : `${category.name} todavía no tiene campos técnicos. Se agregan en Categorías y marcas.`}
                </p>

                {currentSpecSchema && currentSpecSchema.fieldDefinitions ? (
                  <form onSubmit={handleSaveSpecs} className={styles.specForm}>
                    <div className={styles.specGrid}>
                      {currentSpecSchema.fieldDefinitions.map((field) => {
                        const val = specValues[field.key];

                        return (
                          <div key={field.key} className={styles.field}>
                            <label
                              htmlFor={`spec-${field.key}`}
                              className={`${styles.label} ${styles.specLabel}`}
                            >
                              <span className={styles.specLabelText} title={field.label}>
                                {field.label}
                              </span>
                              {field.unit && (
                                <span className={styles.specUnit}>({field.unit})</span>
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
                                onChange={(e) =>
                                  handleSpecFieldChange(field.key, e.target.value || "")
                                }
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

                    <div className={styles.specFooter}>
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
                          <span>Guardar</span>
                        )}
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            )}
          </section>
          <section
            id="panel-historia"
            className={`${styles.step} ${activeSection === "historia" ? styles.stepOpen : ""}`}
          >
            {renderStepHeader("historia")}
            {activeSection === "historia" && (
              <section id="historia" className={styles.card} data-testid="product-story-entry">
                <ProductPageStep
                  technicalFieldNames={Object.entries(specifications?.specValues ?? {})
                    .filter(
                      ([, value]) =>
                        value !== null &&
                        value !== undefined &&
                        value !== "" &&
                        (!Array.isArray(value) || value.length > 0)
                    )
                    .map(
                      ([key]) =>
                        `${key} ${currentSpecSchema?.fieldDefinitions.find((field) => field.key === key)?.label ?? ""}`
                    )}
                  product={product}
                  pdpConfig={product.pdpConfig}
                  variants={variants}
                  media={media}
                  storySummary={storySummary}
                  onChanged={() => router.refresh()}
                />
              </section>
            )}
          </section>
        </div>

        <aside className={styles.publishPanel} aria-label="Para publicar">
          <section
            id="panel-resumen"
            className={styles.card}
            aria-label="Estado de publicación"
            data-testid="section-publish-readiness"
          >
            <div className={styles.readinessStatusHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <h2 className={styles.cardTitle}>Para publicar</h2>
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
                      <span>
                        {publishReadiness.blockers.length === 1
                          ? "Falta 1 cosa"
                          : `Faltan ${publishReadiness.blockers.length} cosas`}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {!hasPublishPermission && (
                <span className={styles.permissionNotice} data-testid="publish-permission-notice">
                  <Lock
                    size={12}
                    style={{ display: "inline", marginRight: 4 }}
                    aria-hidden="true"
                  />
                  Solo lectura de publicación (requiere permiso <code>catalog:publish</code>).
                </span>
              )}
            </div>

            {publishReadiness.blockers.length > 0 && (
              <QualityChecklist
                title={
                  // A published product is already on sale; the gaps are what the customer misses.
                  product.status === "PUBLISHED"
                    ? "Ya está en la tienda, pero le falta esto"
                    : "Falta esto para que el producto entre a la tienda"
                }
                tone="blocker"
                issues={publishReadiness.blockers}
                onJump={openStep}
                testId="readiness-blockers-list"
                itemTestIdPrefix="blocker"
              />
            )}

            {publishReadiness.warnings.length > 0 && (
              <QualityChecklist
                title="Recomendado, pero no obligatorio"
                tone="warning"
                issues={publishReadiness.warnings}
                onJump={openStep}
                testId="publish-warnings"
                itemTestIdPrefix="warning"
              />
            )}
          </section>
        </aside>
      </div>

      <div className={styles.toastStack} aria-live="polite" data-testid="media-op-success">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <m.div
              key={toast.id}
              layout
              className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : styles.toastSuccess}`}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              {toast.tone === "error" ? (
                <XCircle size={15} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={15} aria-hidden="true" />
              )}
              <span>{toast.text}</span>
            </m.div>
          ))}
        </AnimatePresence>
      </div>

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
