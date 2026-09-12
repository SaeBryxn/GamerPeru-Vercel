import { inngest } from "../client";
import { reconcileResearchDispatches } from "@/lib/ai/research";

export const aiResearchDispatchReconciliation = inngest.createFunction(
  {
    id: "ai-research-dispatch-reconciliation",
    name: "AI Research Dispatch Reconciliation",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/1 * * * *" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ step }: any) => {
    return await step.run("reconcile-research-dispatches", async () => {
      return await reconcileResearchDispatches();
    });
  }
);
