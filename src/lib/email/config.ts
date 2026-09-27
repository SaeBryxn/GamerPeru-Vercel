import "server-only";

export interface EmailConfig {
  apiKey: string;
  from: string;
  replyTo: string | null;
  siteUrl: string;
}

const isPlaceholder = (value: string | undefined) =>
  !value || value.trim() === "" || value.includes("placeholder");

/**
 * Email is optional infrastructure: without a real key or sender the dispatcher stays idle and
 * events wait in the outbox, rather than being marked delivered while nothing was sent.
 */
export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (isPlaceholder(apiKey) || isPlaceholder(from)) return null;

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    apiKey: apiKey!,
    from: from!,
    // An empty EMAIL_REPLY_TO in .env means "not set".
    replyTo: replyTo !== undefined && replyTo.length > 0 ? replyTo : null,
    siteUrl,
  };
}
