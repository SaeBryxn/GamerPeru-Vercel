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
   * Computes a stable deterministic fingerprint of a mutation payload.
   */
  private computeFingerprint(payload: unknown): string {
    try {
      return JSON.stringify(
        payload,
        Object.keys((payload as Record<string, unknown>) ?? {}).sort()
      );
    } catch {
      return String(payload);
    }
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
