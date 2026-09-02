# GP-023 — Admin Dashboard Metric Contract, Authorization & Source-of-Truth Specification

## Status

**METRIC CONTRACT PENDING EXTERNAL APPROVAL (IN DISCOVERY — CHK0)**

---

## 1. Canonical Sources Reviewed

The architectural and domain specifications reviewed for this contract include:

- **`AGENTS.md`**: Canonical engineering standards, Peru-first commerce, RBAC authorization, integer minor-unit money invariants, and zero false dashboard claims.
- **`docs/roadmap/GP-023.md`**: Authoritative scope defining headline KPI widgets (Revenue, Orders, AOV, Trends, Products, Stock, Payment, Fulfillment) and excluding full BI.
- **`docs/roadmap/GP-022.md` & `GP-022-CLOSURE.md`**: Established Admin Shell layout, server-side RBAC session resolution, and fail-closed security guards.
- **Drizzle PostgreSQL Schema**:
  - `orders` (`src/db/schema/orders/orders.ts`, `enums.ts`)
  - `payments`, `payment_submissions`, `refunds` (`src/db/schema/payments/`)
  - `inventory_items`, `inventory_reservations`, `inventory_locations` (`src/db/schema/inventory/`)
  - `products`, `product_variants`, `brands`, `categories` (`src/db/schema/catalog/`)
  - `roles`, `permissions`, `role_permissions`, `user_roles` (`src/db/schema/identity/`)
- **Domain Libraries**:
  - `src/lib/auth/rbac.ts` (Verified Auth Context & Permission resolution)
  - `src/lib/orders/`, `src/lib/payments/`, `src/lib/inventory/`
- **Migration Lineage**:
  - Migrations `0000` through `0012` (Migration 0012 blob `e80c30ae9d0f86e14486b0fd5c782eb9ec3f7119`). Zero migration `0013`.

---

## 2. Existing Physical Schema Summary Relevant to Dashboard

| Entity Table                 | Primary Key   | Key Columns / Enums Relevant to Dashboard                                                                                                                                                                                                 | Canonical Invariants                                                                                                                              |
| :--------------------------- | :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`orders`**                 | `id` (UUIDv7) | `order_number`, `customer_id` (nullable), `status` (`PENDING`, `CONFIRMED`, `PROCESSING`, `FULFILLED`, `CANCELLED`, `EXPIRED`, `REFUNDED`), `subtotal_cents`, `discount_cents`, `shipping_cents`, `total_cents`, `currency`, `created_at` | `total_cents = subtotal_cents - discount_cents + shipping_cents`. All money $\ge 0$. `customer_id` is null for guest checkouts.                   |
| **`payments`**               | `id` (UUIDv7) | `order_id` (UNIQUE), `payment_method_code`, `amount_cents`, `refunded_amount_cents`, `currency`, `status` (`UNPAID`, `SUBMITTED`, `VERIFYING`, `PAID`, `REJECTED`, `REFUNDED`), `created_at`                                              | Exactly 1 payment row per order. `refunded_amount_cents <= amount_cents`. `status = 'PAID'` represents verified collected bank funds.             |
| **`payment_submissions`**    | `id` (UUIDv7) | `payment_id`, `attempt_number`, `operation_code`, `proof_media_id`, `is_late`, `submitted_at`                                                                                                                                             | Append-only proof attempts submitted by customer for manual Yape/Plin verification.                                                               |
| **`refunds`**                | `id` (UUIDv7) | `order_id`, `payment_id`, `amount_cents`, `reason`, `actor_auth_user_id`, `created_at`                                                                                                                                                    | Immutable reimbursement record. `amount_cents > 0`.                                                                                               |
| **`inventory_items`**        | `id` (UUIDv7) | `variant_id`, `location_id`, `quantity_on_hand`, `quantity_reserved`, `quantity_allocated`, `reorder_point`, `updated_at`                                                                                                                 | `available_to_sell = quantity_on_hand - quantity_reserved - quantity_allocated`. All balances $\ge 0$. `reorder_point` is the low-stock boundary. |
| **`inventory_reservations`** | `id` (UUIDv7) | `order_id`, `status` (`ACTIVE`, `VERIFICATION_HOLD`, `ALLOCATED`, `CONSUMED`, `RELEASED`), `expires_at`, `created_at`                                                                                                                     | Stock hold during unpaid window (`ACTIVE`), paused during verification (`VERIFICATION_HOLD`), confirmed upon payment (`ALLOCATED`).               |
| **`products`**               | `id` (UUIDv7) | `brand_id`, `category_id`, `name`, `slug`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `is_featured`, `created_at`                                                                                                                       | Aggregate catalog root.                                                                                                                           |
| **`product_variants`**       | `id` (UUIDv7) | `product_id`, `sku`, `title`, `price_cents`, `compare_at_price_cents`, `cost_cents`, `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`), `created_at`                                                                                            | Sellable physical SKUs. `price_cents > 0`.                                                                                                        |

