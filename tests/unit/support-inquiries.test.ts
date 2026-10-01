import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  submitContactInquiryAction,
  submitDistributorInquiryAction,
} from "@/lib/support/inquiry-actions";
import { buildInquiryEmail } from "@/lib/support/inquiry-email";

const mocks = vi.hoisted(() => ({ send: vi.fn(), config: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/email/config", () => ({ getEmailConfig: mocks.config }));
vi.mock("@/lib/email/resend-provider", () => ({
  ResendProvider: class {
    constructor(readonly options: unknown) {}
    send = mocks.send;
  },
}));

const IDLE = { status: "idle" } as const;

function contactForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values = {
    name: "Ana Pérez",
    email: "ana@example.pe",
    phone: "",
    topic: "Estado de un pedido",
    message: "Quiero saber el estado de mi pedido GP-1234.",
    website: "",
    startedAt: String(Date.now() - 10_000),
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("support inquiry actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({
      apiKey: "re_x",
      from: "Gamer Perú <hola@gp.pe>",
      replyTo: null,
    });
    mocks.send.mockResolvedValue({ ok: true, messageId: "m1" });
    vi.stubEnv("CONTACT_INBOX_EMAIL", "equipo@gp.pe");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("forwards a valid contact message to the team inbox", async () => {
    await expect(submitContactInquiryAction(IDLE, contactForm())).resolves.toEqual({
      status: "success",
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "equipo@gp.pe",
        subject: "Contacto web: Estado de un pedido",
      })
    );
  });

  it("reports field errors without sending", async () => {
    const result = await submitContactInquiryAction(
      IDLE,
      contactForm({ email: "no-es-correo", message: "corto" })
    );
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { email: expect.any(String), message: expect.any(String) },
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("silently drops submissions that fill the trap or arrive instantly", async () => {
    await expect(
      submitContactInquiryAction(IDLE, contactForm({ website: "spam.example" }))
    ).resolves.toEqual({ status: "success" });
    await expect(
      submitContactInquiryAction(IDLE, contactForm({ startedAt: String(Date.now()) }))
    ).resolves.toEqual({ status: "success" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("asks visitors to use another channel when no inbox is configured", async () => {
    vi.stubEnv("CONTACT_INBOX_EMAIL", "");
    const result = await submitContactInquiryAction(IDLE, contactForm());
    expect(result).toMatchObject({ status: "error", message: expect.stringContaining("WhatsApp") });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("validates the distributor RUC format", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      company: "Gamer Store SAC",
      ruc: "123",
      name: "Luis",
      email: "luis@store.pe",
      phone: "987654321",
      city: "Arequipa",
      businessType: "Tienda física",
      startedAt: String(Date.now() - 10_000),
    })) {
      form.set(key, value);
    }
    await expect(submitDistributorInquiryAction(IDLE, form)).resolves.toMatchObject({
      status: "error",
      fieldErrors: { ruc: "El RUC tiene 11 dígitos." },
    });
  });
});

describe("buildInquiryEmail", () => {
  it("escapes visitor input and omits empty fields", () => {
    const { html, text } = buildInquiryEmail("Contacto", [
      { label: "Mensaje", value: '<script>alert("x")</script>' },
      { label: "Teléfono", value: "" },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(text).not.toContain("Teléfono");
  });
});
