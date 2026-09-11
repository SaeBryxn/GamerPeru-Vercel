/**
 * Stable Mutation Request Identity Manager.
 *
 * Implements client-side mutation request identity lifecycle:
 * 1. Generates one high-entropy mutationRequestId per logical mutation before first transport attempt.
 * 2. If the same logical mutation suffers a network/transport failure and is retried, reuses the SAME ID.
 * 3. After a definitive structured server response (success or domain rejection), completes the attempt.
 * 4. A subsequent logical operation receives a fresh ID.
 * 5. If the payload is materially modified after a transport error, detects the change and assigns a new ID.
 * 6. Never displays or persists raw request IDs.
 */
/**
 * Canonical JSON serializer for deterministic client-side mutation request fingerprinting.
 *
 * Rules:
 * - Recursively sorts plain-object keys.
 * - Preserves arrays in original element order.
 * - Preserves JSON primitives (numbers, booleans, strings).
 * - Distinguishes null from undefined/empty.
 * - Does not collapse nested objects or fallback to lossy String(object).
 * - Rejects non-JSON primitives (functions, symbols, bigints).
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  const type = typeof value;
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Cannot serialize non-finite number in canonical JSON");
    }
    return JSON.stringify(value);
  }
  if (type === "string") {
    return JSON.stringify(value);
  }
  if (type === "undefined") {
    return "undefined";
  }
  if (type === "bigint" || type === "symbol" || type === "function") {
    throw new TypeError(`Unsupported non-JSON value type: ${type}`);
  }
  if (Array.isArray(value)) {
    const elements = value.map((item) => canonicalJsonStringify(item === undefined ? null : item));
    return `[${elements.join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries: string[] = [];
    for (const key of keys) {
      const val = obj[key];
      if (val !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Unsupported non-JSON value: ${String(value)}`);
}

/**
 * Stable Mutation Request Identity Manager.
 *
 * Implements client-side mutation request identity lifecycle:
 * 1. Generates one high-entropy mutationRequestId per logical mutation before first transport attempt.
 * 2. If the same logical mutation suffers a network/transport failure and is retried, reuses the SAME ID.
 * 3. After a definitive structured server response (success or domain rejection), completes the attempt.
 * 4. A subsequent logical operation receives a fresh ID.
 * 5. If the payload is materially modified after a transport error, detects the change and assigns a new ID.
 * 6. Never displays or persists raw request IDs.
 */
export class MutationRequestTracker {
  private activeId: string | null = null;
  private lastPayloadFingerprint: string | null = null;

  /**
   * Computes a stable deterministic deep fingerprint of a mutation payload.
   */
  public computeFingerprint(payload: unknown): string {
    return canonicalJsonStringify(payload);
  }

  /**
   * Gets the mutationRequestId for the given payload.
   * If an active request exists with identical payload, reuses the existing ID.
   * Otherwise, generates a fresh UUID.
   */
  public getRequestId(payload: unknown): string {
    const fingerprint = this.computeFingerprint(payload);

    if (this.activeId !== null && this.lastPayloadFingerprint === fingerprint) {
      return this.activeId;
    }

    const newId = crypto.randomUUID();
    this.activeId = newId;
    this.lastPayloadFingerprint = fingerprint;
    return newId;
  }

  /**
   * Marks the logical attempt as completed after receiving a definitive structured response.
   * Clears the active ID so subsequent operations receive a new ID.
   */
  public complete(): void {
    this.activeId = null;
    this.lastPayloadFingerprint = null;
  }

  /**
   * Inspects current state for unit tests.
   */
  public get currentId(): string | null {
    return this.activeId;
  }
}
