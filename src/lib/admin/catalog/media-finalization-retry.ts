export interface MediaFinalizationIdentity {
  signedIntentToken: string;
  mutationRequestId: string;
  productId: string;
  targetVariantId: string | null;
}

export interface PendingFinalizationState extends MediaFinalizationIdentity {
  safeStatus: "ready_to_retry" | "retrying";
}

export type MediaFinalizationTransition =
  | { type: "transport_failed"; identity: MediaFinalizationIdentity }
  | { type: "retry_started" }
  | { type: "structured_success" }
  | { type: "structured_domain_rejection" }
  | { type: "new_logical_operation" };

export function transitionPendingFinalization(
  current: PendingFinalizationState | null,
  transition: MediaFinalizationTransition
): PendingFinalizationState | null {
  switch (transition.type) {
    case "transport_failed": {
      const identity = current ?? transition.identity;
      return { ...identity, safeStatus: "ready_to_retry" };
    }
    case "retry_started":
      return current ? { ...current, safeStatus: "retrying" } : null;
    case "structured_success":
    case "structured_domain_rejection":
    case "new_logical_operation":
      return null;
  }
}

export function buildMediaFinalizationRetryRequest(
  pending: PendingFinalizationState
): MediaFinalizationIdentity {
  return {
    signedIntentToken: pending.signedIntentToken,
    mutationRequestId: pending.mutationRequestId,
    productId: pending.productId,
    targetVariantId: pending.targetVariantId,
  };
}
