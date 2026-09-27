const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Every dynamic value in an email passes through here: customer input must never become markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

const COLORS = {
  canvas: "#f4f4f5",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  hairline: "#e5e7eb",
  accent: "#111827",
  accentText: "#ffffff",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface LineItemView {
  name: string;
  detail: string;
  quantity: number;
  total: string;
}

export function renderLineItems(items: LineItemView[]): string {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.text};">
            ${item.quantity}× ${escapeHtml(item.name)}
            <div style="font-size:12px;color:${COLORS.muted};">${escapeHtml(item.detail)}</div>
          </td>
          <td align="right" style="padding:10px 0;border-top:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.text};white-space:nowrap;">
            ${escapeHtml(item.total)}
          </td>
        </tr>`
    )
    .join("");
}

export function renderSummaryRow(label: string, value: string, strong = false): string {
  const weight = strong ? "700" : "400";
  return `
    <tr>
      <td style="padding:4px 0;font-size:14px;color:${strong ? COLORS.text : COLORS.muted};font-weight:${weight};">${escapeHtml(label)}</td>
      <td align="right" style="padding:4px 0;font-size:14px;color:${COLORS.text};font-weight:${weight};white-space:nowrap;">${escapeHtml(value)}</td>
    </tr>`;
}

export function renderButton(label: string, href: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;">
      <tr>
        <td style="border-radius:10px;background:${COLORS.accent};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.accentText};text-decoration:none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

/** Monochrome, table-based shell with inline styles: the subset every mail client renders. */
export function renderLayout(options: {
  preheader: string;
  heading: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.canvas};">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(options.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLORS.canvas};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.hairline};border-radius:14px;">
            <tr>
              <td style="padding:28px 28px 0;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:-0.01em;color:${COLORS.text};">Gamer Perú</td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;font-family:${FONT};color:${COLORS.text};">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(options.heading)}</h1>
                ${options.body}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:${COLORS.muted};">
            Recibes este correo por una compra en Gamer Perú.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${COLORS.text};">${html}</p>`;
}

export function mutedParagraph(html: string): string {
  return `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${html}</p>`;
}

export function panel(html: string): string {
  return `<div style="margin:16px 0;padding:16px;border:1px solid ${COLORS.hairline};border-radius:10px;">${html}</div>`;
}

export function table(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0;">${rowsHtml}</table>`;
}
