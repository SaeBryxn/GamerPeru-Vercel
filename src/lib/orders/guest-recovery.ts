import "server-only";
import { cookies } from "next/headers";
import { guestAccessCookieName, verifyGuestAccessToken } from "./guest-access-token";
export async function hasGuestRecoveryAccess(order: {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerEmail: string;
}) {
  if (order.customerId !== null) return false;
  const secret = process.env.CHECKOUT_HMAC_SECRET?.trim() ?? "";
  const token = (await cookies()).get(guestAccessCookieName(order.orderNumber))?.value;
  return Boolean(token && verifyGuestAccessToken(token, order.id, order.customerEmail, secret));
}
