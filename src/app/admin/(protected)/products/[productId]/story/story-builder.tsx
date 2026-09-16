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
  Copy,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  discardProductStoryDraftAction,
  saveProductStoryDraftAction,
} from "@/lib/admin/catalog/story-actions";
import {
  classifyStoryActionResult,
  createBuilderDocument,
  createIncompleteBuilderBlock,
  duplicateBuilderBlock,
  getBuilderBlockId,
  getBuilderBlockType,
  getStoryBlockDefinition,
  getStoryLifecycleText,
  isStoryBuilderDirty,
  moveBuilderBlock,
  removeBuilderBlock,
  STORY_BLOCK_LIBRARY,
  STORY_BUILDER_MAX_BLOCKS,
  toCompleteStoryDocument,
  type BuilderStoryBlock,
  type StoryBlockType,
  type StoryLifecycle,
  type StoryLifecycleSummary,
} from "@/lib/admin/catalog/story-builder-model";
import { MutationRequestTracker } from "@/lib/admin/catalog/mutation-request";
import type { AdminProductStoryDto } from "@/lib/admin/catalog/story-reader";
import type { AuthoringStoryDocument } from "@/lib/admin/catalog/story-validation";
import styles from "./story-builder.module.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StoryBuilderProps {
  initialStory: AdminProductStoryDto;
}

interface DurableStoryView extends StoryLifecycleSummary {
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
}

type PendingConfirmation =
  | { kind: "DELETE_BLOCK"; blockId: string; label: string }
  | { kind: "RESET_LOCAL" }
  | { kind: "DISCARD_DRAFT" }
  | { kind: "NAVIGATE"; href: string }
  | { kind: "RELOAD_SERVER" };

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
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusFirst = () => {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? dialog).focus();
    };
    focusFirst();
    const timer = window.setTimeout(focusFirst, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [dialogRef, isOpen, onClose, triggerRef]);
}

