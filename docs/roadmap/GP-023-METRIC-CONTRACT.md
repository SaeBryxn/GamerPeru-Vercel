# GP-023 — Admin Dashboard Metric Contract, Authorization & Source-of-Truth Specification

## Status

**METRIC CONTRACT PENDING EXTERNAL APPROVAL (IN DISCOVERY — CHK0-BR1 REMEDIATION)**

---

## 1. Canonical Sources Reviewed

The architectural and domain specifications reviewed for this contract include:

- **`AGENTS.md`**: Canonical engineering standards, Peru-first commerce, RBAC authorization, integer minor-unit money invariants, and zero false dashboard claims.
- **`docs/roadmap/GP-023.md`**: Authoritative scope defining headline overview widgets (Revenue, Orders, AOV, Trends, Products, Stock, Payment, Fulfillment) and excluding full BI.
- **`docs/roadmap/GP-022.md` & `GP-022-CLOSURE.md`**: Established Admin Shell layout, server-side RBAC session resolution, and fail-closed security guards.
- **Drizzle PostgreSQL Schema**:
  - `orders` (`src/db/schema/orders/orders.ts`, `src/db/schema/orders/enums.ts`)
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

| Entity Table                 | Primary Key   | Key Columns / Enums Relevant to Dashboard                                                                                                                                                                                                 | Canonical Invariants                                                                                                                                                                               |
| :--------------------------- | :------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`orders`**                 | `id` (UUIDv7) | `order_number`, `customer_id` (nullable), `status` (`PENDING`, `CONFIRMED`, `PROCESSING`, `FULFILLED`, `CANCELLED`, `EXPIRED`, `REFUNDED`), `subtotal_cents`, `discount_cents`, `shipping_cents`, `total_cents`, `currency`, `created_at` | `total_cents = subtotal_cents - discount_cents + shipping_cents`. All money $\ge 0$. `customer_id` is null for guest checkouts.                                                                    |
| **`payments`**               | `id` (UUIDv7) | `order_id` (UNIQUE), `payment_method_code`, `amount_cents`, `refunded_amount_cents`, `currency`, `status` (`UNPAID`, `SUBMITTED`, `VERIFYING`, `PAID`, `REJECTED`, `REFUNDED`), `created_at`, `updated_at`                                | Exactly 1 payment row per order. `refunded_amount_cents <= amount_cents`. `status = 'PAID'` represents verified bank receipt. `created_at` is row creation time (UNPAID); `updated_at` is mutable. |
| **`payment_submissions`**    | `id` (UUIDv7) | `payment_id`, `attempt_number`, `operation_code`, `proof_media_id`, `is_late`, `submitted_at`, `created_at`                                                                                                                               | Append-only proof attempts submitted by customer for manual Yape/Plin verification. `submitted_at` is the authoritative customer submission timestamp.                                             |
| **`refunds`**                | `id` (UUIDv7) | `order_id`, `payment_id`, `amount_cents`, `reason`, `actor_auth_user_id`, `created_at`                                                                                                                                                    | Immutable reimbursement record. `amount_cents > 0`. `created_at` is the authoritative refund timestamp.                                                                                            |
| **`inventory_items`**        | `id` (UUIDv7) | `variant_id`, `location_id`, `quantity_on_hand`, `quantity_reserved`, `quantity_allocated`, `reorder_point`, `updated_at`                                                                                                                 | Authoritative per `(variant_id, location_id)`. `available_to_sell = quantity_on_hand - quantity_reserved - quantity_allocated`. All balances $\ge 0$. `reorder_point` is location-specific.        |
| **`inventory_reservations`** | `id` (UUIDv7) | `order_id`, `status` (`ACTIVE`, `VERIFICATION_HOLD`, `ALLOCATED`, `CONSUMED`, `RELEASED`), `expires_at`, `created_at`                                                                                                                     | Stock hold during unpaid window (`ACTIVE`), paused during verification (`VERIFICATION_HOLD`), confirmed upon payment (`ALLOCATED`).                                                                |
| **`products`**               | `id` (UUIDv7) | `brand_id`, `category_id`, `name`, `slug`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `is_featured`, `created_at`                                                                                                                       | Aggregate catalog root. Sellability requires `status = 'PUBLISHED'`.                                                                                                                               |
| **`product_variants`**       | `id` (UUIDv7) | `product_id`, `sku`, `title`, `price_cents`, `compare_at_price_cents`, `cost_cents`, `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`), `created_at`                                                                                            | Sellable physical SKUs. Sellability requires `status = 'ACTIVE'` AND parent `products.status = 'PUBLISHED'`.                                                                                       |

---

## 3. Dashboard Authorization Matrix

Authorization is derived strictly from PostgreSQL `role_permissions` via `getVerifiedAuthContext()`. There is **zero hardcoded `SUPER_ADMIN` bypass**. Every widget boundary checks canonical permissions server-side.

