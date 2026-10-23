"use client";

import Link from "@/components/app-link";
import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { formatDimensions, formatHandRange, pdpSizeSchema } from "@/lib/catalog/product-pdp-config";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleSlash2,
  ExternalLink,
  FileWarning,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  applyProposalAdminAction,
  approveProposalAdminAction,
  getProposalApplyStatusAdminAction,
  getProposalReviewAdminAction,
  initializeProposalReviewAdminAction,
  rejectProposalAdminAction,
  reviewProposalFieldAdminAction,
  setHumanVariantPlanAdminAction,
} from "@/lib/ai/admin/actions";
import type {
  AdminProposalApplyStatusDto,
  AdminProposalFieldDto,
  AdminProposalReviewDto,
  CatalogReferenceDto,
} from "@/lib/ai/admin/types";
import styles from "@/components/admin/ai-admin.module.css";

interface ProposalReviewWorkspaceProps {
  initialProposal: AdminProposalReviewDto;
  brands: CatalogReferenceDto[];
  categories: CatalogReferenceDto[];
  canApply: boolean;
}

const DECISION_LABELS = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  MANUALLY_EDITED: "Editado por personal",
} as const;

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED_OFFICIAL: "Verificado · fuente oficial",
  VERIFIED_SECONDARY: "Verificado · fuente secundaria",
  AI_INFERRED: "Inferido por IA",
  SOURCE_CONFLICT: "Conflicto de fuentes",
  UNVERIFIED: "Sin verificar",
};

function humanFieldName(path: string): string {
  const labels: Record<string, string> = {
    "catalog.brandId": "Marca",
    "catalog.categoryId": "Categoría",
    "catalog.slug": "Slug",
    "copy.name": "Nombre",
    "copy.subtitle": "Subtítulo",
    "copy.description": "Descripción",
    "seo.title": "Título SEO",
    "seo.description": "Descripción SEO",
    "research.unmappedSpecifications": "Especificaciones sin mapear",
    "research.variants": "Variantes propuestas",
    "research.mediaCandidates": "Referencias de medios",
    "pdp.sizes": "Tallas, dimensiones y peso",
    "pdp.packageContents": "Contenido de la caja",
    "pdp.support.warranty": "Garantía",
    "pdp.support.manualUrl": "Manual del producto",
    "pdp.support.driverUrl": "Software del producto",
    "pdp.highlights": "Especificaciones de la tienda",
  };
  return labels[path] ?? path;
}

