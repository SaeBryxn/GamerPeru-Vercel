import { inngest } from "../client";
import { getEmailConfig } from "@/lib/email/config";
import { ResendProvider } from "@/lib/email/resend-provider";
import { claimOutboxBatch, deliverOutboxEvent } from "@/lib/notifications/dispatcher";

interface StepTools {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Sends transactional email for outbox events, once a minute.
 *
 * Each event is its own step, so Inngest retries a crashed step without resending the ones
 * already done; claiming with SKIP LOCKED and a lease keeps overlapping runs from sharing events.
 */
export const outboxEmailDispatcher = inngest.createFunction(
  {
    id: "outbox-email-dispatcher",
    name: "Outbox Email Dispatcher",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/1 * * * *" }],
  },
  async ({ step }: { step: StepTools }) => {
    if (!getEmailConfig()) return { status: "EMAIL_NOT_CONFIGURED" as const };

    const claimed = await step.run("claim-outbox-batch", () => claimOutboxBatch());
    const outcomes: Record<string, string> = {};

    for (const event of claimed) {
      outcomes[event.id] = await step.run(`deliver-${event.id}`, async () => {
        const config = getEmailConfig();
        if (!config) return "EMAIL_NOT_CONFIGURED";
        const provider = new ResendProvider({
          apiKey: config.apiKey,
          from: config.from,
          replyTo: config.replyTo,
        });
        return deliverOutboxEvent(event.id, { provider, config });
      });
    }

    return { status: "OK" as const, claimed: claimed.length, outcomes };
  }
);
