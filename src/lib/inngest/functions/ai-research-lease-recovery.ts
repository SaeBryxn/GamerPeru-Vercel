import { inngest } from "../client";
import { recoverExpiredResearchWork } from "@/lib/ai/research";

export const aiResearchLeaseRecovery = inngest.createFunction(
  {
    id: "ai-research-lease-recovery",
    name: "AI Research Lease Recovery",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/1 * * * *" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ step }: any) => {
    return await step.run("recover-research-leases", async () => {
      return await recoverExpiredResearchWork();
    });
  }
);
