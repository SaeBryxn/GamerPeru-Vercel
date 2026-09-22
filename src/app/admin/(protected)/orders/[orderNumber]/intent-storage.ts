"use client";

export type OrderIntentKind = "note" | "unpaid-cancellation" | "paid-cancellation";

export interface PendingOrderIntent {
  id: string;
  sent: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function key(orderNumber: string, kind: OrderIntentKind): string {
  return `gp027:order-intent:${encodeURIComponent(orderNumber)}:${kind}`;
}

export function readOrderIntent(
  orderNumber: string,
  kind: OrderIntentKind
): PendingOrderIntent | null {
  try {
    const raw = sessionStorage.getItem(key(orderNumber, kind));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== "string" || !UUID.test(record.id)) return null;
    if (typeof record.sent !== "boolean") return null;
    return { id: record.id, sent: record.sent };
  } catch {
    return null;
  }
}

export function getOrCreateOrderIntent(
  orderNumber: string,
  kind: OrderIntentKind
): PendingOrderIntent | null {
  try {
    const storageKey = key(orderNumber, kind);
    const raw = sessionStorage.getItem(storageKey);
    if (raw !== null) return readOrderIntent(orderNumber, kind);
    const intent = { id: crypto.randomUUID(), sent: false };
    sessionStorage.setItem(storageKey, JSON.stringify(intent));
    return intent;
  } catch {
    return null;
  }
}

export function markOrderIntentSent(
  orderNumber: string,
  kind: OrderIntentKind,
  intent: PendingOrderIntent
): boolean {
  try {
    sessionStorage.setItem(key(orderNumber, kind), JSON.stringify({ ...intent, sent: true }));
    return true;
  } catch {
    return false;
  }
}

export function clearOrderIntent(orderNumber: string, kind: OrderIntentKind): void {
  try {
    sessionStorage.removeItem(key(orderNumber, kind));
  } catch {
    // A confirmed server result remains authoritative even if local cleanup is unavailable.
  }
}
