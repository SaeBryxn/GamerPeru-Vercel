"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FlaskConical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { getResearchJobAdminAction, submitResearchJobAdminAction } from "@/lib/ai/admin/actions";
import {
  resolveResearchMutationIntent,
  shouldPollResearchJob,
} from "@/lib/ai/admin/client-contracts";
import type {
  ResearchJobDetailDto,
  ResearchJobSummaryDto,
  ResearchProductOptionDto,
  ResearchProfileOptionDto,
} from "@/lib/ai/admin/types";
import styles from "@/components/admin/ai-admin.module.css";

interface AiImportWorkspaceProps {
  profiles: ResearchProfileOptionDto[];
  products: ResearchProductOptionDto[];
  recentJobs: ResearchJobSummaryDto[];
  canManageAiSettings: boolean;
}

type WorkspaceMode = "SINGLE" | "BATCH";
type ResearchMode = "CREATE" | "ENRICH";

const ITEM_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RESEARCHING: "Investigando",
  READY_FOR_REVIEW: "Lista para revisión",
  NEEDS_ATTENTION: "Requiere atención",
  AMBIGUOUS: "Identidad ambigua",
  SOURCE_CONFLICT: "Conflicto de fuentes",
  FAILED: "Fallida",
  APPROVED: "Aprobada",
  APPLIED: "Aplicada",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function itemTone(status: string): string {
  if (["READY_FOR_REVIEW", "APPROVED", "APPLIED"].includes(status))
    return styles.statusPositive ?? "";
  if (["NEEDS_ATTENTION", "AMBIGUOUS", "SOURCE_CONFLICT"].includes(status))
    return styles.statusWarning ?? "";
  if (status === "FAILED") return styles.statusDanger ?? "";
  return styles.statusNeutral ?? "";
}

