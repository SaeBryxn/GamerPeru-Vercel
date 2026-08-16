# Payments Specification — v1

Initial methods: `YAPE_MANUAL`, `PLIN_MANUAL` (defined under `PaymentMethodConfiguration`).

Workflow:
Order → QR/instructions (`PaymentInstructionVersion`) → customer submits operation code + optional proof (`PaymentSubmission`) → `VERIFYING` workbench → authorized Admin verifies actual bank receipt → approve (`PAID`) / reject.

Rules:

- Customer submission never confirms funds automatically.
- Payment instructions presented at checkout are frozen in immutable `PaymentInstructionVersion` records.
- Payment submission is distinct from payment verification; resubmission is supported for non-terminal rejections.
- Late submissions (after reservation expiry) are recorded with timing flags for manual administrative stock resolution or refunding.
- Full verification audit trail records verifier ID, timestamps, decision, notes, and status transitions.
- Architecture uses a provider-neutral payment abstraction permitting later payment gateways without rewriting the `Order` aggregate.
