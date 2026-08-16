# Gamer Perú — AI Product Assistant Specification

## Status

APPROVED / CANONICAL (v1.2)

## Purpose

Add an AI-assisted workflow for researching, enriching and preparing products for publication in Gamer Perú.

The goal is to allow an administrator to start with only a product name, SKU, model code or a list of product names and progressively transform that input into a structured, reviewable product draft.

The AI must assist the administrator. It must never silently publish unverified product information.

---

## 1. Primary Use Cases

### Single Product Import

Administrator enters:

`WLMouse Beast X Max`

The system researches the product and creates a draft containing, when available:

- brand;
- exact model;
- product family;
- product category;
- product variants;
- official specifications;
- dimensions;
- weight;
- sensor / switch / connectivity / polling rate / battery or category-specific attributes;
- official or authorized media references;
- source URLs/references;
- short description;
- long description;
- highlights;
- technical specifications;
- SEO title;
- SEO meta description;
- slug suggestion;
- FAQ suggestions;
- Product Story suggestions.

### Batch Import

Administrator pastes a list of product names or uploads CSV.

The system creates an import job with per-product status:

- `RESEARCHING`
- `READY_FOR_REVIEW`
- `NEEDS_ATTENTION`
- `AMBIGUOUS`
- `SOURCE_CONFLICT`
- `FAILED`
- `APPROVED`
- `PUBLISHED`

### Existing Product Enrichment

Administrator may ask AI to:

- complete missing specifications;
- improve product description;
- generate SEO metadata;
- generate FAQ;
- suggest Product Story blocks;
- compare data against official sources;
- flag outdated or conflicting information.

---

## 2. Human-in-the-Loop Rule

AI-generated or AI-researched product information must enter Gamer Perú as a draft.

AI is allowed to:

- research;
- extract;
- normalize;
- classify;
- summarize;
- draft;
- suggest.

AI is NOT allowed to:

- mark manual payments as paid;
- publish new products automatically by default;
- change prices automatically;
- modify stock automatically;
- approve affiliate commissions;
- override Admin verification;
- silently resolve conflicting technical data.

Any of these actions require an authorized human or a future explicitly approved automation policy.

---

## 3. Source Priority

Product research should use the following trust hierarchy:

1. Official manufacturer product page.
2. Official technical documentation/manual.
3. Official manufacturer media/press/distributor kit.
4. Authorized distributor.
5. Reputable secondary technical source.
6. Other public sources only as supporting evidence.

If high-priority sources conflict, mark the field as `SOURCE_CONFLICT`.

Never hide disagreement from the administrator.

---

## 4. Media Rules

The AI may discover media references, but Gamer Perú must not automatically copy arbitrary images from search engines or third-party stores.

Preferred media sources:

1. Assets provided directly by Gamer Perú suppliers.
2. Official brand media kits.
3. Manufacturer assets explicitly usable by retailers/distributors.
4. Original Gamer Perú photography or 3D renders.
5. Other licensed assets.

Each imported media asset should be associated with:

- source;
- license/use status when known;
- original URL/reference;
- product;
- variant;
- alt text;
- attribution requirements if applicable.

If usage rights are unknown, store as a reference candidate only.

---

## 5. Structured Product Extraction

The AI must map researched data into category-specific schemas instead of creating uncontrolled free text.

### Mouse Example

- sensor;
- weight;
- dimensions;
- DPI;
- polling rate;
- switches;
- MCU;
- battery;
- connectivity;
- material;
- feet/skates;
- compatibility.

### Keyboard Example

- layout;
- size;
- switch technology;
- switch model;
- actuation;
- rapid trigger;
- polling rate;
- keycaps;
- connectivity;
- dimensions;
- weight;
- software compatibility.

### Headset Example

- driver;
- frequency response;
- impedance;
- microphone;
- connection;
- codec;
- battery;
- weight;
- compatibility.

Schemas must remain extensible through the catalog architecture.

---

## 6. AI-Generated Commerce Copy

The AI may generate original Gamer Perú copy from verified facts.

Outputs may include:

- short description;
- long description;
- feature highlights;
- technical explanations;
- comparison text;
- FAQs;
- SEO title;
- meta description;
- Product Story suggestions.

Generated copy must not reproduce manufacturer or competitor text verbatim beyond unavoidable product names or factual technical identifiers.

---

## 7. Confidence & Evidence

Every AI-enriched field should support provenance metadata where practical:

- value;
- source;
- confidence;
- verification status;
- last researched timestamp.

Suggested verification states:

- `VERIFIED_OFFICIAL`
- `VERIFIED_SECONDARY`
- `AI_INFERRED`
- `CONFLICT`
- `UNVERIFIED`

High-risk or ambiguous fields should require explicit Admin review.

---

## 8. AI Product Assistant in Admin

Suggested route:

`/admin/products/ai-import`

Suggested workflow:

1. Enter one or multiple products.
2. Choose AI profile/model.
3. Start research.
4. AI creates structured drafts.
5. Admin reviews sources, conflicts and media rights.
6. Admin edits if needed.
7. Admin approves.
8. Product is saved as draft or published.

The UI should show:

- research progress;
- model/provider used;
- source list;
- confidence;
- conflicts;
- missing data;
- generated content;
- media candidates;
- estimated AI cost when available.

---

## 9. Auditability

Store an audit trail for AI-assisted changes.

Recommended fields:

- provider;
- model;
- AI profile;
- request type;
- user/admin who initiated;
- timestamp;
- product;
- result status;
- fields changed;
- approval user;
- approval timestamp.

Avoid storing raw prompts containing secrets or sensitive information unnecessarily.

---

## 10. Cost Controls

Support configurable limits:

- maximum products per batch;
- maximum AI calls per import;
- maximum tokens/cost per task;
- concurrency;
- retry limit;
- expensive-model approval threshold;
- daily/monthly budget alerts.

Bulk research should use job queues rather than blocking a browser request.

---

## 11. Failure Handling

The system must gracefully handle:

- provider outage;
- rate limit;
- invalid API key;
- model unavailable;
- incomplete result;
- malformed structured output;
- source conflicts;
- ambiguous product names;
- unsupported product category;
- partial batch failure.

One failed product must not invalidate the entire batch.

---

## 12. Security

AI provider keys are server-side secrets.

Never:

- expose provider API keys in browser bundles;
- store plaintext keys in client-accessible database fields;
- send unnecessary customer data to AI providers;
- allow the AI assistant to execute privileged commerce actions without authorization.

---

## 13. Acceptance Criteria

- Single-product research supported.
- Batch product research supported.
- Products remain drafts until human approval by default.
- Source priority and conflicts are visible.
- Category-specific structured schemas are supported.
- AI output records provider/model metadata.
- Image/media import respects source/use rules.
- Provider failure does not corrupt product data.
- AI provider is replaceable without rewriting Product/Admin domains.
