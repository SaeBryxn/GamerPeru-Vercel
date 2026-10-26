"use client";

import type { ProductOption } from "@/components/admin/product-selection";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Lock, Pencil } from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { AnimatePresence } from "framer-motion";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import { useUnsavedDraft } from "@/components/admin/use-unsaved-draft";
import { SectionPreview } from "./section-preview";
import type { AdminHomeSection, AdminHomeState } from "@/lib/home/home-sections-service";
import {
  createHomeSectionAction,
  reorderHomeSectionsAction,
  setHomeSectionVisibilityAction,
  updateHomeSectionContentAction,
} from "@/lib/home/home-sections-actions";
import type { EditorMedia } from "./media-fields";
import { HOME_SECTION_GUIDES } from "./section-guide";
import { SectionForm, type CategoryOption } from "./section-form";
import styles from "./home-editor.module.css";

export interface HomeEditorProps {
  products?: readonly ProductOption[];
  initialState: AdminHomeState | null;
  categories: readonly CategoryOption[];
}

/** The most recognizable line of a section, to tell repeated types apart in the list. */
export function sectionHeadline(section: AdminHomeSection): string {
  const content = section.content;
  const pick = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  const title = Array.isArray(content.title) ? content.title.join(" ") : content.title;
  const firstItem = Array.isArray(content.items)
    ? (content.items[0] as { title?: unknown } | undefined)?.title
    : undefined;
  return (
    pick(title) ??
    pick(content.heading) ??
    pick(content.eyebrow) ??
    pick(firstItem) ??
    HOME_SECTION_GUIDES[section.type].label
  );
}

interface PendingVisibility {
  section: AdminHomeSection;
  isVisible: boolean;
}