| Dashboard Section / Metric Widget                                                                                                                                                                | Required Permission                   | Authorized Staff Roles               | Unauthorized Roles Behavior                                                                                                                                                        |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Financial KPIs**<br>• Valor Realizado de Pedidos (Cohort Realized Value)<br>• Ventas Brutas Pagadas (Gross Realized)<br>• Ticket Promedio del Cohorte (Cohort AOV)<br>• Tendencias Financieras | `orders:manage` OR `orders:verify`    | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed / Redacted**: Widget is not rendered, and financial metrics are excluded from server JSON payload. `ADMIN_CATALOG` and `ADMIN_SUPPORT` cannot view financial totals. |
| **Pipeline y Volumen de Pedidos**<br>• Volumen Total Creado<br>• Desglose por Estado de Pedido<br>• Estado de Preparación y Entrega                                                              | `orders:manage`                       | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed**: Omitido del payload.                                                                                                                                              |
| **Cola de Verificación de Pagos Yape / Plin**<br>• Conteo de Cola Actual (Snapshot)<br>• Monto Total por Verificar (Snapshot)<br>• Desglose de Estados Yape / Plin                               | `orders:verify`                       | • `SUPER_ADMIN`<br>• `ADMIN_ORDERS`  | **Fail-Closed**: Omitido del payload.                                                                                                                                              |
| **Resumen de Catálogo**<br>• SKUs Vendibles Activos (Publicados)<br>• Productos Publicados / Borradores<br>• Variantes Totales del Catálogo                                                      | `catalog:manage` OR `catalog:publish` | • `SUPER_ADMIN`<br>• `ADMIN_CATALOG` | **Fail-Closed**: Omitido del payload.                                                                                                                                              |
| **Salud de Inventario**<br>• Unidades Globales On-Hand / Reservadas / ATS<br>• SKUs sin Stock Global ($ATS \le 0$)<br>• Posiciones de Almacén en Punto de Reorden                                | `inventory:manage`                    | • `SUPER_ADMIN`                      | **Fail-Closed**: Omitido del payload.                                                                                                                                              |
| **Acceso de Clientes Storefront**                                                                                                                                                                | `CUSTOMER` (0 permisos admin)         | Ninguno                              | **Denegado**: Redirección a login / 403 Forbidden.                                                                                                                                 |

---

## 4. Temporal Accounting Model & Financial Definitions

### A. Physical Schema Capability Gap Analysis

In the current PostgreSQL database schema:

1. `payments.created_at` records the row insertion timestamp at checkout initialization, when `payments.status` is strictly `'UNPAID'`. It does **NOT** represent when funds were verified or approved by staff.
2. `payments.updated_at` is a mutable timestamp updated on every row modification (e.g. status transition to `SUBMITTED`, `VERIFYING`, `PAID`, `REJECTED`, or subsequent partial refunds). It does **NOT** provide an immutable audit of when payment was recognized.
3. The schema currently possesses **NO immutable `paid_at` or `verified_at` column** in `payments`.

Consequently, using the current schema, it is physically impossible to truthfully answer:
_"How much cash was collected/recognized by bank verification between Date A and Date B?"_ without confounding order-creation timing with verification timing or using a mutable timestamp.

### B. Chosen Canonical Strategy for GP-023: Strategy A — Cohort Financial Realization

To maintain complete mathematical truthfulness without inventing non-existent database columns or running unauthorized migrations during CHK0, GP-023 establishes **Cohort Financial Realization** as the canonical model:

- **Temporal Anchor**: `orders.created_at` (the deterministic creation moment of the purchase intent).
- **Metric Concept**: Current financial value realized from orders _created_ within the reporting period $[T_{\text{start}}, T_{\text{end}})$.
- **Strict Labeling Invariant**: This metric **MUST NOT** be labeled "Ingresos recibidos en el periodo", "Caja del periodo", or "Pagos verificados en el periodo".
- **Canonical UI Label**: **"Valor Retenido del Cohorte" (Cohort Net Retained Value)**.

### C. True Cash-Recognition Model (Documented Implementation Precondition)

To support a future "Ingresos Recaudados en el Periodo" (Cash-Basis Accounting), the system requires an explicit immutable timestamp extension:

- **Proposed Field**: `payments.paid_at` (`timestamp with time zone`, nullable).
- **Lifecycle Semantics**: Set exactly once when staff approves bank receipt and transitions `payments.status` to `'PAID'` (GP-028). Immutable thereafter.
- **Backfill Rule for Existing Data**: `COALESCE(paid_at, updated_at)`.
- **Status**: Documented as an **Implementation Precondition / Future Scope**. Zero migration `0013` is created in CHK0-BR1.

### D. Mathematical Formulas for Cohort Financial Metrics

