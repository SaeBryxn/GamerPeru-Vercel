"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  discardProductStoryDraftAction,
  publishProductStoryAction,
  saveProductStoryDraftAction,
  unpublishProductStoryAction,
} from "@/lib/admin/catalog/story-actions";
import {
  adaptPersistedValidationIssueToAuthoring,
  classifyStoryActionResult,
  createEditorDocument,
  createInitialEditorBlock,
  duplicateEditorBlock,
  getStoryBlockDefinition,
  getStoryLifecycleText,
  isStoryBuilderDirty,
  moveEditorBlock,
  normalizeEditorStoryDocument,
  removeEditorBlock,
  resolveTargetFromIssuePath,
  STORY_BUILDER_MAX_BLOCKS,
  type EditorStoryBlock,
  type StoryBlockType,
  type StoryLifecycle,
  type StoryLifecycleSummary,
} from "@/lib/admin/catalog/story-builder-model";
import { detachProductMediaAction } from "@/lib/admin/catalog/actions";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import type {
  AdminProductStoryDto,
  AdminStoryRelatedProductOption,
  AdminStorySelectableMedia,
} from "@/lib/admin/catalog/story-reader";
import type {
  AuthoringStoryDocument,
  StoryValidationIssue,
} from "@/lib/admin/catalog/story-validation";
import {
  BLOCK_LIBRARY_GROUPS,
  BLOCK_REQUIREMENTS,
  STARTER_BLOCK_TYPES,
  STORY_FLOW_STEPS,
} from "./block-library-guide";
import { BlockWireframe } from "./block-wireframe";
import { MediaPickerDialog, type DeleteStoryMediaResult } from "./media-picker-dialog";
import { RelatedProductPickerDialog } from "./related-product-picker-dialog";
import { ValidationSummary } from "./validation-summary";
import {
  clearStoryMediaReferences,
  collectIncompleteBlockIds,
  getDefaultExpandedBlockIds,
} from "./story-builder-state";
import { HeroMediaEditor } from "./block-editors/hero-media-editor";
import { FullBleedImageEditor } from "./block-editors/full-bleed-image-editor";
import { ImageTextEditor } from "./block-editors/image-text-editor";
import { StatHighlightEditor } from "./block-editors/stat-highlight-editor";
import { SpecFeatureEditor } from "./block-editors/spec-feature-editor";
import { VideoEditor } from "./block-editors/video-editor";
import { GalleryEditor } from "./block-editors/gallery-editor";
import { ComparisonEditor } from "./block-editors/comparison-editor";
import { DimensionsEditor } from "./block-editors/dimensions-editor";
import { BoxContentsEditor } from "./block-editors/box-contents-editor";
import { TechnicalSpecsEditor } from "./block-editors/technical-specs-editor";
import { FaqEditor } from "./block-editors/faq-editor";
import { RelatedProductsEditor } from "./block-editors/related-products-editor";
import styles from "./story-builder.module.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StoryBuilderProps {
  initialStory: AdminProductStoryDto;
  canPublish?: boolean;
}

interface DurableStoryView extends StoryLifecycleSummary {
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
}

type PendingConfirmation =
  | { kind: "DELETE_BLOCK"; blockId: string; label: string }
  | { kind: "RESET_LOCAL" }
  | { kind: "DISCARD_DRAFT" }
  | { kind: "PUBLISH" }
  | { kind: "UNPUBLISH" }
  | { kind: "NAVIGATE"; href: string }
  | { kind: "RELOAD_SERVER" };

interface MediaPickerState {
  isOpen: boolean;
  title: string;
  mediaType: "IMAGE" | "VIDEO";
  selectedMediaId?: string;
  allowClear?: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (mediaId: string | undefined) => void;
}

interface RelatedProductPickerState {
  isOpen: boolean;
  blockId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function deriveLifecycle(
  draftRevisionId: string | null,
  publishedRevisionId: string | null
): StoryLifecycle {
  if (draftRevisionId !== null) {
    return publishedRevisionId !== null ? "DRAFT_OVER_PUBLISHED" : "DRAFT_ONLY";
  }
  return publishedRevisionId !== null ? "PUBLISHED_ONLY" : "NO_STORY";
}

function durableViewFromStory(story: AdminProductStoryDto): DurableStoryView {
  return {
    lifecycle: story.lifecycle,
    draftRevisionId: story.concurrency.expectedDraftRevisionId,
    draftRevisionNumber: story.draft?.revisionNumber ?? null,
    publishedRevisionId: story.concurrency.expectedPublishedRevisionId,
    publishedRevisionNumber: story.published?.revisionNumber ?? null,
    publishedAt: story.published?.publishedAt ?? null,
  };
}

function formatPublishedAt(value: string | null): string | null {
  if (value === null) return null;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function useDialogFocus(
  isOpen: boolean,
  dialogRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  canClose: boolean = true
) {
  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusFirst = () => {
      if (dialog.contains(document.activeElement) && document.activeElement !== dialog) {
        return;
      }
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? dialog).focus();
    };
    focusFirst();
    const timer = window.setTimeout(focusFirst, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!canClose) return;
        event.preventDefault();
        onClose();
        window.setTimeout(() => triggerRef.current?.focus(), 10);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !dialog.contains(target)) {
        event.stopPropagation();
        focusFirst();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [canClose, dialogRef, isOpen, onClose, triggerRef]);
}

