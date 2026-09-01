import { inngest } from "../client";
import { processReservationExpirationBatch } from "@/lib/inventory/service";

/**
 * Gamer Perú — Background Reservation Expiration Worker
 *
 * Scans for expired unpaid ACTIVE reservations and releases stock atomically.
 * Runs on a scheduled cron interval (every 2 minutes).
 */
export const inventoryReservationExpirationJob = inngest.createFunction(
  {
    id: "inventory-reservation-expiration",
    name: "Inventory Reservation Expiration Worker",
    concurrency: {
      limit: 2,
    },
    triggers: [{ cron: "*/2 * * * *" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ step }: any) => {
    const result = await step.run("expire-unpaid-reservations-batch", async () => {
      return await processReservationExpirationBatch({
        batchSize: 50,
        actorId: "SYSTEM",
      });
    });

    return result;
  }
);