---

## 3. Dashboard Authorization Matrix

Authorization is derived strictly from PostgreSQL `role_permissions` via `getVerifiedAuthContext()`. There is **zero hardcoded `SUPER_ADMIN` bypass**. Every widget boundary checks canonical permissions server-side.

| Dashboard Section / Metric Widget                                                                                                                      | Required Permission                   | Authorized Staff Roles               | Unauthorized Roles Behavior                                                                                                                                                        |
| :----------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Financial KPIs**<br>• Net Recognized Revenue<br>• Gross Sales / Paid Total<br>• Average Order Value (AOV)<br>• Revenue Trend & Comparison            | `orders:manage` OR `orders:verify`    | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed / Redacted**: Widget is not rendered, and financial metrics are excluded from server JSON payload. `ADMIN_CATALOG` and `ADMIN_SUPPORT` cannot view financial totals. |
| **Order Pipeline & Volume**<br>• Headline Order Volume<br>• Order Status Breakdown<br>• Fulfillment Preparation Status                                 | `orders:manage`                       | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed**: Excluded from payload.                                                                                                                                            |
| **Payment Verification Overview**<br>• Pending Review Queue Count<br>• Verification Queue Amount<br>• Yape / Plin Status Breakdown                     | `orders:verify`                       | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed**: Excluded from payload.                                                                                                                                            |
| **Catalog Overview**<br>• Published / Draft Products<br>• Active Sellable SKUs<br>• Catalog Integrity Warnings                                         | `catalog:manage` OR `catalog:publish` | • `SUPER_ADMIN`<br>• `ADMIN_CATALOG` | **Fail-Closed**: Excluded from payload.                                                                                                                                            |
| **Inventory / Stock Health**<br>• Total Units On-Hand / Reserved / ATS<br>• Low-Stock Count (ATS $\le$ Reorder Point)<br>• Out-of-Stock SKUs (ATS = 0) | `inventory:manage`                    | • `SUPER_ADMIN`                      | **Fail-Closed**: Excluded from payload.                                                                                                                                            |
| **Storefront Customer Access**                                                                                                                         | `CUSTOMER` (0 permissions)            | None                                 | **Denied**: Redirected to `/auth/login` or rendered with 403 Forbidden Admin Shell layout.                                                                                         |

---

## 4. Revenue Definition

### A. Core Distinction

In GamerPeru's manual Yape/Plin and e-commerce model, creating an order does **NOT** equal money received. Therefore:

1. **Unpaid Orders** (`status = 'PENDING'`, `'EXPIRED'`, `'CANCELLED'`) **CANNOT** be counted as recognized revenue.
2. **Pending Submissions** (`payments.status \in ('SUBMITTED', 'VERIFYING')`) represent customer claims awaiting staff bank verification; they are classified as **"En Verificación" (In-Flight / Unverified)** and **excluded from Net Revenue**.
3. **Recognized Revenue** requires verified bank funds: `payments.status = 'PAID'` (which corresponds to order status `CONFIRMED`, `PROCESSING`, or `FULFILLED`).

### B. Mathematical Formulas

#### 1. Gross Paid Revenue ($R_{\text{gross}}$)