export function StoryBuilder({ initialStory, canPublish = false }: StoryBuilderProps) {
  const router = useRouter();

  // Unified canonical rehydration
  const [document, setDocument] = useState<EditorStoryBlock[]>(() =>
    createEditorDocument(initialStory.initialDocument)
  );
  const [savedBaseline, setSavedBaseline] = useState<AuthoringStoryDocument>(() =>
    structuredClone(initialStory.initialDocument)
  );
  const [durableStory, setDurableStory] = useState<DurableStoryView>(() =>
    durableViewFromStory(initialStory)
  );
  // Grows when an image is uploaded from the picker, so blocks can show it without a reload.
  const [selectableMedia, setSelectableMedia] = useState(initialStory.selectableMedia);
  const [knownProductOptions, setKnownProductOptions] = useState<
    Map<string, AdminStoryRelatedProductOption>
  >(() => new Map((initialStory.initialRelatedProducts ?? []).map((p) => [p.productId, p])));

  // Solo el primer bloque y los incompletos empiezan desplegados.
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(() =>
    getDefaultExpandedBlockIds(document)
  );

  // Validation issues state
  const [validationIssues, setValidationIssues] = useState<StoryValidationIssue[]>([]);

  // Modals state
  const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
  const [mediaPickerState, setMediaPickerState] = useState<MediaPickerState | null>(null);
  const [relatedProductPickerState, setRelatedProductPickerState] =
    useState<RelatedProductPickerState | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  // Status & feedback
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);
  const [ambiguousSave, setAmbiguousSave] = useState(false);
  const [ambiguousPublish, setAmbiguousPublish] = useState(false);
  const [ambiguousUnpublish, setAmbiguousUnpublish] = useState(false);
  const [isAuthoritativeReloadPending, setIsAuthoritativeReloadPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [validationActive, setValidationActive] = useState(false);

  // Trackers and refs
  const saveTracker = useRef(new MutationRequestTracker());
  const discardTracker = useRef(new MutationRequestTracker());
  const publishTracker = useRef(new MutationRequestTracker());
  const unpublishTracker = useRef(new MutationRequestTracker());
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const addBlockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const libraryDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const preservedUnpublishDocumentRef = useRef<EditorStoryBlock[] | null>(null);
  // Reutiliza el mutationRequestId si la eliminación falló sin respuesta (reintento idempotente).
  const detachRequestIds = useRef(new Map<string, string>());
  const allowAuthoritativeReloadRef = useRef(false);
  const lastProductIdRef = useRef(initialStory.product.id);

  const dirty = useMemo(
    () => isStoryBuilderDirty(document, savedBaseline),
    [document, savedBaseline]
  );
  const normResult = useMemo(() => normalizeEditorStoryDocument(document), [document]);
  const incompleteBlockIds = useMemo(
    () =>
      normResult.success
        ? new Set<string>()
        : collectIncompleteBlockIds(document, normResult.issues),
    [document, normResult]
  );
  const incompleteCount = incompleteBlockIds.size;

  const isAnyMutationPending = isSaving || isDiscarding || isPublishing || isUnpublishing;
  const isAnyAmbiguityActive = ambiguousSave || ambiguousPublish || ambiguousUnpublish;

  const hasDurableDraft = durableStory.draftRevisionId !== null;
  const hasBlocksToPublish = savedBaseline.length > 0 && document.length > 0;

  const previewDisabled = !hasDurableDraft || dirty;
  const previewDisabledReason = !hasDurableDraft
    ? "Guarda un borrador antes de previsualizar."
    : dirty
      ? "Guarda los cambios antes de previsualizar."
      : null;

  const publishEligible =
    canPublish &&
    hasDurableDraft &&
    !dirty &&
    hasBlocksToPublish &&
    normResult.success &&
    !staleConflict &&
    !isAnyMutationPending &&
    !isAnyAmbiguityActive;

  const publishDisabled =
    !canPublish ||
    isAnyMutationPending ||
    ambiguousSave ||
    ambiguousUnpublish ||
    (!ambiguousPublish && !publishEligible);

  const unpublishEligible =
    canPublish &&
    durableStory.publishedRevisionId !== null &&
    !staleConflict &&
    !isAnyMutationPending &&
    !isAnyAmbiguityActive;

  const unpublishDisabled =
    !canPublish ||
    isAnyMutationPending ||
    ambiguousSave ||
    ambiguousPublish ||
    (!ambiguousUnpublish && !unpublishEligible);

  const canSaveWithoutChanges = durableStory.draftRevisionId === null;
  const saveDisabled =
    isAnyMutationPending ||
    ambiguousPublish ||
    ambiguousUnpublish ||
    document.length > STORY_BUILDER_MAX_BLOCKS ||
    (!dirty && !canSaveWithoutChanges);

  const discardDisabled =
    isAnyMutationPending ||
    ambiguousSave ||
    ambiguousPublish ||
    ambiguousUnpublish ||
    !hasDurableDraft;

  useEffect(() => {
    // 1. If product ID changed, this is a navigation to a different product
    if (initialStory.product.id !== lastProductIdRef.current) {
      lastProductIdRef.current = initialStory.product.id;
      preservedUnpublishDocumentRef.current = null;
      allowAuthoritativeReloadRef.current = false;
      setIsAuthoritativeReloadPending(false);
      setDocument(createEditorDocument(initialStory.initialDocument));
      setSavedBaseline(structuredClone(initialStory.initialDocument));
      setDurableStory(durableViewFromStory(initialStory));
      setKnownProductOptions(
        new Map((initialStory.initialRelatedProducts ?? []).map((p) => [p.productId, p]))
      );
      setExpandedBlockIds(
        getDefaultExpandedBlockIds(createEditorDocument(initialStory.initialDocument))
      );
      setStaleConflict(false);
      saveTracker.current.complete();
      discardTracker.current.complete();
      publishTracker.current.complete();
      unpublishTracker.current.complete();
      setAmbiguousSave(false);
      setAmbiguousPublish(false);
      setAmbiguousUnpublish(false);
      setErrorMessage(null);
      setFieldErrors([]);
      setValidationIssues([]);
      setValidationActive(false);
      return;
    }

    // 2. If explicit reload was requested (via reload button or draft discard)
    if (allowAuthoritativeReloadRef.current) {
      allowAuthoritativeReloadRef.current = false;
      setIsAuthoritativeReloadPending(false);
      preservedUnpublishDocumentRef.current = null;
      setDocument(createEditorDocument(initialStory.initialDocument));
      setSavedBaseline(structuredClone(initialStory.initialDocument));
      setDurableStory(durableViewFromStory(initialStory));
      setKnownProductOptions(
        new Map((initialStory.initialRelatedProducts ?? []).map((p) => [p.productId, p]))
      );
      setExpandedBlockIds(
        getDefaultExpandedBlockIds(createEditorDocument(initialStory.initialDocument))
      );
      setStaleConflict(false);
      saveTracker.current.complete();
      discardTracker.current.complete();
      publishTracker.current.complete();
      unpublishTracker.current.complete();
      setAmbiguousSave(false);
      setAmbiguousPublish(false);
      setAmbiguousUnpublish(false);
      setErrorMessage(null);
      setFieldErrors([]);
      setValidationIssues([]);
      setValidationActive(false);
      return;
    }

    // 3. If unpublish preservation is active (Case B: published-only unpublish)
    if (preservedUnpublishDocumentRef.current !== null) {
      // Server returned empty document because story was unpublished
      // Preserve local editor document and keep baseline empty ([]), dirty = true
      setDurableStory({
        lifecycle: "NO_STORY",
        draftRevisionId: null,
        draftRevisionNumber: null,
        publishedRevisionId: null,
        publishedRevisionNumber: null,
        publishedAt: null,
      });
      setSavedBaseline([]);
      return;
    }

    // 4. Default: If not dirty, sync cleanly from incoming initialStory
    if (!isStoryBuilderDirty(document, savedBaseline)) {
      setDocument(createEditorDocument(initialStory.initialDocument));
      setSavedBaseline(structuredClone(initialStory.initialDocument));
      setDurableStory(durableViewFromStory(initialStory));
      setKnownProductOptions(
        new Map((initialStory.initialRelatedProducts ?? []).map((p) => [p.productId, p]))
      );
      setExpandedBlockIds(
        getDefaultExpandedBlockIds(createEditorDocument(initialStory.initialDocument))
      );
    } else {
      // Local document has dirty unsaved edits; update only background durableStory metadata
      setDurableStory(durableViewFromStory(initialStory));
    }
  }, [initialStory]);

  const deleteStoryMediaFromProduct = useCallback(
    async (media: AdminStorySelectableMedia): Promise<DeleteStoryMediaResult> => {
      const productMediaId = media.productMediaId;
      const mutationRequestId = detachRequestIds.current.get(productMediaId) ?? crypto.randomUUID();
      detachRequestIds.current.set(productMediaId, mutationRequestId);

      let result: Awaited<ReturnType<typeof detachProductMediaAction>>;
      try {
        result = await detachProductMediaAction({
          productId: initialStory.product.id,
          productMediaId,
          mutationRequestId,
        });
      } catch {
        return {
          ok: false,
          error: "Se perdió la conexión al eliminar el video. Inténtalo de nuevo.",
        };
      }

      detachRequestIds.current.delete(productMediaId);
      if (!result.success) {
        return { ok: false, error: result.error ?? "No se pudo eliminar el video del producto." };
      }

      setSelectableMedia((current) => current.filter((m) => m.productMediaId !== productMediaId));
      setDocument((current) => clearStoryMediaReferences(current, productMediaId));
      setMediaPickerState((current) =>
        current?.selectedMediaId === productMediaId
          ? { ...current, selectedMediaId: undefined }
          : current
      );
      return { ok: true };
    },
    [initialStory.product.id]
  );

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;

    const handleInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      confirmationTriggerRef.current = anchor;
      setPendingConfirmation({
        kind: "NAVIGATE",
        href: `${destination.pathname}${destination.search}${destination.hash}`,
      });
    };

    window.document.addEventListener("click", handleInternalNavigation, true);
    return () => window.document.removeEventListener("click", handleInternalNavigation, true);
  }, [dirty]);

  useEffect(() => {
    if (pendingFocusBlockId === null) return;
    const target = blockRefs.current.get(pendingFocusBlockId);
    if (target) {
      target.focus();
      setPendingFocusBlockId(null);
    }
  }, [document, pendingFocusBlockId]);

  const closeBlockLibrary = useCallback(() => setIsBlockLibraryOpen(false), []);
  const closeConfirmation = useCallback(() => {
    if (!isAnyMutationPending) setPendingConfirmation(null);
  }, [isAnyMutationPending]);
  const handleOpenMediaPicker = useCallback((options: Omit<MediaPickerState, "isOpen">) => {
    setMediaPickerState({ isOpen: true, ...options });
  }, []);

  useDialogFocus(isBlockLibraryOpen, libraryDialogRef, addBlockTriggerRef, closeBlockLibrary);
  useDialogFocus(
    pendingConfirmation !== null,
    confirmationDialogRef,
    confirmationTriggerRef,
    closeConfirmation,
    !isAnyMutationPending
  );

  function clearFeedbackForEdit() {
    if (!ambiguousPublish && !ambiguousUnpublish) {
      setErrorMessage(null);
    }
    setFieldErrors([]);
    setSuccessMessage(null);
    setAmbiguousSave(false);
  }

  function openPreview() {
    if (previewDisabled || !durableStory.draftRevisionId) return;
    const previewUrl = `/admin/products/${initialStory.product.id}/story/preview?revision=${durableStory.draftRevisionId}`;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  function announce(message: string) {
    setAnnouncement(message);
  }

  function openConfirmation(event: React.MouseEvent<HTMLElement>, value: PendingConfirmation) {
    confirmationTriggerRef.current = event.currentTarget;
    setPendingConfirmation(value);
  }

  function toggleBlockExpanded(blockId: string) {
    setExpandedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function navigateToIssue(blockId: string | null, targetId: string) {
    if (blockId) {
      setExpandedBlockIds((prev) => new Set(prev).add(blockId));
    }
    setTimeout(() => {
      const el =
        window.document.getElementById(targetId) ??
        (blockId ? window.document.getElementById(`story-block-${blockId}`) : null);
      el?.focus();
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 30);
  }

  function addBlock(type: StoryBlockType) {
    if (document.length >= STORY_BUILDER_MAX_BLOCKS) return;
    const block = createInitialEditorBlock(type);
    clearFeedbackForEdit();
    setDocument((current) => [...current, block]);
    setExpandedBlockIds((prev) => new Set(prev).add(block.blockId));
    setIsBlockLibraryOpen(false);
    setPendingFocusBlockId(block.blockId);
    announce(`${getStoryBlockDefinition(type).label} agregado como nuevo bloque.`);
  }

  function duplicateBlock(index: number) {
    const source = document[index];
    if (!source || document.length >= STORY_BUILDER_MAX_BLOCKS) return;
    const newBlockId = crypto.randomUUID();
    const next = duplicateEditorBlock(document, index, () => newBlockId);
    clearFeedbackForEdit();
    setDocument(next);
    setExpandedBlockIds((prev) => new Set(prev).add(newBlockId));
    setPendingFocusBlockId(newBlockId);
    announce(
      `${getStoryBlockDefinition(source.type).label} duplicado en la posición ${index + 2}.`
    );
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const block = document[index];
    if (!block) return;
    const next = moveEditorBlock(document, index, direction);
    clearFeedbackForEdit();
    setDocument(next);
    setPendingFocusBlockId(block.blockId);
    announce(`Bloque movido a la posición ${index + direction + 1} de ${document.length}.`);
  }

  function removeBlock(blockId: string) {
    const index = document.findIndex((block) => block.blockId === blockId);
    if (index === -1) return;
    const next = removeEditorBlock(document, blockId);
    const nextFocus = next[index] ?? next[index - 1] ?? null;
    clearFeedbackForEdit();
    setDocument(next);
    setExpandedBlockIds((prev) => {
      const n = new Set(prev);
      n.delete(blockId);
      return n;
    });
    setPendingConfirmation(null);
    if (nextFocus) {
      setPendingFocusBlockId(nextFocus.blockId);
    } else {
      window.setTimeout(() => addBlockTriggerRef.current?.focus(), 10);
    }
    announce(`Bloque eliminado. Quedan ${next.length} bloques.`);
  }

  function updateBlockPayload<TType extends StoryBlockType>(
    index: number,
    payload: Extract<EditorStoryBlock, { type: TType }>["payload"]
  ) {
    const next = [...document];
    const current = next[index];
    if (!current) return;
    next[index] = { ...current, payload } as EditorStoryBlock;
    setDocument(next);
    clearFeedbackForEdit();

    // If validation summary is currently active, update errors live
    if (validationActive || validationIssues.length > 0) {
      const res = normalizeEditorStoryDocument(next);
      if (res.success) {
        setValidationActive(false);
        setValidationIssues([]);
        setErrorMessage(null);
      } else {
        setValidationIssues(res.issues);
      }
    }
  }

  async function saveDraft() {
    // 1. Convert local editable state to canonical candidate and validate
    const normResult = normalizeEditorStoryDocument(document);
    if (!normResult.success || normResult.document === null) {
      setValidationActive(true);
      setValidationIssues(normResult.issues);
      setErrorMessage("Corrige los errores señalados en la historia antes de guardar.");
      if (normResult.issues.length > 0) {
        const firstIssue = normResult.issues[0]!;
        const { blockId, targetId } = resolveTargetFromIssuePath(firstIssue.path, document);
        if (blockId) {
          setExpandedBlockIds((prev) => new Set(prev).add(blockId));
        }
        setTimeout(() => {
          const el =
            window.document.getElementById(targetId) ??
            (blockId ? window.document.getElementById(`story-block-${blockId}`) : null);
          el?.focus();
          el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        }, 30);
      }
      return;
    }

    // 2. Canonical normalized document
    setValidationActive(false);
    setValidationIssues([]);
    const validDocument = normResult.document;
    const payload = {
      productId: initialStory.product.id,
      expectedDraftRevisionId: durableStory.draftRevisionId,
      expectedPublishedRevisionId: durableStory.publishedRevisionId,
      document: validDocument,
    };
    const mutationRequestId = saveTracker.current.getRequestId(payload);
    setIsSaving(true);
    setErrorMessage(null);
    setFieldErrors([]);
    setSuccessMessage(null);
    setStaleConflict(false);

    try {
      const result = await saveProductStoryDraftAction({ ...payload, mutationRequestId });
      const disposition = classifyStoryActionResult(result);

      if (disposition === "SUCCESS") {
        const committed = result.data!;
        preservedUnpublishDocumentRef.current = null;
        saveTracker.current.complete();
        const baseline = structuredClone(validDocument);
        setDocument(createEditorDocument(baseline));
        setSavedBaseline(baseline);
        setDurableStory((current) => {
          const publishedRevisionNumber =
            committed.publishedRevisionId === current.publishedRevisionId
              ? current.publishedRevisionNumber
              : null;
          const publishedAt =
            committed.publishedRevisionId === current.publishedRevisionId
              ? current.publishedAt
              : committed.publishedAt;
          return {
            lifecycle: deriveLifecycle(committed.draftRevisionId, committed.publishedRevisionId),
            draftRevisionId: committed.draftRevisionId,
            draftRevisionNumber: committed.revisionNumber,
            publishedRevisionId: committed.publishedRevisionId,
            publishedRevisionNumber,
            publishedAt,
          };
        });
        setAmbiguousSave(false);
        setSuccessMessage(
          committed.replayed
            ? `Borrador r${committed.revisionNumber} confirmado sin crear otra revisión.`
            : `Borrador r${committed.revisionNumber} guardado correctamente.`
        );
        announce(`Borrador r${committed.revisionNumber} guardado correctamente.`);
        return;
      }

      if (disposition === "DEFINITIVE_FAILURE") {
        saveTracker.current.complete();
        setAmbiguousSave(false);
        setErrorMessage(result.error ?? "No se pudo guardar el borrador.");
        if (result.fieldErrors && result.fieldErrors.length > 0) {
          setValidationIssues(result.fieldErrors);
          setFieldErrors(result.fieldErrors.map((issue) => `${issue.path}: ${issue.message}`));
        } else {
          setFieldErrors([]);
        }
        setStaleConflict(result.code === "STORY_STALE_WRITE");
        return;
      }

      setAmbiguousSave(true);
      setErrorMessage(
        result.error
          ? `${result.error} No se pudo confirmar el resultado en el servidor. Reintenta sin modificar el documento para conservar la misma identidad de operación.`
          : "No se pudo confirmar el resultado en el servidor. Reintenta sin modificar el documento para conservar la misma identidad de operación."
      );
    } catch {
      setAmbiguousSave(true);
      setErrorMessage(
        "La conexión se interrumpió antes de confirmar el resultado. Reintenta sin modificar el documento para conservar la misma identidad de operación."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function discardDurableDraft() {
    if (durableStory.draftRevisionId === null) return;

    const payload = {
      productId: initialStory.product.id,
      expectedDraftRevisionId: durableStory.draftRevisionId,
      expectedPublishedRevisionId: durableStory.publishedRevisionId,
    };
    const mutationRequestId = discardTracker.current.getRequestId(payload);
    setIsDiscarding(true);
    setErrorMessage(null);
    setFieldErrors([]);
    setValidationIssues([]);
    setSuccessMessage(null);

    try {
      const result = await discardProductStoryDraftAction({ ...payload, mutationRequestId });
      const disposition = classifyStoryActionResult(result);

      if (disposition === "SUCCESS") {
        discardTracker.current.complete();
        preservedUnpublishDocumentRef.current = null;
        allowAuthoritativeReloadRef.current = true;
        setPendingConfirmation(null);
        setSuccessMessage("Borrador descartado. Recargando la versión autorizada del servidor.");
        announce("Borrador descartado correctamente.");
        router.refresh();
        return;
      }

      if (disposition === "DEFINITIVE_FAILURE") {
        discardTracker.current.complete();
        setPendingConfirmation(null);
        setErrorMessage(result.error ?? "No se pudo descartar el borrador guardado.");
        setStaleConflict(result.code === "STORY_STALE_WRITE");
        window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
        return;
      }

      setPendingConfirmation(null);
      setErrorMessage(
        result.error
          ? `${result.error} No se pudo confirmar si el descarte concluyó en el servidor. Puedes reintentar la misma operación.`
          : "No se pudo confirmar si el descarte concluyó en el servidor. Puedes reintentar la misma operación."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } catch {
      setPendingConfirmation(null);
      setErrorMessage(
        "La conexión se interrumpió antes de confirmar el descarte. Puedes reintentar la misma operación."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } finally {
      setIsDiscarding(false);
    }
  }

  async function executePublish() {
    if (durableStory.draftRevisionId === null) return;

    const payload = {
      productId: initialStory.product.id,
      expectedDraftRevisionId: durableStory.draftRevisionId,
      expectedPublishedRevisionId: durableStory.publishedRevisionId,
    };
    const mutationRequestId = publishTracker.current.getRequestId(payload);
    setIsPublishing(true);
    setErrorMessage(null);
    setFieldErrors([]);
    setValidationIssues([]);
    setSuccessMessage(null);

    try {
      const result = await publishProductStoryAction({ ...payload, mutationRequestId });
      const disposition = classifyStoryActionResult(result);

      if (disposition === "SUCCESS") {
        const committed = result.data!;
        preservedUnpublishDocumentRef.current = null;
        publishTracker.current.complete();
        setPendingConfirmation(null);
        setAmbiguousPublish(false);
        setDurableStory({
          lifecycle: "PUBLISHED_ONLY",
          draftRevisionId: null,
          draftRevisionNumber: null,
          publishedRevisionId: committed.publishedRevisionId ?? committed.revisionId,
          publishedRevisionNumber: committed.revisionNumber,
          publishedAt: committed.publishedAt,
        });
        setSuccessMessage(
          committed.replayed
            ? `Historia r${committed.revisionNumber} confirmada sin nueva publicación.`
            : `Historia r${committed.revisionNumber} publicada correctamente en la tienda pública.`
        );
        announce(`Historia r${committed.revisionNumber} publicada correctamente.`);
        return;
      }

      if (disposition === "DEFINITIVE_FAILURE") {
        publishTracker.current.complete();
        setPendingConfirmation(null);
        setAmbiguousPublish(false);
        setErrorMessage(result.error ?? "No se pudo publicar la historia.");
        setStaleConflict(result.code === "STORY_STALE_WRITE");
        if (result.fieldErrors && result.fieldErrors.length > 0) {
          const adaptedIssues = result.fieldErrors.map(adaptPersistedValidationIssueToAuthoring);
          setValidationIssues(adaptedIssues);
          setFieldErrors(adaptedIssues.map((issue) => `${issue.path}: ${issue.message}`));
          const firstIssue = adaptedIssues[0];
          if (firstIssue) {
            const { blockId, targetId } = resolveTargetFromIssuePath(firstIssue.path, document);
            if (blockId) {
              setExpandedBlockIds((prev) => new Set(prev).add(blockId));
            }
            setTimeout(() => {
              const el =
                window.document.getElementById(targetId) ??
                (blockId ? window.document.getElementById(`story-block-${blockId}`) : null);
              el?.focus();
              el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            }, 30);
          }
        } else {
          setFieldErrors([]);
        }
        window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
        return;
      }

      setPendingConfirmation(null);
      setAmbiguousPublish(true);
      setErrorMessage(
        result.error
          ? `${result.error} No se pudo confirmar el resultado de la publicación. Puedes reintentar la publicación o recargar la versión autorizada.`
          : "No se pudo confirmar el resultado de la publicación. Puedes reintentar la publicación o recargar la versión autorizada."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } catch {
      setPendingConfirmation(null);
      setAmbiguousPublish(true);
      setErrorMessage(
        "La conexión se interrumpió antes de confirmar la publicación. Puedes reintentar la publicación o recargar la versión autorizada."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } finally {
      setIsPublishing(false);
    }
  }

  async function executeUnpublish() {
    if (durableStory.publishedRevisionId === null) return;

    const payload = {
      productId: initialStory.product.id,
      expectedDraftRevisionId: durableStory.draftRevisionId,
      expectedPublishedRevisionId: durableStory.publishedRevisionId,
    };
    const mutationRequestId = unpublishTracker.current.getRequestId(payload);
    setIsUnpublishing(true);
    setErrorMessage(null);
    setFieldErrors([]);
    setValidationIssues([]);
    setSuccessMessage(null);

    try {
      const result = await unpublishProductStoryAction({ ...payload, mutationRequestId });
      const disposition = classifyStoryActionResult(result);

      if (disposition === "SUCCESS") {
        unpublishTracker.current.complete();
        setPendingConfirmation(null);
        setAmbiguousUnpublish(false);

        if (durableStory.draftRevisionId !== null) {
          setDurableStory((current) => ({
            ...current,
            lifecycle: "DRAFT_ONLY",
            publishedRevisionId: null,
            publishedRevisionNumber: null,
            publishedAt: null,
          }));
        } else {
          preservedUnpublishDocumentRef.current = [...document];
          setDurableStory({
            lifecycle: "NO_STORY",
            draftRevisionId: null,
            draftRevisionNumber: null,
            publishedRevisionId: null,
            publishedRevisionNumber: null,
            publishedAt: null,
          });
          setSavedBaseline([]);
        }

        setSuccessMessage(
          "Historia despublicada correctamente. Ya no es visible en la tienda pública."
        );
        announce("Historia despublicada correctamente.");
        return;
      }

      if (disposition === "DEFINITIVE_FAILURE") {
        unpublishTracker.current.complete();
        setPendingConfirmation(null);
        setAmbiguousUnpublish(false);
        setErrorMessage(result.error ?? "No se pudo despublicar la historia.");
        setStaleConflict(result.code === "STORY_STALE_WRITE");
        window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
        return;
      }

      setPendingConfirmation(null);
      setAmbiguousUnpublish(true);
      setErrorMessage(
        result.error
          ? `${result.error} No se pudo confirmar el resultado de la despublicación. Puedes reintentar la despublicación o recargar la versión autorizada.`
          : "No se pudo confirmar el resultado de la despublicación. Puedes reintentar la despublicación o recargar la versión autorizada."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } catch {
      setPendingConfirmation(null);
      setAmbiguousUnpublish(true);
      setErrorMessage(
        "La conexión se interrumpió antes de confirmar la despublicación. Puedes reintentar la despublicación o recargar la versión autorizada."
      );
      window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
    } finally {
      setIsUnpublishing(false);
    }
  }

  async function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;

    switch (confirmation.kind) {
      case "DELETE_BLOCK":
        removeBlock(confirmation.blockId);
        return;
      case "RESET_LOCAL":
        setDocument(createEditorDocument(savedBaseline));
        setValidationIssues([]);
        setValidationActive(false);
        clearFeedbackForEdit();
        setStaleConflict(false);
        setPendingConfirmation(null);
        announce("Los cambios locales se restablecieron al último borrador guardado.");
        window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
        return;
      case "DISCARD_DRAFT":
        await discardDurableDraft();
        return;
      case "PUBLISH":
        await executePublish();
        return;
      case "UNPUBLISH":
        await executeUnpublish();
        return;
      case "NAVIGATE":
        setPendingConfirmation(null);
        router.push(confirmation.href);
        return;
      case "RELOAD_SERVER":
        setPendingConfirmation(null);
        preservedUnpublishDocumentRef.current = null;
        allowAuthoritativeReloadRef.current = true;
        setIsAuthoritativeReloadPending(true);
        try {
          router.refresh();
        } catch {
          // Keep pending/ambiguity flags intact on refresh failure
        }
        return;
    }
  }

  function requestServerReload(event: React.MouseEvent<HTMLButtonElement>) {
    if (dirty || isAnyAmbiguityActive) {
      openConfirmation(event, { kind: "RELOAD_SERVER" });
      return;
    }
    preservedUnpublishDocumentRef.current = null;
    allowAuthoritativeReloadRef.current = true;
    setIsAuthoritativeReloadPending(true);
    try {
      router.refresh();
    } catch {
      // Keep pending/ambiguity flags intact on refresh failure
    }
  }

  const lifecycleText = getStoryLifecycleText(durableStory);
  const publishedAt = formatPublishedAt(durableStory.publishedAt);
  const productManagerHref = `/admin/products/${initialStory.product.id}`;

  const confirmationCopy = (() => {
    switch (pendingConfirmation?.kind) {
      case "DELETE_BLOCK":
        return {
          title: "Eliminar bloque guardado",
          description: `Se quitará ${pendingConfirmation.label} del documento local. La base de datos no cambiará hasta que guardes el borrador.`,
          action: "Eliminar bloque",
          danger: true,
        };
      case "RESET_LOCAL":
        return {
          title: "Restablecer cambios locales",
          description:
            "Se perderán los cambios que aún no se han guardado. El borrador durable permanecerá intacto.",
          action: "Restablecer",
          danger: false,
        };
      case "DISCARD_DRAFT":
        return {
          title: "Descartar borrador guardado",
          description:
            "Se archivará el borrador durable actual. La versión publicada no cambiará. También se perderán los cambios locales sin guardar.",
          action: "Descartar borrador",
          danger: true,
        };
      case "PUBLISH":
        return {
          title: "Publicar historia",
          description:
            durableStory.publishedRevisionId !== null
              ? `Se publicará el borrador r${durableStory.draftRevisionNumber} de ${initialStory.product.name}. Esta acción reemplazará la versión publicada r${durableStory.publishedRevisionNumber} actual en la tienda pública.`
              : `Se publicará el borrador r${durableStory.draftRevisionNumber} de ${initialStory.product.name} en la tienda pública.`,
          action: "Publicar historia",
          danger: false,
        };
      case "UNPUBLISH":
        return {
          title: "Despublicar historia",
          description:
            durableStory.draftRevisionId !== null
              ? "La historia del producto dejará de ser visible en la tienda pública. El historial de revisiones se conservará y el borrador guardado actual permanecerá intacto."
              : "La historia del producto dejará de ser visible en la tienda pública. El historial de revisiones se conservará y el contenido actual se mantendrá en el editor como trabajo local sin guardar.",
          action: "Despublicar historia",
          danger: true,
        };
      case "NAVIGATE":
        return {
          title: "Salir con cambios sin guardar",
          description:
            "Los cambios locales se perderán. El borrador durable guardado permanecerá intacto.",
          action: "Salir sin guardar",
          danger: true,
        };
      case "RELOAD_SERVER":
        return {
          title: "Recargar versión del servidor",
          description:
            "La versión autorizada del servidor reemplazará todo el trabajo local sin guardar.",
          action: "Recargar servidor",
          danger: true,
        };
      default:
        return null;
    }
  })();

  function renderBlockEditor(
    block: EditorStoryBlock,
    index: number,
    blockIssues: readonly StoryValidationIssue[]
  ) {
    switch (block.type) {
      case "hero_media":
        return (
          <HeroMediaEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"hero_media">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case "full_bleed_image":
        return (
          <FullBleedImageEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"full_bleed_image">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case "image_text":
        return (
          <ImageTextEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"image_text">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case "stat_highlight":
        return (
          <StatHighlightEditor
            blockId={block.blockId}
            payload={block.payload}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"stat_highlight">(index, payload)}
            onAnnounce={announce}
          />
        );
      case "spec_feature":
        return (
          <SpecFeatureEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"spec_feature">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case "video":
        return (
          <VideoEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"video">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
          />
        );
      case "gallery":
        return (
          <GalleryEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"gallery">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
            onAnnounce={announce}
          />
        );
      case "comparison":
        return (
          <ComparisonEditor
            blockId={block.blockId}
            payload={block.payload}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"comparison">(index, payload)}
            onAnnounce={announce}
          />
        );
      case "dimensions":
        return (
          <DimensionsEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"dimensions">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
            onAnnounce={announce}
          />
        );
      case "box_contents":
        return (
          <BoxContentsEditor
            blockId={block.blockId}
            payload={block.payload}
            selectableMedia={selectableMedia}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"box_contents">(index, payload)}
            onOpenMediaPicker={handleOpenMediaPicker}
            onAnnounce={announce}
          />
        );
      case "technical_specs":
        return (
          <TechnicalSpecsEditor
            blockId={block.blockId}
            payload={block.payload}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"technical_specs">(index, payload)}
            onAnnounce={announce}
          />
        );
      case "faq":
        return (
          <FaqEditor
            blockId={block.blockId}
            payload={block.payload}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"faq">(index, payload)}
            onAnnounce={announce}
          />
        );
      case "related_products":
        return (
          <RelatedProductsEditor
            blockId={block.blockId}
            payload={block.payload}
            knownProductOptions={knownProductOptions}
            issues={blockIssues}
            onChange={(payload) => updateBlockPayload<"related_products">(index, payload)}
            onOpenProductPicker={(triggerRef) =>
              setRelatedProductPickerState({
                isOpen: true,
                blockId: block.blockId,
                triggerRef,
              })
            }
            onAnnounce={announce}
          />
        );
    }
  }

  return (
    <div
      className={styles.container}
      data-testid="story-builder"
      data-reload-pending={isAuthoritativeReloadPending ? "true" : undefined}
    >
      <div aria-live="polite" className={styles.srOnly} data-testid="story-announcement">
        {announcement}
      </div>

      <Link href={productManagerHref} className={styles.backLink} data-testid="story-back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al editor del producto
      </Link>

      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.titleIcon} aria-hidden="true">
            <FileText size={24} />
          </div>
          <div>
            <h1 className={styles.title}>Historia del producto</h1>
            <p className={styles.productName}>{initialStory.product.name}</p>
            <p className={styles.productSlug}>/{initialStory.product.slug}</p>
          </div>
        </div>
        <div className={styles.headerStatus}>
          <span className={styles.statusLabel}>Estado del servidor</span>
          <strong data-testid="story-lifecycle-status">{lifecycleText}</strong>
        </div>
      </header>

      <section className={styles.statusRegion} aria-label="Estado de la historia">
        <div>
          <span className={styles.statusLabel}>Ciclo durable</span>
          <strong>{lifecycleText}</strong>
          {publishedAt && <span>Publicada el {publishedAt}</span>}
        </div>
        <div>
          <span className={styles.statusLabel}>Trabajo local</span>
          <strong data-testid="story-dirty-state">
            {dirty ? "Cambios sin guardar" : "Todos los cambios están guardados"}
          </strong>
          <span>
            {document.length} de {STORY_BUILDER_MAX_BLOCKS} bloques
          </span>
        </div>
      </section>

      {staleConflict && (
        <div className={styles.alertConflict} role="alert" data-testid="story-stale-alert">
          <div className={styles.alertHeading}>
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>La historia cambió en el servidor</strong>
          </div>
          <p>
            Tu trabajo local sigue intacto. Recarga la versión autorizada solamente cuando estés
            listo para reemplazarlo.
          </p>
          <button type="button" className={styles.secondaryButton} onClick={requestServerReload}>
            <RefreshCw size={16} aria-hidden="true" />
            Recargar versión del servidor
          </button>
        </div>
      )}

      {errorMessage && (
        <div className={styles.alertError} role="alert" data-testid="story-error">
          <strong>No se pudo completar la operación</strong>
          <p>{errorMessage}</p>
          {fieldErrors.length > 0 && (
            <ul>
              {fieldErrors.map((fieldError) => (
                <li key={fieldError}>{fieldError}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {successMessage && (
        <div className={styles.alertSuccess} role="status" data-testid="story-success">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      <ValidationSummary
        issues={validationIssues}
        document={document}
        onNavigateToIssue={navigateToIssue}
      />

      <div className={styles.workspace}>
        <aside className={styles.actionPanel} aria-labelledby="story-actions-title">
          <div className={styles.actionStatus}>
            <h2 id="story-actions-title" className={styles.actionTitle}>
              Acciones del borrador
            </h2>
            <div className={styles.localState}>
              <span className={styles.statusLabel}>Estado local</span>
              <strong>{dirty ? "Cambios sin guardar" : "Sin cambios pendientes"}</strong>
              {incompleteCount > 0 && (
                <span id="story-save-blocker" className={styles.saveBlocker}>
                  {incompleteCount}{" "}
                  {incompleteCount === 1 ? "bloque pendiente impide" : "bloques pendientes impiden"}{" "}
                  guardar.
                </span>
              )}
            </div>
          </div>

          <div className={styles.actionButtons}>
            {/* Short visible labels keep the bar on one row; the full action name stays accessible. */}
            <button
              type="button"
              className={styles.tertiaryButton}
              onClick={requestServerReload}
              aria-label="Recargar desde servidor"
              title="Recargar desde servidor"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Recargar
            </button>
            {dirty && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={(event) => openConfirmation(event, { kind: "RESET_LOCAL" })}
                aria-label="Restablecer cambios locales"
                title="Restablecer cambios locales"
              >
                <RotateCcw size={16} aria-hidden="true" />
                Restablecer
              </button>
            )}
            {durableStory.draftRevisionId !== null && (
              <button
                type="button"
                className={styles.dangerButton}
                disabled={discardDisabled}
                onClick={(event) => openConfirmation(event, { kind: "DISCARD_DRAFT" })}
                data-testid="story-discard-draft"
              >
                {isDiscarding ? (
                  <Loader2 size={17} className={styles.spinner} aria-hidden="true" />
                ) : (
                  <Trash2 size={16} aria-hidden="true" />
                )}
                Descartar borrador guardado
              </button>
            )}
            {durableStory.publishedRevisionId !== null && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={unpublishDisabled}
                onClick={(event) => {
                  if (ambiguousUnpublish) {
                    void executeUnpublish();
                  } else {
                    openConfirmation(event, { kind: "UNPUBLISH" });
                  }
                }}
                data-testid="story-unpublish-button"
              >
                {isUnpublishing ? (
                  <Loader2 size={17} className={styles.spinner} aria-hidden="true" />
                ) : (
                  <EyeOff size={16} aria-hidden="true" />
                )}
                {isUnpublishing
                  ? "Despublicando…"
                  : ambiguousUnpublish
                    ? "Reintentar despublicación"
                    : "Despublicar historia"}
              </button>
            )}
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={previewDisabled}
              onClick={openPreview}
              aria-describedby={previewDisabledReason ? "story-preview-reason" : undefined}
              title={previewDisabledReason ?? undefined}
              data-testid="story-preview-button"
            >
              <Eye size={16} aria-hidden="true" />
              Vista previa
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={publishDisabled}
              onClick={(event) => {
                if (ambiguousPublish) {
                  void executePublish();
                } else {
                  openConfirmation(event, { kind: "PUBLISH" });
                }
              }}
              data-testid="story-publish-button"
            >
              {isPublishing ? (
                <Loader2 size={17} className={styles.spinner} aria-hidden="true" />
              ) : (
                <UploadCloud size={16} aria-hidden="true" />
              )}
              {isPublishing
                ? "Publicando…"
                : ambiguousPublish
                  ? "Reintentar publicación"
                  : "Publicar historia"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={saveDisabled}
              aria-describedby={incompleteCount > 0 ? "story-save-blocker" : undefined}
              onClick={() => void saveDraft()}
              data-testid="story-save-draft"
            >
              {isSaving ? (
                <Loader2 size={17} className={styles.spinner} aria-hidden="true" />
              ) : (
                <Save size={17} aria-hidden="true" />
              )}
              {isSaving ? "Guardando…" : ambiguousSave ? "Reintentar guardado" : "Guardar borrador"}
            </button>
          </div>

          <div className={styles.actionNotes}>
            {previewDisabledReason && (
              <span id="story-preview-reason" className={styles.actionSubtext}>
                {previewDisabledReason}
              </span>
            )}
            {!canPublish && (
              <p
                className={styles.permissionWarning}
                data-testid="story-publish-permission-warning"
              >
                Se requiere el permiso <code>catalog:publish</code> para publicar o despublicar la
                historia.
              </p>
            )}
            <details className={styles.actionHelpDetails}>
              <summary>¿Qué hace cada acción?</summary>
              <p className={styles.actionHelp}>
                Guardar crea una revisión inmutable. Publicar promociona el borrador a la tienda
                pública. Descartar archiva el borrador actual sin afectar la versión publicada.
              </p>
            </details>
          </div>
        </aside>

        <section className={styles.documentPanel} aria-labelledby="story-document-title">
          <div className={styles.documentHeader}>
            <div>
              <h2 id="story-document-title">Documento</h2>
              <p>El orden visual de estas tarjetas será el orden durable al guardar.</p>
            </div>
            <button
              ref={addBlockTriggerRef}
              type="button"
              className={styles.primaryButton}
              onClick={() => setIsBlockLibraryOpen(true)}
              disabled={document.length >= STORY_BUILDER_MAX_BLOCKS}
              aria-describedby={
                document.length >= STORY_BUILDER_MAX_BLOCKS ? "story-block-limit" : undefined
              }
              data-testid="story-add-block"
            >
              <Plus size={17} aria-hidden="true" />
              Agregar bloque
            </button>
          </div>

          {document.length >= STORY_BUILDER_MAX_BLOCKS && (
            <p id="story-block-limit" className={styles.limitMessage} role="status">
              Alcanzaste el máximo de 30 bloques. Elimina uno antes de agregar otro.
            </p>
          )}

          {document.length === 0 ? (
            <div className={styles.emptyState} data-testid="story-empty-state">
              <FileText size={30} aria-hidden="true" />
              <h3>La historia está vacía</h3>
              <p>
                La historia es la parte de la página del producto que cuenta sus ventajas con
                imágenes y texto. Se arma apilando bloques, en tres pasos:
              </p>
              <FlowSteps activeStep={0} />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={(event) => {
                  addBlockTriggerRef.current = event.currentTarget;
                  setIsBlockLibraryOpen(true);
                }}
              >
                <Plus size={17} aria-hidden="true" />
                Agregar primer bloque
              </button>
              <p className={styles.starterHint}>O empieza con uno de los más usados:</p>
              <div className={styles.starterGrid}>
                {STARTER_BLOCK_TYPES.map((type) => {
                  const definition = getStoryBlockDefinition(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className={styles.starterOption}
                      onClick={() => addBlock(type)}
                      aria-label={`Empezar con ${definition.label}`}
                    >
                      <BlockWireframe type={type} />
                      <strong>{definition.label}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ol className={styles.blockList} data-testid="story-block-list">
              {document.map((block, index) => {
                const blockId = block.blockId;
                const type = block.type;
                const definition = getStoryBlockDefinition(type);
                const position = index + 1;
                const isExpanded = expandedBlockIds.has(blockId);
                const blockIssues = validationIssues.filter((i) =>
                  i.path.startsWith(`blocks[${index}]`)
                );
                const hasErrors = blockIssues.length > 0;

                return (
                  <li key={blockId}>
                    <article
                      ref={(node) => {
                        if (node) blockRefs.current.set(blockId, node);
                        else blockRefs.current.delete(blockId);
                      }}
                      tabIndex={-1}
                      className={`${styles.blockCard} ${
                        hasErrors ? styles.blockCardIncomplete : ""
                      }`}
                      data-testid={`story-block-${blockId}`}
                      data-block-id={blockId}
                    >
                      <div className={styles.blockHeader}>
                        <div className={styles.blockIdentity}>
                          <BlockWireframe type={type} className={styles.blockThumb} />
                          <div>
                            <span className={styles.blockPosition}>
                              Bloque {position} de {document.length}
                            </span>
                            <h3>{definition.label}</h3>
                            <p>{definition.description}</p>
                          </div>
                        </div>
                        <div className={styles.blockHeaderToggle}>
                          <span
                            className={
                              incompleteBlockIds.has(blockId)
                                ? styles.incompleteBadge
                                : styles.completeBadge
                            }
                          >
                            {incompleteBlockIds.has(blockId)
                              ? "Configuración pendiente"
                              : "Bloque completo"}
                          </span>
                          <button
                            type="button"
                            className={styles.expandButton}
                            onClick={() => toggleBlockExpanded(blockId)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Colapsar" : "Expandir"} bloque ${position}`}
                          >
                            {isExpanded ? (
                              <ChevronUp size={16} aria-hidden="true" />
                            ) : (
                              <ChevronDown size={16} aria-hidden="true" />
                            )}
                            {isExpanded ? "Colapsar" : "Expandir"}
                          </button>
                        </div>
                      </div>

                      <div
                        className={styles.blockActions}
                        aria-label={`Acciones para ${definition.label}`}
                      >
                        <button
                          type="button"
                          className={styles.blockAction}
                          disabled={index === 0}
                          onClick={() => moveBlock(index, -1)}
                          aria-label={`Mover ${definition.label} hacia arriba`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                          <span className={styles.blockActionLabel}>Subir</span>
                        </button>
                        <button
                          type="button"
                          className={styles.blockAction}
                          disabled={index === document.length - 1}
                          onClick={() => moveBlock(index, 1)}
                          aria-label={`Mover ${definition.label} hacia abajo`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                          <span className={styles.blockActionLabel}>Bajar</span>
                        </button>
                        <button
                          type="button"
                          className={styles.blockAction}
                          disabled={document.length >= STORY_BUILDER_MAX_BLOCKS}
                          onClick={() => duplicateBlock(index)}
                          aria-label={`Duplicar ${definition.label}`}
                        >
                          <Copy size={16} aria-hidden="true" />
                          <span className={styles.blockActionLabel}>Duplicar</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.blockAction} ${styles.deleteAction}`}
                          onClick={(event) => {
                            const isSavedBlock = savedBaseline.some((b) => b.blockId === blockId);
                            if (!isSavedBlock) {
                              removeBlock(blockId);
                              return;
                            }
                            openConfirmation(event, {
                              kind: "DELETE_BLOCK",
                              blockId,
                              label: definition.label,
                            });
                          }}
                          aria-label={`Eliminar ${definition.label}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          <span className={styles.blockActionLabel}>Eliminar</span>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className={styles.blockCardContent}>
                          {renderBlockEditor(block, index, blockIssues)}
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {isBlockLibraryOpen && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            ref={libraryDialogRef}
            className={`${styles.modalContent} ${styles.libraryModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-library-title"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="story-library-title">Agregar bloque</h2>
                <p>
                  Elige cómo quieres mostrar el producto. Cada dibujo es un boceto del resultado.
                </p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setIsBlockLibraryOpen(false);
                  window.setTimeout(() => addBlockTriggerRef.current?.focus(), 10);
                }}
                aria-label="Cerrar biblioteca de bloques"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <FlowSteps activeStep={0} />
            {BLOCK_LIBRARY_GROUPS.map((group) => (
              <section key={group.title} className={styles.libraryGroup} aria-label={group.title}>
                <h3 className={styles.libraryGroupTitle}>{group.title}</h3>
                <div className={styles.libraryGrid}>
                  {group.types.map((type) => {
                    const definition = getStoryBlockDefinition(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        className={styles.libraryOption}
                        data-story-block-type={type}
                        onClick={() => addBlock(type)}
                      >
                        <BlockWireframe type={type} className={styles.libraryWireframe} />
                        <span className={styles.libraryOptionText}>
                          <strong>{definition.label}</strong>
                          <span>{definition.description}</span>
                          <span className={styles.libraryNeeds}>
                            Necesitas: {BLOCK_REQUIREMENTS[type]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {mediaPickerState && (
        <MediaPickerDialog
          isOpen={mediaPickerState.isOpen}
          productId={initialStory.product.id}
          onUploaded={(media) => setSelectableMedia((current) => [media, ...current])}
          title={mediaPickerState.title}
          mediaType={mediaPickerState.mediaType}
          selectableMedia={selectableMedia}
          selectedMediaId={mediaPickerState.selectedMediaId}
          allowClear={mediaPickerState.allowClear}
          triggerRef={mediaPickerState.triggerRef}
          onSelect={mediaPickerState.onSelect}
          onClose={() => setMediaPickerState(null)}
          onDeleteFromProduct={deleteStoryMediaFromProduct}
        />
      )}

      {relatedProductPickerState && (
        <RelatedProductPickerDialog
          isOpen={relatedProductPickerState.isOpen}
          currentProductId={initialStory.product.id}
          alreadySelectedProductIds={
            document.find((b) => b.blockId === relatedProductPickerState.blockId)?.type ===
            "related_products"
              ? (
                  document.find((b) => b.blockId === relatedProductPickerState.blockId) as Extract<
                    EditorStoryBlock,
                    { type: "related_products" }
                  >
                ).payload.productIds
              : []
          }
          triggerRef={relatedProductPickerState.triggerRef}
          onSelectProduct={(product) => {
            const targetBlock = document.find(
              (b) => b.blockId === relatedProductPickerState.blockId
            );
            if (targetBlock && targetBlock.type === "related_products") {
              const blockIdx = document.findIndex(
                (b) => b.blockId === relatedProductPickerState.blockId
              );
              if (!targetBlock.payload.productIds.includes(product.productId)) {
                updateBlockPayload<"related_products">(blockIdx, {
                  ...targetBlock.payload,
                  productIds: [...targetBlock.payload.productIds, product.productId],
                });
                setKnownProductOptions((prev) => new Map(prev).set(product.productId, product));
                announce(`Producto ${product.name} agregado.`);
              }
            }
          }}
          onClose={() => setRelatedProductPickerState(null)}
        />
      )}

      {pendingConfirmation && confirmationCopy && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            ref={confirmationDialogRef}
            className={styles.confirmationModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-confirmation-title"
            aria-describedby="story-confirmation-description"
            tabIndex={-1}
            data-testid="story-confirmation-dialog"
          >
            <h2 id="story-confirmation-title">{confirmationCopy.title}</h2>
            <p id="story-confirmation-description">{confirmationCopy.description}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isAnyMutationPending}
                onClick={() => {
                  setPendingConfirmation(null);
                  window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={confirmationCopy.danger ? styles.dangerButton : styles.primaryButton}
                disabled={isAnyMutationPending}
                onClick={() => void confirmPendingAction()}
              >
                {((isDiscarding && pendingConfirmation.kind === "DISCARD_DRAFT") ||
                  (isPublishing && pendingConfirmation.kind === "PUBLISH") ||
                  (isUnpublishing && pendingConfirmation.kind === "UNPUBLISH")) && (
                  <Loader2 size={17} className={styles.spinner} aria-hidden="true" />
                )}
                {confirmationCopy.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowSteps({ activeStep }: { activeStep: number }): React.JSX.Element {
  return (
    <ol className={styles.flowSteps} aria-label="Pasos para armar la historia">
      {STORY_FLOW_STEPS.map((step, index) => (
        <li
          key={step.title}
          className={index === activeStep ? styles.flowStepActive : styles.flowStep}
          aria-current={index === activeStep ? "step" : undefined}
        >
          <span className={styles.flowStepNumber}>{index + 1}</span>
          <span className={styles.flowStepText}>
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
