"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Loader2, RotateCcw, Search } from "lucide-react";
import {
  getResearchJobAdminAction,
  submitResearchJobAdminAction,
  retryResearchDispatchAdminAction,
} from "@/lib/ai/admin/actions";
import {
  resolveResearchMutationIntent,
  shouldPollResearchJob,
  researchQueueDescription,
  type ResearchMutationIntent,
} from "@/lib/ai/admin/client-contracts";
import type { ProductAutofillContextDto } from "@/lib/ai/admin/readers";
import type { ResearchJobDetailDto, ResearchJobItemDto } from "@/lib/ai/admin/types";
import styles from "./autofill-bar.module.css";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";

export interface AutofillBarProps {
  productId: string;
  productName: string;
  isDraft: boolean;
  context: ProductAutofillContextDto;
}

const RUNNING_TEXT: Partial<Record<ResearchJobItemDto["status"], string>> = {
  PENDING: "En cola…",
  RESEARCHING: "Buscando en la web y leyendo las fuentes…",
};

const ERROR_TEXT: Record<string, string> = {
  AI_PROVIDER_RATE_LIMITED: "Se acabó la cuota gratis de hoy. Vuelve a intentarlo mañana.",
  AI_PROVIDER_UNAVAILABLE: "El servicio de IA no responde ahora. Inténtalo en unos minutos.",
  AI_SEARCH_RATE_LIMITED: "Se acabó la cuota de búsquedas. Vuelve a intentarlo más tarde.",
  AI_SEARCH_NO_USABLE_EVIDENCE:
    "No encontramos páginas útiles. Prueba con el enlace del fabricante.",
  AI_SEARCH_CONFIG_MISSING: "Falta configurar la búsqueda web en el servidor.",
  AI_PROVIDER_DISABLED: "El proveedor de IA está apagado o sin clave en Configuración IA.",
};

function describeFailure(item: ResearchJobItemDto): string {
  if (item.status === "AMBIGUOUS") {
    return "Encontramos varios productos parecidos. Escribe el modelo exacto o pega el enlace.";
  }
  if (item.status === "SOURCE_CONFLICT") {
    return "Las fuentes no coinciden entre sí. Revisa las sugerencias con cuidado.";
  }
  return (item.errorCode && ERROR_TEXT[item.errorCode]) ?? "No se pudo completar la búsqueda.";
}

/**
 * "Autocompletar desde la web": starts an ENRICH research run for this product and links to the
 * field-by-field review. Nothing is written to the product until a person accepts it there;
 * price and stock never come from the AI.
 */