Sum of all verified customer payments received within the reporting window $[T_{\text{start}}, T_{\text{end}})$:
$$R_{\text{gross}} = \sum \text{payments.amount\_cents} \quad \text{WHERE } \text{payments.status} = \text{'PAID'} \text{ AND } \text{payments.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

#### 2. Net Recognized Revenue ($R_{\text{net}}$)

Gross verified revenue minus total refunds issued against those payments:
$$R_{\text{net}} = \sum (\text{payments.amount\_cents} - \text{payments.refunded\_amount\_cents}) \quad \text{WHERE } \text{payments.status} \in (\text{'PAID'}, \text{'REFUNDED'}) \text{ AND } \text{payments.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

#### 3. Pending Verification Total ($R_{\text{pending}}$)

Funds claimed by customers in manual submissions awaiting staff confirmation:
$$R_{\text{pending}} = \sum \text{payments.amount\_cents} \quad \text{WHERE } \text{payments.status} \in (\text{'SUBMITTED'}, \text{'VERIFYING'}) \text{ AND } \text{payments.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

#### 4. Total Refunds Issued ($R_{\text{refunds}}$)

$$R_{\text{refunds}} = \sum \text{refunds.amount\_cents} \quad \text{WHERE } \text{refunds.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

---

## 5. Orders Definition

### A. Headline Order Volume ($N_{\text{orders}}$)

Total distinct order records created within the reporting window $[T_{\text{start}}, T_{\text{end}})$:
$$N_{\text{total\_created}} = \text{COUNT}(\text{orders.id}) \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

### B. Paid / Realized Orders ($N_{\text{paid}}$)

Distinct orders that have successfully reached paid confirmation:
$$N_{\text{paid}} = \text{COUNT}(\text{orders.id}) \quad \text{WHERE } \text{orders.status} \in (\text{'CONFIRMED'}, \text{'PROCESSING'}, \text{'FULFILLED'}) \text{ AND } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

### C. Status Breakdown

The dashboard must provide an operational count breakdown across all 7 canonical statuses:

- `PENDING`: Checkout created, awaiting customer payment or voucher submission.
- `CONFIRMED`: Payment verified and funds receipt approved by staff.
- `PROCESSING`: Order assigned for warehouse picking and packing.
- `FULFILLED`: Order packed, dispatched, and marked completed.
- `CANCELLED`: Order cancelled by customer or staff before fulfillment.
- `EXPIRED`: Reservation TTL elapsed without payment submission.
- `REFUNDED`: Confirmed order returned/refunded.

### D. Guest vs Authenticated Orders

Both guest (`orders.customer_id IS NULL`) and authenticated (`orders.customer_id IS NOT NULL`) purchases represent legally binding commerce orders and are **both fully included** in all order metrics.

---

## 6. Average Order Value (AOV) Definition

### A. Canonical Formula

Average Order Value represents the average net monetary value realized per paid order:
$$\text{AOV} = \frac{R_{\text{net}} \text{ (in PEN cents)}}{N_{\text{paid}}}$$

### B. Zero-Denominator Handling

If $N_{\text{paid}} = 0$ (e.g. newly launched store, empty period, or zero paid orders in range):
$$\text{AOV} = 0 \text{ PEN (S/ 0.00)}$$

- **Rule**: Never evaluate division by zero. The application code must return `0` cents whenever $N_{\text{paid}} == 0$.

---

## 7. Trend & Comparison Semantics

### A. Comparison Window

For any selected reporting window $W_{\text{curr}} = [T_0, T_1)$ of duration $\Delta = T_1 - T_0$, the comparison window is the immediately preceding period of equal length:
$$W_{\text{prev}} = [T_0 - \Delta, T_0)$$

### B. Delta Formulas

For any metric $M$ with current value $V_{\text{curr}}$ and prior period value $V_{\text{prev}}$:

- **Absolute Delta**: $\Delta_{\text{abs}} = V_{\text{curr}} - V_{\text{prev}}$
- **Percentage Delta**:
  $$ \Delta_{%} = \begin{cases}
  \left( \frac{V_{\text{curr}} - V_{\text{prev}}}{V_{\text{prev}}} \right) \times 100 & \text{if } V_{\text{prev}} > 0 \\
  +100\% \text{ (New Baseline)} & \text{if } V_{\text{prev}} = 0 \text{ and } V_{\text{curr}} > 0 \\
  0\% & \text{if } V_{\text{prev}} = 0 \text{ and } V_{\text{curr}} = 0
  \end{cases}$$

  $$
- **Safety Invariant**: Zero dividing by zero. Never display `Infinity%` or `NaN%`.

---

## 8. Product & Catalog Overview Definitions

Available from active PostgreSQL catalog schema without anticipating GP-024:

1. **Total Catalog Products**: $\text{COUNT}(\text{products.id})$.
2. **Published Products**: $\text{COUNT}(\text{products.id}) \text{ WHERE status} = \text{'PUBLISHED'}$.
3. **Draft Products**: $\text{COUNT}(\text{products.id}) \text{ WHERE status} = \text{'DRAFT'}$.
4. **Active Sellable SKUs**: $\text{COUNT}(\text{product\_variants.id}) \text{ WHERE status} = \text{'ACTIVE'}$.
5. **Catalog Gap Alert (Products with 0 Active SKUs)**: Count of `PUBLISHED` products that possess zero `ACTIVE` variant records.

---

## 9. Stock & Inventory Overview Definitions

Derived from the GP-021 canonical multi-balance inventory engine:

1. **Total On-Hand Units ($Q_{\text{on\_hand}}$)**: $\sum \text{inventory\_items.quantity\_on\_hand}$.
2. **Total Reserved Units ($Q_{\text{reserved}}$)**: $\sum \text{inventory\_items.quantity\_reserved}$ (holds during active checkout/verification).
3. **Total Allocated Units ($Q_{\text{allocated}}$)**: $\sum \text{inventory\_items.quantity\_allocated}$ (confirmed orders waiting for physical dispatch).
4. **Available-to-Sell Units ($Q_{\text{ATS}}$)**:
   $$Q_{\text{ATS}} = \sum (\text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated})$$
5. **Canonical Low-Stock Threshold**:
   - **Threshold Source**: `inventory_items.reorder_point` column (configured per SKU/location).
   - **Low-Stock Item Condition**: $(\text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}) \le \text{reorder\_point} \text{ AND } Q_{\text{ATS}} > 0$.
6. **Out-of-Stock SKU Count**:
   Count of `ACTIVE` variants where $\sum (\text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}) \le 0$.

---

## 10. Payment Overview Definitions (Manual Yape / Plin)

Derived from the GP-019 / GP-028 payment engine:

1. **Unpaid Orders (`UNPAID`)**: Orders created where customer has not yet submitted an operation code or voucher image.
2. **Pending Staff Verification Queue (`SUBMITTED` + `VERIFYING`)**: Customer submitted payment proof; awaiting staff audit in bank console.
3. **Verified Payments (`PAID`)**: Approved funds.
4. **Rejected Submissions (`REJECTED`)**: Invalid or mismatched payment submissions.
5. **Late Submissions (`is_late = true`)**: Proof submitted after reservation window expired.

---

## 11. Fulfillment Overview Definitions

Derived from the GP-018 / GP-027 order fulfillment engine:

1. **Ready to Pack (`CONFIRMED`)**: Payment verified; stock allocated; pending warehouse picking.
2. **In Preparation (`PROCESSING`)**: Warehouse staff actively packing parcel.
3. **Dispatched / Complete (`FULFILLED`)**: Parcel handed to courier with tracking reference.
4. **Closed / Cancelled (`CANCELLED` + `EXPIRED`)**: Unfulfilled or timed out.

---

## 12. Timezone & Temporal Contract

1. **Canonical Reporting Timezone**: **`America/Lima`** (UTC-5, Peru-First).
   - All relative period boundaries ("Hoy", "Últimos 7 días", "Últimos 30 días", "Este Mes") are calculated with respect to local calendar days in Lima (`America/Lima`), then converted to UTC ISO strings for PostgreSQL range queries.
2. **Period Boundaries**:
   - **Convention**: Half-open intervals $[T_{\text{start}}, T_{\text{end}})$:
     $$\text{timestamp} \ge T_{\text{start}} \quad \text{AND} \quad \text{timestamp} < T_{\text{end}}$$
   - **Hoy (Today)**: From `00:00:00.000` Lima time today to `23:59:59.999` (or next day `00:00:00.000`).
   - **Últimos 7 Días (Last 7 Days)**: Past 7 full 24-hour days plus elapsed time today.
   - **Últimos 30 Días (Last 30 Days)**: Past 30 full 24-hour days plus elapsed time today (Default View).
   - **Este Mes (Month to Date)**: From day 1 `00:00:00.000` of current month in Lima to now.
3. **Primary Timestamp Fields**:
   - Financial & Order creation: `orders.created_at`
   - Payment confirmation: `payments.updated_at` (when `status = 'PAID'`)
   - Proof submission: `payment_submissions.submitted_at`

---

## 13. Money & Currency Contract

1. **Storage Standard**: All monetary values are stored strictly as **integer minor units** (`integer` or `bigint` in PostgreSQL) representing **PEN cents** (1 PEN = 100 cents).
2. **Floating-Point Prohibition**: Zero floating-point arithmetic is allowed in database queries or server calculations.
3. **Currency Invariant**: All current transactions are denominated in `PEN` (`currency = 'PEN'`).
4. **Multi-Currency Policy**: If USD transactions are introduced in future GPs, they **MUST NOT be summed directly into PEN**. Currencies must remain grouped by currency code unless an explicit authoritative exchange rate table is introduced via an approved ADR.
5. **Display Formatting**:
   $$\text{Formatted} = \text{"S/ "} + (cents / 100).\text{toLocaleString}('es-PE', \{ \text{minimumFractionDigits}: 2, \text{maximumFractionDigits}: 2 \})$$

---

## 14. Database Source-of-Truth & Query Plan Matrix

| Dashboard Widget                 | Source Tables & Relations                               | SQL Aggregation Logic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Target Index                                                               | Performance Notes                                                                           |
| :------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Headline Revenue & Orders**    | `orders` $O$<br>`payments` $P$ (`ON P.order_id = O.id`) | `SELECT`<br>&nbsp;&nbsp;`COUNT(O.id) AS total_orders,`<br>&nbsp;&nbsp;`COUNT(O.id) FILTER (WHERE P.status = 'PAID') AS paid_orders,`<br>&nbsp;&nbsp;`COALESCE(SUM(P.amount_cents - P.refunded_amount_cents) FILTER (WHERE P.status IN ('PAID','REFUNDED')), 0) AS net_revenue_cents,`<br>&nbsp;&nbsp;`COALESCE(SUM(P.amount_cents) FILTER (WHERE P.status IN ('SUBMITTED','VERIFYING')), 0) AS pending_verification_cents`<br>`FROM orders O`<br>`JOIN payments P ON P.order_id = O.id`<br>`WHERE O.created_at >= $1 AND O.created_at < $2`                                                                                                                                                                                                                                                       | `orders_status_created_at_idx`<br>`payments_status_created_at_idx`         | 1 single-pass table scan over filtered index range. Computes all 4 headline KPIs in < 10ms. |
| **Order Status Breakdown**       | `orders` $O$                                            | `SELECT status, COUNT(*) AS count, SUM(total_cents) AS value_cents`<br>`FROM orders`<br>`WHERE created_at >= $1 AND created_at < $2`<br>`GROUP BY status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `orders_status_created_at_idx`                                             | Fast aggregated grouping.                                                                   |
| **Payment Verification Summary** | `payments` $P$                                          | `SELECT status, COUNT(*) AS count, SUM(amount_cents) AS total_cents`<br>`FROM payments`<br>`WHERE created_at >= $1 AND created_at < $2`<br>`GROUP BY status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `payments_status_created_at_idx`                                           | Direct grouping on indexed column.                                                          |
| **Catalog SKU Summary**          | `products` $PR$<br>`product_variants` $PV$              | `SELECT`<br>&nbsp;&nbsp;`COUNT(DISTINCT PR.id) AS total_products,`<br>&nbsp;&nbsp;`COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'PUBLISHED') AS published_products,`<br>&nbsp;&nbsp;`COUNT(PV.id) FILTER (WHERE PV.status = 'ACTIVE') AS active_variants`<br>`FROM products PR`<br>`LEFT JOIN product_variants PV ON PV.product_id = PR.id`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `products_status_featured_idx`<br>`product_variants_product_id_status_idx` | Sub-millisecond indexed scan.                                                               |
| **Inventory Health**             | `inventory_items` $II$<br>`product_variants` $PV$       | `SELECT`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_on_hand), 0) AS on_hand,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_reserved), 0) AS reserved,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_allocated), 0) AS allocated,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_on_hand - quantity_reserved - quantity_allocated), 0) AS available_to_sell,`<br>&nbsp;&nbsp;`COUNT(*) FILTER (WHERE (quantity_on_hand - quantity_reserved - quantity_allocated) <= reorder_point AND (quantity_on_hand - quantity_reserved - quantity_allocated) > 0) AS low_stock_skus,`<br>&nbsp;&nbsp;`COUNT(*) FILTER (WHERE (quantity_on_hand - quantity_reserved - quantity_allocated) <= 0) AS out_of_stock_skus`<br>`FROM inventory_items II`<br>`JOIN product_variants PV ON PV.id = II.variant_id`<br>`WHERE PV.status = 'ACTIVE'` | `inventory_items_variant_id_idx`                                           | Single pass aggregation.                                                                    |

---

## 15. Data Integrity & Edge-Case Matrix

| Scenario / Edge Case               | Expected System Behavior & Value                                                                                                  | Safety Invariant                                        |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ |
| **Completely Empty Database**      | All counts = `0`, Net Revenue = `S/ 0.00`, AOV = `S/ 0.00`, Stock = `0`. Clean zero-state display.                                | No runtime exceptions, no SQL null coalescence failure. |
| **Zero Orders in Selected Period** | Headline KPIs show `S/ 0.00` and `0 pedidos`. AOV returns `S/ 0.00`.                                                              | Never divide by zero.                                   |
| **Orders Created but 0 Paid**      | Total orders = $N$, Net Revenue = `S/ 0.00`, Paid Orders = `0`, AOV = `S/ 0.00`.                                                  | Prevents counting unpaid orders as sales.               |
| **Cancelled Orders**               | Counted in `CANCELLED` status breakdown, excluded from Net Revenue.                                                               | Cancelled value does not inflate revenue.               |
| **Unverified Payment Proofs**      | Aggregated into "En Verificación" queue count and monetary total. Excluded from Net Revenue.                                      | Staff knows funds are unconfirmed.                      |
| **Rejected Payment Proofs**        | Counted in `REJECTED` status; revenue = `0`.                                                                                      | Rejected fraud proofs ignored in sales.                 |
| **Partial / Full Refunds**         | `refunded_amount_cents` is subtracted from `amount_cents` in Net Revenue calculation.                                             | Net Revenue strictly reflects kept funds.               |
| **Previous Period = 0**            | Trend displays `+100% (Nuevo)` or `+S/ X.XX` without calculating $X / 0$.                                                         | No `Infinity%` or `NaN%`.                               |
| **Reserved Stock Holds**           | $Q_{\text{ATS}}$ formula strictly subtracts active holds ($Q_{\text{reserved}}$ and $Q_{\text{allocated}}$).                      | Prevents overselling and double counting.               |
| **Mixed Guest & User Orders**      | Both types aggregate seamlessly by order ID.                                                                                      | Guest sales are never dropped.                          |
| **Exact Boundary Timestamps**      | Evaluated via $[T_{\text{start}}, T_{\text{end}})$ half-open interval ($t \ge T_{\text{start}} \text{ AND } t < T_{\text{end}}$). | Zero double-counting across adjacent periods.           |
| **Unauthorized Staff Role**        | Section is withheld or rendered with clean access-restricted badge.                                                               | Zero data leakage in HTML or JSON.                      |
| **Storefront Customer Access**     | Blocked at `/admin` layout boundary with HTTP 403 Forbidden.                                                                      | Complete platform isolation.                            |

---

## 16. Visual Information Architecture (GP-023 Dashboard)

The dashboard integrates directly into the established **GP-022 Admin Shell** (`/admin`), preserving existing global sidebar navigation, mobile drawer, and brand aesthetic:

```
+-----------------------------------------------------------------------------------+
|  HEADER: Panel de Control Gamer Perú | Selector de Período [Hoy | 7D | 30D | Mes]   |
+-----------------------------------------------------------------------------------+
|  HEADLINE KPI CARDS (4-Column Grid Desktop / 2-Col Tablet / 1-Col Mobile)          |
|  [ S/ Ingresos Netos ]  [ Pedidos Pagados ]  [ Ticket Promedio ]  [ En Verificación ] |
|  (Trend vs Prev)        (Trend vs Prev)      (AOV)                (Yape/Plin Queue)  |
+-----------------------------------------------------------------------------------+
|  OPERATIONAL STATUS GRID (2-Column Grid)                                          |
|  +-------------------------------------+ +-------------------------------------+  |
|  | Verificación de Pagos Yape / Plin   | | Pipeline de Preparación y Envíos    |  |
|  | • Pendientes de Revisión: N (S/ X)  | | • Por Preparar (Confirmados): N     |  |
|  | • Pagos Aprobados: N                | | • En Preparación (Picking): N       |  |
|  | • Rechazados / Expirados: N         | | • Despachados / Entregados: N       |  |
|  +-------------------------------------+ +-------------------------------------+  |
+-----------------------------------------------------------------------------------+
|  CATALOG & INVENTORY HEALTH GRID (2-Column Grid)                                  |
|  +-------------------------------------+ +-------------------------------------+  |
|  | Resumen de Catálogo                 | | Salud de Inventario (Unidades)      |  |
|  | • Productos Publicados: N           | | • Unidades Disponibles (ATS): N     |  |
|  | • Productos en Borrador: N          | | • Unidades Reservadas: N            |  |
|  | • SKUs / Variantes Activas: N       | | • Alerta de Stock Bajo: N SKUs      |  |
|  +-------------------------------------+ +-------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Visual & Accessibility DoD:

