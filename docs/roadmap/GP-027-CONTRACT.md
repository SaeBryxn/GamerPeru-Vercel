# GP-027 CHK0 — Orders Admin implementation contract

## 1. Authority and baseline

Status: **CONTRACT CANDIDATE / PENDING EXTERNAL APPROVAL**. This document defines later checkpoints; it implements no runtime behavior. The authorized parent is `fab89780a7e2f5576849a54b143f58c9d291da84` (`origin/main`, definitive GP-026 closure). Work occurs only on `audit/gp027-chk0`. No part of this candidate authorizes a merge, hosted migration, or GP-028 implementation.

Authority, in descending order: `AGENTS.md`; `docs/engineering/ENGINEERING_STANDARDS.md`; accepted ADR-002, ADR-003, ADR-008, ADR-009; `docs/architecture/COMMERCE_DOMAIN_MODEL.md`; Master, Commerce, Payments, and Admin specs; GP-020/022/023/026 closure evidence; `docs/roadmap/GP-027.md`. The domain specification describes eventual transitions, while the integrated service implementation determines which transitions are actually executable now. A diagram edge is not permission to write an enum value.

## 2. Dependency audit

GP-020 provides the integrated order lifecycle, refund, timeline, audit, idempotency, and inventory-safe cancellation services. Its roadmap says `COMPLETED`; its closure file still says `FINAL CLOSURE CANDIDATE / PENDING EXTERNAL APPROVAL`, so this contract does not misstate that document's verdict. GP-022's closure is `CLOSED / EXTERNALLY APPROVED` despite its older roadmap status saying `PLANNED`; the installed protected shell and RBAC are the operative evidence. GP-023 is closed and provides an aggregate-only Admin dashboard; its payment queue is not GP-027 authority. GP-026 is definitively closed at the authorized baseline and supplies current Admin shell/navigation conventions. GP-028 remains the next, unstarted payment-verification gate. These documentation-status discrepancies do not change implemented service ownership.

## 3. Existing Order domain inventory

- `src/db/schema/orders/**`: seven-state `orders`, immutable order-item, address, and pricing snapshots; `orders.customerId` is nullable and `ON DELETE SET NULL`.
- `src/db/schema/payments/**`: one payment per order in the normal checkout path, submission attempts, immutable refunds; monetary values are integer cents. The Admin reader must tolerate a missing payment as an integrity condition, not silently omit the order.
- `src/db/schema/shipping/**`: zero-to-many shipments physically; the v1 checkout creates one, but the schema permits split fulfillment. Shipment status is orthogonal to order/payment status.
- `src/db/schema/inventory/**`: reservation and ledger truth for expiry/cancellation/refund effects.
- `src/db/schema/audit/**`, `src/db/schema/outbox/**`, `src/db/schema/idempotency/**`: append-only audit, transactional events, and existing operation-key infrastructure.
- `src/lib/orders/authority.ts`, `service.ts`, `types.ts`, `validation.ts`, `actions.ts`: mixed ownership resolver, domain mutations, customer-facing action, and seven-type timeline. `src/lib/inventory/service.ts` owns unpaid reservation expiry. Checkout creates `PENDING` order, `UNPAID` payment, and `UNFULFILLED` shipment; GP-019 submission can make payment `SUBMITTED`. No integrated service currently performs `CONFIRMED -> PROCESSING`, shipment packing/dispatch/delivery, or `PROCESSING -> FULFILLED`.

## 4. Existing Admin and RBAC inventory

`requirePermission("orders:manage")` is the existing server guard. Seeded `SUPER_ADMIN` and `ADMIN_ORDERS` have it; `ADMIN_CATALOG`, `ADMIN_SUPPORT`, and `CUSTOMER` do not. Both order-capable roles also have `orders:verify`, but GP-027 does not use that permission. The shell's staff check is not a substitute for a route/reader/action guard. `src/lib/admin/navigation.ts` has no Orders link; its icon union already permits `ShoppingCart`. `src/lib/admin/dashboard-reader.ts` demonstrates server-only, permission-scoped projections and exact-money conventions.

