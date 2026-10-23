import type { ResearchJobSummaryDto } from "./types";

export interface ResearchMutationIntent {
  fingerprint: string;
  mutationRequestId: string;
}

export function resolveResearchMutationIntent(
  previous: ResearchMutationIntent | null,
  fingerprint: string,
  idFactory: () => string
): ResearchMutationIntent {
  if (previous?.fingerprint === fingerprint) return previous;
  return { fingerprint, mutationRequestId: idFactory() };
}

export function shouldPollResearchJob(status: ResearchJobSummaryDto["jobStatus"]): boolean {
  return status === "QUEUED" || status === "PROCESSING";
}

export function researchQueueDescription(
  job: Pick<ResearchJobSummaryDto, "dispatchStatus" | "updatedAt">,
  now = Date.now()
): string {
  if (job.dispatchStatus === "DISPATCH_FAILED")
    return "No se pudo enviar el trabajo al procesador. Puedes reintentar el envío del mismo trabajo.";
  if (job.dispatchStatus === "PENDING_DISPATCH")
    return "Trabajo guardado; todavía no se confirmó su envío al procesador.";
  if (now - Date.parse(job.updatedAt) > 120000)
    return "Evento enviado, pero no hay actividad reciente. Revisa la ejecución en Inngest; crear otro trabajo no desbloquea este.";
  return "Evento enviado; esperando turno del procesador en segundo plano.";
}