#### 1. Cohort Gross Paid Value ($V_{\text{cohort\_gross}}$)

Total original payment amount of orders created in $[T_{\text{start}}, T_{\text{end}})$ that have reached paid status (including orders that were subsequently refunded, since cash was genuinely paid):
$$V_{\text{cohort\_gross}} = \sum \text{payments.amount\_cents} \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}}) \text{ AND } \text{payments.status} \in (\text{'PAID'}, \text{'REFUNDED'})$$

#### 2. Cohort Net Retained Value ($V_{\text{cohort\_net}}$)

Total net funds retained from orders created in $[T_{\text{start}}, T_{\text{end}})$ after deducting refunds:
$$V_{\text{cohort\_net}} = \sum (\text{payments.amount\_cents} - \text{payments.refunded\_amount\_cents}) \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}}) \text{ AND } \text{payments.status} \in (\text{'PAID'}, \text{'REFUNDED'})$$

#### 3. Cohort Pending Verification Value ($V_{\text{cohort\_pending}}$)

Funds currently claimed by customers in manual submissions awaiting staff confirmation for orders created in $[T_{\text{start}}, T_{\text{end}})$:
$$V_{\text{cohort\_pending}} = \sum \text{payments.amount\_cents} \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}}) \text{ AND } \text{payments.status} \in (\text{'SUBMITTED'}, \text{'VERIFYING'})$$

#### 4. Period Refund Outflow ($R_{\text{period\_outflow}}$)

Actual cash reimbursed to customers during the selected period $[T_{\text{start}}, T_{\text{end}})$, based on the authoritative immutable refund timestamp:
$$R_{\text{period\_outflow}} = \sum \text{refunds.amount\_cents} \quad \text{WHERE } \text{refunds.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

---

## 5. Orders Definition

### A. Total Created Orders ($N_{\text{orders\_created}}$)

Total distinct order records created within the reporting window $[T_{\text{start}}, T_{\text{end}})$:
$$N_{\text{orders\_created}} = \text{COUNT}(\text{orders.id}) \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}})$$

### B. Cohort Paid Orders ($N_{\text{cohort\_paid}}$)

Distinct orders created within $[T_{\text{start}}, T_{\text{end}})$ that have reached paid confirmation:
$$N_{\text{cohort\_paid}} = \text{COUNT}(\text{orders.id}) \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}}) \text{ AND } \text{payments.status} \in (\text{'PAID'}, \text{'REFUNDED'})$$

### C. Cohort Active Paid Orders ($N_{\text{cohort\_paid\_active}}$)

Paid orders created within $[T_{\text{start}}, T_{\text{end}})$ that retain positive net value (excluding fully refunded orders):
$$N_{\text{cohort\_paid\_active}} = \text{COUNT}(\text{orders.id}) \quad \text{WHERE } \text{orders.created\_at} \in [T_{\text{start}}, T_{\text{end}}) \text{ AND } \text{payments.status} \in (\text{'PAID'}, \text{'REFUNDED'}) \text{ AND } (\text{payments.amount\_cents} - \text{payments.refunded\_amount\_cents}) > 0$$

### D. Canonical Status Breakdown

Operational breakdown of orders created in $[T_{\text{start}}, T_{\text{end}})$ across all 7 canonical statuses:

- `PENDING`: Checkout created, awaiting customer payment or voucher submission.
- `CONFIRMED`: Payment verified and funds receipt approved by staff.
- `PROCESSING`: Order assigned for warehouse picking and packing.
- `FULFILLED`: Order has been packed, dispatched, and delivered.
- `CANCELLED`: Order cancelled by customer or staff before fulfillment.
- `EXPIRED`: Reservation TTL elapsed without payment submission.
- `REFUNDED`: Confirmed order returned and fully refunded.

### E. Customer Segmentation

Both guest (`orders.customer_id IS NULL`) and authenticated (`orders.customer_id IS NOT NULL`) orders are fully included in all order metrics.

---

## 6. Average Order Value (AOV) Definition

### A. Mathematical Formula & Population Alignment

AOV must draw its numerator and denominator from the **exact same eligible population and temporal basis**.
Under the Cohort Realization model:
$$\text{AOV}_{\text{cohort}} = \frac{V_{\text{cohort\_net}}}{N_{\text{cohort\_paid\_active}}}$$

Where:

- **Numerator**: $V_{\text{cohort\_net}}$ = Net retained cents of paid orders created in $[T_{\text{start}}, T_{\text{end}})$.
- **Denominator**: $N_{\text{cohort\_paid\_active}}$ = Count of paid orders created in $[T_{\text{start}}, T_{\text{end}})$ that retain net positive value.
- **Refund Treatment**:
  - _Partially Refunded Orders_: Retained in the denominator; numerator reflects reduced net retained cents.
  - _Fully Refunded Orders_ ($amount\_cents == refunded\_amount\_cents$): Excluded from the denominator because their net value is $0$, preventing synthetic downward depression of the average realized ticket.
