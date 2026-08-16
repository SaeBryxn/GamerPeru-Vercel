# Gamer Perú — AI Provider Architecture

## Decision Goal

Gamer Perú must not be coupled to a single AI vendor.

The application should expose an internal AI abstraction used by features such as the AI Product Assistant.

---

## 1. Conceptual Architecture

```text
Admin UI
   |
   v
AI Product Assistant
   |
   v
AI Orchestrator / Gateway
   |
   +---- Provider Adapter: OpenAI
   |
   +---- Provider Adapter: Anthropic
   |
   +---- Provider Adapter: Google
   |
   +---- Provider Adapter: Other future providers
```

Business modules must call the internal AI orchestration interface rather than vendor SDKs directly.

---

## 2. AI Provider Settings

Admin should have a protected settings area conceptually similar to:

`/admin/settings/ai`

Capabilities:

### Providers

- enable / disable provider;
- configure API credential through secure server-side secret management;
- test connection;
- view status;
- set default provider.

### Models

For each supported provider:

- model identifier;
- enabled / disabled;
- display name;
- use-case eligibility;
- relative cost tier;
- context capability metadata when available.

### Default Model Profiles

Instead of hardcoding model names in product workflows, create reusable AI profiles.

Examples:

`PRODUCT_RESEARCH_FAST`

- optimized for inexpensive extraction / triage.

`PRODUCT_RESEARCH_DEEP`

- optimized for difficult product research and conflict resolution.

`SEO_COPY`

- optimized for product SEO copy.

`PRODUCT_STORY`

- optimized for premium marketing/product storytelling.

`BATCH_IMPORT`

- optimized for cost-efficient structured enrichment.

Each profile references a configured provider + model + generation settings.

---

## 3. Model Selection

Admin users with permission should be able to:

- use the default profile;
- select another allowed AI profile;
- optionally select an explicit provider/model for a job;
- see estimated relative cost/tier;
- see which provider/model produced a result.

The normal workflow should favor profiles rather than making administrators understand provider-specific parameters.

---

## 4. Provider Adapter Contract

Conceptual interface:

```text
AIProvider
  generateStructured()
  generateText()
  healthCheck()
  listConfiguredModels()
```

The exact code interface is chosen in GP-003.

The business layer should request capabilities, not vendor-specific endpoints.

Example:

```text
researchProduct({
  productName,
  categoryHint,
  locale: "es-PE"
})
```

not:

```text
callVendorSpecificModel(...)
```

---

## 5. Structured Output

AI Product Assistant operations should prefer schema-validated structured output.

Flow:

```text
Model response
   ↓
Schema validation
   ↓
Normalization
   ↓
Source/confidence checks
   ↓
Draft proposal
   ↓
Admin approval
```

Malformed AI responses must never be written directly into canonical commerce records.

---

## 6. Credentials

Provider API credentials are infrastructure secrets.

The Admin may show:

- provider configured: yes/no;
- masked key identifier;
- last connection test;
- credential update action.

The browser must never receive the full API secret after it has been stored.

Actual secret-storage implementation depends on GP-003 architecture.

---

## 7. Fallbacks

Optional configuration:

Primary:
`PRODUCT_RESEARCH_DEEP -> Provider A / Model X`

Fallback:
`Provider B / Model Y`

Fallback should only occur according to explicit policy.

Reasons may include:

- provider outage;
- rate limiting;
- unavailable model.

Do not silently switch providers if policy or data-governance requirements prohibit it.

---

## 8. Usage & Cost Telemetry

Record when available:

- provider;
- model;
- feature;
- tokens/input-output or equivalent usage;
- estimated/requested cost;
- latency;
- success/failure;
- retries.

Admin analytics may later expose AI usage and cost.

---

## 9. Permissions

Suggested permissions:

- `ai.use`
- `ai.product_import`
- `ai.view_usage`
- `ai.manage_models`
- `ai.manage_providers`
- `ai.manage_credentials`

Credential management should be restricted to the highest appropriate Admin role.

---

## 10. Design Principle

The AI system is infrastructure that assists Gamer Perú.

Commerce rules, catalog integrity, pricing, inventory, payments and authorization remain deterministic application responsibilities.

AI must never become the system of record for business-critical state.
