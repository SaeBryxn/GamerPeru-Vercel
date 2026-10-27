"use client";

import React, { useEffect, useId, useState } from "react";
import { ProductSelection, type ProductOption } from "@/components/admin/product-selection";
import type { ProductSelection as Selection } from "@/lib/catalog/curated-products";
import { Plus, Trash2 } from "lucide-react";
import type { HomeSectionType } from "@/db/schema";
import {
  parseHomeSectionContent,
  type HomeImageSlot,
  type HomeVideoSourceContent,
} from "@/lib/home/section-schemas";
import { getAt, joinPath, setAt } from "./content-path";
import { ImageSlotField, VideoSourceField, type EditorMedia } from "./media-fields";
import { HOME_SECTION_FIELDS, type FieldPath, type HomeField } from "./section-fields";
import styles from "./home-editor.module.css";

export interface CategoryOption {
  slug: string;
  name: string;
}

interface FieldContext {
  products: readonly ProductOption[];
  content: Record<string, unknown>;
  errors: Map<string, string>;
  media: Record<string, EditorMedia>;
  categories: readonly CategoryOption[];
  update: (path: FieldPath, value: unknown) => void;
  addMedia: (assetId: string, media: EditorMedia) => void;
}

/** First validation message at `path` or below it. */
function errorAt(errors: Map<string, string>, path: FieldPath): string | undefined {
  const key = joinPath(path);
  for (const [issuePath, message] of errors) {
    if (issuePath === key || issuePath.startsWith(`${key}.`)) return message;
  }
  return undefined;
}