- **Zero-Denominator Rule**: If $N_{\text{cohort\_paid\_active}} == 0$, $\text{AOV} = 0 \text{ PEN (S/ 0.00)}$. Division by zero is strictly prevented.

---

## 7. Trend & Comparison Semantics

### A. Comparison Window

For any selected reporting window $W_{\text{curr}} = [T_0, T_1)$ of duration $\Delta = T_1 - T_0$, the comparison window is the immediately preceding period of equal length:
$$W_{\text{prev}} = [T_0 - \Delta, T_0)$$

### B. Delta Formulas & Truthful Zero-Baseline Behavior

For any metric $M$ with current value $V_{\text{curr}}$ and prior period value $V_{\text{prev}}$:

- **Absolute Delta**: $\Delta_{\text{abs}} = V_{\text{curr}} - V_{\text{prev}}$
- **Percentage Delta ($\Delta_{\%}$)**:
  - If $V_{\text{prev}} > 0$:
    $$\Delta_{\%} = \left( \frac{V_{\text{curr}} - V_{\text{prev}}}{V_{\text{prev}}} \right) \times 100$$
  - If $V_{\text{prev}} == 0$ and $V_{\text{curr}} > 0$:
    $$\Delta_{\%} = \text{null}$$
    - **Visual Presentation**: Render a clean badge `"Nuevo"` or `"Sin base previa"` alongside the positive absolute delta $+S/ X.XX$ or $+N$. **Never fabricate $+100\%$. Never display `Infinity` or `NaN`**.
  - If $V_{\text{prev}} == 0$ and $V_{\text{curr}} == 0$:
    $$\Delta_{\%} = 0\%$$

---

## 8. Product & Catalog Overview Definitions

1. **Active Sellable SKUs (Catálogo Disponible Storefront)**:
   Distinct product variants that are active and belong to a currently published product:
   $$N_{\text{sellable\_skus}} = \text{COUNT}(\text{product\_variants.id}) \quad \text{WHERE } \text{product\_variants.status} = \text{'ACTIVE'} \text{ AND } \text{products.status} = \text{'PUBLISHED'}$$
2. **Total Active Variants (Inventario / Backoffice)**:
   Count of all variants with `status = 'ACTIVE'` regardless of parent publication state:
   $$N_{\text{active\_variants}} = \text{COUNT}(\text{product\_variants.id}) \quad \text{WHERE } \text{status} = \text{'ACTIVE'}$$
3. **Published Products**: $\text{COUNT}(\text{products.id}) \text{ WHERE status} = \text{'PUBLISHED'}$.
4. **Draft Products**: $\text{COUNT}(\text{products.id}) \text{ WHERE status} = \text{'DRAFT'}$.
5. **Catalog Integrity Alert (Published Products with 0 Sellable SKUs)**:
   Count of `PUBLISHED` products that have zero `ACTIVE` variants.

---

## 9. Stock & Multi-Location Inventory Overview Definitions

In GamerPeru's multi-location inventory engine, `inventory_items` is authoritative per `(variant_id, location_id)`. The dashboard must never conflate location-level stock positions with SKU counts.

1. **Total Stock Positions (Posiciones de Inventario Almacén)**:
   Count of physical inventory records across all warehouses:
   $$N_{\text{inventory\_positions}} = \text{COUNT}(\text{inventory\_items.id})$$
2. **Global Aggregate Balances (Unidades Físicas)**:
   - _Total On-Hand_: $Q_{\text{on\_hand}} = \sum \text{inventory\_items.quantity\_on\_hand}$
   - _Total Reserved_: $Q_{\text{reserved}} = \sum \text{inventory\_items.quantity\_reserved}$ (unpaid checkout holds)
   - _Total Allocated_: $Q_{\text{allocated}} = \sum \text{inventory\_items.quantity\_allocated}$ (confirmed orders in prep)
   - _Total Available-to-Sell (ATS)_:
     $$Q_{\text{ATS}} = \sum (\text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated})$$
3. **Out-of-Stock SKUs (SKUs sin Stock Disponible)**:
   Count of active product variants where the global sum of ATS across all locations is $\le 0$:
   $$N_{\text{oos\_skus}} = \text{COUNT}(*) \text{ FROM (SELECT variant\_id, SUM(quantity\_on\_hand - quantity\_reserved - quantity\_allocated) AS total\_ats FROM inventory\_items JOIN product\_variants ON product\_variants.id = inventory\_items.variant\_id WHERE product\_variants.status = 'ACTIVE' GROUP BY variant\_id HAVING SUM(quantity\_on\_hand - quantity\_reserved - quantity\_allocated) <= 0)}$$
