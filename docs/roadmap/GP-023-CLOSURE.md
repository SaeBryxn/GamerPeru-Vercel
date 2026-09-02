# GP-023 — Admin Dashboard: Closure Report

## Status

CLOSED / EXTERNALLY APPROVED

---

## 1. Objective & Scope

GP-023 implements the authoritative, production-grade Admin Dashboard for Gamer Perú. It replaces the GP-022 landing placeholder with live, real-time metrics across 5 operational domains:

1. **Resumen Financiero (Financial Cohort Realization)**
2. **Flujo de Pedidos (Order Pipeline Lifecycle)**
3. **Verificación de Pagos Manuales (Manual Payment Verification & Refunds)**
4. **Resumen de Catálogo (Catalog Distribution & Variants)**
5. **Resumen de Inventario (Physical Inventory Balances & Critical Stock Alerts)**

All dashboard metrics are aggregate-only, read-only, and backed directly by canonical PostgreSQL schemas with zero client-side computation, zero fake numbers, and zero mutation workflows.

---

## 2. Gate Progression & Approved Commit SHAs

| Gate     | Description                                      | Approved SHA                               | Status                       |
| :------- | :----------------------------------------------- | :----------------------------------------- | :--------------------------- |
| **CHK0** | Metric Contract & Source of Truth Specification  | `a8e171827eb5543f35e8dd2d64cd5791ffa7cb5a` | EXTERNALLY APPROVED / FROZEN |
| **CHK1** | Reader Layer, Aggregations & Live DB Integration | `639fe78b9ed656e12bf8a216021e7f309d16eb68` | EXTERNALLY APPROVED / FROZEN |
| **CHK2** | Visual Presentation, Responsive UX & Axe Audits  | `9b55d5b8f9b340bd692d8c5d4d3b61874ebd4c4a` | EXTERNALLY APPROVED / FROZEN |
| **CHK3** | Final Integrated Validation & Closure Candidate  | `f1e911b020e6f670f351bad96f4111e7a8c613b0` | EXTERNALLY APPROVED / FROZEN |

### Canonical Gate Commit Identification

- **CHK0 Final Approval**: `a8e171827eb5543f35e8dd2d64cd5791ffa7cb5a` (_"docs(roadmap): define deterministic AOV rounding, fail-closed currency integrity, and physical payment cardinality (CHK0-BR5)"_)
- **CHK1 Final Approval**: `639fe78b9ed656e12bf8a216021e7f309d16eb68` (_"fix(admin): preserve exact monetary bigint and isolate test fixtures (GP-023 CHK1-BR1)"_)
- **CHK2 Final Approval**: `9b55d5b8f9b340bd692d8c5d4d3b61874ebd4c4a` (_"fix(admin): repair dashboard css module contracts and visual regression coverage (GP-023 CHK2-BR3)"_)
- **CHK3 Final Approval**: `f1e911b020e6f670f351bad96f4111e7a8c613b0` (_"docs(roadmap): correct GP-023 closure evidence and canonical SHAs (CHK3-BR1)"_)

---

## 3. Canonical Authorization Matrix

Access to the Admin Shell and individual dashboard sections is strictly enforced server-side via canonical RBAC permissions:

| Dashboard Surface        | Required Permission                   | SUPER_ADMIN | ADMIN_ORDERS | ADMIN_CATALOG | ADMIN_SUPPORT |     CUSTOMER     |
| :----------------------- | :------------------------------------ | :---------: | :----------: | :-----------: | :-----------: | :--------------: |
| **Admin Shell Entry**    | Any valid staff role                  |   Granted   |   Granted    |    Granted    |    Granted    | **Denied (403)** |
| **Financial Cohort**     | `orders:manage` OR `orders:verify`    |   Visible   |   Visible    |    Hidden     |    Hidden     |      Hidden      |
| **Order Pipeline**       | `orders:manage`                       |   Visible   |   Visible    |    Hidden     |    Hidden     |      Hidden      |
| **Payment Verification** | `orders:verify`                       |   Visible   |   Visible    |    Hidden     |    Hidden     |      Hidden      |
| **Catalog Overview**     | `catalog:manage` OR `catalog:publish` |   Visible   |    Hidden    |    Visible    |    Hidden     |      Hidden      |
| **Inventory Overview**   | `inventory:manage`                    |   Visible   |    Hidden    |    Hidden     |    Hidden     |      Hidden      |

_Note: `admin:orders:read` does not exist in the canonical codebase and is not used or claimed._

---

## 4. Authoritative Metric Semantics & Invariants

### A. Financial Cohort Realization (Strategy A)

- **Anchor**: `orders.created_at` within the selected temporal window.
- **Labels**: Truthful cohort realization wording (_"Valor neto de pedidos"_, _"Valor bruto confirmado"_, _"Pedidos pagados"_, _"Ticket promedio"_). Explanatory caption: _"Pedidos creados en el período seleccionado, según su estado de pago actual."_
- **Exact-Money Invariant**: All monetary values are maintained strictly in integer cents using `bigint` through aggregation, reader payload, and presentation formatting (`src/lib/admin/dashboard-format.ts`). Zero `Number(bigint)` conversion or floating-point arithmetic is permitted.
- **AOV Exact Integer Round Half Up Implementation**: Average Order Value is computed using integer division with exact non-negative ROUND HALF UP scaling (`src/lib/admin/dashboard-metrics.ts`):
  ```typescript
  if (cohortActivePaidOrders <= 0n || cohortNetCents <= 0n) {
    return 0n;
  }
  const halfDenominator = cohortActivePaidOrders / 2n;
  const aovCents = (cohortNetCents + halfDenominator) / cohortActivePaidOrders;
  ```
  Canonical examples:
  - `100n / 3n => 33n`
  - `101n / 2n => 51n`
  - `100n / 2n => 50n`
  - `1n / 2n => 1n`
  - `denominator 0n => 0n`
