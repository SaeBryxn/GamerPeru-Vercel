import "server-only";

import { createHash } from "node:crypto";
import { orderStatusEnum, paymentStatusEnum, shipmentStatusEnum } from "@/db/schema";
import { startOfLimaDay } from "@/lib/admin/dashboard-period";
import type { AdminOrderListQuery } from "./types";

const KEYS = new Set([
  "q",
  "orderStatus",
  "paymentStatus",
  "shipmentStatus",
  "from",
  "to",
  "cursor",
  "pageSize",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isValidMutationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeOrderNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9-]{4,30}$/.test(normalized) ? normalized : null;
}

function parseSafeEmail(value: string): { local: string; domain: string } | null {
  if (value.length > 255 || UNSAFE_TEXT.test(value) || /\s/u.test(value)) return null;
  const parts = value.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain || local.length > 64 || domain.length > 253) return null;
  if (!/^[^@<>()[\],;:"\\\s]+$/u.test(local) || local.startsWith(".") || local.endsWith("..")) {
    return null;
  }
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !/^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i.test(label))
  ) {
    return null;
  }
  return { local, domain };
}

export function maskOrderEmail(value: string): string {
  const parsed = parseSafeEmail(value);
  if (!parsed) return "Correo no disponible";
  const firstCodePoint = Array.from(parsed.local)[0];
  return firstCodePoint ? `${firstCodePoint}***@${parsed.domain}` : "Correo no disponible";
}

function parseLimaDate(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day)
    return null;
  return { year, month, day };
}

function inputEntries(
  input: URLSearchParams | Record<string, string | string[] | undefined>
): [string, string][] | null {
  if (input instanceof URLSearchParams) return Array.from(input.entries());
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value !== "string") return null;
    entries.push([key, value]);
  }
  return entries;
}

export function listQueryDigest(query: Omit<AdminOrderListQuery, "cursor">): string {
  const content = JSON.stringify([
    query.search?.kind ?? null,
    query.search?.value ?? null,
    query.orderStatus,
    query.paymentStatus,
    query.shipmentStatus,
    query.from,
    query.to,
    query.pageSize,
  ]);
  return createHash("sha256").update(content).digest("hex");
}

export function encodeOrderCursor(createdAt: Date, id: string, query: AdminOrderListQuery): string {
  return Buffer.from(
    JSON.stringify({ v: 1, createdAt: createdAt.toISOString(), id, digest: listQueryDigest(query) })
  ).toString("base64url");
}

function decodeOrderCursor(
  raw: string,
  query: Omit<AdminOrderListQuery, "cursor">
): { createdAt: Date; id: string } | null {
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 4 ||
      record.v !== 1 ||
      typeof record.createdAt !== "string" ||
      !ISO_INSTANT.test(record.createdAt) ||
      !isValidMutationUuid(record.id) ||
      record.digest !== listQueryDigest(query)
    )
      return null;
    const createdAt = new Date(record.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== record.createdAt)
      return null;
    return { createdAt, id: record.id };
  } catch {
    return null;
  }
}

export function parseAdminOrderListQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>
): { valid: true; query: AdminOrderListQuery } | { valid: false } {
  const entries = inputEntries(input);
  if (!entries) return { valid: false };
  const values = new Map<string, string>();
  for (const [key, value] of entries) {
    if (!KEYS.has(key) || values.has(key) || value.length > 1024) return { valid: false };
    values.set(key, value);
  }

  let search: AdminOrderListQuery["search"] = null;
  const q = values.get("q");
  if (q !== undefined) {
    const normalized = q.trim();
    if (
      !normalized ||
      normalized.length > 255 ||
      UNSAFE_TEXT.test(normalized) ||
      /[%_\\]/.test(normalized)
    )
      return { valid: false };
    if (normalized.includes("@")) {
      if (!parseSafeEmail(normalized)) return { valid: false };
      search = { kind: "EMAIL", value: normalized.toLowerCase() };
    } else {
      const prefix = normalizeOrderNumber(normalized);
      if (!prefix) return { valid: false };
      search = { kind: "ORDER_PREFIX", value: prefix };
    }
  }

  const orderStatusRaw = values.get("orderStatus");
  const paymentStatusRaw = values.get("paymentStatus");
  const shipmentStatusRaw = values.get("shipmentStatus");
  if (orderStatusRaw && !orderStatusEnum.enumValues.includes(orderStatusRaw as never))
    return { valid: false };
  if (
    paymentStatusRaw &&
    paymentStatusRaw !== "NOT_RECORDED" &&
    !paymentStatusEnum.enumValues.includes(paymentStatusRaw as never)
  )
    return { valid: false };
  if (
    shipmentStatusRaw &&
    shipmentStatusRaw !== "NOT_RECORDED" &&
    !shipmentStatusEnum.enumValues.includes(shipmentStatusRaw as never)
  )
    return { valid: false };
  if (
    (values.has("orderStatus") && !orderStatusRaw) ||
    (values.has("paymentStatus") && !paymentStatusRaw) ||
    (values.has("shipmentStatus") && !shipmentStatusRaw)
  )
    return { valid: false };

  const from = values.get("from") ?? null;
  const to = values.get("to") ?? null;
  if ((from === null) !== (to === null)) return { valid: false };
  let fromUtc: Date | null = null;
  let toUtcExclusive: Date | null = null;
  if (from !== null && to !== null) {
    const parsedFrom = parseLimaDate(from);
    const parsedTo = parseLimaDate(to);
    if (!parsedFrom || !parsedTo) return { valid: false };
    fromUtc = startOfLimaDay(parsedFrom.year, parsedFrom.month, parsedFrom.day);
    toUtcExclusive = startOfLimaDay(parsedTo.year, parsedTo.month, parsedTo.day + 1);
    const span = (toUtcExclusive.getTime() - fromUtc.getTime()) / 86_400_000;
    if (span < 1 || span > 366) return { valid: false };
  }

  const pageSizeRaw = values.get("pageSize");
  const pageSize = pageSizeRaw === undefined ? 25 : Number(pageSizeRaw);
  if (
    (pageSizeRaw !== undefined && !/^[1-9]\d*$/.test(pageSizeRaw)) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  )
    return { valid: false };

  const base = {
    search,
    orderStatus: (orderStatusRaw ?? null) as AdminOrderListQuery["orderStatus"],
    paymentStatus: (paymentStatusRaw ?? null) as AdminOrderListQuery["paymentStatus"],
    shipmentStatus: (shipmentStatusRaw ?? null) as AdminOrderListQuery["shipmentStatus"],
    fromUtc,
    toUtcExclusive,
    from,
    to,
    pageSize,
  };
  const rawCursor = values.get("cursor");
  const cursor = rawCursor === undefined ? null : decodeOrderCursor(rawCursor, base);
  if (rawCursor !== undefined && !cursor) return { valid: false };
  return { valid: true, query: { ...base, cursor } };
}

export function normalizeAdminCancellationReason(value: unknown): string | null {
  if (typeof value !== "string" || UNSAFE_TEXT.test(value)) return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 255 ? normalized : null;
}

export function normalizeOrderNoteBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(normalized.replace(/\n/g, ""))) return null;
  return Array.from(normalized).length <= 2000 ? normalized : null;
}