## 5. Exact GP-027 scope

Authorized Admins can see a bounded list, server-side search/filter, a detail read model, a faithful timeline, internal staff notes, and eligibility-driven order actions. GP-027 exposes only two already-implemented lifecycle actions: unpaid cancellation and paid pre-shipment cancellation with recorded full refund. It does not create a generic status setter, independent partial/full refund workbench, fulfillment engine, or payment-verification workflow. Existing refunds and all canonical states remain visible read-only where relevant.

## 6. GP-027 / GP-028 boundary

| Concern                                               | GP-027                                                                      | GP-028                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Payment status, method code, amount/refunded amount   | Read-only, minimum operational facts                                        | Verification workbench may also use them                  |
| Submission presence/time                              | Aggregate/status timeline fact only; no code, image, or submission reviewer | Proof/code review and queue                               |
| `VERIFYING`, approve, reject, late-funds adjudication | No action or writer                                                         | Exclusive workflow owner                                  |
| Payment-review notes, reviewer SLA, signed proof URLs | Absent                                                                      | Exclusive workflow owner                                  |
| Terminal rejection consequence helper                 | Never called by GP-027 UI                                                   | Called only by an authorized GP-028 rejection transaction |
| `orders:verify`                                       | Not checked or exercised                                                    | Required for verification mutations                       |

GP-027 must not deep-link to a nonexistent GP-028 screen or mislabel `SUBMITTED` as paid.

## 7. List read model

Route: `/admin/orders`. One row contains `orderNumber`, `createdAt`, masked purchase-time email, `accountLinkState` (`LINKED` or `NOT_LINKED`, not a claimed guest classification), order status, payment status or `NOT_RECORDED`, shipment display state or `NOT_RECORDED`/`MULTIPLE`, integer `totalCents`, explicit currency, **unit count** (`SUM(order_items.quantity)`), safe payment method code/label, and `latestOperationalAt`. The latter is the maximum of order/payment/shipments/refunds/notes update or creation timestamps represented by the row, computed over the bounded page; it is informational and never used as a pagination key. No address, phone, recipient name, operation code, proof URL, refund external reference, note body, catalog cost, or customer profile lookup is in the list DTO. Multiple shipments must not be silently collapsed to an arbitrary first row.

## 8. Search semantics

One `q` parameter, trimmed and control/format-character rejected, at most 255 characters. An input containing `@` is an exact, case-insensitive purchase-time `orders.customer_email` lookup after syntactic email validation; no partial email search. Otherwise it is an uppercase order-number prefix of 4–30 `[A-Z0-9-]` characters, anchored at the beginning; a complete number is therefore an exact match as well. The current generator emits `GP-` plus eight alphanumerics, but the schema permits historical values up to 30 characters. SQL uses bound parameters and escapes `%`, `_`, and backslash before a literal prefix comparison; wildcard input is rejected, never interpreted. No name, phone, transaction identifier, payment operation code, or external reference search. No global customer lookup, auto-suggestion, client-side corpus, or public search endpoint. Guard before query; generic unavailable responses for nonstaff; apply bounded pagination even for an exact email.

## 9. Filter semantics

URL parameters are single-valued `orderStatus`, `paymentStatus`, `shipmentStatus`, `from`, `to`. Status values are only the physical enums: order `PENDING`, `CONFIRMED`, `PROCESSING`, `FULFILLED`, `CANCELLED`, `EXPIRED`, `REFUNDED`; payment `UNPAID`, `SUBMITTED`, `VERIFYING`, `PAID`, `REJECTED`, `REFUNDED`; shipment `UNFULFILLED`, `READY_TO_PACK`, `PACKED`, `SHIPPED`, `DELIVERED`, `RETURNED`. A missing-payment or missing-shipment choice may be offered as the explicitly synthetic `NOT_RECORDED`, never passed as an enum. Shipment status matching means **any** shipment for the order has that state. `from` and `to` are both required together as valid `YYYY-MM-DD` Lima calendar dates, inclusive in UI and converted to a UTC half-open `[startOfFromLima, startOfDayAfterToLima)` predicate on `orders.created_at`; maximum inclusive span 366 days. No browser-local date interpretation. Empty filter = all history. Payment method, customer type, amount range, and refund presence are deferred: current customer FK cannot distinguish guest from deleted-profile history, and those filters lack a demonstrated operational/index need. Unknown, duplicate, contradictory, or oversized parameters produce a safe validation state, not an unbounded fallback query.

