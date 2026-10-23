import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createGuestAccessToken,
  verifyGuestAccessToken,
  GUEST_ACCESS_TTL_MS,
} from "@/lib/orders/guest-access-token";
import {
  redeemGuestOrderAccessAction,
  requestGuestOrderAccessAction,
} from "@/lib/orders/guest-recovery-actions";
import { hasGuestRecoveryAccess } from "@/lib/orders/guest-recovery";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  insert: vi.fn(),
  email: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("next/headers", () => ({
  cookies: () => ({ set: mocks.setCookie, get: mocks.getCookie }),
}));
vi.mock("@/lib/email/config", () => ({ getEmailConfig: mocks.email }));
const secret = "unit-test-only-secret-with-at-least-32-characters";
const order = {
  id: "order-uuid",
  orderNumber: "GP-TEST",
  customerId: null,
  customerEmail: "buyer@example.test",
};
const queryOrder = (value: unknown) =>
  mocks.select.mockReturnValueOnce({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(value ? [value] : []) }) }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHECKOUT_HMAC_SECRET", secret);
  mocks.email.mockReturnValue({ apiKey: "fake", from: "test" });
});
afterEach(() => vi.unstubAllEnvs());
it("vincula el enlace al pedido, correo, secreto y plazo exactos", () => {
  const token = createGuestAccessToken(order.id, order.customerEmail, secret, 1000);
  expect(verifyGuestAccessToken(token, order.id, order.customerEmail, secret, 2000)).toBe(
    1000 + GUEST_ACCESS_TTL_MS
  );
  expect(
    verifyGuestAccessToken(token, "another-order", order.customerEmail, secret, 2000)
  ).toBeNull();
  expect(verifyGuestAccessToken(token, order.id, "other@example.test", secret, 2000)).toBeNull();
  expect(
    verifyGuestAccessToken(token + "x", order.id, order.customerEmail, secret, 2000)
  ).toBeNull();
  expect(
    verifyGuestAccessToken(token, order.id, order.customerEmail, secret, 1000 + GUEST_ACCESS_TTL_MS)
  ).toBeNull();
});
it("canjea solo un pedido invitado en una cookie HttpOnly y ruta limpia", async () => {
  const token = createGuestAccessToken(order.id, order.customerEmail, secret);
  queryOrder(order);
  expect(await redeemGuestOrderAccessAction({ orderNumber: order.orderNumber, token })).toEqual({
    success: true,
    href: "/checkout/confirmacion/GP-TEST",
  });
  expect(mocks.setCookie).toHaveBeenCalledWith(
    expect.any(String),
    token,
    expect.objectContaining({ httpOnly: true, sameSite: "lax", expires: expect.any(Date) })
  );
  queryOrder({ ...order, customerId: "registered-customer" });
  expect(await redeemGuestOrderAccessAction({ orderNumber: order.orderNumber, token })).toEqual({
    success: false,
  });
});
it("la cookie no autoriza otro pedido ni un pedido con cuenta", async () => {
  mocks.getCookie.mockReturnValue({
    value: createGuestAccessToken(order.id, order.customerEmail, secret),
  });
  expect(await hasGuestRecoveryAccess(order)).toBe(true);
  expect(await hasGuestRecoveryAccess({ ...order, id: "different" })).toBe(false);
  expect(await hasGuestRecoveryAccess({ ...order, customerId: "customer" })).toBe(false);
});
it("usa respuesta genérica y limita solicitudes sin persistir correo ni token en la cola", async () => {
  mocks.transaction.mockImplementation(async (operation) =>
    operation({ select: mocks.select, execute: vi.fn(), insert: () => ({ values: mocks.insert }) })
  );
  queryOrder(order);
  mocks.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });
  const first = await requestGuestOrderAccessAction({
    orderNumber: order.orderNumber,
    email: order.customerEmail,
  });
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      eventName: "GuestOrderAccessRequested",
      payload: { orderId: order.id },
    })
  );
  expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(order.customerEmail);
  mocks.insert.mockClear();
  queryOrder(order);
  mocks.select.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve([{ createdAt: new Date() }]) }),
  });
  expect(
    await requestGuestOrderAccessAction({
      orderNumber: order.orderNumber,
      email: order.customerEmail,
    })
  ).toEqual(first);
  expect(mocks.insert).not.toHaveBeenCalled();
  queryOrder(null);
  expect(
    await requestGuestOrderAccessAction({
      orderNumber: order.orderNumber,
      email: "wrong@example.test",
    })
  ).toEqual(first);
});
