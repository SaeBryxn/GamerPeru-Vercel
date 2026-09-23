# Hosted Migrations 0013–0015 — Deployment & Closure Report

## Status

**HOSTED MIGRATIONS 0013–0015 DEPLOYED / PHYSICALLY VERIFIED / IDEMPOTENCE VERIFIED / EXTERNALLY APPROVED**

---

## 1. Executive Summary & External Disposition

This document constitutes the authoritative post-closure record of the controlled sequential deployment of canonical migrations `0013`, `0014`, and `0015` against the authorized Gamer Perú hosted Supabase database.

- **External Approval Verdict:** **PASS — HOSTED CANONICAL MIGRATION CATCH-UP 0013–0015 EXTERNALLY APPROVED**
- **Authorized Project Reference:** `jpjffalmvlxpufvtvskx`
- **PostgreSQL Version:** `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Endpoint:** Supabase Supavisor Session Pooler (`aws-0-sa-east-1.pooler.supabase.com:5432`)
- **Repository Baseline Commit:** `5b571cc423c98ce5905f100513a362baa1a2b1b3`
- **Canonical Deployed Migration Boundary:** `0000` through `0015` (Migration `0016` is strictly **ABSENT**)

---

## 2. Pre-Deployment State & Preflight Reconfirmation

Prior to deployment, strictly read-only inspection confirmed:

1. **Pre-Deployment Registry:** Schema `drizzle`, Table `__drizzle_migrations` contained exactly 13 canonical rows (`0000_superb_ink` through `0012_canonical_inventory_permission`).
2. **Hash & Timestamp Reconciliation:** Every migration `0000–0012` in the registry reconciled byte-for-byte against local migration SQL SHA-256 hashes and journal millisecond timestamps (`src/db/migrations/meta/_journal.json`).
3. **Registry Integrity:** Zero unknown or anomalous registry rows existed.
4. **Pending Migration Sequence:** Exactly migrations `0013`, `0014`, and `0015` were pending execution.
5. **Zero Partial Drift:**
   - 0013: All 11 `ai_*` relational tables and 13 explicit indexes were verified completely absent.
   - 0014: Column `product_stories.draft_revision_id` and all 0014 constraints/indexes were verified completely absent.
   - 0015: Table `public.order_notes` and all 0015 constraints/indexes were verified completely absent.
6. **0014 Pre-Deployment Data Preflight:** All six fail-closed Story invariant queries returned zero violations (`count = 0`).
7. **0014 Backfill Forecast:** With 0 existing `product_stories` and 0 `product_story_revisions`, the forecasted backfill was 0 inserted rows and 0 populated `draft_revision_id` columns.

---

## 3. Deployment Execution

Deployment was executed using the repository's canonical Drizzle migration runner under explicit, non-persisted environment authorization:

- **Environment Guard:** `GAMERPERU_MIGRATION_ENV=hosted`, `AUTHORIZED_HOSTED_DEPLOYMENT=true`
- **Connection Target:** `DATABASE_MIGRATION_URL` (Port `5432`, `postgres`, `postgres.jpjffalmvlxpufvtvskx`)
- **Command:** `pnpm db:migrate` (`drizzle-kit migrate`)
- **Execution Timestamp:** `2026-09-23T00:17:00.848Z` – `2026-09-23T00:17:10.282Z` (~9.43s)
- **Exit Code:** `0`
- **Applied Migrations:** Sequentially applied `0013_parched_mephistopheles.sql`, `0014_steep_skreet.sql`, and `0015_nifty_prowler.sql`.
- **Result:** `[✓] migrations applied successfully!`

---

## 4. Post-Deployment Migration Registry Verification

Read-only inspection of `drizzle.__drizzle_migrations` after deployment confirms exactly **16 canonical rows**:

| idx | Migration Tag                         | Remote ID | Journal `when` | Remote `created_at` | Remote Registry Hash                                               | Local File SHA-256 | Reconciled |
| :-: | :------------------------------------ | :-------: | :------------: | :-----------------: | :----------------------------------------------------------------- | :----------------- | :--------: |
|  0  | `0000_superb_ink`                     |     1     | 1786940421722  |    1786940421722    | `2a0e83ac666177da45d46315a3cbdaa32c37748aa044b2ce9df3ac209ab18750` | `2a0e83ac...`      |  **YES**   |
|  1  | `0001_search_pg_trgm`                 |     2     | 1786981173767  |    1786981173767    | `afa53ee91429eb6c11836c093a56c55b4305b8bb16bc4a70e886232aa39c40d1` | `afa53ee9...`      |  **YES**   |
|  2  | `0002_silky_dazzler`                  |     3     | 1787025464371  |    1787025464371    | `17415c789dac6ed72e79ad915300ab7cc72c6a676ba46fab750b2d8f5bf23a2b` | `17415c78...`      |  **YES**   |
|  3  | `0003_small_slyde`                    |     4     | 1787090287769  |    1787090287769    | `69e8cf923aa9fd1a36ecfd1dbae3f439d4ace2071c00a2a3bc143c1a502f8bbb` | `69e8cf92...`      |  **YES**   |
|  4  | `0004_famous_doomsday`                |     5     | 1787213773799  |    1787213773799    | `657157c6f6dd55550da867b1828870145e586fe6682bf81e6a9408f839a46d03` | `657157c6...`      |  **YES**   |
|  5  | `0005_data_api_hardening`             |     6     | 1787216661570  |    1787216661570    | `733332e490359f38e34abfbebd6ab04831be6fe65eb6dcfe9bb0c94bdfffc03a` | `733332e4...`      |  **YES**   |
|  6  | `0006_canonical_rbac_seed`            |     7     | 1787300000000  |    1787300000000    | `1a81a03c19b47eed1b06bb582c72e73d28a1508229b598b98436f1b73d69fd56` | `1a81a03c...`      |  **YES**   |
|  7  | `0007_customer_account_addresses`     |     9     | 1787383211757  |    1787383211757    | `743ce4d9539b4650e94b505943da6ba45bfb1ee6668d54a30ba3a761890c438a` | `743ce4d9...`      |  **YES**   |
|  8  | `0008_small_logan`                    |    10     | 1787442224265  |    1787442224265    | `bbab907620e39ba21f15e58c8b3dec2f7b9d274466c8941e4aefb64395ae8aab` | `bbab9076...`      |  **YES**   |
|  9  | `0009_majestic_madame_web`            |    11     | 1788076372168  |    1788076372168    | `0fc2833bc015747ea602a755d4d1f433fe6830fed2cecb8a1c1dda100af6a7ba` | `0fc2833b...`      |  **YES**   |
| 10  | `0010_chief_hemingway`                |    12     | 1788169849760  |    1788169849760    | `257a1211edfde111d08308eaf853a7752fb8b3c7230e64fd87c32c84be868693` | `257a1211...`      |  **YES**   |
| 11  | `0011_mushy_viper`                    |    13     | 1788231782857  |    1788231782857    | `0890b540ba993da662eeac4b35f619d36e2c0ab6cc8f812c31643b0b8d150efc` | `0890b540...`      |  **YES**   |
| 12  | `0012_canonical_inventory_permission` |    14     | 1788250000000  |    1788250000000    | `6704bde065e562e346a55ef173b0b3c2b4d15382f1064681ea16c4d216273668` | `6704bde0...`      |  **YES**   |
| 13  | `0013_parched_mephistopheles`         |    15     | 1789171743552  |    1789171743552    | `c2da772e9d314a6934d43c843d7e00eead79ed5f06e37cf94fe6ae610c948670` | `c2da772e...`      |  **YES**   |
| 14  | `0014_steep_skreet`                   |    16     | 1789455106193  |    1789455106193    | `1a109bbea553e314906deb05dba63757a3868f7841bd4fbfb88f525f4265d93e` | `1a109bbe...`      |  **YES**   |
| 15  | `0015_nifty_prowler`                  |    17     | 1789976128241  |    1789976128241    | `fd2a389e975271675d150a6cc9af876d13dfeb2a1719a67fc2a4740644a9bead` | `fd2a389e...`      |  **YES**   |

- **Unknown/Extra Registry Rows:** `0`
- **Migration 0016:** Absent

---

## 5. Physical Schema Verification

### 5.1. Migration 0013 (GP-025 AI Research Foundation)

- **Artifact:** `src/db/migrations/0013_parched_mephistopheles.sql` (Git blob `7c29de159250ef7fc043f758a966364370534cac`, SHA-256 `c2da772e9d314a6934d43c843d7e00eead79ed5f06e37cf94fe6ae610c948670`).
- **Installed Tables (11):** `ai_providers`, `ai_provider_credentials`, `ai_profiles`, `ai_research_jobs`, `ai_research_job_items`, `ai_sources`, `ai_product_proposals`, `ai_proposal_field_reviews`, `ai_proposal_field_sources`, `ai_proposal_apply_steps`, `ai_provider_attempts`.
- **Installed Explicit Foreign Keys:** Exactly **23 of 23** canonical foreign keys physically present and verified via `pg_constraint`.
  _(Note on PostgreSQL identifier truncation: Two long FK constraint names are truncated by PostgreSQL's standard 63-byte identifier limit (`NAMEDATALEN - 1 = 63`): `ai_proposal_field_reviews_proposal_id_ai_product_proposals_id_f` and `ai_proposal_field_sources_field_review_id_ai_proposal_field_rev`. This is expected physical PostgreSQL behavior and matches local Drizzle behavior)._
- **Installed Explicit Indexes:** Exactly **13 of 13** canonical explicit indexes physically present and verified via `pg_indexes`.
- **Data API Security:** Verified zero table privileges granted to `anon`, `authenticated`, or `service_role` on all 11 tables (canonical `REVOKE ALL PRIVILEGES` enforced).
- **Activation Boundary:** Physical schema deployment does NOT imply AI credentials are configured, production encryption keys are provisioned, external AI providers (Gemini, Tavily, OpenAI, Anthropic) are enabled, or production Inngest is activated.

### 5.2. Migration 0014 (GP-026 Product Story Revision Model)

- **Artifact:** `src/db/migrations/0014_steep_skreet.sql` (Git blob `6fc3d47a75494f669e51378587293cd88906e310`, SHA-256 `1a109bbea553e314906deb05dba63757a3868f7841bd4fbfb88f525f4265d93e`).
- **Added Column:** `product_stories.draft_revision_id` (`uuid`, nullable).
- **Installed Constraints (5):**
  - `product_story_revisions_product_id_id_unique`: `UNIQUE (product_id, id)`
  - `product_stories_draft_revision_fk`: `FOREIGN KEY (draft_revision_id) REFERENCES product_story_revisions(id) ON DELETE SET NULL`
  - `product_stories_published_revision_product_fk`: `FOREIGN KEY (product_id, published_revision_id) REFERENCES product_story_revisions(product_id, id)`
  - `product_stories_draft_revision_product_fk`: `FOREIGN KEY (product_id, draft_revision_id) REFERENCES product_story_revisions(product_id, id)`
  - `product_stories_distinct_revision_pointers`: `CHECK (((published_revision_id IS NULL) OR (draft_revision_id IS NULL) OR (published_revision_id <> draft_revision_id)))`
- **Installed Partial Unique Indexes (2):**
  - `product_story_revisions_one_draft_per_product_idx` ON `product_story_revisions (product_id) WHERE (status = 'DRAFT'::catalog_status)`
  - `product_story_revisions_one_published_per_product_idx` ON `product_story_revisions (product_id) WHERE (status = 'PUBLISHED'::catalog_status)`
- **Post-Migration Invariant Recheck:** All six fail-closed Story invariant queries returned **0 violations**.
- **Backfill Outcome:** Forecasted insertions = `0`, actual = `0`; forecasted `draft_revision_id` populated = `0`, actual = `0`. Zero domain-row mutations occurred.

### 5.3. Migration 0015 (GP-027 Orders Admin Notes)

- **Artifact:** `src/db/migrations/0015_nifty_prowler.sql` (Git blob `bc3a0fa39aa8a1e2857cf008cb2eb4d762832ecc`, SHA-256 `fd2a389e975271675d150a6cc9af876d13dfeb2a1719a67fc2a4740644a9bead`).
- **Installed Table:** `public.order_notes`
- **Exact Columns:**
  - `id`: `uuid` (PRIMARY KEY, NOT NULL)
  - `order_id`: `uuid` (NOT NULL)
  - `author_auth_user_id`: `uuid` (NULLABLE)
  - `body`: `text` (NOT NULL)
  - `created_at`: `timestamptz` (NOT NULL, default `now()`)
  - `mutation_request_id`: `uuid` (NOT NULL, UNIQUE)
  - `intent_fingerprint`: `char(64)` (NOT NULL)
  - `actor_binding_digest`: `char(64)` (NOT NULL)
- **Installed Constraints:**
  - `order_notes_pkey`: `PRIMARY KEY (id)`
  - `order_notes_mutation_request_id_unique`: `UNIQUE (mutation_request_id)`
  - `order_notes_body_not_blank`: `CHECK (length(trim(body)) > 0)`
  - `order_notes_body_max_length`: `CHECK (char_length(body) <= 2000)`
  - `order_notes_order_id_orders_id_fk`: `FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT`
  - `order_notes_author_auth_user_id_fk`: `FOREIGN KEY (author_auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`
- **Installed Indexes:**
  - `order_notes_order_created_id_idx`: `CREATE INDEX ... ON public.order_notes USING btree (order_id, created_at, id)`
  - `orders_created_id_idx`: `CREATE INDEX ... ON public.orders USING btree (created_at DESC NULLS LAST, id DESC NULLS LAST)`
  - `orders_lower_email_created_id_idx`: `CREATE INDEX ... ON public.orders USING btree (lower(customer_email::text), created_at DESC NULLS LAST, id DESC NULLS LAST)`
- **Smoke Testing:** Pre-existing `orders` count was `0`; write smoke testing was properly skipped with justification, avoiding persistent synthetic data.

---

## 6. Idempotence Verification

A second authorized execution of the migration runner was conducted against the hosted instance:

- **Command:** `pnpm db:migrate` (`drizzle-kit migrate`)
- **Execution Timestamp:** `2026-09-23T00:17:40.108Z` – `2026-09-23T00:17:42.033Z` (~1.92s)
- **Exit Code:** `0`
- **Log Summary:** Drizzle Kit checked the remote registry, identified zero pending migrations, executed zero DDL statements, and completed cleanly (`[✓] migrations applied successfully!`).
- **Post-Idempotence Registry Count:** Exactly **16 records**.
- **Classification:** **HOSTED MIGRATION IDEMPOTENCE VERIFIED**

---

## 7. Data Safety & Operational Table Inventory

Read-only counts across all operational, catalog, AI, and orders tables after deployment:

- `products`: `0`
- `product_stories`: `0`
- `product_story_revisions`: `0`
- `ai_providers`: `0`
- `ai_provider_credentials`: `0`
- `ai_profiles`: `0`
- `ai_research_jobs`: `0`
- `ai_research_job_items`: `0`
- `ai_sources`: `0`
- `ai_product_proposals`: `0`
- `ai_proposal_field_reviews`: `0`
- `ai_proposal_field_sources`: `0`
- `ai_proposal_apply_steps`: `0`
- `ai_provider_attempts`: `0`
- `orders`: `0`
- `payments`: `0`
- `shipments`: `0`
- `refunds`: `0`
- `order_notes`: `0`

**Safety Invariants:**

- Zero customer, order, payment, or catalog records were modified or dropped.
- Cloudflare R2 object storage was completely untouched.
- External AI providers (Gemini, Tavily, OpenAI, Anthropic, Inngest) were not contacted.
- GP-028 was NOT started.

---

## 8. Final Authority State

The hosted Supabase database is now canonically aligned through migration `0015`. All schema objects for GP-025, GP-026, and GP-027 are physically deployed, introspected, and verified.