export function AutofillBar({ productId, productName, isDraft, context }: AutofillBarProps) {
  const [query, setQuery] = useState(productName);
  const [jobId, setJobId] = useState<string | null>(context.latestJobId);
  const [job, setJob] = useState<ResearchJobDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();
  const intent = useRef<ResearchMutationIntent | null>(null);
  const polling = useRef(false);
  const lastRead = useRef("");
  const [retrying, startRetry] = useTransition();
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (id: string) => {
    if (polling.current) return false;
    polling.current = true;
    try {
      const result = await getResearchJobAdminAction({ jobId: id });
      if (result.success) {
        setJob(result.data ?? null);
        const fingerprint = JSON.stringify(result.data);
        const changed = fingerprint !== lastRead.current;
        lastRead.current = fingerprint;
        return changed;
      }
    } catch {
      // A missed poll is retried on the next tick.
    } finally {
      polling.current = false;
    }
    return false;
  }, []);

  useEffect(() => {
    if (jobId) void refresh(jobId);
  }, [jobId, refresh]);

  useVisiblePolling(
    jobId ?? "",
    Boolean(jobId && (!job || shouldPollResearchJob(job.jobStatus))),
    () => (jobId ? refresh(jobId) : Promise.resolve(false)),
    5000,
    60000
  );

  const item = job?.items.find((candidate) => candidate.targetProductId === productId) ?? null;
  const running = Boolean(job && shouldPollResearchJob(job.jobStatus)) || isSubmitting;
  const ready = item?.proposalId && item.status === "READY_FOR_REVIEW";
  const failed =
    item &&
    !running &&
    ["FAILED", "NEEDS_ATTENTION", "AMBIGUOUS", "SOURCE_CONFLICT"].includes(item.status);

  function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !context.profileId) return;
    const items = [{ query: trimmed, mode: "ENRICH" as const, targetProductId: productId }];
    // The same request id for a repeated click; a new search gets a new one.
    intent.current = resolveResearchMutationIntent(intent.current, JSON.stringify(items), () =>
      crypto.randomUUID()
    );
    const { mutationRequestId } = intent.current;
    setError(null);
    startSubmitting(async () => {
      const result = await submitResearchJobAdminAction({
        mutationRequestId,
        selectedProfileId: context.profileId,
        items,
      });
      if (!result.success || !result.data) {
        setError(result.error ?? "No se pudo iniciar la búsqueda.");
        return;
      }
      setJob(null);
      setJobId(result.data.jobId);
    });
  }

  function reset() {
    intent.current = null;
    setJob(null);
    setJobId(null);
    setError(null);
  }

  if (!isDraft) {
    return (
      <p className={styles.note}>
        Autocompletar desde la web está disponible mientras el producto es un borrador.
      </p>
    );
  }
  if (!context.profileId) {
    return (
      <p className={styles.note}>
        Falta un perfil de investigación habilitado con un proveedor activo. En{" "}
        <Link href="/admin/settings/ai#autofill-profile">Configurar autocompletado</Link>, elige el
        proveedor y el modelo en PRODUCT RESEARCH FAST, marca Habilitado y pulsa Guardar perfil.
        Activar solo el proveedor no completa la configuración.
      </p>
    );
  }

  return (
    <section className={styles.bar} aria-label="Autocompletar desde la web">
      {notice && <p role="status">{notice}</p>}
      {ready ? (
        <div className={styles.result} role="status">
          <span>
            <strong>Sugerencias listas.</strong> Revisa cada dato y acepta solo lo que esté bien.
          </span>
          <Link
            href={`/admin/products/ai-import/proposals/${item.proposalId}`}
            className={styles.primary}
          >
            Revisar sugerencias
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <button type="button" className={styles.secondary} onClick={reset}>
            Buscar de nuevo
          </button>
        </div>
      ) : running ? (
        <div className={styles.result} role="status" aria-live="polite">
          <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
          <div>
            <span>
              {item?.status === "PENDING" && job
                ? researchQueueDescription(job)
                : ((item && RUNNING_TEXT[item.status]) ?? "Iniciando la búsqueda…")}
            </span>
            {job && (
              <p>
                Última actividad:{" "}
                {new Date(job.updatedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}.
                Trabajo: {job.jobId}
              </p>
            )}
            {job?.jobStatus === "QUEUED" && job.dispatchStatus !== "DISPATCHED" && (
              <button
                type="button"
                className={styles.secondary}
                disabled={retrying}
                onClick={() =>
                  startRetry(async () => {
                    const result = await retryResearchDispatchAdminAction({ jobId: job.jobId });
                    setNotice(
                      result.success
                        ? (result.data?.message ?? "Estado actualizado.")
                        : (result.error ?? "No se pudo reenviar el trabajo.")
                    );
                    await refresh(job.jobId);
                  })
                }
              >
                {retrying ? "Reenviando…" : "Reintentar envío"}
              </button>
            )}
            <Link href="/admin/products/ai-import">Abrir Asistente IA</Link>
          </div>
        </div>
      ) : failed ? (
        <div className={styles.result} role="alert">
          <span>{describeFailure(item)}</span>
          {item.proposalId && (
            <Link
              href={`/admin/products/ai-import/proposals/${item.proposalId}`}
              className={styles.secondary}
            >
              Ver lo encontrado
            </Link>
          )}
          <button type="button" className={styles.secondary} onClick={reset}>
            <RotateCcw size={14} aria-hidden="true" />
            Intentar de nuevo
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={start}>
          <label htmlFor="autofill-query" className={styles.label}>
            Autocompletar desde la web
          </label>
          <div className={styles.row}>
            <input
              id="autofill-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={500}
              placeholder="Modelo exacto o enlace del fabricante"
              className={styles.input}
              aria-describedby="autofill-hint"
            />
            <button type="submit" className={styles.primary} disabled={!query.trim()}>
              <Search size={15} aria-hidden="true" />
              Buscar datos
            </button>
          </div>
          <p id="autofill-hint" className={styles.hint}>
            Propone descripción y especificaciones con sus fuentes. Precio y stock no se tocan.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
