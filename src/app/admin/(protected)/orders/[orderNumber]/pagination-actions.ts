"use server";

import { getAdminOrderNotesPage, getAdminOrderTimelinePage } from "@/lib/admin/orders/reader";

export async function loadOlderAdminNotes(orderNumber: string, cursor: string) {
  return getAdminOrderNotesPage(orderNumber, cursor);
}

export async function loadOlderAdminTimeline(orderNumber: string, cursor: string) {
  return getAdminOrderTimelinePage(orderNumber, cursor);
}