function valueForEditor(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function parseEditorValue(raw: string, proposed: unknown): unknown {
  if (typeof proposed === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("Ingresa un número válido.");
    return value;
  }
  if (typeof proposed === "boolean") return raw === "true";
  if (proposed && typeof proposed === "object") return JSON.parse(raw);
  return raw;
}

function centsToPen(value: unknown): string {
  if (typeof value !== "number" || !Number.isInteger(value)) return "";
  const whole = Math.trunc(value / 100);
  const decimals = String(Math.abs(value % 100)).padStart(2, "0");
  return `${whole}.${decimals}`;
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pdpRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function PdpReviewValue({ path, value }: { path: string; value: unknown }) {
  if (path === "pdp.sizes")
    return (
      <ul>
        {safeArray(value).map((entry, index) => {
          const parsed = pdpSizeSchema.safeParse(entry);
          if (!parsed.success) return <li key={index}>Talla incompleta</li>;
          const size = parsed.data;
          return (
            <li key={index}>
              {[
                size.name,
                formatDimensions(size),
                size.weight,
                size.handMin !== null || size.handMax !== null
                  ? `Mano: ${formatHandRange(size)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </li>
          );
        })}
      </ul>
    );
  if (path === "pdp.packageContents")
    return (
      <ul>
        {safeArray(value).map((entry, index) => {
          const edition = pdpRecord(entry);
          return (
            <li key={index}>
              <strong>{String(edition.edition ?? "")}</strong>
              <ul>
                {safeArray(edition.items).map((entry, itemIndex) => {
                  const item = pdpRecord(entry);
                  return (
                    <li key={itemIndex}>
                      {[
                        item.name,
                        item.quantity ? `Cantidad: ${String(item.quantity)}` : null,
                        item.note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  if (path === "pdp.highlights")
    return (
      <ul>
        {safeArray(value).map((entry, index) => {
          const row = pdpRecord(entry);
          return (
            <li key={index}>{[row.label, row.value, row.note].filter(Boolean).join(" · ")}</li>
          );
        })}
      </ul>
    );
  return <p>{valueForEditor(value) || "Sin valor propuesto"}</p>;
}

/** Structured controls keep the review usable without asking staff to edit JSON. */
function PdpArrayEditor({
  path,
  raw,
  onChange,
  disabled,
}: {
  path: string;
  raw: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const rows = safeArray(JSON.parse(raw)).map(pdpRecord);
  const changeRow = (index: number, key: string, value: unknown) =>
    onChange(
      JSON.stringify(
        rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
      )
    );
  const columns =
    path === "pdp.sizes"
      ? [
          ["name", "Talla"],
          ["lengthMm", "Largo (mm)"],
          ["widthMm", "Ancho (mm)"],
          ["heightMm", "Alto (mm)"],
          ["weight", "Peso (con unidad)"],
          ["handMin", "Mano mínima (cm)"],
          ["handMax", "Mano máxima (cm)"],
        ]
      : path === "pdp.highlights"
        ? [
            ["label", "Dato"],
            ["value", "Valor"],
            ["note", "Nota"],
          ]
        : [["edition", "Edición"]];
  const numeric = new Set(["lengthMm", "widthMm", "heightMm", "handMin", "handMax"]);
  return (
    <div>
      {rows.map((row, index) => (
        <fieldset key={index} disabled={disabled}>
          <legend>
            {path === "pdp.sizes" ? "Talla" : path === "pdp.highlights" ? "Especificación" : "Caja"}{" "}
            {index + 1}
          </legend>
          {columns.map(([key, label]) => (
            <label className={styles.field} key={key}>
              <span>{label}</span>
              <input
                aria-label={`${label} ${index + 1}`}
                type={numeric.has(key!) ? "number" : "text"}
                step={numeric.has(key!) ? "any" : undefined}
                value={String(row[key!] ?? "")}
                onChange={(event) =>
                  changeRow(
                    index,
                    key!,
                    numeric.has(key!)
                      ? event.target.value === ""
                        ? null
                        : Number(event.target.value)
                      : event.target.value
                  )
                }
              />
            </label>
          ))}
          {path === "pdp.packageContents" &&
            safeArray(row.items).map((entry, itemIndex) => {
              const item = pdpRecord(entry);
              return (
                <fieldset key={itemIndex}>
                  <legend>Elemento {itemIndex + 1}</legend>
                  {[
                    ["name", "Elemento"],
                    ["quantity", "Cantidad"],
                    ["note", "Nota"],
                  ].map(([key, label]) => (
                    <label className={styles.field} key={key}>
                      <span>{label}</span>
                      <input
                        aria-label={`${label} ${itemIndex + 1} de caja ${index + 1}`}
                        value={String(item[key!] ?? "")}
                        onChange={(event) =>
                          changeRow(
                            index,
                            "items",
                            safeArray(row.items).map((current, currentIndex) =>
                              currentIndex === itemIndex
                                ? { ...pdpRecord(current), [key!]: event.target.value }
                                : current
                            )
                          )
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              );
            })}
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() =>
              onChange(JSON.stringify(rows.filter((_, rowIndex) => rowIndex !== index)))
            }
          >
            Quitar fila {index + 1}
          </button>
        </fieldset>
      ))}
    </div>
  );
}

function FieldReviewCard({
  field,
  proposalId,
  proposalVersion,
  brandOptions,
  categoryOptions,
  disabled,
  onSaved,
  onError,
}: {
  field: AdminProposalFieldDto;
  proposalId: string;
  proposalVersion: string;
  brandOptions: CatalogReferenceDto[];
  categoryOptions: CatalogReferenceDto[];
  disabled: boolean;
  onSaved: (version: string) => Promise<void>;
  onError: (code: string | undefined, message: string) => void;
}) {
  const isBrand = field.fieldPath === "catalog.brandId";
  const isCategory = field.fieldPath === "catalog.categoryId";
  const isCatalogSelector = isBrand || isCategory;
  const isPdp = field.fieldPath.startsWith("pdp.");
  const options = isBrand ? brandOptions : categoryOptions;
  const initialDecision = field.decision;
  const [decision, setDecision] = useState(field.decision);
  const [manualValue, setManualValue] = useState(
    valueForEditor(field.selectedValue ?? field.proposedValue)
  );
  const [preferredSourceId, setPreferredSourceId] = useState(field.preferredSourceId ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sourcesById = useMemo(
    () => new Map(field.sources.map((source) => [source.sourceId, source])),
    [field.sources]
  );

  const submit = () => {
    setLocalError(null);
    let selectedValue: unknown;
    try {
      if (decision === "MANUALLY_EDITED")
        selectedValue = parseEditorValue(manualValue, field.proposedValue);
    } catch {
      setLocalError("El valor manual no tiene un formato válido.");
      return;
    }
    startTransition(async () => {
      const result = await reviewProposalFieldAdminAction({
        proposalId,
        expectedProposalUpdatedAt: proposalVersion,
        fieldPath: field.fieldPath,
        decision,
        ...(decision === "MANUALLY_EDITED" ? { selectedValue } : {}),
        preferredSourceId: preferredSourceId || null,
      });
      if (!result.success || !result.data) {
        const message = result.error ?? "No se pudo guardar la decisión.";
        setLocalError(message);
        onError(result.code, message);
        return;
      }
      await onSaved(result.data.proposalUpdatedAt);
    });
  };

  return (
    <article className={styles.reviewCard} data-testid={`review-field-${field.fieldPath}`}>
      <header className={styles.reviewCardHeader}>
        <div>
          <span className={styles.fieldPath}>{field.fieldPath}</span>
          <h3>{humanFieldName(field.fieldPath)}</h3>
        </div>
        <div
          className={`${styles.verificationBadge} ${field.verificationState === "SOURCE_CONFLICT" ? styles.statusWarning : ""}`}
        >
          {field.verificationState === "SOURCE_CONFLICT" ? (
            <AlertTriangle size={14} aria-hidden="true" />
          ) : (
            <ShieldCheck size={14} aria-hidden="true" />
          )}
          {VERIFICATION_LABELS[field.verificationState] ?? field.verificationState}
        </div>
      </header>

      <div className={styles.comparisonGrid}>
        <div className={styles.aiValue}>
          <span className={styles.valueLabel}>
            <Bot size={14} aria-hidden="true" /> Propuesta IA · no aprobada
          </span>
          {isPdp ? (
            <PdpReviewValue path={field.fieldPath} value={field.proposedValue} />
          ) : (
            <pre>{valueForEditor(field.proposedValue) || "Sin valor propuesto"}</pre>
          )}
        </div>
        <div className={styles.humanValue}>
          <span className={styles.valueLabel}>
            <Check size={14} aria-hidden="true" /> Selección humana
          </span>
          {decision === "MANUALLY_EDITED" ? (
            isCatalogSelector ? (
              <select
                aria-label={`Selección humana para ${humanFieldName(field.fieldPath)}`}
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                disabled={disabled || pending}
              >
                <option value="">Selecciona una opción publicada</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {option.slug}
                  </option>
                ))}
              </select>
            ) : isPdp && Array.isArray(field.proposedValue) ? (
              <PdpArrayEditor
                path={field.fieldPath}
                raw={manualValue}
                onChange={setManualValue}
                disabled={disabled || pending}
              />
            ) : typeof field.proposedValue === "boolean" ? (
              <select
                aria-label={`Valor manual para ${humanFieldName(field.fieldPath)}`}
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                disabled={disabled || pending}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : (
              <textarea
                aria-label={`Valor manual para ${humanFieldName(field.fieldPath)}`}
                rows={typeof field.proposedValue === "string" ? 3 : 6}
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                disabled={disabled || pending}
              />
            )
          ) : isPdp && decision === "ACCEPTED" ? (
            <PdpReviewValue path={field.fieldPath} value={field.proposedValue} />
          ) : (
            <pre>
              {decision === "ACCEPTED"
                ? valueForEditor(field.proposedValue)
                : decision === "REJECTED"
                  ? "Excluido del borrador"
                  : "Pendiente de decisión"}
            </pre>
          )}
        </div>
      </div>

      {field.sources.length > 0 && (
        <div className={styles.evidenceBox}>
          <strong>Evidencia vinculada</strong>
          <ul>
            {field.sources.map((source) => (
              <li key={source.id}>
                <span
                  className={`${styles.relationshipBadge} ${source.relationship === "CONFLICTS" ? styles.statusWarning : ""}`}
                >
                  {source.relationship}
                </span>
                <code>{source.sourceId.slice(0, 8)}</code>
                {isPdp ? (
                  <PdpReviewValue path={field.fieldPath} value={source.sourceValue} />
                ) : (
                  <span>{valueForEditor(source.sourceValue)}</span>
                )}
              </li>
            ))}
          </ul>
          {(field.verificationState === "SOURCE_CONFLICT" || preferredSourceId) && (
            <label className={styles.field}>
              <span>Fuente preferida para la resolución</span>
              <select
                value={preferredSourceId}
                onChange={(event) => {
                  const next = event.target.value;
                  setPreferredSourceId(next);
                  const source = sourcesById.get(next);
                  if (source && decision === "MANUALLY_EDITED")
                    setManualValue(valueForEditor(source.sourceValue));
                }}
                disabled={disabled || pending}
              >
                <option value="">Selecciona una fuente</option>
                {field.sources
                  .filter((source) => source.relationship !== "CONTEXT_ONLY")
                  .map((source) => (
                    <option key={source.id} value={source.sourceId}>
                      {source.relationship} · {source.sourceId.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}

      {field.conflictDetails != null && (
        <details className={styles.details}>
          <summary>Detalles del conflicto</summary>
          <pre>{valueForEditor(field.conflictDetails)}</pre>
        </details>
      )}

      <div className={styles.reviewControls}>
        <label>
          <span>Decisión</span>
          <select
            value={decision}
            onChange={(event) => {
              const next = event.target.value as typeof decision;
              setDecision(next);
              if (next === "REJECTED" || next === "PENDING") setPreferredSourceId("");
            }}
            disabled={disabled || pending}
          >
            <option value="PENDING">Pendiente</option>
            {!isCatalogSelector && <option value="ACCEPTED">Aceptar propuesta</option>}
            <option value="REJECTED">Rechazar campo</option>
            <option value="MANUALLY_EDITED">Editar manualmente</option>
          </select>
        </label>
        <span
          className={`${styles.decisionSummary} ${initialDecision === "PENDING" ? styles.statusWarning : styles.statusNeutral}`}
        >
          Actual: {DECISION_LABELS[initialDecision]}
        </span>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={submit}
          disabled={
            disabled ||
            pending ||
            (decision === initialDecision &&
              manualValue === valueForEditor(field.selectedValue ?? field.proposedValue) &&
              preferredSourceId === (field.preferredSourceId ?? ""))
          }
        >
          {pending ? (
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
          ) : (
            <Save size={15} aria-hidden="true" />
          )}{" "}
          Guardar decisión
        </button>
      </div>
      {localError && (
        <p className={styles.fieldError} role="alert">
          {localError}
        </p>
      )}
    </article>
  );
}

export function ProposalReviewWorkspace({
  initialProposal,
  brands,
  categories,
  canApply,
}: ProposalReviewWorkspaceProps) {
  const [detail, setDetail] = useState(initialProposal);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(
    null
  );
  const [stale, setStale] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [applyStatus, setApplyStatus] = useState<AdminProposalApplyStatusDto | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(
    async (successText?: string) => {
      const result = await getProposalReviewAdminAction({ proposalId: detail.proposal.id });
      if (!result.success || !result.data) {
        setNotice({ tone: "error", text: result.error ?? "No se pudo recargar la propuesta." });
        return;
      }
      setDetail(result.data);
      setStale(false);
      if (successText) setNotice({ tone: "success", text: successText });
    },
    [detail.proposal.id]
  );

  const refreshApply = useCallback(async () => {
    if (!canApply || !["APPROVED", "APPLYING", "APPLIED"].includes(detail.proposal.status)) return;
    const result = await getProposalApplyStatusAdminAction({ proposalId: detail.proposal.id });
    if (result.success && result.data) setApplyStatus(result.data);
  }, [canApply, detail.proposal.id, detail.proposal.status]);

  useEffect(() => {
    void refreshApply();
  }, [refreshApply]);

  const genericFields = detail.fields.filter((field) => !field.fieldPath.startsWith("research."));
  const specificationFields = genericFields.filter(
    (field) => !["catalog.", "copy.", "seo."].some((root) => field.fieldPath.startsWith(root))
  );
  const coreFields = genericFields.filter((field) => !specificationFields.includes(field));
  const variantField = detail.fields.find((field) => field.fieldPath === "research.variants");
  const mediaField = detail.fields.find((field) => field.fieldPath === "research.mediaCandidates");
  const proposedVariants = safeArray(
    variantField?.proposedValue ?? detail.proposal.proposedVariants
  );
  const mediaCandidates = safeArray(mediaField?.proposedValue ?? detail.proposal.mediaCandidates);
  const catalogPrepared = ["catalog.brandId", "catalog.categoryId", "catalog.slug"].every((path) =>
    detail.fields.some((field) => field.fieldPath === path)
  );
  const blockers = detail.fields.filter(
    (field) =>
      field.decision === "PENDING" ||
      (field.verificationState === "SOURCE_CONFLICT" &&
        field.decision !== "REJECTED" &&
        !field.preferredSourceId)
  );
  const immutable = detail.proposal.status !== "DRAFT";

  function handleError(code: string | undefined, message: string) {
    if (code === "AI_PROPOSAL_STALE") setStale(true);
    setNotice({ tone: "error", text: message });
  }

  async function afterFieldSaved(_version: string) {
    await reload("Decisión guardada con la versión vigente de la propuesta.");
  }

  function initializeCatalog() {
    startTransition(async () => {
      const result = await initializeProposalReviewAdminAction({
        proposalId: detail.proposal.id,
        expectedProposalUpdatedAt: detail.proposal.updatedAt,
      });
      if (!result.success)
        return handleError(result.code, result.error ?? "No se pudo preparar la revisión.");
      await reload("Campos de marca, categoría y slug preparados para revisión explícita.");
    });
  }

  function finalize(kind: "approve" | "reject") {
    startTransition(async () => {
      const action = kind === "approve" ? approveProposalAdminAction : rejectProposalAdminAction;
      const result = await action({
        proposalId: detail.proposal.id,
        expectedProposalUpdatedAt: detail.proposal.updatedAt,
      });
      if (!result.success)
        return handleError(result.code, result.error ?? "No se pudo finalizar la propuesta.");
      setConfirmReject(false);
      await reload(
        kind === "approve"
          ? "Propuesta aprobada. Ya puede aplicarse al catálogo."
          : "Propuesta rechazada. No se realizaron cambios al catálogo."
      );
    });
  }

  function applyOrResume() {
    startTransition(async () => {
      const result = await applyProposalAdminAction({ proposalId: detail.proposal.id });
      if (!result.success)
        return handleError(result.code, result.error ?? "No se pudo aplicar la propuesta.");
      await reload(
        result.data?.status === "APPLIED"
          ? "Propuesta aplicada como borrador canónico."
          : "Aplicación iniciada."
      );
      await refreshApply();
    });
  }

  const failedRetryable =
    applyStatus?.steps.some((step) => step.stepStatus === "FAILED_RETRYABLE") ?? false;
  const failedTerminal =
    applyStatus?.steps.some((step) => step.stepStatus === "FAILED_TERMINAL") ?? false;

  return (
    <div className={styles.page}>
      <Link href="/admin/products/ai-import" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" /> Volver al asistente
      </Link>
      <header className={styles.reviewPageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <Bot size={15} aria-hidden="true" /> Revisión humana obligatoria
          </div>
          <h1 className={styles.pageTitle}>{detail.proposal.proposedName}</h1>
          <p className={styles.pageDescription}>
            Consulta: {detail.item.query} · {detail.item.mode} · Identidad{" "}
            {detail.item.identityStatus}
          </p>
        </div>
        <div className={styles.headerStatus}>
          <span
            className={`${styles.statusBadge} ${detail.proposal.status === "REJECTED" ? styles.statusDanger : detail.proposal.status === "APPLIED" ? styles.statusPositive : styles.statusNeutral}`}
          >
            {detail.proposal.status}
          </span>
          <code>{detail.proposal.id.slice(0, 8)}</code>
        </div>
      </header>

      <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
        {notice && (
          <div className={`${styles.notice} ${styles[`notice${notice.tone}`]}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {stale && (
        <div className={styles.staleBanner} role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Hay una versión más reciente. No se sobrescribió ningún dato.</span>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => startTransition(() => reload())}
          >
            <RefreshCw size={15} aria-hidden="true" /> Recargar propuesta
          </button>
        </div>
      )}

      <section className={styles.reviewSummary} aria-label="Resumen de revisión">
        <div>
          <span>Campos</span>
          <strong>{detail.fields.length}</strong>
        </div>
        <div>
          <span>Pendientes</span>
          <strong data-testid="pending-review-count">
            {detail.fields.filter((field) => field.decision === "PENDING").length}
          </strong>
        </div>
        <div>
          <span>Conflictos</span>
          <strong>
            {detail.fields.filter((field) => field.verificationState === "SOURCE_CONFLICT").length}
          </strong>
        </div>
        <div>
          <span>Fuentes</span>
          <strong>{detail.sources.length}</strong>
        </div>
      </section>

      {!catalogPrepared && !immutable && (
        <section className={styles.prepareCard}>
          <div>
            <Tag aria-hidden="true" />
            <h2>Preparar selección canónica</h2>
            <p>
              Crea explícitamente las filas de revisión para marca, categoría y slug. Esta acción es
              idempotente y no modifica el catálogo.
            </p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={initializeCatalog}
            disabled={pending}
          >
            Preparar revisión
          </button>
        </section>
      )}

      <div className={styles.reviewLayout}>
        <main className={styles.reviewMain}>
          <section aria-labelledby="core-fields-heading">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>Contenido canónico</span>
                <h2 id="core-fields-heading">Identidad y copy</h2>
              </div>
              <span className={styles.quietLabel}>IA vs selección humana</span>
            </div>
            <div className={styles.reviewStack}>
              {coreFields.map((field) => (
                <FieldReviewCard
                  key={`${field.id}-${field.updatedAt}`}
                  field={field}
                  proposalId={detail.proposal.id}
                  proposalVersion={detail.proposal.updatedAt}
                  brandOptions={brands}
                  categoryOptions={categories}
                  disabled={immutable || pending}
                  onSaved={afterFieldSaved}
                  onError={handleError}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="spec-fields-heading">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>Datos estructurados</span>
                <h2 id="spec-fields-heading">Especificaciones</h2>
              </div>
              <span className={styles.quietLabel}>Sin namespaces reservados</span>
            </div>
            {specificationFields.length === 0 ? (
              <div className={styles.emptyStrip}>No hay especificaciones físicas para revisar.</div>
            ) : (
              <div className={styles.reviewStack}>
                {specificationFields.map((field) => (
                  <FieldReviewCard
                    key={`${field.id}-${field.updatedAt}`}
                    field={field}
                    proposalId={detail.proposal.id}
                    proposalVersion={detail.proposal.updatedAt}
                    brandOptions={brands}
                    categoryOptions={categories}
                    disabled={immutable || pending}
                    onSaved={afterFieldSaved}
                    onError={handleError}
                  />
                ))}
              </div>
            )}
          </section>

          {variantField && (
            <VariantPlanEditor
              key={`${variantField.id}-${variantField.updatedAt}`}
              field={variantField}
              proposalId={detail.proposal.id}
              proposalVersion={detail.proposal.updatedAt}
              proposedVariants={proposedVariants}
              disabled={immutable || pending}
              onSaved={() => reload("Plan de variantes y precios humanos guardado.")}
              onError={handleError}
            />
          )}

          <section aria-labelledby="media-heading">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>Referencia únicamente</span>
                <h2 id="media-heading">Candidatos de medios</h2>
              </div>
              <FileWarning aria-hidden="true" />
            </div>
            <div className={styles.rightsWarning}>
              <AlertTriangle size={17} aria-hidden="true" /> Estos enlaces no se descargan ni se
              publican. Los derechos deben confirmarse en un flujo de medios separado.
            </div>
            {mediaCandidates.length === 0 ? (
              <div className={styles.emptyStrip}>
                La propuesta no contiene candidatos de medios.
              </div>
            ) : (
              <ul className={styles.mediaList}>
                {mediaCandidates.map((candidate, index) => (
                  <li key={index}>
                    <code>{valueForEditor(candidate)}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className={styles.reviewAside}>
          <section className={styles.stickyCard} aria-labelledby="evidence-heading">
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.stepLabel}>Procedencia</span>
                <h2 id="evidence-heading" className={styles.panelTitle}>
                  Fuentes
                </h2>
              </div>
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            {detail.sources.length === 0 ? (
              <p className={styles.muted}>No hay fuentes registradas para esta propuesta.</p>
            ) : (
              <ol className={styles.sourceList}>
                {detail.sources.map((source) => (
                  <li key={source.id}>
                    <div>
                      <strong>{source.sourceName}</strong>
                      <span>{source.trustTier.replaceAll("_", " ")}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Método</dt>
                        <dd>{source.retrievalMethod}</dd>
                      </div>
                      <div>
                        <dt>Base</dt>
                        <dd>{source.trustBasis}</dd>
                      </div>
                    </dl>
                    {source.snippet && <p>{source.snippet}</p>}
                    {source.url && (
                      <a href={source.url} target="_blank" rel="noreferrer noopener">
                        Abrir fuente <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.stickyCard} aria-labelledby="finalize-heading">
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.stepLabel}>Decisión de propuesta</span>
                <h2 id="finalize-heading" className={styles.panelTitle}>
                  Finalizar revisión
                </h2>
              </div>
            </div>
            {blockers.length > 0 && detail.proposal.status === "DRAFT" && (
              <div className={styles.blockerBox} data-testid="approval-blockers">
                <strong>{blockers.length} bloqueos visibles</strong>
                <ul>
                  {blockers.slice(0, 6).map((field) => (
                    <li key={field.id}>{humanFieldName(field.fieldPath)}</li>
                  ))}
                </ul>
                <small>El servidor volverá a validar todas las reglas.</small>
              </div>
            )}
            {detail.proposal.status === "DRAFT" ? (
              <div className={styles.actionStack}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => finalize("approve")}
                  disabled={pending || blockers.length > 0}
                >
                  <CheckCircle2 size={16} aria-hidden="true" /> Aprobar propuesta
                </button>
                <button
                  type="button"
                  className={styles.dangerSecondaryButton}
                  onClick={() => setConfirmReject(true)}
                  disabled={pending}
                >
                  <CircleSlash2 size={16} aria-hidden="true" /> Rechazar propuesta completa
                </button>
              </div>
            ) : (
              <p className={styles.muted}>
                La revisión está cerrada con estado {detail.proposal.status}.
              </p>
            )}
          </section>

          {["APPROVED", "APPLYING", "APPLIED"].includes(detail.proposal.status) && (
            <section className={styles.stickyCard} aria-labelledby="apply-heading">
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.stepLabel}>Catálogo canónico</span>
                  <h2 id="apply-heading" className={styles.panelTitle}>
                    Aplicación durable
                  </h2>
                </div>
                <Play size={19} aria-hidden="true" />
              </div>
              {!canApply ? (
                <div className={styles.permissionNote}>
                  Necesitas <code>catalog:manage</code> para aplicar. La revisión sigue visible.
                </div>
              ) : !applyStatus ? (
                <div className={styles.loadingState} role="status">
                  <LoaderCircle className={styles.spinner} aria-hidden="true" /> Consultando estado…
                </div>
              ) : (
                <>
                  {applyStatus.steps.length > 0 && (
                    <ol className={styles.stepList}>
                      {applyStatus.steps.map((step) => (
                        <li key={step.stepKey}>
                          <span
                            className={`${styles.stepDot} ${step.stepStatus === "COMMITTED" ? styles.dotDone : step.stepStatus.startsWith("FAILED") ? styles.dotFailed : ""}`}
                            aria-hidden="true"
                          />
                          <div>
                            <strong>
                              {step.stepOrdinal + 1}. {step.stepKey.replaceAll("_", " ")}
                            </strong>
                            <span>{step.stepStatus}</span>
                            {step.targetId && <code>Destino {step.targetId.slice(0, 8)}</code>}
                            {step.errorMessage && <p>{step.errorMessage}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {failedTerminal ? (
                    <div className={styles.terminalBox}>
                      <AlertTriangle size={17} aria-hidden="true" />
                      <p>
                        <strong>Error terminal</strong>La operación congelada no admite reintento
                        normal. Requiere recuperación operativa documentada o una propuesta nueva.
                      </p>
                    </div>
                  ) : applyStatus.proposalStatus === "APPLIED" && applyStatus.canonicalProductId ? (
                    <Link
                      href={`/admin/products/${applyStatus.canonicalProductId}`}
                      className={styles.primaryButton}
                    >
                      Abrir producto DRAFT <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={applyOrResume}
                      disabled={pending}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      {failedRetryable
                        ? "Reanudar misma aplicación"
                        : applyStatus.proposalStatus === "APPLYING"
                          ? "Continuar aplicación"
                          : "Aplicar como borrador"}
                    </button>
                  )}
                </>
              )}
              <p className={styles.safetyNote}>
                Aplicar no publica. El producto permanece DRAFT hasta una acción separada y
                autorizada.
              </p>
            </section>
          )}
        </aside>
      </div>

      <ConfirmationDialog
        open={confirmReject}
        title="¿Rechazar toda la propuesta?"
        description="Esta decisión cierra la propuesta sin aplicar cambios al catálogo. No es lo mismo que rechazar un campo individual."
        confirmLabel="Rechazar propuesta"
        busy={pending}
        onClose={() => setConfirmReject(false)}
        onConfirm={() => finalize("reject")}
      />
    </div>
  );
}

function VariantPlanEditor({
  field,
  proposalId,
  proposalVersion,
  proposedVariants,
  disabled,
  onSaved,
  onError,
}: {
  field: AdminProposalFieldDto;
  proposalId: string;
  proposalVersion: string;
  proposedVariants: unknown[];
  disabled: boolean;
  onSaved: () => Promise<void>;
  onError: (code: string | undefined, message: string) => void;
}) {
  const selected = safeArray(field.selectedValue);
  const [rows, setRows] = useState(() =>
    (proposedVariants.length ? proposedVariants : [{}]).map((raw, index) => {
      const proposal = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const existing =
        selected[index] && typeof selected[index] === "object"
          ? (selected[index] as Record<string, unknown>)
          : {};
      const attributes = existing.attributes ?? proposal.attributes ?? {};
      return {
        sku:
          typeof existing.sku === "string"
            ? existing.sku
            : typeof proposal.sku === "string"
              ? proposal.sku
              : "",
        title:
          typeof existing.title === "string"
            ? existing.title
            : typeof proposal.title === "string"
              ? proposal.title
              : `Variante ${index + 1}`,
        pricePen: centsToPen(existing.priceCents),
        compareAtPricePen: centsToPen(existing.compareAtPriceCents),
        costPen: centsToPen(existing.costCents),
        weightGrams: typeof existing.weightGrams === "number" ? String(existing.weightGrams) : "",
        attributesJson: JSON.stringify(attributes, null, 2),
      };
    })
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(index: number, key: keyof (typeof rows)[number], value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  }
  function savePlan() {
    setLocalError(null);
    let variants;
    try {
      variants = rows.map((row) => ({
        sku: row.sku,
        title: row.title,
        pricePen: row.pricePen,
        ...(row.compareAtPricePen ? { compareAtPricePen: row.compareAtPricePen } : {}),
        ...(row.costPen ? { costPen: row.costPen } : {}),
        ...(row.weightGrams ? { weightGrams: Number(row.weightGrams) } : {}),
        attributes: JSON.parse(row.attributesJson),
      }));
    } catch {
      setLocalError("Revisa el JSON de atributos antes de guardar.");
      return;
    }
    startTransition(async () => {
      const result = await setHumanVariantPlanAdminAction({
        proposalId,
        expectedProposalUpdatedAt: proposalVersion,
        variants,
      });
      if (!result.success) {
        const message = result.error ?? "No se pudo guardar el plan de variantes.";
        setLocalError(message);
        onError(result.code, message);
        return;
      }
      await onSaved();
    });
  }
  function rejectVariants() {
    startTransition(async () => {
      const result = await reviewProposalFieldAdminAction({
        proposalId,
        expectedProposalUpdatedAt: proposalVersion,
        fieldPath: field.fieldPath,
        decision: "REJECTED",
        preferredSourceId: null,
      });
      if (!result.success)
        return onError(result.code, result.error ?? "No se pudo rechazar el campo de variantes.");
      await onSaved();
    });
  }
  return (
    <section aria-labelledby="variants-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.stepLabel}>Autoridad humana</span>
          <h2 id="variants-heading">Variantes y precios PEN</h2>
        </div>
        <span
          className={`${styles.statusBadge} ${field.decision === "MANUALLY_EDITED" ? styles.statusPositive : styles.statusWarning}`}
        >
          {DECISION_LABELS[field.decision]}
        </span>
      </div>
      <div className={styles.rightsWarning}>
        <AlertTriangle size={17} aria-hidden="true" /> La IA no fija precios. Todo precio se ingresa
        como texto PEN y el servidor lo normaliza a centavos.
      </div>
      <div className={styles.variantList}>
        {rows.map((row, index) => (
          <fieldset key={index} className={styles.variantCard} disabled={disabled || pending}>
            <legend>
              Variante {index + 1} · orden {index}
            </legend>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>SKU</span>
                <input
                  value={row.sku}
                  onChange={(event) => update(index, "sku", event.target.value)}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Título</span>
                <input
                  value={row.title}
                  onChange={(event) => update(index, "title", event.target.value)}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Precio PEN</span>
                <input
                  inputMode="decimal"
                  value={row.pricePen}
                  onChange={(event) => update(index, "pricePen", event.target.value)}
                  placeholder="129.90"
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Precio comparación</span>
                <input
                  inputMode="decimal"
                  value={row.compareAtPricePen}
                  onChange={(event) => update(index, "compareAtPricePen", event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label className={styles.field}>
                <span>Costo PEN</span>
                <input
                  inputMode="decimal"
                  value={row.costPen}
                  onChange={(event) => update(index, "costPen", event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label className={styles.field}>
                <span>Peso (g)</span>
                <input
                  inputMode="numeric"
                  value={row.weightGrams}
                  onChange={(event) => update(index, "weightGrams", event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Atributos JSON</span>
                <textarea
                  rows={3}
                  value={row.attributesJson}
                  onChange={(event) => update(index, "attributesJson", event.target.value)}
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
      <div className={styles.reviewControls}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={savePlan}
          disabled={disabled || pending}
        >
          <Save size={15} aria-hidden="true" /> Guardar plan con precios humanos
        </button>
        <button
          type="button"
          className={styles.dangerSecondaryButton}
          onClick={rejectVariants}
          disabled={disabled || pending}
        >
          <CircleSlash2 size={15} aria-hidden="true" /> No usar variantes propuestas
        </button>
      </div>
      {localError && (
        <p className={styles.fieldError} role="alert">
          {localError}
        </p>
      )}
    </section>
  );
}
