"use server";

import { dispatchResearchJob } from "./dispatch-service";
import { createResearchJob } from "./job-service";
import type { CreateResearchJobInput } from "./schemas";

export async function createResearchJobAction(input: CreateResearchJobInput) {
  const result = await createResearchJob(input);
  if (!result.replayed) {
    try {
      await dispatchResearchJob(result.jobId);
    } catch {
      // The durable DISPATCH_FAILED row is recovered by reconciliation.
    }
  }
  return result;
}
