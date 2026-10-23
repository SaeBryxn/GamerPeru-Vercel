"use server";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, outboxEvents } from "@/db/schema";
import { getEmailConfig } from "@/lib/email/config";
import { guestAccessCookieName, verifyGuestAccessToken } from "./guest-access-token";

const numberSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[A-Za-z0-9-]+$/);
export async function redeemGuestOrderAccessAction(raw: unknown) {
  const input = z
    .object({ orderNumber: numberSchema, token: z.string().min(40).max(512) })
    .safeParse(raw);
  if (!input.success) return { success: false as const };
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, input.data.orderNumber))
    .limit(1);
  const secret = process.env.CHECKOUT_HMAC_SECRET?.trim() ?? "";
  const expiresAt =
    order?.customerId === null
      ? verifyGuestAccessToken(input.data.token, order.id, order.customerEmail, secret)
      : null;
  if (!order || !expiresAt) return { success: false as const };
  (await cookies()).set(guestAccessCookieName(order.orderNumber), input.data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return {
    success: true as const,
    href: `/checkout/confirmacion/${encodeURIComponent(order.orderNumber)}`,
  };
}

/** Same response for missing orders, mismatched email, quota and mail configuration. */
export async function requestGuestOrderAccessAction(raw: unknown) {
  const input = z
    .object({ orderNumber: numberSchema, email: z.string().trim().email().max(254) })
    .safeParse(raw);
  const reply = {
    message:
      "Si los datos coinciden con un pedido de invitado y el correo está disponible, recibirás un enlace temporal. Revisa también tu carpeta de spam.",
  };
  if (!input.success || !getEmailConfig()) return reply;
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.orderNumber, input.data.orderNumber),
          sql`${orders.customerId} IS NULL`,
          sql`lower(${orders.customerEmail}) = ${input.data.email.toLowerCase()}`
        )
      )
      .limit(1);
    if (!order) return;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"guest_order_recovery:" + order.id}))`
    );
    const recent = await tx
      .select({ createdAt: outboxEvents.createdAt })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateId, order.id),
          eq(outboxEvents.eventName, "GuestOrderAccessRequested"),
          sql`${outboxEvents.createdAt} > now() - interval '24 hours'`
        )
      );
    if (
      recent.length >= 4 ||
      recent.some((row) => Date.now() - row.createdAt.getTime() < 15 * 60 * 1000)
    )
      return;
    await tx
      .insert(outboxEvents)
      .values({
        aggregateType: "order",
        aggregateId: order.id,
        eventName: "GuestOrderAccessRequested",
        eventVersion: 1,
        payload: { orderId: order.id },
        status: "PENDING",
      });
  });
  return reply;
}