4. **Low-Stock Location Positions (Posiciones en Punto de Reorden)**:
   Because `reorder_point` is strictly location-specific, this metric is defined per location position:
   Count of `(variant_id, location_id)` positions where local $(\text{quantity\_on\_hand} - \text{quantity\_reserved} - \text{quantity\_allocated}) \le \text{reorder\_point} \text{ AND } > 0$.
   - **Visual Label**: **"Posiciones en Punto de Reorden"** (not labeled "SKUs").

---

## 10. Payment Overview Definitions (Manual Yape / Plin)

### A. Dual Temporal Model for Payments

1. **Primary Widget: Current Operational Snapshot Queue (Cola Actual en Tiempo Real)**
   - Displays all payments currently in `SUBMITTED` or `VERIFYING` status **regardless of when the order was created**. Staff needs real-time visibility into current unverified vouchers awaiting review in bank accounts:
     $$N_{\text{queue\_count}} = \text{COUNT}(\text{payments.id}) \quad \text{WHERE } \text{status} \in (\text{'SUBMITTED'}, \text{'VERIFYING'})$$
     $$V_{\text{queue\_amount}} = \sum \text{payments.amount\_cents} \quad \text{WHERE } \text{status} \in (\text{'SUBMITTED'}, \text{'VERIFYING'})$$
2. **Secondary Metric: Historical Submission Activity in Period**
   - Counts distinct payments submitted by customers during $[T_{\text{start}}, T_{\text{end}})$, anchored strictly on `payment_submissions.submitted_at` taking the latest attempt per payment (`attempt_number = (SELECT MAX(attempt_number) ...)`).

---

## 11. Fulfillment Overview Definitions

Canonical statuses aligned with `src/db/schema/orders/enums.ts`:

1. **Por Preparar (`CONFIRMED`)**: Payment verified and funds approved; inventory allocated; awaiting picking.
2. **En Preparación (`PROCESSING`)**: Warehouse staff actively picking and packing parcel.
3. **Completados / Entregados (`FULFILLED`)**: Order has been packed, dispatched, and delivered.
4. **Cancelados / Expirados (`CANCELLED` + `EXPIRED`)**: Closed without fulfillment.

---

## 12. Timezone & Temporal Contract

1. **Canonical Reporting Timezone**: **`America/Lima`** (UTC-5, Peru-First).
   - All relative period boundaries ("Hoy", "Últimos 7 días", "Últimos 30 días", "Este Mes") are computed relative to local calendar boundaries in Lima (`America/Lima`), then converted to UTC ISO strings for PostgreSQL range queries.
2. **Boundary Convention**: Half-open intervals $[T_{\text{start}}, T_{\text{end}})$:
   $$\text{timestamp} \ge T_{\text{start}} \quad \text{AND} \quad \text{timestamp} < T_{\text{end}}$$
3. **Period Definitions**:
   - **Hoy (Today)**: `00:00:00.000` Lima today to `23:59:59.999` Lima today.
   - **Últimos 7 Días (Last 7 Days)**: Preceding 7 full 24-hour days plus elapsed time today.
   - **Últimos 30 Días (Last 30 Days)**: Preceding 30 full 24-hour days plus elapsed time today (Default View).
   - **Este Mes (Month to Date)**: Day 1 `00:00:00.000` of current month in Lima to now.

---

## 13. Money & Currency Contract

1. **Storage Unit**: All monetary values are strictly **integer minor units (PEN cents)**. 1 PEN = 100 cents.
2. **No Floating-Point Arithmetic**: Server accumulators use integer addition/subtraction or SQL `SUM(...)::bigint`.
3. **Currency Invariant**: All active commerce is denominated in `PEN`. Mixed currency addition without an approved FX rate table is forbidden.
4. **Display Formatting**:
   $$\text{Formatted} = \text{"S/ "} + (cents / 100).\text{toLocaleString}('es-PE', \{ \text{minimumFractionDigits}: 2, \text{maximumFractionDigits}: 2 \})$$

---

## 14. Database Source-of-Truth & Query Plan Matrix

