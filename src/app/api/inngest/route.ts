import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { inventoryReservationExpirationJob } from "@/lib/inngest/functions/inventory-expiration";

/**
 * Gamer Perú — Inngest Serving Endpoint
 *
 * Exposes durable background functions to Inngest daemon / cloud executor.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [inventoryReservationExpirationJob],
});