export function StoryBuilder({ initialStory }: StoryBuilderProps) {
  const router = useRouter();
  const [document, setDocument] = useState<BuilderStoryBlock[]>(() =>
    createBuilderDocument(initialStory.initialDocument)
  );
  const [savedBaseline, setSavedBaseline] = useState<AuthoringStoryDocument>(() =>
    structuredClone(initialStory.initialDocument)
  );
  const [durableStory, setDurableStory] = useState<DurableStoryView>(() =>
    durableViewFromStory(initialStory)
  );
  const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);
  const [ambiguousSave, setAmbiguousSave] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);

  const saveTracker = useRef(new MutationRequestTracker());
  const discardTracker = useRef(new MutationRequestTracker());
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const addBlockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const libraryDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);

  const dirty = useMemo(
    () => isStoryBuilderDirty(document, savedBaseline),
    [document, savedBaseline]
  );
  const incompleteCount = document.filter((block) => block.state === "INCOMPLETE").length;
  const completeDocument = useMemo(() => toCompleteStoryDocument(document), [document]);
  const canSaveWithoutChanges = durableStory.draftRevisionId === null;
  const saveDisabled =
    isSaving ||
    isDiscarding ||
    incompleteCount > 0 ||
    document.length > STORY_BUILDER_MAX_BLOCKS ||
    (!dirty && !canSaveWithoutChanges);

  useEffect(() => {
    setDocument(createBuilderDocument(initialStory.initialDocument));
    setSavedBaseline(structuredClone(initialStory.initialDocument));
    setDurableStory(durableViewFromStory(initialStory));
    setStaleConflict(false);
    setAmbiguousSave(false);
    setErrorMessage(null);
    setFieldErrors([]);
  }, [initialStory]);

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
    if (!isDiscarding) setPendingConfirmation(null);
  }, [isDiscarding]);

  useDialogFocus(isBlockLibraryOpen, libraryDialogRef, addBlockTriggerRef, closeBlockLibrary);
  useDialogFocus(
    pendingConfirmation !== null,
    confirmationDialogRef,
    confirmationTriggerRef,
    closeConfirmation
  );

  function clearFeedbackForEdit() {
    setErrorMessage(null);
    setFieldErrors([]);
    setSuccessMessage(null);
    setAmbiguousSave(false);
  }

  function announce(message: string) {
    setAnnouncement(message);
  }

  function openConfirmation(event: React.MouseEvent<HTMLElement>, value: PendingConfirmation) {
    confirmationTriggerRef.current = event.currentTarget;
    setPendingConfirmation(value);
  }

  function addBlock(type: StoryBlockType) {
    if (document.length >= STORY_BUILDER_MAX_BLOCKS) return;
    const block = createIncompleteBuilderBlock(type);
    clearFeedbackForEdit();
    setDocument((current) => [...current, block]);
    setIsBlockLibraryOpen(false);
    setPendingFocusBlockId(block.blockId);
    announce(`${getStoryBlockDefinition(type).label} agregado como bloque pendiente.`);
  }

  function duplicateBlock(index: number) {
    const source = document[index];
    if (!source || source.state !== "COMPLETE") return;
    const newBlockId = crypto.randomUUID();
    const next = duplicateBuilderBlock(document, index, () => newBlockId);
    clearFeedbackForEdit();
    setDocument(next);
    setPendingFocusBlockId(newBlockId);
    announce(
      `${getStoryBlockDefinition(source.block.type).label} duplicado en la posición ${index + 2}.`
    );
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const block = document[index];
    if (!block) return;
    const next = moveBuilderBlock(document, index, direction);
    clearFeedbackForEdit();
    setDocument(next);
    setPendingFocusBlockId(getBuilderBlockId(block));
    announce(`Bloque movido a la posición ${index + direction + 1} de ${document.length}.`);
  }

  function removeBlock(blockId: string) {
    const index = document.findIndex((block) => getBuilderBlockId(block) === blockId);
    if (index === -1) return;
    const next = removeBuilderBlock(document, blockId);
    const nextFocus = next[index] ?? next[index - 1] ?? null;
    clearFeedbackForEdit();
    setDocument(next);
    setPendingConfirmation(null);
    if (nextFocus) {
      setPendingFocusBlockId(getBuilderBlockId(nextFocus));
    } else {
      window.setTimeout(() => addBlockTriggerRef.current?.focus(), 10);
    }
    announce(`Bloque eliminado. Quedan ${next.length} bloques.`);
  }

  async function saveDraft() {
    if (completeDocument === null) {
      setErrorMessage("Completa o elimina los bloques pendientes antes de guardar el borrador.");
      return;
    }

    const payload = {
      productId: initialStory.product.id,
      expectedDraftRevisionId: durableStory.draftRevisionId,
      expectedPublishedRevisionId: durableStory.publishedRevisionId,
      document: completeDocument,
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
        saveTracker.current.complete();
        const baseline = structuredClone(completeDocument);
        setDocument(createBuilderDocument(baseline));
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
        setFieldErrors(result.fieldErrors?.map((issue) => `${issue.path}: ${issue.message}`) ?? []);
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
    setSuccessMessage(null);

    try {
      const result = await discardProductStoryDraftAction({ ...payload, mutationRequestId });
      const disposition = classifyStoryActionResult(result);

      if (disposition === "SUCCESS") {
        discardTracker.current.complete();
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

  async function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;

    switch (confirmation.kind) {
      case "DELETE_BLOCK":
        removeBlock(confirmation.blockId);
        return;
      case "RESET_LOCAL":
        setDocument(createBuilderDocument(savedBaseline));
        clearFeedbackForEdit();
        setStaleConflict(false);
        setPendingConfirmation(null);
        announce("Los cambios locales se restablecieron al último borrador guardado.");
        window.setTimeout(() => confirmationTriggerRef.current?.focus(), 10);
        return;
      case "DISCARD_DRAFT":
        await discardDurableDraft();
        return;
      case "NAVIGATE":
        setPendingConfirmation(null);
        router.push(confirmation.href);
        return;
      case "RELOAD_SERVER":
        setPendingConfirmation(null);
        router.refresh();
        return;
    }
  }

  function requestServerReload(event: React.MouseEvent<HTMLButtonElement>) {
    if (dirty) {
      openConfirmation(event, { kind: "RELOAD_SERVER" });
      return;
    }
    router.refresh();
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

  return (
    <div className={styles.container} data-testid="story-builder">
      <div aria-live="polite" className={styles.srOnly} data-testid="story-announcement">
        {announcement}
      </div>

      <Link href={productManagerHref} className={styles.backLink} data-testid="story-back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al Product Manager
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

      <div className={styles.workspace}>
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
                Puedes guardar un borrador vacío o agregar el primer bloque. La configuración de
                contenido estará disponible en la siguiente etapa.
              </p>
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
            </div>
          ) : (
            <ol className={styles.blockList} data-testid="story-block-list">
              {document.map((block, index) => {
                const blockId = getBuilderBlockId(block);
                const type = getBuilderBlockType(block);
                const definition = getStoryBlockDefinition(type);
                const position = index + 1;
                return (
                  <li key={blockId}>
                    <article
                      ref={(node) => {
                        if (node) blockRefs.current.set(blockId, node);
                        else blockRefs.current.delete(blockId);
                      }}
                      tabIndex={-1}
                      className={`${styles.blockCard} ${
                        block.state === "INCOMPLETE" ? styles.blockCardIncomplete : ""
                      }`}
                      data-testid={`story-block-${blockId}`}
                      data-block-id={blockId}
                    >
                      <div className={styles.blockHeader}>
                        <div>
                          <span className={styles.blockPosition}>
                            Bloque {position} de {document.length}
                          </span>
                          <h3>{definition.label}</h3>
                          <p>{definition.description}</p>
                        </div>
                        <span
                          className={
                            block.state === "INCOMPLETE"
                              ? styles.incompleteBadge
                              : styles.completeBadge
                          }
                        >
                          {block.state === "INCOMPLETE"
                            ? "Configuración pendiente"
                            : "Contenido guardado"}
                        </span>
                      </div>

                      {block.state === "INCOMPLETE" ? (
                        <p className={styles.incompleteExplanation}>
                          Este bloque contiene solamente su estructura. Configura su contenido
                          cuando los campos estén disponibles o elimínalo antes de guardar.
                        </p>
                      ) : (
                        <p className={styles.completeExplanation}>
                          El contenido y las referencias actuales se conservarán sin cambios.
                        </p>
                      )}

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
                          Subir
                        </button>
                        <button
                          type="button"
                          className={styles.blockAction}
                          disabled={index === document.length - 1}
                          onClick={() => moveBlock(index, 1)}
                          aria-label={`Mover ${definition.label} hacia abajo`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                          Bajar
                        </button>
                        <button
                          type="button"
                          className={styles.blockAction}
                          disabled={
                            block.state === "INCOMPLETE" ||
                            document.length >= STORY_BUILDER_MAX_BLOCKS
                          }
                          onClick={() => duplicateBlock(index)}
                          aria-label={`Duplicar ${definition.label}`}
                        >
                          <Copy size={16} aria-hidden="true" />
                          Duplicar
                        </button>
                        <button
                          type="button"
                          className={`${styles.blockAction} ${styles.deleteAction}`}
                          onClick={(event) => {
                            if (block.state === "INCOMPLETE") {
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
                          Eliminar
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className={styles.actionPanel} aria-labelledby="story-actions-title">
          <h2 id="story-actions-title">Acciones del borrador</h2>
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

          {dirty && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={(event) => openConfirmation(event, { kind: "RESET_LOCAL" })}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Restablecer cambios locales
            </button>
          )}

          {durableStory.draftRevisionId !== null && (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={isDiscarding || isSaving}
              onClick={(event) => openConfirmation(event, { kind: "DISCARD_DRAFT" })}
              data-testid="story-discard-draft"
            >
              <Trash2 size={16} aria-hidden="true" />
              Descartar borrador guardado
            </button>
          )}

          <button type="button" className={styles.tertiaryButton} onClick={requestServerReload}>
            <RefreshCw size={16} aria-hidden="true" />
            Recargar desde servidor
          </button>

          <p className={styles.actionHelp}>
            Guardar crea una revisión inmutable. Descartar actúa sobre el borrador durable; nunca se
            ejecuta al salir de la página.
          </p>
        </aside>
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
                <p>Elige una estructura. Su contenido se configurará en la siguiente etapa.</p>
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
            <div className={styles.libraryGrid}>
              {STORY_BLOCK_LIBRARY.map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  className={styles.libraryOption}
                  data-story-block-type={definition.type}
                  onClick={() => addBlock(definition.type)}
                >
                  <strong>{definition.label}</strong>
                  <span>{definition.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
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
                disabled={isDiscarding}
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
                disabled={isDiscarding}
                onClick={() => void confirmPendingAction()}
              >
                {isDiscarding && pendingConfirmation.kind === "DISCARD_DRAFT" && (
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