## 10. Pagination and sorting

Sort is immutable `orders.created_at DESC, orders.id DESC`. Server-side keyset pagination: 25 rows default, 50 hard maximum. An opaque versioned cursor contains the last `(createdAt,id)` and a digest of normalized search/filter/page-size parameters; malformed or cross-filter cursors are rejected. Next/previous navigation may maintain URL cursor history, not SQL `OFFSET` over all orders. Filter/search changes reset the cursor. URL parameters are the shareable source of truth; local client state owns only temporary form edits and in-flight feedback. Never transfer all historical orders to the browser; no unbounded total-count query is required.

## 11. Detail read model

Route: `/admin/orders/[orderNumber]`, with canonical order-number validation before lookup. The DTO contains order number/status/timestamps/cancellation reason, purchase-time email/phone/customer note, link-state, immutable item SKU/product/variant/price/quantity/line total, immutable delivery address and immutable pricing breakdown, payment method/status/amount/refunded amount (if present), read-only refund records (amount/reason/time), shipment set with status/courier/tracking/times, timeline page, and internal notes page. A missing required snapshot or payment is shown as `Datos de pedido no disponibles` for that section with an integrity warning; do not reconstruct financial or delivery truth from current catalog/profile or guess zero. Shipment tracking URL is rendered only after server URL validation to allowed `https:` destinations; never blindly trust stored text. No inventory ledger or private payment submission data is returned. Detail requires `orders:manage` before reading.

## 12. Snapshot and PII authority

| Field                                                       | Classification                   | Presentation                                                       |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Order number, statuses, monetary snapshots                  | Operationally required           | List/detail; integer cents and explicit currency                   |
| Purchase-time email                                         | Required for contact             | Mask local part on list; full on detail only                       |
| Purchase-time phone and delivery address/recipient          | Required for fulfillment/contact | Detail only; never list; no current profile substitution           |
| Customer checkout note                                      | Conditionally operational        | Detail only, text-only, not a staff note                           |
| Linked customer profile ID                                  | Internal join only               | Never render raw ID; null means not linked, not conclusively guest |
| Payment method/status and amounts                           | Required operational             | Read-only list/detail as specified                                 |
| Payment operation code, proof media/URL, verification notes | Hidden                           | GP-028 only                                                        |
| Refund external reference                                   | Hidden                           | Refund amount/reason/time may be read-only                         |
| Staff note body                                             | Internal operational             | Admin detail/timeline only                                         |

`SUPER_ADMIN` and `ADMIN_ORDERS` see the same GP-027 PII because both hold `orders:manage`; there is no invented role-specific redaction. Private responses use no public/ISR cache, no analytics payloads containing PII, no downloadable bulk export, and `no-store` semantics. Redaction/scrubbing must honor the future legally approved retention policy; CHK0 does not define one.

## 13. Timeline authority

Choose **B: a thin Admin-only projection** over canonical durable tables and allowlisted audit/outbox facts, reusing `OrderTimelineEntry` event meanings, not the mixed customer/guest `getOrderTimeline` as an Admin reader. The existing function requires a payment, synthesizes confirmation from mutable `orders.updatedAt`, reads only one shipment, and has no same-timestamp tie-break or notes. The Admin projection uses order creation for `ORDER_PLACED`, payment submission rows for `PAYMENT_SUBMITTED`, authoritative payment-approval audit/outbox only when GP-028 supplies one for `ORDER_CONFIRMED`, cancellation audit/`cancelledAt` for `ORDER_CANCELLED`, refund rows for `REFUND_ISSUED`, and **all** shipment rows' `shippedAt`/`deliveredAt` for `SHIPMENT_DISPATCHED`/`ORDER_DELIVERED`. Never fabricate historical confirmation or delivery from the current status/`updatedAt`. Dedupe overlapping audit/outbox/row evidence by the underlying business occurrence; do not expose raw JSON. Current status remains a separate snapshot, even if a historical event lacks durable evidence. Internal notes appear as `INTERNAL_NOTE`, visually and semantically distinct from lifecycle events and never added to the customer timeline type/surface.