| Dashboard Widget                           | Source Tables & Joins                                                             | Aggregation Formula & Status Filters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Index Coverage                                                             | Potential Scan Risks & Benchmark Requirements                                                                                                                        |
| :----------------------------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Headline Cohort Financials & Orders**    | `orders` $O$<br>`JOIN payments` $P$ `ON P.order_id = O.id`                        | `SELECT`<br>&nbsp;&nbsp;`COUNT(O.id) AS total_created_orders,`<br>&nbsp;&nbsp;`COUNT(O.id) FILTER (WHERE P.status IN ('PAID','REFUNDED')) AS cohort_paid_orders,`<br>&nbsp;&nbsp;`COUNT(O.id) FILTER (WHERE P.status IN ('PAID','REFUNDED') AND (P.amount_cents - P.refunded_amount_cents) > 0) AS cohort_active_paid_orders,`<br>&nbsp;&nbsp;`COALESCE(SUM(P.amount_cents) FILTER (WHERE P.status IN ('PAID','REFUNDED')), 0) AS cohort_gross_cents,`<br>&nbsp;&nbsp;`COALESCE(SUM(P.amount_cents - P.refunded_amount_cents) FILTER (WHERE P.status IN ('PAID','REFUNDED')), 0) AS cohort_net_cents,`<br>&nbsp;&nbsp;`COALESCE(SUM(P.amount_cents) FILTER (WHERE P.status IN ('SUBMITTED','VERIFYING')), 0) AS cohort_pending_cents`<br>`FROM orders O`<br>`JOIN payments P ON P.order_id = O.id`<br>`WHERE O.created_at >= $1 AND O.created_at < $2` | `orders_status_created_at_idx`<br>`payments_status_created_at_idx`         | Index range scan on `orders.created_at` with nested index lookup on `payments.order_id`. Must be benchmarked under simulated 10k-order volume during implementation. |
| **Current Payment Queue (Snapshot)**       | `payments` $P$                                                                    | `SELECT`<br>&nbsp;&nbsp;`COUNT(id) AS queue_count,`<br>&nbsp;&nbsp;`COALESCE(SUM(amount_cents), 0) AS queue_amount_cents`<br>`FROM payments`<br>`WHERE status IN ('SUBMITTED', 'VERIFYING')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `payments_status_created_at_idx`                                           | Filtered index scan on `status`. Highly efficient for pending review items.                                                                                          |
| **Catalog Sellable SKUs Summary**          | `product_variants` $PV$<br>`JOIN products` $PR$ `ON PR.id = PV.product_id`        | `SELECT`<br>&nbsp;&nbsp;`COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'PUBLISHED') AS published_products,`<br>&nbsp;&nbsp;`COUNT(DISTINCT PR.id) FILTER (WHERE PR.status = 'DRAFT') AS draft_products,`<br>&nbsp;&nbsp;`COUNT(PV.id) FILTER (WHERE PV.status = 'ACTIVE' AND PR.status = 'PUBLISHED') AS active_sellable_skus,`<br>&nbsp;&nbsp;`COUNT(PV.id) FILTER (WHERE PV.status = 'ACTIVE') AS total_active_variants`<br>`FROM products PR`<br>`LEFT JOIN product_variants PV ON PV.product_id = PR.id`                                                                                                                                                                                                                                                                                                                                         | `products_status_featured_idx`<br>`product_variants_product_id_status_idx` | Indexed join across active products and variants.                                                                                                                    |
| **Global Stock & Out-of-Stock SKUs**       | `inventory_items` $II$<br>`JOIN product_variants` $PV$ `ON PV.id = II.variant_id` | `SELECT`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_on_hand), 0) AS on_hand,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_reserved), 0) AS reserved,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_allocated), 0) AS allocated,`<br>&nbsp;&nbsp;`COALESCE(SUM(quantity_on_hand - quantity_reserved - quantity_allocated), 0) AS available_to_sell,`<br>&nbsp;&nbsp;`COUNT(*) FILTER (WHERE (quantity_on_hand - quantity_reserved - quantity_allocated) <= reorder_point AND (quantity_on_hand - quantity_reserved - quantity_allocated) > 0) AS low_stock_positions`<br>`FROM inventory_items II`<br>`JOIN product_variants PV ON PV.id = II.variant_id`<br>`WHERE PV.status = 'ACTIVE'`                                                                                                                                                                                 | `inventory_items_variant_id_idx`                                           | Multi-location aggregate scan.                                                                                                                                       |
| **Out-of-Stock SKUs (Global ATS $\le$ 0)** | Subquery over `inventory_items`                                                   | `SELECT COUNT(*) AS oos_skus FROM (`<br>&nbsp;&nbsp;`SELECT II.variant_id`<br>&nbsp;&nbsp;`FROM inventory_items II`<br>&nbsp;&nbsp;`JOIN product_variants PV ON PV.id = II.variant_id`<br>&nbsp;&nbsp;`WHERE PV.status = 'ACTIVE'`<br>&nbsp;&nbsp;`GROUP BY II.variant_id`<br>&nbsp;&nbsp;`HAVING SUM(II.quantity_on_hand - II.quantity_reserved - II.quantity_allocated) <= 0`<br>`) sub`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `inventory_items_variant_id_idx`                                           | Evaluates true SKU-level aggregate stock rather than location rows.                                                                                                  |

---

## 15. Data Integrity & Edge-Case Matrix

