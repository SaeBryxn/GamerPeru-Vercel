import "server-only";

export interface InquiryEmailField {
  label: string;
  value: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain-text and HTML bodies for an inquiry forwarded to the team inbox. Every value is escaped. */
export function buildInquiryEmail(
  title: string,
  fields: InquiryEmailField[]
): { html: string; text: string } {
  const filled = fields.filter((field) => field.value.trim() !== "");

  const text = [title, "", ...filled.map((field) => `${field.label}: ${field.value}`)].join("\n");

  const rows = filled
    .map(
      (field) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#71717a;vertical-align:top;white-space:nowrap">${escapeHtml(
          field.label
        )}</td><td style="padding:6px 0;color:#09090b;white-space:pre-wrap">${escapeHtml(
          field.value
        )}</td></tr>`
    )
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(
    title
  )}</h2><table style="border-collapse:collapse">${rows}</table></div>`;

  return { html, text };
}
