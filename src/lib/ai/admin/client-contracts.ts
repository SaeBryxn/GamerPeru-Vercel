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