export function AiImportWorkspace({
  profiles,
  products,
  recentJobs,
  canManageAiSettings,
}: AiImportWorkspaceProps) {
  const enabledProfiles = profiles.filter(
    (profile) => profile.isEnabled && profile.providerEnabled && profile.researchExecutionSupported
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("SINGLE");
  const [researchMode, setResearchMode] = useState<ResearchMode>("CREATE");
  const [selectedProfileId, setSelectedProfileId] = useState(enabledProfiles[0]?.id ?? "");
  const [singleQuery, setSingleQuery] = useState("");
  const [batchQueries, setBatchQueries] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ResearchJobDetailDto | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(
    null
  );
  const [isSubmitting, startSubmitting] = useTransition();
  const [isRefreshing, startRefreshing] = useTransition();
  const submissionIntent = useRef<{ fingerprint: string; mutationRequestId: string } | null>(null);
  const pollInFlight = useRef(false);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const selectedProduct = products.find((product) => product.id === targetProductId);

  const requestItems = useMemo(() => {
    if (workspaceMode === "BATCH") {
      return batchQueries
        .split(/\r?\n/)
        .map((query) => query.trim())
        .filter(Boolean)
        .map((query) => ({ query, mode: "CREATE" as const }));
    }
    const query = singleQuery.trim();
    if (!query) return [];
    return [
      {
        query,
        mode: researchMode,
        ...(researchMode === "ENRICH" ? { targetProductId } : {}),
      },
    ];
  }, [batchQueries, researchMode, singleQuery, targetProductId, workspaceMode]);

  const refreshJob = useCallback(async (jobId: string, announce = false) => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const result = await getResearchJobAdminAction({ jobId });
      if (!result.success) {
        if (announce)
          setNotice({ tone: "error", text: result.error ?? "No se pudo actualizar el job." });
        return;
      }
      if (!result.data) {
        setJob(null);
        setNotice({ tone: "error", text: "El job solicitado ya no está disponible." });
        return;
      }
      setJob(result.data);
      if (announce) setNotice({ tone: "info", text: "Estado actualizado desde la base de datos." });
    } catch {
      if (announce) {
        setNotice({
          tone: "error",
          text: "No se pudo consultar el estado. Puedes volver a intentarlo.",
        });
      }
    } finally {
      pollInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    void refreshJob(selectedJobId);
  }, [refreshJob, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId || (job && !shouldPollResearchJob(job.jobStatus))) return;
    const timer = window.setInterval(() => void refreshJob(selectedJobId), 4_000);
    return () => window.clearInterval(timer);
  }, [job, refreshJob, selectedJobId]);

  function switchWorkspaceMode(mode: WorkspaceMode) {
    setWorkspaceMode(mode);
    if (mode === "BATCH") setResearchMode("CREATE");
    setNotice(null);
  }

  function submitResearch() {
    const fingerprint = JSON.stringify({ selectedProfileId, items: requestItems });
    const intent = resolveResearchMutationIntent(submissionIntent.current, fingerprint, () =>
      crypto.randomUUID()
    );
    submissionIntent.current = intent;
    setNotice(null);
    startSubmitting(async () => {
      const result = await submitResearchJobAdminAction({
        mutationRequestId: intent.mutationRequestId,
        selectedProfileId,
        items: requestItems,
      });
      if (!result.success || !result.data) {
        setNotice({ tone: "error", text: result.error ?? "No se pudo crear la investigación." });
        return;
      }
      setSelectedJobId(result.data.jobId);
      setNotice({
        tone: "success",
        text: result.data.replayed
          ? "Se recuperó el job ya creado para este mismo intento."
          : "Investigación registrada y enviada a procesamiento.",
      });
    });
  }

  const submissionDisabled =
    isSubmitting ||
    !selectedProfileId ||
    !selectedProfile?.isEnabled ||
    !selectedProfile.providerEnabled ||
    !selectedProfile.researchExecutionSupported ||
    requestItems.length === 0 ||
    (workspaceMode === "SINGLE" && researchMode === "ENRICH" && !targetProductId);

  const settledItems = job ? Math.min(job.completedItems + job.failedItems, job.totalItems) : 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <Bot size={15} aria-hidden="true" /> Catálogo asistido
          </div>
          <h1 className={styles.pageTitle}>Asistente IA de productos</h1>
          <p className={styles.pageDescription}>
            Investiga productos, verifica sus fuentes y convierte propuestas revisadas en borradores
            de catálogo.
          </p>
        </div>
        {canManageAiSettings && (
          <Link href="/admin/settings/ai" className={styles.secondaryButton}>
            Configuración IA <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </header>

      <div className={styles.workspaceGrid}>
        <section className={styles.panel} aria-labelledby="research-heading">
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.stepLabel}>Paso 1</span>
              <h2 id="research-heading" className={styles.panelTitle}>
                Nueva investigación
              </h2>
            </div>
            <FlaskConical size={20} aria-hidden="true" />
          </div>

          <div className={styles.segmented} role="group" aria-label="Tipo de investigación">
            <button
              type="button"
              className={workspaceMode === "SINGLE" ? styles.segmentActive : styles.segment}
              aria-pressed={workspaceMode === "SINGLE"}
              onClick={() => switchWorkspaceMode("SINGLE")}
            >
              Individual
            </button>
            <button
              type="button"
              className={workspaceMode === "BATCH" ? styles.segmentActive : styles.segment}
              aria-pressed={workspaceMode === "BATCH"}
              onClick={() => switchWorkspaceMode("BATCH")}
            >
              Por lote
            </button>
          </div>

          <div className={styles.formStack}>
            <label className={styles.field}>
              <span>Perfil de ejecución</span>
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                <option value="">Selecciona un perfil</option>
                {profiles.map((profile) => (
                  <option
                    key={profile.id}
                    value={profile.id}
                    disabled={
                      !profile.isEnabled ||
                      !profile.providerEnabled ||
                      !profile.researchExecutionSupported
                    }
                  >
                    {profile.profileKey} · {profile.providerDisplayName} · {profile.modelId}
                    {!profile.researchExecutionSupported
                      ? " (sin adaptador de ejecución)"
                      : !profile.isEnabled || !profile.providerEnabled
                        ? " (no disponible)"
                        : ""}
                  </option>
                ))}
              </select>
            </label>

            {profiles.length === 0 && (
              <div className={styles.inlineEmpty} role="note">
                No hay perfiles configurados. Solicita a una persona con acceso a Configuración IA
                que prepare uno.
              </div>
            )}
            {profiles.length > 0 && enabledProfiles.length === 0 && (
              <div className={styles.inlineEmpty} role="note">
                No hay perfiles ejecutables. Actualmente la investigación GP-025 requiere un perfil
                habilitado con proveedor Google.
              </div>
            )}

            {workspaceMode === "SINGLE" ? (
              <>
                <fieldset className={styles.fieldset}>
                  <legend>Destino</legend>
                  <label className={styles.radioCard}>
                    <input
                      type="radio"
                      name="research-mode"
                      value="CREATE"
                      checked={researchMode === "CREATE"}
                      onChange={() => setResearchMode("CREATE")}
                    />
                    <span>
                      <strong>Crear borrador</strong>
                      <small>Propone un producto nuevo sin publicarlo.</small>
                    </span>
                  </label>
                  <label className={styles.radioCard}>
                    <input
                      type="radio"
                      name="research-mode"
                      value="ENRICH"
                      checked={researchMode === "ENRICH"}
                      onChange={() => setResearchMode("ENRICH")}
                    />
                    <span>
                      <strong>Enriquecer borrador</strong>
                      <small>Investiga un producto canónico que aún permanece DRAFT.</small>
                    </span>
                  </label>
                </fieldset>

                {researchMode === "ENRICH" && (
                  <label className={styles.field}>
                    <span>Producto canónico</span>
                    <select
                      value={targetProductId}
                      onChange={(event) => setTargetProductId(event.target.value)}
                    >
                      <option value="">Selecciona un producto</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.slug} · DRAFT
                        </option>
                      ))}
                    </select>
                    {selectedProduct && <small>Identificador: {selectedProduct.id}</small>}
                    {products.length === 0 && (
                      <small>No hay productos en borrador elegibles para enriquecimiento.</small>
                    )}
                  </label>
                )}

                <label className={styles.field}>
                  <span>Producto, modelo o identificador</span>
                  <input
                    type="text"
                    value={singleQuery}
                    onChange={(event) => setSingleQuery(event.target.value)}
                    maxLength={500}
                    placeholder="Ej. Logitech G Pro X Superlight 2"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : (
              <label className={styles.field}>
                <span>Productos a investigar</span>
                <textarea
                  value={batchQueries}
                  onChange={(event) => setBatchQueries(event.target.value)}
                  rows={8}
                  placeholder={"Un producto por línea\nWooting 80HE\nPulsar X2V3"}
                />
                <small>
                  {requestItems.length} de 100 items · Los lotes crean propuestas nuevas.
                </small>
              </label>
            )}

            <button
              type="button"
              className={styles.primaryButton}
              disabled={submissionDisabled}
              onClick={submitResearch}
              data-testid="submit-research"
            >
              {isSubmitting ? (
                <LoaderCircle className={styles.spinner} aria-hidden="true" />
              ) : (
                <Search size={16} aria-hidden="true" />
              )}
              {isSubmitting
                ? "Registrando…"
                : workspaceMode === "BATCH"
                  ? "Investigar lote"
                  : "Iniciar investigación"}
            </button>
            <p className={styles.safetyNote}>
              La IA solo prepara material de revisión. No define precios, stock ni publicación.
            </p>
          </div>
        </section>

        <section
          className={`${styles.panel} ${styles.progressPanel}`}
          aria-labelledby="progress-heading"
        >
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.stepLabel}>Paso 2</span>
              <h2 id="progress-heading" className={styles.panelTitle}>
                Seguimiento
              </h2>
            </div>
            {selectedJobId && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Actualizar estado del job"
                onClick={() => startRefreshing(() => refreshJob(selectedJobId, true))}
                disabled={isRefreshing}
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
            {notice && (
              <div className={`${styles.notice} ${styles[`notice${notice.tone}`]}`}>
                {notice.tone === "error" ? (
                  <AlertTriangle size={17} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={17} aria-hidden="true" />
                )}
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {!selectedJobId ? (
            <div className={styles.emptyState}>
              <CircleDashed size={36} aria-hidden="true" />
              <h3>Aún no seleccionaste un job</h3>
              <p>Inicia una investigación o abre una actividad reciente para ver su avance real.</p>
            </div>
          ) : !job ? (
            <div className={styles.loadingState} role="status">
              <LoaderCircle className={styles.spinner} aria-hidden="true" /> Consultando el job…
            </div>
          ) : (
            <div className={styles.jobDetail} data-testid="research-job-detail">
              <div className={styles.jobHeadline}>
                <div>
                  <span className={`${styles.statusBadge} ${styles.statusNeutral}`}>
                    {job.jobStatus}
                  </span>
                  <h3>
                    {job.jobType === "BATCH"
                      ? "Investigación por lote"
                      : "Investigación individual"}
                  </h3>
                  <p>
                    {job.profileKey} · {job.providerDisplayName} · {job.modelId}
                  </p>
                </div>
                <code>{job.jobId.slice(0, 8)}</code>
              </div>
              <label className={styles.progressLabel}>
                <span>
                  <strong>{settledItems}</strong> de {job.totalItems} elementos terminados
                </span>
                <progress max={job.totalItems} value={settledItems}>
                  {settledItems} de {job.totalItems}
                </progress>
              </label>
              <dl className={styles.metricGrid}>
                <div>
                  <dt>En curso</dt>
                  <dd>{job.activeItems}</dd>
                </div>
                <div>
                  <dt>Revisables</dt>
                  <dd>{job.reviewableItems}</dd>
                </div>
                <div>
                  <dt>Completados</dt>
                  <dd>{job.completedItems}</dd>
                </div>
                <div>
                  <dt>Fallidos</dt>
                  <dd>{job.failedItems}</dd>
                </div>
              </dl>
              <div className={styles.itemList}>
                {job.items.map((item) => (
                  <article key={item.itemId} className={styles.itemCard}>
                    <div className={styles.itemTopline}>
                      <span className={`${styles.statusBadge} ${itemTone(item.status)}`}>
                        {ITEM_STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      <span>
                        #{item.itemIndex + 1} · {item.mode}
                      </span>
                    </div>
                    <h4>{item.inputQuery}</h4>
                    {item.targetProductName && <p>Destino: {item.targetProductName}</p>}
                    {item.errorMessage && (
                      <p className={styles.errorText}>
                        {item.errorCode}: {item.errorMessage}
                      </p>
                    )}
                    {item.proposalId && (
                      <Link
                        href={`/admin/products/ai-import/proposals/${item.proposalId}`}
                        className={styles.inlineAction}
                      >
                        {item.status === "SOURCE_CONFLICT"
                          ? "Resolver conflicto"
                          : item.status === "APPLIED"
                            ? "Ver aplicación"
                            : "Abrir propuesta"}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </article>
                ))}
              </div>
              {shouldPollResearchJob(job.jobStatus) && (
                <p className={styles.pollingNote}>
                  <Clock3 size={14} aria-hidden="true" /> Actualización automática cada 4 segundos.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className={styles.activitySection} aria-labelledby="activity-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.stepLabel}>Actividad</span>
            <h2 id="activity-heading">Investigaciones recientes</h2>
          </div>
          <span className={styles.quietLabel}>Últimas {Math.min(recentJobs.length, 20)}</span>
        </div>
        {recentJobs.length === 0 ? (
          <div className={styles.emptyStrip}>
            <Plus size={18} aria-hidden="true" /> No hay jobs recientes. La primera investigación
            aparecerá aquí.
          </div>
        ) : (
          <div className={styles.activityList}>
            {recentJobs.map((recent) => (
              <button
                type="button"
                key={recent.jobId}
                data-testid={`recent-job-${recent.jobId}`}
                className={
                  selectedJobId === recent.jobId ? styles.activityActive : styles.activityRow
                }
                onClick={() => setSelectedJobId(recent.jobId)}
              >
                <span className={styles.activityMain}>
                  <strong>
                    {recent.jobType === "BATCH"
                      ? `Lote de ${recent.totalItems}`
                      : "Investigación individual"}
                  </strong>
                  <small>
                    {recent.profileKey} · {formatDate(recent.createdAt)}
                  </small>
                </span>
                <span className={`${styles.statusBadge} ${styles.statusNeutral}`}>
                  {recent.jobStatus}
                </span>
                <span className={styles.activityProgress}>
                  {recent.completedItems + recent.failedItems}/{recent.totalItems}
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