- **Responsive Layout**: 12-column responsive grid (Desktop $\ge$ 1024px) $\to$ 2-column grid (Tablet 768px - 1023px) $\to$ 1-column stacked (Mobile < 768px, zero horizontal overflow at 360px).
- **Typography & Theme**: Built with Gamer Perú design tokens (`tokens.css`), dark mode aesthetic, high contrast ratios ($\ge 4.5:1$ text, $\ge 3.0:1$ UI components).
- **Accessibility**: Semantic HTML landmarks (`<header>`, `<section>`, `<article>`), descriptive `aria-label` tags on KPI cards, table/list data with proper screen reader context, keyboard navigable.
- **Motion**: Adheres to `prefers-reduced-motion: reduce` with instant state transitions.

---

## 17. Server, Cache & Freshness Contract

1. **Server-Side Execution**: All metric resolution executes strictly in Next.js Server Components (`src/app/admin/(protected)/page.tsx` and server data helpers in `src/lib/admin/`).
2. **Freshness Guarantee**: `export const dynamic = "force-dynamic"` is enforced. Every dashboard request queries PostgreSQL directly to ensure real-time financial accuracy.
3. **Zero Secret Leakage**: `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain strictly server-side. No database credentials or internal margins are exposed to browser bundles.
4. **Server Authorization Enforcement**: `getVerifiedAuthContext()` is executed before any query is dispatched. If unauthorized, execution short-circuits immediately.

---

## 18. Accessibility & Quality Requirements

- **WCAG 2.1 AA Compliance**: Full pass on automated Axe accessibility scans (`@axe-core/playwright`).
- **Screen Reader Clarity**: Numeric KPI values formatted with descriptive labels (e.g., `aria-label="Ingresos netos reconocidos: S/ 1,250.00"`).
- **No Reliance on Color Alone**: Status badges use text and distinct iconography alongside color tokens.

---

## 19. Performance & Index Observations

- **Current Index Sufficiency**:
  - `orders_status_created_at_idx` (`orders(status, created_at)`) $\to$ Fully covers range filtering and status aggregation.
  - `payments_status_created_at_idx` (`payments(status, created_at)`) $\to$ Fully covers payment aggregation.
  - `inventory_items_variant_id_idx` (`inventory_items(variant_id)`) $\to$ Fully covers inventory joins.
- **No Migration Required**: The existing indexes from migrations `0000` through `0012` are 100% sufficient for GP-023 dashboard queries. Zero database schema migrations (`0013`) are needed for GP-023.

---

## 20. GP-023 vs Later-GP Scope Boundary Matrix

| Feature / UI Surface                                               | Milestone Owner  | Allowed in GP-023? | Rationale                                                    |
| :----------------------------------------------------------------- | :--------------- | :----------------- | :----------------------------------------------------------- |
| **Headline KPI Summary & Financial Trends**                        | **GP-023**       | **YES**            | Core objective of Admin Dashboard overview.                  |
| **Payment Verification Queue Status (Read-Only)**                  | **GP-023**       | **YES**            | High-level operational count of pending proofs.              |
| **Interactive Payment Approval / Rejection Actions**               | **GP-028**       | **NO**             | Interactive queue and bank reconciliation belongs to GP-028. |
| **Fulfillment & Order Pipeline Counts (Read-Only)**                | **GP-023**       | **YES**            | High-level status breakdown.                                 |
| **Order Details / Tracking Number Updates / Cancellation Actions** | **GP-027**       | **NO**             | Order management mutations belong to GP-027.                 |
| **Catalog & SKU Overview Metrics (Read-Only)**                     | **GP-023**       | **YES**            | Product count and integrity summary.                         |
| **Product CRUD / Pricing / Specification Editor**                  | **GP-024**       | **NO**             | Product Manager UI belongs to GP-024.                        |
| **AI Catalog Research & Import Tooling**                           | **GP-025**       | **NO**             | Belongs to GP-025.                                           |
| **Product Story Modular Editor**                                   | **GP-026**       | **NO**             | Belongs to GP-026.                                           |
| **Inventory Multi-Location Receiving & Ledger Adjustments**        | **GP-029**       | **NO**             | Inventory receiving mutation UI belongs to GP-029.           |
| **Full BI / SQL Query Builder / Custom Report Exports**            | **Out of Scope** | **NO**             | Explicitly out of scope for Gamer Perú v1.2.                 |

---

## 21. Open Decisions & Clarifications

1. **Default Reporting Period**:
   - **Decision**: Default to `Últimos 30 días` (Last 30 days) with quick toggle options for `Hoy` (Today), `Últimos 7 días` (Last 7 days), and `Este Mes` (Month-to-Date).
2. **Catalog Integrity Alert**:
   - **Decision**: Display a non-blocking alert badge if any published product has zero active sellable SKUs.
3. **Multi-Currency Handling**:
   - **Decision**: All figures displayed strictly in `PEN (S/.)`. Mixed currency aggregation is forbidden.

---

## 22. Proposed GP-023 Implementation Slices (For Subsequent Checkpoints)

- **Slice 1 (Data Layer & Query Builders)**: Create `src/lib/admin/dashboard-reader.ts` containing fail-closed, single-pass aggregated PostgreSQL queries with strict RBAC permission gating.
- **Slice 2 (UI Components & Layout)**: Implement `DashboardKpiCard`, `OperationalStatusCard`, and `CatalogInventoryCard` in `src/components/admin/dashboard/` matching Gamer Perú design tokens.
- **Slice 3 (Page Integration & Validation)**: Integrate into `src/app/admin/(protected)/page.tsx`, write comprehensive unit tests (`tests/unit/admin-dashboard.test.ts`), and add real local Supabase E2E tests (`tests/e2e/admin-dashboard.spec.ts`).

---