- **Fail-Closed Currency Invariant**: If any multi-currency or non-PEN transaction is detected within the cohort population, the financial reader enters `status: "UNAVAILABLE"` with error `"CURRENCY_INTEGRITY_ERROR"`, displaying a sanitized explanation without rendering `S/ 0.00` or mixed-currency totals.

### B. Payment Verification & Refunds

- **Snapshot vs Period Separation**: The unverified queue (_"Por verificar ahora"_) is a live instantaneous snapshot of all payments in `SUBMITTED` or `VERIFYING` state across all time. Submission attempts and distinct payments submitted are bounded strictly by `payment_submissions.submitted_at` within the selected period.
- **Partial Unavailability Resilience**: If monetary amounts experience currency integrity failures, queue and refund counts remain displayed while monetary outflows display _"No disponible"_ instead of `S/ 0.00`.

### C. Order Pipeline

- **Missing-Payment Resilience**: Orders without payment records are included in the total created orders count without distortion.
- **Canonical 7-State Distribution**: `PENDING`, `CONFIRMED`, `PROCESSING`, `FULFILLED`, `CANCELLED`, `EXPIRED`, `REFUNDED`.

### D. Catalog & Inventory

- **Catalog Metrics Actually Rendered**: `publishedProducts` (_"Productos publicados"_), `draftProducts` (_"Productos en borrador"_), `activeSellableSkus` (_"SKUs vendibles activos"_), `totalActiveVariants` (_"De X variantes activas"_), and `publishedProductsWithoutSkus` (_"Publicados sin SKU activo"_). `archivedProducts` exists in the payload but is not visually rendered.
- **Sellable SKU Definition**: Product is `PUBLISHED` AND Variant is `ACTIVE`.
- **Inventory Units & ATS**: Global Available To Sell (ATS) is aggregated across all physical locations before SKU out-of-stock classification.
- **Low-Stock Position Truthfulness**: Low-stock alerts track variant-location physical positions below safety reorder points and are truthfully labeled _"Posiciones con stock bajo"_ (not _"SKUs con stock bajo"_).

---

## 5. Visual Architecture, Responsiveness & Accessibility

- **CSS Module Contracts**: Deterministically validated via `tests/unit/admin-dashboard-css-contract.test.ts` verifying that: (1) all statically referenced dashboard `styles.foo` selectors resolve to selectors defined in their imported CSS Modules; (2) expected dynamic Order status selectors exist; (3) expected dynamic trend direction selectors exist; and (4) specifically obsolete Inventory and Payment selectors removed during CHK2-BR3 do not remain.
- **WCAG 2.1 AA Accessibility**: 0 violations reported by automated Axe audits on `/admin`. All foreground/background color combinations satisfy minimum contrast ratios `>= 4.5:1` in both light and dark color schemes.
- **Responsive Viewport Matrix**: Zero horizontal overflow verified across 8 viewports (320px, 360px, 375px, 480px, 768px, 1024px, 1440px, 1920px).
- **Keyboard Navigation**: Skip links (`#admin-main-content`) and focus traps in mobile navigation drawers operate seamlessly.

---

## 6. Verification & Quality Gates Summary

- **Unit Test Suite (`pnpm test`)**: 88 test files passed (88/88); 1,094 tests passed, 1 skipped, 0 failed (1,095 total).
- **Admin Live Integration Suite (`pnpm test:admin:live`)**: 2 test files passed (2/2); 25 scenarios passed (25/25), 0 skipped, 0 failed against real PostgreSQL.
- **Admin Playwright E2E Suite (`pnpm test:admin:e2e`)**: 15 tests passed (15/15), 0 failed covering RBAC matrix, period switching, Axe audits, and desktop/mobile layout structure.
- **Storefront & Platform E2E Suite (`pnpm test:e2e`)**: 142 tests passed (142/142), 0 failed.
- **Production Build (`pnpm build`)**: Compiled successfully with Next.js Turbopack with 0 errors.
- **Code Quality (`format:check`, `typecheck`, `lint`)**: All quality commands passed cleanly (`--max-warnings=0`).
- **CI Output & Log Characterization**: Format, typecheck, and lint passed; production build completed successfully with zero compile errors. CI emitted only non-material runner/test/dev-server informational or warning output (e.g., pnpm runner layout notices, Next.js LCP image hints, expected application WARN/ERROR log events in negative tests, transient dev-server ECONNRESET on worker teardown), with no failing gate.
- **Database Migration Safety**: Migration 0012 blob hash matches `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119`; zero migration 0013 files exist.
- **Hosted Infrastructure Safety**: Hosted Supabase and Cloudflare R2 remained 100% untouched throughout GP-023 execution.
- **GP-024 Isolation**: Zero GP-024 implementation work has been started.
