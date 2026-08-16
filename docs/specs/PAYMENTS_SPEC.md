# Payments Specification — v1
Initial methods: `YAPE_MANUAL`, `PLIN_MANUAL`.

Order → QR/instructions → customer submits operation code + optional proof → `payment_verification` → authorized Admin verifies actual receipt → approve/reject.

Customer submission never confirms funds automatically. Store verifier/timestamps/result/notes/status audit. Architecture must permit later payment gateways without rewriting Orders.