function TextField({
  field,
  path,
  ctx,
}: {
  field: Extract<HomeField, { kind: "text" | "href" }>;
  path: FieldPath;
  ctx: FieldContext;
}) {
  const id = useId();
  const raw = getAt(ctx.content, path);
  const value = typeof raw === "string" ? raw : "";
  const error = errorAt(ctx.errors, path);
  const hint = field.kind === "href" ? field.hint : field.hint;
  const max = field.kind === "text" ? field.max : 300;
  const onChange = (next: string) =>
    ctx.update(path, field.kind === "href" && field.nullable && next.trim() === "" ? null : next);
  const common = {
    id,
    className: styles.input,
    value,
    maxLength: max,
    "aria-invalid": Boolean(error),
    "aria-describedby": hint ? `${id}-hint` : undefined,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {field.label}
        <span className={styles.counter}>
          {value.length}/{max}
        </span>
      </label>
      {field.kind === "text" && field.multiline ? (
        <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && (
        <p id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </p>
      )}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

function renderField(field: HomeField, base: FieldPath, ctx: FieldContext): React.ReactNode {
  const path = [...base, ...field.path];
  const key = joinPath(path);

  switch (field.kind) {
    case "toggle":
      return (
        <div key={key} className={styles.field}>
          <label className={styles.fieldLabel}>
            <input
              type="checkbox"
              role="switch"
              checked={getAt(ctx.content, path) === true}
              onChange={(event) => ctx.update(path, event.target.checked)}
            />
            {field.label}
          </label>
          {field.hint && <p className={styles.fieldHint}>{field.hint}</p>}
          {errorAt(ctx.errors, path) && (
            <p className={styles.fieldError}>{errorAt(ctx.errors, path)}</p>
          )}
        </div>
      );
    case "text":
    case "href":
      return <TextField key={key} field={field} path={path} ctx={ctx} />;
    case "number":
      return <NumberField key={key} field={field} path={path} ctx={ctx} />;
    case "select":
      return (
        <SelectField key={key} label={field.label} path={path} ctx={ctx} options={field.options} />
      );
    case "category":
      return (
        <SelectField
          key={key}
          label={field.label}
          path={path}
          ctx={ctx}
          options={ctx.categories.map((category) => ({
            value: category.slug,
            label: category.name,
          }))}
        />
      );
    case "selection":
      return (
        <ProductSelection
          key={key}
          products={ctx.products}
          value={getAt(ctx.content, path) as Selection | undefined}
          categorySlug={
            (ctx.content.categorySlug as string | undefined) ??
            (ctx.content.source as { kind: string; categorySlug?: string } | undefined)
              ?.categorySlug
          }
          onChange={(next) => ctx.update(path, next)}
        />
      );
    case "productSource":
      return <ProductSourceField key={key} label={field.label} path={path} ctx={ctx} />;
    case "image":
      return (
        <ImageSlotField
          key={key}
          label={field.label}
          hint={field.hint}
          value={getAt(ctx.content, path) as HomeImageSlot}
          media={ctx.media}
          error={errorAt(ctx.errors, path)}
          onChange={(next) => ctx.update(path, next)}
          onMediaAdded={ctx.addMedia}
        />
      );
    case "video":
      return (
        <VideoSourceField
          key={key}
          label={field.label}
          value={getAt(ctx.content, path) as HomeVideoSourceContent}
          media={ctx.media}
          error={errorAt(ctx.errors, path)}
          onChange={(next) => ctx.update(path, next)}
          onMediaAdded={ctx.addMedia}
        />
      );
    case "list":
      return <ListField key={key} field={field} path={path} ctx={ctx} />;
  }
}

function NumberField({
  field,
  path,
  ctx,
}: {
  field: Extract<HomeField, { kind: "number" }>;
  path: FieldPath;
  ctx: FieldContext;
}) {
  const id = useId();
  const value = getAt(ctx.content, path);
  const error = errorAt(ctx.errors, path);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {field.label}
      </label>
      <input
        id={id}
        type="number"
        className={styles.inputNarrow}
        min={field.min}
        max={field.max}
        value={typeof value === "number" ? value : ""}
        aria-invalid={Boolean(error)}
        onChange={(event) => ctx.update(path, Number(event.target.value))}
      />
      <p className={styles.fieldHint}>
        Entre {field.min} y {field.max}.
      </p>
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

function SelectField({
  label,
  path,
  ctx,
  options,
}: {
  label: string;
  path: FieldPath;
  ctx: FieldContext;
  options: readonly { value: string; label: string }[];
}) {
  const id = useId();
  const raw = getAt(ctx.content, path);
  const value = typeof raw === "string" ? raw : "";
  const error = errorAt(ctx.errors, path);
  const known = options.some((option) => option.value === value);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => ctx.update(path, event.target.value)}
      >
        {!known && <option value={value}>{value || "Elige una opción"}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

function ProductSourceField({
  label,
  path,
  ctx,
}: {
  label: string;
  path: FieldPath;
  ctx: FieldContext;
}) {
  const source = getAt(ctx.content, path) as { kind: string; categorySlug?: string };
  return (
    <fieldset className={styles.mediaField}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        <label className={styles.segment}>
          <input
            type="radio"
            checked={source.kind === "showcase"}
            onChange={() => ctx.update(path, { kind: "showcase" })}
          />
          Destacados de todo el catálogo
        </label>
        <label className={styles.segment}>
          <input
            type="radio"
            checked={source.kind === "category"}
            onChange={() =>
              ctx.update(path, {
                kind: "category",
                categorySlug: ctx.categories[0]?.slug ?? "",
              })
            }
          />
          Una categoría
        </label>
      </div>
      {source.kind === "category" && (
        <SelectField
          label="Categoría"
          path={[...path, "categorySlug"]}
          ctx={ctx}
          options={ctx.categories.map((category) => ({
            value: category.slug,
            label: category.name,
          }))}
        />
      )}
    </fieldset>
  );
}

function ListField({
  field,
  path,
  ctx,
}: {
  field: Extract<HomeField, { kind: "list" }>;
  path: FieldPath;
  ctx: FieldContext;
}) {
  const items = (getAt(ctx.content, path) as unknown[] | undefined) ?? [];
  const error = errorAt(ctx.errors, path);
  return (
    <fieldset className={styles.listField}>
      <legend className={styles.fieldLabel}>
        {field.label} ({items.length} de {field.max})
      </legend>
      {items.map((_, index) => (
        <div key={index} className={styles.listItem}>
          <div className={styles.listItemHeader}>
            {[-1, 1].map((direction) => (
              <button
                key={direction}
                type="button"
                className={styles.iconButton}
                aria-label={`${direction < 0 ? "Subir" : "Bajar"} ${field.itemLabel.toLowerCase()} ${index + 1}`}
                disabled={index + direction < 0 || index + direction >= items.length}
                onClick={() => {
                  const next = [...items];
                  const target = index + direction;
                  [next[index], next[target]] = [next[target], next[index]];
                  ctx.update(path, next);
                }}
              >
                {direction < 0 ? "↑" : "↓"}
              </button>
            ))}
            <span className={styles.listItemTitle}>
              {field.itemLabel} {index + 1}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              disabled={items.length <= field.min}
              aria-label={`Quitar ${field.itemLabel.toLowerCase()} ${index + 1}`}
              onClick={() =>
                ctx.update(
                  path,
                  items.filter((__, position) => position !== index)
                )
              }
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
          {field.fields.map((child) => renderField(child, [...path, index], ctx))}
        </div>
      ))}
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={items.length >= field.max}
        onClick={() => ctx.update(path, [...items, field.newItem()])}
      >
        <Plus size={14} aria-hidden="true" />
        Agregar {field.itemLabel.toLowerCase()}
      </button>
      {error && !error.includes(".") && <p className={styles.fieldError}>{error}</p>}
    </fieldset>
  );
}

export interface SectionFormProps {
  type: HomeSectionType;
  products?: readonly ProductOption[];
  initialContent: Record<string, unknown>;
  initialMedia: Record<string, EditorMedia>;
  categories: readonly CategoryOption[];
  busy: boolean;
  onSave: (content: Record<string, unknown>) => void;
  onDraftChange?: (content: Record<string, unknown>) => void;
  onCancel: () => void;
  onMediaAdded: (assetId: string, media: EditorMedia) => void;
}

/** Edits one section. Validates with the server's schema before sending anything. */
export function SectionForm({
  type,
  initialContent,
  products = [],
  initialMedia,
  categories,
  busy,
  onSave,
  onDraftChange,
  onCancel,
  onMediaAdded,
}: SectionFormProps) {
  const [content, setContent] = useState(initialContent);
  const [media, setMedia] = useState(initialMedia);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const summaryId = useId();
  useEffect(() => {
    onDraftChange?.(content);
  }, [content, onDraftChange]);

  const ctx: FieldContext = {
    products,
    content,
    errors,
    media,
    categories,
    update: (path, value) => setContent((current) => setAt(current, path, value)),
    addMedia: (assetId, added) => {
      setMedia((current) => ({ ...current, [assetId]: added }));
      onMediaAdded(assetId, added);
    },
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseHomeSectionContent(type, content);
    if (!parsed.success) {
      const next = new Map<string, string>();
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!next.has(key)) next.set(key, describeIssue(issue.message, issue.code));
      }
      setErrors(next);
      return;
    }
    setErrors(new Map());
    onSave(parsed.data);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-describedby={summaryId}>
      {errors.size > 0 && (
        <p id={summaryId} className={styles.formError} role="alert">
          Revisa los campos marcados: {errors.size} por corregir.
        </p>
      )}
      <fieldset disabled={busy} className={styles.formFields}>
        {HOME_SECTION_FIELDS[type].map((field) => renderField(field, [], ctx))}
      </fieldset>
      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>
          Descartar cambios
        </button>
        <button type="submit" className={styles.primaryButton} disabled={busy}>
          {busy ? "Guardando…" : "Guardar y publicar"}
        </button>
      </div>
    </form>
  );
}

/** Zod's default messages are in English; the operator gets them in Spanish. */
function describeIssue(message: string, code: string): string {
  if (message.startsWith("Forbidden HTML")) return "No se permiten etiquetas HTML.";
  switch (code) {
    case "too_small":
      return "Este campo es obligatorio o tiene muy pocos elementos.";
    case "too_big":
      return "Es demasiado largo o tiene demasiados elementos.";
    case "invalid_string":
      return message.startsWith("Debe") ? message : "El formato no es válido.";
    case "invalid_type":
      return "Falta completar este campo.";
    case "invalid_union_discriminator":
    case "invalid_union":
      return "Completa el video y su portada, o elige un video de YouTube.";
    case "custom":
      return message.startsWith("Debe") ? message : "El valor no es válido.";
    default:
      return "El valor no es válido.";
  }
}