| Scenario / Edge Case                  | Expected System Behavior & Value                                                                                                  | Safety Invariant                                    |
| :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| **Completely Empty Database**         | All counts = `0`, Net Value = `S/ 0.00`, AOV = `S/ 0.00`, Stock = `0`. Clean zero-state display.                                  | No runtime exceptions; SQL null coalescence to 0.   |
| **Zero Orders in Period**             | Headline KPIs show `S/ 0.00` and `0 pedidos`. AOV returns `S/ 0.00`.                                                              | Never divide by zero.                               |
| **Orders Created but 0 Paid**         | Total orders = $N$, Net Retained = `S/ 0.00`, Paid Orders = `0`, AOV = `S/ 0.00`.                                                 | Unpaid orders never count as realized sales.        |
| **Cancelled Orders**                  | Counted in `CANCELLED` status breakdown; excluded from paid cohort value.                                                         | Cancelled amounts do not inflate revenue.           |
| **Unverified Payment Proofs**         | Aggregated in Snapshot Queue ("Por Verificar"). Excluded from Net Retained Value.                                                 | Staff clearly sees claimed vs verified funds.       |
| **Rejected Payment Proofs**           | Recorded in `REJECTED` status; revenue value = `0`.                                                                               | Rejected proofs ignored in sales metrics.           |
| **Fully Refunded Orders**             | Net retained value is $0$; excluded from AOV denominator ($N_{\text{cohort\_paid\_active}}$).                                     | Prevents AOV depression from zero-value orders.     |
| **Partially Refunded Orders**         | Net value reduced by `refunded_amount_cents`; retained in AOV denominator.                                                        | Accurate average ticket for retained funds.         |
| **Previous Period = 0**               | Trend displays `percentageDelta = null`, visual badge `"Nuevo"`, and absolute delta $+S/ X.XX$.                                   | Never display `+100%`, `Infinity%`, or `NaN%`.      |
| **Multi-Location Inventory**          | Location positions are counted as positions; Out-of-Stock is computed globally per SKU.                                           | Prevents duplicate or misleading SKU counts.        |
| **DRAFT Product with ACTIVE Variant** | Excluded from "SKUs Vendibles Activos"; counted only in "Total Variantes".                                                        | Accurately reflects storefront customer visibility. |
| **Exact Boundary Timestamps**         | Evaluated via $[T_{\text{start}}, T_{\text{end}})$ half-open interval ($t \ge T_{\text{start}} \text{ AND } t < T_{\text{end}}$). | Zero double-counting across adjacent periods.       |
| **Unauthorized Staff Role**           | Financial cards omitted from server payload; clean access-restricted badge.                                                       | Zero privileged data leakage in HTML or JSON.       |
| **Storefront Customer Access**        | Blocked at `/admin` layout boundary with HTTP 403 Forbidden.                                                                      | Complete platform isolation.                        |

---

## 16. Visual Information Architecture (GP-023 Dashboard)

The dashboard integrates directly into the established **GP-022 Admin Shell** (`/admin`):

