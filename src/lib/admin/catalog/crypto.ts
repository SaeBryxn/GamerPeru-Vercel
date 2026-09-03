import { createHash } from "node:crypto";

/**
 * Deterministically serializes an arbitrary JavaScript object or value to a canonical JSON string.
 *
 * Rules:
 * 1. Recursively sorts all object keys in lexicographical order.
 * 2. Preserves array order where array is present.
 * 3. Distinguishes null from absent / undefined fields (null serialized as "null", undefined omitted).
 * 4. Serializes exact integer monetary cents, never formatted strings.
 * 5. Excludes volatile transport metadata, secrets, tokens, or timestamps.
 */
export function canonicalSerialize(val: unknown): string {
  if (val === null) {
    return "null";
  }

  if (val === undefined) {
    return "";
  }

  if (typeof val === "boolean" || typeof val === "number") {
    return JSON.stringify(val);
  }

  if (typeof val === "string") {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalSerialize(item));
    return `[${items.join(",")}]`;
  }

  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();

    const pairs = sortedKeys.map((k) => {
      const serializedKey = JSON.stringify(k);
      const serializedVal = canonicalSerialize(obj[k]);
      return `${serializedKey}:${serializedVal}`;
    });

    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(val);
}

/**
 * Computes the canonical mutationRequestDigest for an idempotent request attempt.
 *
 * Format:
 * v1|<len(actorId)>:<actorId>|<len(opType)>:<opType>|<mutationRequestId>
 */
export function computeMutationRequestDigest(
  actorId: string,
  operationType: string,
  mutationRequestId: string
): string {
  const normalizedActor = actorId.trim();
  const normalizedOp = operationType.trim();
  const normalizedReqId = mutationRequestId.trim();

  const input = `v1|${normalizedActor.length}:${normalizedActor}|${normalizedOp.length}:${normalizedOp}|${normalizedReqId}`;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Computes the canonical requestFingerprint (SHA-256) of a validated, normalized business mutation payload.
 */
export function computeRequestFingerprint(normalizedPayload: unknown): string {
  const serialized = canonicalSerialize(normalizedPayload);
  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Derives a deterministic 64-bit signed BigInt for PostgreSQL pg_advisory_xact_lock(bigint).
 */
export function createCatalogAdvisoryLockKey(digest: string): bigint {
  const hash = createHash("sha256").update(`gp024:request:${digest.trim().toLowerCase()}`).digest();
  return hash.readBigInt64BE(0);
}

/**
 * Derives a deterministic 32-bit signed integer for PostgreSQL pg_advisory_xact_lock(int4).
 */
export function createCatalogAdvisoryLockKey32(digest: string): number {
  const hash = createHash("sha256").update(`gp024:request:${digest.trim().toLowerCase()}`).digest();
  return hash.readInt32BE(0);
}
