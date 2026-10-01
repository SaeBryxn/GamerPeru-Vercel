"use server";

import { getEmailConfig } from "@/lib/email/config";
import { ResendProvider } from "@/lib/email/resend-provider";
import { logger } from "@/lib/logger";
import { buildInquiryEmail, type InquiryEmailField } from "./inquiry-email";
import {
  contactInquirySchema,
  distributorInquirySchema,
  type InquiryFormState,
} from "./inquiry-schema";

/** Bots fill every field and submit instantly; people do neither. */
const MIN_FILL_MS = 2500;

const UNAVAILABLE_MESSAGE =
  "No pudimos enviar tu mensaje en este momento. Escríbenos por WhatsApp o inténtalo más tarde.";

function readForm(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

function looksAutomated(values: Record<string, string>): boolean {
  if (values.website) return true;
  const startedAt = Number(values.startedAt);
  return !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS;
}

function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Forwards an inquiry to the team inbox (CONTACT_INBOX_EMAIL) with the sender as reply-to, so a
 * reply from the inbox goes straight back to them. Nothing is stored.
 */
async function forwardInquiry(
  kind: "contact" | "distributor",
  subject: string,
  replyTo: string,
  fields: InquiryEmailField[]
): Promise<boolean> {
  const config = getEmailConfig();
  const inbox = process.env.CONTACT_INBOX_EMAIL?.trim();
  if (!config || !inbox) {
    logger.warn({ event: "support_inquiry_unconfigured", kind });
    return false;
  }

  const provider = new ResendProvider({ apiKey: config.apiKey, from: config.from, replyTo });
  const body = buildInquiryEmail(subject, fields);
  const result = await provider.send({
    to: inbox,
    subject,
    ...body,
    idempotencyKey: crypto.randomUUID(),
    tags: { category: `support_${kind}` },
  });

  if (!result.ok) {
    logger.error({ event: "support_inquiry_send_failed", kind, permanent: result.permanent });
  }
  return result.ok;
}

export async function submitContactInquiryAction(
  _previous: InquiryFormState,
  formData: FormData
): Promise<InquiryFormState> {
  const values = readForm(formData);
  // Pretend success so automated submissions learn nothing about the filter.
  if (looksAutomated(values)) return { status: "success" };

  const parsed = contactInquirySchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const inquiry = parsed.data;
  const sent = await forwardInquiry("contact", `Contacto web: ${inquiry.topic}`, inquiry.email, [
    { label: "Nombre", value: inquiry.name },
    { label: "Correo", value: inquiry.email },
    { label: "Teléfono", value: inquiry.phone },
    { label: "Tema", value: inquiry.topic },
    { label: "Mensaje", value: inquiry.message },
  ]);

  return sent ? { status: "success" } : { status: "error", message: UNAVAILABLE_MESSAGE };
}

export async function submitDistributorInquiryAction(
  _previous: InquiryFormState,
  formData: FormData
): Promise<InquiryFormState> {
  const values = readForm(formData);
  if (looksAutomated(values)) return { status: "success" };

  const parsed = distributorInquirySchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const inquiry = parsed.data;
  const sent = await forwardInquiry(
    "distributor",
    `Solicitud de distribuidor: ${inquiry.company}`,
    inquiry.email,
    [
      { label: "Empresa", value: inquiry.company },
      { label: "RUC", value: inquiry.ruc },
      { label: "Contacto", value: inquiry.name },
      { label: "Correo", value: inquiry.email },
      { label: "Teléfono", value: inquiry.phone },
      { label: "Ciudad", value: inquiry.city },
      { label: "Tipo de negocio", value: inquiry.businessType },
      { label: "Mensaje", value: inquiry.message },
    ]
  );

  return sent ? { status: "success" } : { status: "error", message: UNAVAILABLE_MESSAGE };
}