Initial timeline page is the latest 50 source events, displayed ascending; a stable older-event cursor loads 50 more. Global order is `(timestamp ASC, event-precedence ASC, source-id ASC)` with fixed precedence `ORDER_PLACED`, `PAYMENT_SUBMITTED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `REFUND_ISSUED`, `SHIPMENT_DISPATCHED`, `ORDER_DELIVERED`, `INTERNAL_NOTE`. Same-instant order is presentation deterministic, not a claim about actual causality. Missing payment still permits order/shipment/refund/note events. Evidence conflict is an integrity warning, not a fabricated event.

## 14. Status-transition matrix

| Current OrderStatus | Physically possible next state and owner                                                                                                                        | Preconditions and effects                                                                                                                                                                                                                    | GP-027 action                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `PENDING`           | `CANCELLED` via GP-020 `cancelUnpaidOrder`; `EXPIRED` via inventory expiry; `CONFIRMED` or terminal-reject `CANCELLED` only via future GP-028 payment authority | Unpaid cancel needs `Payment.UNPAID`, no fulfillment, reservation release, audit/outbox, idempotency and ordered locks. Expiry needs due active reservation and releases stock. Approval/rejection must couple payment/inventory atomically. | Only unpaid cancellation; submitted/verifying is not cancelable here |
| `CONFIRMED`         | `REFUNDED` via GP-020 paid pre-shipment cancel/full refund; `PROCESSING` requires absent fulfillment service                                                    | Paid cancel needs `Payment.PAID`, no shipment progress, remaining refundable funds, allocation release, refund row, audit/outbox and ordered locks. Packing requires shipment state/stock service not implemented.                           | Only paid pre-shipment cancellation/refund                           |
| `PROCESSING`        | `FULFILLED` via future shipment-delivery authority; full `REFUNDED` is supported by GP-020 `recordRefund` subject to its own inventory/payment checks           | Never a raw order write; delivery needs shipment/commission lifecycle. Standalone refund is a different financial workflow.                                                                                                                  | Read-only                                                            |
| `FULFILLED`         | Full `REFUNDED` may be recorded by GP-020 after external settlement; physical return/restock remains separate                                                   | Preserve delivered history; never use cancel as return.                                                                                                                                                                                      | Read-only                                                            |
| `EXPIRED`           | Future GP-028 late-paid reallocation `CONFIRMED`, sold-out refund `REFUNDED`, or rejection `CANCELLED` per domain design                                        | Requires payment evidence and stock/financial adjudication absent today.                                                                                                                                                                     | Read-only                                                            |
| `CANCELLED`         | Terminal                                                                                                                                                        | Existing idempotent replay only; no reopening.                                                                                                                                                                                               | Read-only                                                            |
| `REFUNDED`          | Financial terminal                                                                                                                                              | Shipment history may continue to show delivered/returned; no reopening.                                                                                                                                                                      | Read-only                                                            |

The canonical domain diagram's broader transitions are design intent, not implemented GP-027 commands. Neither `OrderStatus` nor `ShipmentStatus` is client-selectable. All exposed actions use GP-020 precondition checks, idempotency, audit, and established advisory/payment/order/shipment/reservation/inventory lock order. The only status change created by a GP-027-owned mutation is **none**: note creation does not alter an order.

## 15. Existing mutation reuse matrix

| Service                                     | Existing authority and effects                                                                                                                                    | GP-027 disposition                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cancelUnpaidOrder`                         | Mixed owner/staff authority; locks payment/order/inventory; `PENDING + UNPAID -> CANCELLED`, releases reservation, audit `orders:cancel`, `OrderCancelled` outbox | Thin staff-only Admin action, calls service unchanged after `orders:manage` guard                                                                          |
| `cancelPaidPreShipmentAndRefund`            | Staff-only; `CONFIRMED + PAID + pre-shipment -> REFUNDED`, refund record, allocated-stock release, audit `orders:refund_and_cancel`, two outbox events            | Thin staff-only Admin action; require confirmation that external refund was completed, reason, and service-required attempt ID; no invented money transfer |
| `recordRefund`                              | Staff-only partial/full financial recording; may mark order/payment `REFUNDED` on full; audit `orders:refund`                                                     | Existing capability, **not surfaced** in GP-027; separate approved financial workflow needed                                                               |
| `applyTerminalPaymentRejectionConsequences` | Requires payment already `REJECTED`; releases verification hold and cancels order                                                                                 | GP-028 only; never called from GP-027                                                                                                                      |
| `expireUnpaidOrderReservations`             | System expiry and inventory release                                                                                                                               | Background/system only; read-only result in GP-027                                                                                                         |

