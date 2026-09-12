import { inngest } from "../client";
import { claimResearchItem, processClaimedResearchItem } from "@/lib/ai/research";
import {
  AI_RESEARCH_REQUESTED_EVENT,
  aiResearchRequestedEventDataSchema,
} from "@/lib/inngest/events/ai-research";

export const aiResearchJob = inngest.createFunction(
  {
    id: "ai-research-job",
    name: "AI Product Research Job",
    concurrency: { limit: 1 },
    retries: 2,
    triggers: [{ event: AI_RESEARCH_REQUESTED_EVENT }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: any) => {
    const { jobId } = aiResearchRequestedEventDataSchema.parse(event.data);
    return await step.run("process-research-items", async () => {
      let processed = 0;
      while (true) {
        const item = await claimResearchItem(jobId);
        if (!item) break;
        await processClaimedResearchItem(item);
        processed += 1;
      }
      return { jobId, processed };
    });
  }
);
