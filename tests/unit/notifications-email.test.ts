import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailConfig } from "@/lib/email/config";
import { ResendProvider } from "@/lib/email/resend-provider";
import { renderOrderPlaced } from "@/lib/notifications/templates/order-placed";
import { renderPaymentApproved } from "@/lib/notifications/templates/payment-approved";
import type { OrderEmailContext } from "@/lib/notifications/templates/types";

const message = {
  to: "cliente@example.pe",
  subject: "Asunto",
  html: "<p>Hola</p>",
  text: "Hola",
  idempotencyKey: "outbox:evt-1:order_placed",
};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("ResendProvider", () => {
  it("posts the message with the idempotency key and returns the provider id", async () => {
    const fetchImpl = respond(200, { id: "re_123" });
    const provider = new ResendProvider({ apiKey: "re_live", from: "GP <p@gp.pe>" }, fetchImpl);

    await expect(provider.send(message)).resolves.toEqual({ ok: true, messageId: "re_123" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("outbox:evt-1:order_placed");
    expect(headers.Authorization).toBe("Bearer re_live");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "GP <p@gp.pe>",
      to: ["cliente@example.pe"],
      subject: "Asunto",
    });
  });

  it.each([
    [429, { name: "rate_limit_exceeded" }, false],
    [500, { name: "internal_server_error" }, false],
    [409, { name: "concurrent_idempotent_requests" }, false],
    [409, { name: "invalid_idempotent_request" }, true],
    [422, { name: "validation_error" }, true],
    [403, { name: "invalid_from_address" }, true],
  ])("classifies %s %o as permanent=%s", async (status, body, permanent) => {
    const provider = new ResendProvider({ apiKey: "k", from: "f" }, respond(status, body));
    const result = await provider.send(message);
    expect(result).toMatchObject({ ok: false, permanent });
  });

  it("treats network failures as retryable", async () => {
    const provider = new ResendProvider({ apiKey: "k", from: "f" }, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(provider.send(message)).resolves.toMatchObject({ ok: false, permanent: false });
  });
});

describe("getEmailConfig", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("stays disabled with placeholder credentials", () => {
    process.env.RESEND_API_KEY = "re_placeholder_api_key";
    process.env.EMAIL_FROM = "GP <pedidos@gamerperu.pe>";
    expect(getEmailConfig()).toBeNull();
  });

  it("returns the sender and a site URL without trailing slash", () => {
    process.env.RESEND_API_KEY = "re_live_key";
    process.env.EMAIL_FROM = "GP <pedidos@gamerperu.pe>";
    process.env.NEXT_PUBLIC_SITE_URL = "https://gamerperu.pe/";
    expect(getEmailConfig()).toMatchObject({
      apiKey: "re_live_key",
      siteUrl: "https://gamerperu.pe",
    });
  });
});

const context: OrderEmailContext = {
  orderId: "order-1",
  orderNumber: "GP-TEST0001",
  customerEmail: "cliente@example.pe",
  recipientName: "Ana <script>alert(1)</script>",
  subtotalCents: 65800,
  discountCents: 0,
  shippingCents: 1500,
  totalCents: 67300,
  items: [
    {
      name: "ATK A9 Plus",
      variant: "Negro",
      sku: "ATK-A9P-BLK",
      quantity: 2,
      lineTotalCents: 65800,
    },
  ],
  payment: {
    methodName: "Yape",
    recipientName: "Gamer Peru SAC",
    accountIdentifier: "987654321",
    instructionText: 'Incluye tu número de pedido en el mensaje "<b>".',
  },
  payBy: "2026-09-27T20:30:00.000Z",
  confirmationUrl: "https://gamerperu.pe/checkout/confirmacion/GP-TEST0001",
};

describe("order email templates", () => {
  it("OrderPlaced tells the customer what, where and by when to pay", () => {
    const email = renderOrderPlaced(context);
    expect(email.subject).toContain("GP-TEST0001");
    expect(email.html).toContain("S/ 673.00");
    expect(email.html).toContain("987654321");
    expect(email.html).toContain("Gamer Peru SAC");
    expect(email.html).toContain(context.confirmationUrl);
    expect(email.text).toContain("Paga S/ 673.00 con Yape a Gamer Peru SAC, número 987654321.");
    expect(email.text).toContain("Paga antes del domingo, 27 de setiembre, 03:30 p.");
  });

  it("escapes customer and instruction text instead of rendering markup", () => {
    const email = renderOrderPlaced(context);
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain('"<b>"');
    expect(email.html).toContain("&lt;b&gt;");
  });

  it("OrderPlaced falls back to the order page when instructions are missing", () => {
    const email = renderOrderPlaced({ ...context, payment: null, payBy: null });
    expect(email.html).toContain("Revisa las instrucciones de pago");
    expect(email.text).toContain("Total a pagar: S/ 673.00.");
  });

  it("PaymentApproved confirms the paid total and links to the order", () => {
    const email = renderPaymentApproved(context);
    expect(email.subject).toBe("Pago confirmado · pedido GP-TEST0001");
    expect(email.html).toContain("S/ 673.00");
    expect(email.text).toContain(context.confirmationUrl);
    expect(email.html).not.toContain("<script>");
  });
});