Admin action wrappers may map safe errors and revalidate paths; they may not duplicate domain SQL, alter GP-020 idempotency fingerprints, or call the customer-facing Server Action. If a current service cannot be safely invoked through a staff-only wrapper in later implementation, stop that action for external review rather than weakening the service.

## 16. Notes persistence decision

No canonical staff order-note table exists. `orders.customerNotes` belongs to checkout, `shipments.notes` to shipment, and audit metadata is not editable operational note content. **SCHEMA CHANGE REQUIRED**: additive `order_notes` table in later GP-027 work. Columns: `id UUIDv7 PRIMARY KEY`, `order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT`, `author_auth_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL`, `body TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `mutation_request_id UUID NOT NULL UNIQUE`, `intent_fingerprint CHAR(64) NOT NULL`, `actor_binding_digest CHAR(64) NOT NULL`. Database checks enforce nonblank trimmed body and maximum 2,000 Unicode code points (or a demonstrably equivalent DB-enforceable bound); application validation also enforces the bound. Index `(order_id, created_at, id)` serves note/timeline pagination. No public read policy or customer API is added.

## 17. Notes lifecycle and idempotency

Internal-only, append-only: no edit or delete Admin operation. Trim outer whitespace, normalize CRLF/CR to LF, reject empty/whitespace-only, invisible/bidi/unsafe control characters (except normalized line breaks), and over 2,000 Unicode code points; preserve meaningful interior whitespace. Render as escaped text with line breaks, never HTML/Markdown execution. Notes may be entered on terminal orders for historical operational context, but cannot alter order/payment/fulfillment state. Retain with order operational history subject to a separately approved legal/privacy scrub policy.

Each browser intent creates a cryptographically random UUID `mutationRequestId`, retained across retries and lost-response recovery, regenerated only for a genuinely new note. The server computes `actor_binding_digest = SHA256("order_note_actor:" + verifiedAuthUserId)` and `intent_fingerprint = SHA256("order_note_intent:" + length-prefixed(orderId, actor_binding_digest, normalizedBody))`; these non-secret, domain-separated digests remain verifiable after server-secret rotation. The note body is already protected as Admin-only data. The server atomically inserts the unique request ID, note, and audit event. Same ID/same actor/same intent returns the original note (`replayed: true`) without a second audit row; same ID with changed order/body or different actor fails closed (`IDEMPOTENCY_CONFLICT` or indistinguishable non-disclosure for foreign actor). A unique constraint is the final race arbiter; reconcile a post-commit network ambiguity by rereading the durable note, not blind reinsertion. Raw request IDs do not appear in logs or audit metadata. If actor account is later deleted, `author_auth_user_id` becomes null but binding digest/audit preserves provenance; a deleted actor cannot authenticate to replay.

## 18. Audit semantics

Note creation appends `audit_events` **in the same transaction**: `actor_type=ADMIN`, `actor_id=verified auth user ID`, `action=orders:note_added`, `target_type=Order`, `target_id=order.id`, `metadata={noteId}` (no body, email, phone, or raw request ID), and `request_id=SHA256("order_note_request:" + mutationRequestId)` for deterministic safe correlation; IP is captured only through the existing trusted convention. A replay creates no new audit event. Existing GP-020 cancellation/refund actions preserve their own exact audit action, target, metadata, outbox, and transactional guarantees; wrapper must not add a contradictory lifecycle audit. Read-only list/detail/filters do not create business mutation audit rows. Never trust client actor identity.

## 19. Authorization matrix

| Actor                                                                | List/detail/timeline | Notes | Unpaid cancel | Paid pre-shipment cancel/refund | Payment verification |
| -------------------------------------------------------------------- | -------------------- | ----- | ------------- | ------------------------------- | -------------------- |
| `SUPER_ADMIN` with `orders:manage`                                   | Yes                  | Yes   | Yes           | Yes                             | Not in GP-027        |
| `ADMIN_ORDERS` with `orders:manage`                                  | Yes                  | Yes   | Yes           | Yes                             | Not in GP-027        |
| `ADMIN_CATALOG`, `ADMIN_SUPPORT`, `CUSTOMER`, guest, unauthenticated | No                   | No    | No            | No                              | No                   |

Enforce `orders:manage` in page/route, reader, every Server Action, and note mutation service. Direct Action invocation and stale role revocation fail closed. `orders:verify` grants no GP-027 access on its own, and is not a prerequisite for ordinary order management. Client navigation filtering is presentation only.

## 20. Navigation contract

After `/admin/orders` exists, is guarded, and has acceptance coverage, add `Pedidos` -> `/admin/orders`, `requiredPermission: "orders:manage"`, existing Lucide `ShoppingCart` icon. Do not add the destination in CHK0 or before the route is operational. Preserve GP-022 no-dead-link rule.

## 21. Money and currency

Per-row stored values are validated non-negative integer cents (`number` safe because PostgreSQL `INTEGER` range is below JavaScript safe-integer limit); no float business calculations or `/100` arithmetic to determine a mutation amount. SQL sums/counts become `bigint` server-side and are kept exact through formatting, following GP-023 dashboard patterns. Detail compares order/payment/pricing-snapshot currency explicitly; disagreement or unsupported currency yields an integrity/unavailable state, never silently formats as PEN or mixes totals. Presentation formats supported PEN integer cents in Peru locale; a non-PEN stored code is shown explicitly or fails closed for any money-dependent action. The paid cancellation passes the existing exact cent amount rules owned by GP-020; UI never supplies a computed refund total.

## 22. Empty, error, and non-disclosure rules

No orders: neutral empty state. Valid search with no result: distinct empty-results state with clear filters. Invalid/oversized filters or cursor: safe validation feedback, no fallback full-table query. Invalid/missing order number, deleted/unavailable order, or cross-order action: generic `Pedido no disponible` outside authorized reader; no data returned. Unauthorized direct routes: existing Admin auth/forbidden convention; reader/action fail closed before query. Database failure: sanitized retryable Admin error, no SQL/PII/stack. Mutation precondition failure: specific safe conflict and refresh invitation; no optimistic success. A lost response is resolved with the same mutation attempt ID; do not tell the operator to create a second financial operation. Stale detail after another Admin's change is visibly refreshed and action eligibility recomputed server-side.

## 23. Concurrency and stale state

The UI sends the displayed order/payment/shipment state only as an **expected-state hint**, never as authority. The wrapper rechecks eligibility; the GP-020 service's locked transaction is the decisive current-state check, with its existing idempotency attempt ID and lock order. No last-write-wins status dropdown. A stale or changed state becomes a conflict and refreshed detail; one concurrent winner only. The paid cancellation must explicitly warn that it records a completed external refund, not initiate a transfer. Notes are independent append-only mutations, protected by a unique request ID and transactional audit; simultaneous different intents create separate ordered notes, duplicate intent creates one. Cross-order reuse of an attempt ID conflicts without data leakage.

## 24. Query and performance plan

Dedicated `server-only` modules under `src/lib/admin/orders/`: `reader`, `types`, `validation`, `actions`/thin mutation orchestration, plus a note service. Guard before SQL. Page IDs are selected with indexed keyset predicate and `EXISTS` payment/shipment filters to avoid multiplicative joins; a fixed number of batched queries projects ≤50 rows with item-unit counts, payment, shipment summary, refunds/notes maxima. Detail loads one order then related snapshots/items/payment/refunds/shipments in a fixed query budget; no catalog/profile N+1. Timeline loads bounded source windows and merges in memory deterministically. Existing indexes cover order number unique lookup, payment by unique order ID, item/refund/shipment by order ID, and audit target/time. The later migration must include `order_notes(order_id,created_at,id)` and unique request ID. The default keyset access path justifies an `orders(created_at DESC,id DESC)` index; the `lower(customer_email)` equality search justifies a functional `(lower(customer_email),created_at DESC,id DESC)` index; prefix search needs a pattern-operator index on `order_number` if the existing unique B-tree cannot support anchored prefix under the deployed collation. CHK1 must inspect `EXPLAIN (ANALYZE, BUFFERS)` on seeded local PostgreSQL before retaining candidate non-note indexes; do not add speculative payment/shipment composites without measured need. No index or migration is applied in CHK0.

## 25. Schema verdict

**SCHEMA CHANGE REQUIRED** solely for durable internal order notes and query indexes justified by the frozen read plan. The existing `audit_events` JSONB, `orders.customerNotes`, and `shipments.notes` cannot meet append-only staff-note identity, history, replay, and privacy requirements. No status enum, payment, order snapshot, RBAC permission, or existing GP-020 table needs a semantic change. Database constraints and FK deletion behavior in §16 are part of the later implementation contract.

## 26. Migration verdict

**Migration 0015 required after external CHK0 approval**, generated through the canonical Drizzle workflow with deliberate review of any custom checks/index opclasses. Migrations `0000`–`0014` remain untouched. GP-027 CHK0 creates no schema file, SQL, migration metadata, hosted deployment, or manual DDL. A later hosted migration requires its own explicit gate; local implementation success does not imply hosted deployment.

## 27. Cache and revalidation

Admin order list/detail are dynamic private server reads with `no-store`; no public cache/ISR, no customer data in CDN or browser storage. After note/cancellation success or replay, refresh `/admin/orders` and the affected `/admin/orders/[orderNumber]` only as appropriate; cancel actions also revalidate existing customer order/confirmation paths using the established GP-020 route conventions, without redesigning those screens. A failed/ambiguous action must not optimistically mark state or clear the attempt ID. `router.refresh()` supplements, never replaces, server authority.

## 28. Responsive and accessibility requirements

Follow the approved Gamer Perú Admin design language. Desktop list may use a semantic table; narrow screens use a genuinely readable card/stacked layout, not clipped columns. Filter/search controls have labels and clear applied-state summary; status is text plus color, never color alone. Pagination, note submit, and destructive/financial confirmations are keyboard-operable, focus-managed, screen-reader-announced, and maintain focus after update. Validate visible Lima time zone and currency. Loading, empty, denied, error, conflict, and replay states are accessible. Reduced-motion preferences respected; no animation required for correctness. Axe checks must have zero violations.

## 29. Security threat model

| Threat                                                      | Frozen control                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unauthenticated/customer/wrong-staff direct route or Action | Server `orders:manage` at each boundary, no client trust                                                           |
| Manipulated order number/cross-order note or cancel         | Parse canonical identifier; resolve order server-side; bind note/request to resolved order; generic non-disclosure |
| SQL wildcard/search abuse or huge URL                       | Strict query grammar/length, bound SQL, escaped anchored prefix, page ≤50                                          |
| PII overexposure and existence oracle                       | Minimum list DTO, private detail guard, no public cache/log/analytics, uniform forbidden/not-found boundary        |
| Forged status or raw status write                           | Eligibility hint only; GP-020 locked service; no generic update                                                    |
| Duplicate, stale, or lost-response mutation                 | Durable attempt IDs, same-intent replay, changed-intent conflict, locked preconditions                             |
| Payment-verification scope creep                            | No proof/code/reviewer data or `orders:verify` action; GP-028 firewall                                             |
| Internal note disclosure/injection                          | Admin-only reader, text-only escaped rendering, length/control validation, no storefront projection                |
| Financial overflow/precision loss                           | Integer cents, safe-range checks, bigint aggregates, currency integrity guard                                      |
| Client-provided actor identity                              | Verified server auth only; audit actor derived server-side                                                         |

## 30. Testing strategy for later checkpoints

Unit: URL validation (including duplicate/oversized/wildcard input), Lima date boundaries, search classification/escaping, cursor binding, DTO redaction, money/currency formatting, status eligibility, note normalization, and permission mapping. Local PostgreSQL integration: list/filter combinations and deterministic paging under equal timestamps; immutable item/address/pricing fidelity; missing-payment/no-shipment/multiple-shipment behavior; timeline stable ties, source dedupe and no fabricated confirmation; note first commit/replay/conflict/concurrency/rollback/audit and actor deletion; GP-020 cancellation reuse with stale, unauthorized, duplicate, inventory, outbox, and refund invariants. Admin E2E: nav visibility, direct forbidden routes, list/search/filter/page/detail/timeline/notes, permitted cancellation/refund and forbidden transitions, lost-response retry, keyboard/mobile and axe. Regression: GP-020 lifecycle, GP-022 RBAC/nav, GP-023 dashboard metrics, GP-026 Admin shell, and canonical storefront E2E. Every implementation checkpoint must run applicable `pnpm check` and `pnpm test:e2e` with zero warnings before completion claims; CHK0 docs-only needs format/diff/status checks. GitHub Actions conclusions are reported only when a runner executes.

## 31. Frozen checkpoint plan

1. **CHK0** — this discovery/contract candidate; external approval required before implementation.
2. **CHK1** — additive migration 0015, guarded server-only list/detail/timeline readers, note persistence/idempotency/audit service, thin cancellation wrappers, local PostgreSQL tests. No UI/nav until these boundaries pass.
3. **CHK2** — `/admin/orders` list/search/filter/keyset UI, then guarded `Pedidos` navigation and list E2E.
4. **CHK3** — detail/timeline/notes and only the two approved GP-020 action UIs, with explicit confirmation/conflict UX and focused integration/E2E.
5. **CHK4** — integrated security, responsive, accessibility, query-plan/performance and cross-GP regression hardening.
6. **CHK5** — full canonical validation, closure report candidate, external approval, and separately authorized integration/hosted migration steps. No automatic main merge from this CHK0.

## 32. Out of scope

GP-028 payment verification/proof queue/operation-code access; new fulfillment or return/RMA engine; generic manual status setter; standalone refund workbench; customer/guest order UI redesign; bulk exports; order deletion; mutable staff notes; hosted migrations; new permissions; catalogue/profile-derived purchase history; public AI/order tooling; EC OS integration. Existing customer routes are touched later only for cache revalidation required by a canonical mutation.

## 33. Open questions resolved

The roadmap word **status** means eligibility-driven exposure of two existing GP-020 actions, not arbitrary status editing. Staff notes need a new append-only table, not audit JSON. A null customer FK is **not** proof of original guest checkout after account deletion. The timeline cannot directly reuse the mixed owner/guest resolver; the Admin projection preserves event meanings and does not invent missing historical events. Partial refund recording exists but is excluded from this GP's UI. Shipping/processing statuses are visible but not writable until a safe fulfillment service is approved. GP-028 owns all payment review, including terminal rejection. These are decisions, not unresolved implementation liberties.

## 34. External approval gate

This candidate is not an implementation authorization until the external architect approves the exact contract, particularly the two surfaced GP-020 actions, additive note schema/idempotency, timeline evidence rules, and query/index plan. Any material deviation or newly discovered conflict requires a reviewed contract amendment/ADR before code. CHK0 may be published for external verification, but cannot be called closed, GP-027 implemented, or GP-028 started. CI remains factual: no runner success is inferred from a pushed documentation branch.
