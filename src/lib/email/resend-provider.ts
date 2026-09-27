import "server-only";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Resend over its REST API, with no SDK: one POST per message.
 *
 * Errors are classified for the dispatcher: rate limits, server errors, timeouts and concurrent
 * requests with the same idempotency key are retryable; anything else Resend rejects (invalid
 * address, validation, forbidden sender) is permanent, because resending it cannot succeed.
 */
export class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly options: { apiKey: string; from: string; replyTo?: string | null },
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const body = {
      from: this.options.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(this.options.replyTo ? { reply_to: this.options.replyTo } : {}),
      ...(message.tags
        ? { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) }
        : {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return {
        ok: false,
        permanent: false,
        error: `resend_network: ${error instanceof Error ? error.name : "unknown"}`,
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      name?: string;
      message?: string;
    } | null;

    if (response.ok) {
      return { ok: true, messageId: typeof payload?.id === "string" ? payload.id : null };
    }

    const reason = `resend_${response.status}: ${payload?.name ?? "error"}`;
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 409 && payload?.name === "concurrent_idempotent_requests");

    return { ok: false, permanent: !retryable, error: reason };
  }
}
