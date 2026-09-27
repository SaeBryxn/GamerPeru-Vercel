export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Same key, same message: the provider accepts it once. The dispatcher derives it from the
   * outbox event and template, so a retried send cannot deliver a second copy.
   */
  idempotencyKey: string;
  tags?: Record<string, string>;
}

export type EmailSendResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false;
      /** True when retrying the same message cannot succeed (bad address, rejected payload). */
      permanent: boolean;
      error: string;
    };

/** Provider-neutral transport; business events never know which provider sends them. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
