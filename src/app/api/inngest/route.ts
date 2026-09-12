import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { inventoryReservationExpirationJob } from "@/lib/inngest/functions/inventory-expiration";
import { aiResearchJob } from "@/lib/inngest/functions/ai-research-job";
import { aiResearchDispatchReconciliation } from "@/lib/inngest/functions/ai-research-dispatch-reconciliation";
import { aiResearchLeaseRecovery } from "@/lib/inngest/functions/ai-research-lease-recovery";

/**
 * Gamer Perú — Inngest Serving Endpoint
 *
 * Exposes durable background functions to Inngest daemon / cloud executor.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    inventoryReservationExpirationJob,
    aiResearchJob,
    aiResearchDispatchReconciliation,
    aiResearchLeaseRecovery,
  ],
});
