import { describe, expect, it } from "vitest";
import {
  buildMediaFinalizationRetryRequest,
  transitionPendingFinalization,
  type MediaFinalizationIdentity,
  type PendingFinalizationState,
} from "@/lib/admin/catalog/media-finalization-retry";

const FIRST_LOGICAL_OPERATION: MediaFinalizationIdentity = {
  signedIntentToken: "signed-intent-token-T",
  mutationRequestId: "mutation-request-id-M",
  productId: "product-123",
  targetVariantId: "variant-456",
};

function createReadyToRetryState(): PendingFinalizationState {
  const pending = transitionPendingFinalization(null, {
    type: "transport_failed",
    identity: FIRST_LOGICAL_OPERATION,
  });
  if (!pending) {
    throw new Error("Expected pending finalization state.");
  }
  return pending;
}

describe("GP-024 Client Finalization Retry State", () => {
  it("creates pending finalization from the first transport failure with exact T, M, product, and variant", () => {
    const pending = createReadyToRetryState();

    expect(pending).toEqual({
      ...FIRST_LOGICAL_OPERATION,
      safeStatus: "ready_to_retry",
    });
  });

  it("builds the retry request from pending state without changing the logical operation identity", () => {
    const retryRequest = buildMediaFinalizationRetryRequest(createReadyToRetryState());

    expect(retryRequest).toEqual(FIRST_LOGICAL_OPERATION);
    expect(retryRequest.signedIntentToken).toBe("signed-intent-token-T");
    expect(retryRequest.mutationRequestId).toBe("mutation-request-id-M");
  });

  it("marks retrying and returns to ready_to_retry after a second transport failure with the same T and M", () => {
    const ready = createReadyToRetryState();
    const retrying = transitionPendingFinalization(ready, { type: "retry_started" });
    expect(retrying?.safeStatus).toBe("retrying");

    const secondFailure = transitionPendingFinalization(retrying, {
      type: "transport_failed",
      identity: {
        signedIntentToken: "must-not-replace-T",
        mutationRequestId: "must-not-replace-M",
        productId: "must-not-replace-product",
        targetVariantId: null,
      },
    });

    expect(secondFailure).toEqual({
      ...FIRST_LOGICAL_OPERATION,
      safeStatus: "ready_to_retry",
    });
  });

  it("clears pending finalization after structured success", () => {
    expect(
      transitionPendingFinalization(createReadyToRetryState(), { type: "structured_success" })
    ).toBeNull();
  });

  it("clears pending finalization after structured domain rejection", () => {
    expect(
      transitionPendingFinalization(createReadyToRetryState(), {
        type: "structured_domain_rejection",
      })
    ).toBeNull();
  });

  it("clears the old pending operation when a new file or target starts a new logical upload", () => {
    const pending = createReadyToRetryState();

    expect(transitionPendingFinalization(pending, { type: "new_logical_operation" })).toBeNull();
  });
});