```
+-----------------------------------------------------------------------------------+
|  HEADER: Panel de Control Gamer Perú | Selector de Período [Hoy | 7D | 30D | Mes]   |
+-----------------------------------------------------------------------------------+
|  HEADLINE COHORT KPI CARDS (4-Column Grid Desktop / 2-Col Tablet / 1-Col Mobile)  |
|  [ Valor Retenido Cohorte ] [ Pedidos Pagados ] [ Ticket Promedio ] [ Cola Yape ] |
|  S/ 12,450.00 (+S/ 1.2k)    42 (+12%)           S/ 296.43           5 (S/ 1,850)  |
|  (Trend vs Prev / "Nuevo")  (Trend vs Prev)     (Cohort AOV)        (Snapshot)    |
+-----------------------------------------------------------------------------------+
|  OPERATIONAL STATUS GRID (2-Column Grid)                                          |
|  +-------------------------------------+ +-------------------------------------+  |
|  | Verificación de Pagos (Snapshot)    | | Pipeline de Preparación y Envíos    |  |
|  | • Por Verificar (Cola Actual): 5    | | • Por Preparar (Confirmados): 12    |  |
|  | • Pagos Verificados (Periodo): 42   | | • En Empaque (Processing): 8        |  |
|  | • Comprobantes Rechazados: 2        | | • Completados (Entregados): 22      |  |
|  +-------------------------------------+ +-------------------------------------+  |
+-----------------------------------------------------------------------------------+
|  CATALOG & INVENTORY HEALTH GRID (2-Column Grid)                                  |
|  +-------------------------------------+ +-------------------------------------+  |
|  | Resumen de Catálogo                 | | Salud de Inventario (Almacenes)     |  |
|  | • SKUs Vendibles (Publicados): 84   | | • Unidades Disponibles (ATS): 450   |  |
|  | • Productos Publicados: 26          | | • Unidades Reservadas: 18           |  |
|  | • Productos en Borrador: 4          | | • SKUs sin Stock Global: 3          |  |
|  | • Alerta Catálogo sin SKUs: 0       | | • Posiciones Stock Bajo: 6          |  |
|  +-------------------------------------+ +-------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Visual & Accessibility DoD:

- **Responsive Layout**: 12-column responsive grid (Desktop $\ge$ 1024px) $\to$ 2-column grid (Tablet 768px - 1023px) $\to$ 1-column stacked (Mobile < 768px, zero horizontal overflow at 360px).
- **Theme**: Gamer Perú design tokens (`tokens.css`), dark mode aesthetic, high contrast ratios ($\ge 4.5:1$ text, $\ge 3.0:1$ UI components).
- **Accessibility**: Semantic HTML (`<header>`, `<section>`, `<article>`), descriptive `aria-label` tags on KPI cards, keyboard navigable, screen reader friendly.
- **Motion**: Adheres to `prefers-reduced-motion: reduce` with zero motion transitions.

---

## 17. Server, Cache & Freshness Contract

1. **Server-Side Execution**: All metric resolution executes strictly in Next.js Server Components (`src/app/admin/(protected)/page.tsx` and server data helpers in `src/lib/admin/`).
2. **Freshness Guarantee**: `export const dynamic = "force-dynamic"` is enforced. Every dashboard request queries PostgreSQL directly to ensure real-time financial accuracy.
3. **Zero Secret Leakage**: Database connection strings and service role keys remain strictly server-side.
4. **Server Authorization Enforcement**: `getVerifiedAuthContext()` executes before any query is dispatched. If unauthorized, execution short-circuits immediately.

---

## 18. Accessibility Requirements

- **WCAG 2.1 AA Compliance**: Full pass on automated Axe accessibility scans (`@axe-core/playwright`).
- **Screen Reader Clarity**: Numeric KPI values formatted with descriptive labels (e.g., `aria-label="Valor retenido del cohorte de pedidos: S/ 12,450.00"`).
- **No Color-Only Signifiers**: Status badges pair iconography with text tokens.

---

## 19. Performance & Index Observations

- **Index Coverage**:
  - `orders_status_created_at_idx` (`orders(status, created_at)`) covers cohort range queries.
  - `payments_status_created_at_idx` (`payments(status, created_at)`) covers status filtering.
  - `inventory_items_variant_id_idx` covers inventory joins.
  - `product_variants_product_id_status_idx` covers catalog variant sellability joins.
- **Performance Risks**: Large unbounded date ranges could trigger sequential scans if table cardinality grows significantly; queries must enforce bounded period parameters.
- **Benchmark Requirement**: Execution times must be measured and documented under realistic fixture data during the implementation gate. Zero schema migrations (`0013`) are required for GP-023.

---

## 20. GP-023 vs Later-GP Scope Boundary Matrix

| Feature / UI Surface                                               | Milestone Owner  | Allowed in GP-023? | Rationale                                                    |
| :----------------------------------------------------------------- | :--------------- | :----------------- | :----------------------------------------------------------- |
| **Headline KPI Summary & Cohort Financials**                       | **GP-023**       | **YES**            | Core objective of Admin Dashboard overview.                  |
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

## 21. Open Decisions & Implementation Preconditions

1. **Payment Recognition Timestamp Gap (Precondition for Cash-Basis Accounting)**:
   - **Finding**: Current schema cannot compute "Cash received between Date A and Date B" because `payments.created_at` is order creation time and `payments.updated_at` is mutable.
   - **Resolution for GP-023**: Implement Strategy A (Cohort Financial Realization) with unambiguous labeling ("Valor Retenido del Cohorte").
   - **Future Requirement**: Introducing true cash-basis recognition requires adding an immutable `payments.paid_at` column in a future approved migration (e.g. during GP-028 payment verification queue).
2. **Default Reporting Period**:
   - **Resolution**: Default to `Últimos 30 días` (Last 30 days) with toggles for `Hoy`, `Últimos 7 días`, and `Este Mes`.
3. **Multi-Currency Policy**:
   - **Resolution**: All metrics displayed strictly in `PEN (S/.)`. Mixed currency addition without an approved FX policy is forbidden.

---

## 22. Proposed GP-023 Implementation Slices (For Subsequent Checkpoints)

- **Slice 1 (Data Layer & Aggregated Readers)**: Implement `src/lib/admin/dashboard-reader.ts` containing single-pass aggregated PostgreSQL queries with strict RBAC permission gating and cohort realization formulas.
- **Slice 2 (UI Components & Layout)**: Implement `DashboardKpiCard`, `OperationalStatusCard`, and `CatalogInventoryCard` in `src/components/admin/dashboard/` matching Gamer Perú design tokens.
- **Slice 3 (Page Integration & Validation)**: Integrate into `src/app/admin/(protected)/page.tsx`, write comprehensive unit tests (`tests/unit/admin-dashboard.test.ts`), and add real local Supabase E2E tests (`tests/e2e/admin-dashboard.spec.ts`).

---
