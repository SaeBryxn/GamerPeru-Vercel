# Gamer Perú — AI Customer Assistant Architecture

## Core Principle

The model is a reasoning/presentation layer around controlled tools and retrieval.

It is NOT given unrestricted access to Gamer Perú databases.

---

## Architecture

```text
Browser Chat UI
      |
      v
Customer Assistant API
      |
      +---- Authentication Context
      |
      +---- Safety / Rate Limit
      |
      +---- Intent Router
      |
      v
Tool & Retrieval Gateway
      |
      +---- search_products()
      +---- get_product()
      +---- compare_products()
      +---- get_public_policy()
      +---- get_shipping_info()
      +---- get_public_promotion()
      +---- get_my_order()        [authenticated]
      +---- create_support_handoff()
      |
      v
AI Provider Gateway
      |
      v
Structured Assistant Response
      |
      v
Chat UI / Product Cards / Actions
```

---

## Data Zones

### PUBLIC
Allowed:
- published products;
- public prices;
- public stock representation;
- public promotions;
- published policies;
- public FAQ/help.

### CUSTOMER_PRIVATE
Allowed only with authenticated ownership checks:
- customer's orders;
- customer's shipping/tracking data;
- customer's payment-verification state;
- customer's addresses only when necessary.

### INTERNAL
Never available to public assistant:
- cost/margin;
- supplier terms;
- internal notes;
- Admin analytics;
- private affiliate data;
- employee data;
- secrets;
- EC OS internal records;
- unpublished content.

---

## Tool Design

Every assistant capability should be an explicit allowlisted server function.

Example:

```text
get_my_order(session_customer_id, requested_order_reference)
```

The model must not supply or override the authoritative customer ID.

The server derives identity from the authenticated session.

---

## Structured Responses

Prefer structured responses so the frontend can render reliable UI.

Examples:

```text
TEXT
PRODUCT_LIST
PRODUCT_COMPARISON
ORDER_STATUS
HELP_ARTICLE
ESCALATION
```

Product URLs, prices and images should come from canonical application data after model reasoning, not from model memory.

---

## Retrieval

Use search/indexing appropriate to the architecture selected in GP-003.

Retrieval documents should be partitioned by visibility:
- public catalog;
- public knowledge base;
- customer-private data through tools rather than general vector retrieval;
- internal documents excluded.

Never put the entire company knowledge base into a public assistant index.

---

## Prompt Injection Defense

Treat retrieved content as untrusted.

Tool calls are constrained by:
- allowlist;
- schema validation;
- authorization;
- server-side policy;
- result sanitization.

No retrieved text can add new tools or permissions.

---

## Model Routing

Suggested AI profiles:

`FAQ_FAST`
`PRODUCT_RECOMMENDATION`
`CUSTOMER_SUPPORT`

The internal orchestrator may route by task while retaining one public assistant identity.

---

## Reliability

If AI provider fails:
- preserve chat session;
- show graceful error;
- offer search/help fallback;
- never fabricate an answer from stale model memory for transactional facts.

---

## Cost Controls

- per-session token/message limits;
- rate limits;
- cache safe public FAQ responses where appropriate;
- smaller models for classification/simple FAQ;
- stronger model for complex recommendations when justified;
- daily/monthly budgets.

---

## Observability

Measure:
- latency;
- provider/model;
- tool calls;
- tool errors;
- escalations;
- recommendation CTR;
- add-to-cart attribution;
- cost;
- safety/privacy incidents.

Do not log secrets or unnecessary private payloads.