export function HomeEditor({ initialState, categories, products = [] }: HomeEditorProps) {
  const router = useRouter();
  const [sections, setSections] = useState(initialState?.sections ?? []);
  const [media, setMedia] = useState<Record<string, EditorMedia>>(initialState?.media ?? {});
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingVisibility, setPendingVisibility] = useState<PendingVisibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const editedSection = sections.find((section) => section.id === editingId);
  useUnsavedDraft(
    !!editedSection && !!draft && JSON.stringify(draft) !== JSON.stringify(editedSection.content)
  );

  if (!initialState) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Home de la tienda</h1>
        </header>
        <p className={styles.formError} role="alert" data-testid="home-editor-unavailable">
          Las secciones del home todavía no están disponibles en la base de datos. Falta aplicar la
          migración 0021; mientras tanto la tienda muestra el home predeterminado.
        </p>
      </div>
    );
  }

  const fail = (message: string | undefined, code?: string) => {
    setError(message ?? "No se pudo guardar el cambio.");
    if (code === "HOME_SECTION_CONFLICT") router.refresh();
  };

  const perform = (work: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await work();
      } catch {
        fail("No se pudo confirmar el cambio. Vuelve a intentar.");
      }
    });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    const moved = sections[index];
    const displaced = sections[target];
    if (!moved || !displaced || displaced.type === "video_hero") return;

    const next = [...sections];
    next[index] = displaced;
    next[target] = moved;
    setError(null);
    perform(async () => {
      const result = await reorderHomeSectionsAction({
        orderedIds: next.map((section) => section.id),
        expectedOrder: sections.map((section) => section.id),
      });
      if (!result.success || !result.data) return fail(result.error, result.code);
      const versions = result.data.versions;
      setSections(
        next.map((section, position) => ({
          ...section,
          displayOrder: position,
          version: versions[section.id] ?? section.version,
        }))
      );
      setAnnouncement(
        `${HOME_SECTION_GUIDES[moved.type].label} quedó en la posición ${target + 1} de ${next.length}.`
      );
    });
  };

  const confirmVisibility = () => {
    if (!pendingVisibility) return;
    const { section, isVisible } = pendingVisibility;
    setError(null);
    perform(async () => {
      const result = await setHomeSectionVisibilityAction({
        sectionId: section.id,
        expectedVersion: section.version,
        isVisible,
      });
      setPendingVisibility(null);
      if (!result.success || !result.data) return fail(result.error, result.code);
      const version = result.data.version;
      setSections((current) =>
        current.map((item) => (item.id === section.id ? { ...item, isVisible, version } : item))
      );
      setAnnouncement(
        `${HOME_SECTION_GUIDES[section.type].label} ${isVisible ? "ahora se muestra" : "quedó oculta"} en la tienda.`
      );
    });
  };

  const save = (section: AdminHomeSection, content: Record<string, unknown>) => {
    setError(null);
    perform(async () => {
      const result = await updateHomeSectionContentAction({
        sectionId: section.id,
        expectedVersion: section.version,
        content,
      });
      if (!result.success || !result.data) return fail(result.error, result.code);
      const version = result.data.version;
      setSections((current) =>
        current.map((item) =>
          item.id === section.id ? { ...item, content, contentValid: true, version } : item
        )
      );
      setEditingId(null);
      setAnnouncement(`${HOME_SECTION_GUIDES[section.type].label}: cambios publicados.`);
    });
  };

  const editing = sections.find((section) => section.id === editingId);
  const openEditor = (section: AdminHomeSection) => {
    setDraft(section.content);
    setEditingId(section.id);
    setError(null);
  };
  const closeEditor = () => {
    if (isPending) return;
    if (
      editing &&
      draft &&
      JSON.stringify(draft) !== JSON.stringify(editing.content) &&
      !window.confirm("Tienes cambios sin guardar. ¿Descartarlos y cerrar?")
    )
      return;
    setEditingId(null);
    setDraft(null);
  };
  const visibleCount = sections.filter((section) => section.isVisible).length;
  const outline = pendingVisibility
    ? sections.map((section) => ({
        section,
        visible:
          section.id === pendingVisibility.section.id
            ? pendingVisibility.isVisible
            : section.isVisible,
        changed: section.id === pendingVisibility.section.id,
      }))
    : [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Home de la tienda</h1>
          <p className={styles.subtitle}>
            Ordena, muestra u oculta y edita las secciones de la portada. Cada cambio se publica al
            guardarlo. {visibleCount} de {sections.length} secciones visibles.
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.secondaryButton}
          data-testid="home-editor-open-store"
        >
          <ExternalLink size={14} aria-hidden="true" />
          Ver la tienda
        </a>
      </header>

      <p className={styles.canvasHint}>
        Vista de contenido · las secciones aparecen en el orden de la tienda. Abre una para editar y
        previsualizar tus cambios.
      </p>

      {!editing && error && (
        <p className={styles.formError} role="alert" data-testid="home-editor-error">
          {error}
        </p>
      )}
      <p className={styles.visuallyHidden} aria-live="polite">
        {announcement}
      </p>

      <button
        type="button"
        className={styles.secondaryButton}
        disabled={isPending || sections.some((section) => section.type === "brand_strip")}
        onClick={() => {
          setError(null);
          perform(async () => {
            const result = await createHomeSectionAction({
              type: "brand_strip",
              expectedOrder: sections.map((section) => section.id),
            });
            if (!result.success || !result.data) return fail(result.error, result.code);
            setSections((current) => [...current, result.data!]);
            openEditor(result.data);
          });
        }}
      >
        Agregar carrusel de marcas
      </button>
      <ul className={styles.list}>
        {sections.map((section, index) => {
          const guide = HOME_SECTION_GUIDES[section.type];
          const isHero = section.type === "video_hero";
          const isEditing = editingId === section.id;
          const canMoveUp = !isHero && index > 0 && sections[index - 1]?.type !== "video_hero";
          const canMoveDown = !isHero && index < sections.length - 1;
          const headline = sectionHeadline(section);

          return (
            <li
              key={section.id}
              className={`${styles.card} ${section.isVisible ? "" : styles.cardHidden}`}
              data-testid={`home-section-${section.id}`}
            >
              <div className={styles.cardRow}>
                <span className={styles.position}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.cardMain}>
                  <div className={styles.cardHeading}>
                    <span className={styles.cardType}>{guide.label}</span>
                    <span className={section.isVisible ? styles.statusOn : styles.statusOff}>
                      {section.isVisible ? (
                        <>
                          <Eye size={12} aria-hidden="true" /> Visible
                        </>
                      ) : (
                        <>
                          <EyeOff size={12} aria-hidden="true" /> Oculta
                        </>
                      )}
                    </span>
                    {!section.contentValid && (
                      <span className={styles.statusWarn}>Contenido por revisar</span>
                    )}
                  </div>
                  <p className={styles.cardHeadline}>{headline}</p>
                  <p className={styles.cardDescription}>{guide.description}</p>
                </div>
                <div className={styles.cardActions}>
                  {isHero ? (
                    <span className={styles.pinned} title="La portada siempre va primero">
                      <Lock size={12} aria-hidden="true" /> Primera
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(index, -1)}
                        disabled={!canMoveUp || isPending}
                        aria-label={`Subir ${guide.label}: ${headline}`}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(index, 1)}
                        disabled={!canMoveDown || isPending}
                        aria-label={`Bajar ${guide.label}: ${headline}`}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={section.isVisible}
                    aria-label={`${section.isVisible ? "Ocultar" : "Mostrar"} ${guide.label}: ${headline}`}
                    className={`${styles.switch} ${section.isVisible ? styles.switchOn : ""}`}
                    disabled={isPending}
                    onClick={() => setPendingVisibility({ section, isVisible: !section.isVisible })}
                    data-testid={`home-section-toggle-${section.id}`}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    aria-expanded={isEditing}
                    aria-controls={`home-section-form-${section.id}`}
                    onClick={() => openEditor(section)}
                    disabled={isPending && !isEditing}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    {isEditing ? "Cerrar" : "Editar"}
                  </button>
                </div>
              </div>

              <div className={styles.sectionCanvas}>
                <SectionPreview
                  type={section.type}
                  content={section.content}
                  media={media}
                  products={products}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {editing && (
          <SideDrawer
            labelledBy="home-drawer-title"
            onClose={closeEditor}
            busy={isPending}
            size="wide"
            testId="home-section-drawer"
          >
            <DrawerHeader
              titleId="home-drawer-title"
              title={HOME_SECTION_GUIDES[editing.type].label}
              eyebrow={`Home · sección ${sections.indexOf(editing) + 1} de ${sections.length}`}
              onClose={closeEditor}
              busy={isPending}
            />
            <div className={styles.editorLayout}>
              <aside className={styles.livePreview} aria-label="Vista previa de la sección">
                <div className={styles.previewCaption}>
                  <strong>Vista previa</strong>
                  <span>{editing.isVisible ? "Visible en la tienda" : "Sección oculta"}</span>
                </div>
                <SectionPreview
                  type={editing.type}
                  content={draft ?? editing.content}
                  media={media}
                  products={products}
                />
                <p className={styles.canvasHint}>
                  Los cambios se publican al guardar. La vista previa representa el contenido; el
                  tamaño final se adapta a la tienda.
                </p>
              </aside>
              <div className={styles.editorFields} id={`home-section-form-${editing.id}`}>
                {error && (
                  <p className={styles.formError} role="alert">
                    {error}
                  </p>
                )}
                <SectionForm
                  key={editing.id}
                  products={products}
                  type={editing.type}
                  initialContent={editing.content}
                  initialMedia={media}
                  categories={categories}
                  busy={isPending}
                  onDraftChange={setDraft}
                  onSave={(content) => save(editing, content)}
                  onCancel={() => {
                    setEditingId(null);
                    setDraft(null);
                  }}
                  onMediaAdded={(assetId, added) =>
                    setMedia((current) => ({ ...current, [assetId]: added }))
                  }
                />
              </div>
            </div>
          </SideDrawer>
        )}
      </AnimatePresence>

      <ConfirmationDialog
        open={pendingVisibility !== null}
        title={
          pendingVisibility?.isVisible
            ? "¿Mostrar esta sección en la tienda?"
            : "¿Ocultar esta sección de la tienda?"
        }
        description={
          pendingVisibility
            ? pendingVisibility.isVisible
              ? `«${sectionHeadline(pendingVisibility.section)}» vuelve a aparecer en el home al confirmar.`
              : `«${sectionHeadline(pendingVisibility.section)}» deja de verse en el home al confirmar. Su contenido se conserva y puedes volver a mostrarla.`
            : ""
        }
        confirmLabel={pendingVisibility?.isVisible ? "Mostrar sección" : "Ocultar sección"}
        tone={pendingVisibility?.isVisible ? "warning" : "danger"}
        busy={isPending}
        onConfirm={confirmVisibility}
        onClose={() => setPendingVisibility(null)}
      >
        <div className={styles.outline} data-testid="home-visibility-preview">
          <p className={styles.outlineTitle}>Así quedará el home:</p>
          <ol>
            {outline.map(({ section, visible, changed }) => (
              <li
                key={section.id}
                className={`${visible ? "" : styles.outlineHidden} ${changed ? styles.outlineChanged : ""}`}
              >
                {HOME_SECTION_GUIDES[section.type].label}: {sectionHeadline(section)}
                {changed && <strong> · {visible ? "se mostrará" : "se ocultará"}</strong>}
                {!changed && !visible && <span> · oculta</span>}
              </li>
            ))}
          </ol>
        </div>
      </ConfirmationDialog>
    </div>
  );
}
