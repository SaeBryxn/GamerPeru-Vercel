# ADR-007 — AI Provider Gateway and Credential Security Architecture

## Status
ACCEPTED

## Context
Gamer Perú integrates artificial intelligence across two major operational surfaces:
1. **AI Product Research & Import (Internal Admin)**: Multi-model product extraction, structured technical spec normalization, and marketing copy generation.
2. **AI Customer Assistant (Public Storefront)**: Real-time customer hardware guidance, order status lookup, and compatibility assistance.

The architecture must support multi-provider adapters (OpenAI, Anthropic, Google Gemini), prevent vendor lock-in, enforce strict data boundaries (PUBLIC vs. CUSTOMER_PRIVATE vs. INTERNAL), and provide secure, encrypted-at-rest storage for Admin-configured provider API keys.

## Decision Drivers
- **Multi-Provider Agnosticism**: Ability to switch providers or models per feature profile without modifying business domain code.
- **Admin Credential Encryption**: Authorized admins can input provider API keys via `/admin/settings/ai`; keys must be encrypted at rest, never exposed in plaintext to browsers, logs, or analytics.
- **Customer Assistant Safety**: Public LLM interface must never have direct SQL access, raw database queries, or access to other customers' data or internal margins.
- **Structured Schema Validation**: All model outputs must be validated by Zod schemas before being presented as draft proposals.

## Options Considered
1. **Encrypted Database Storage (AES-256-GCM) with Server-Side Root Key**: Provider credentials encrypted at rest in PostgreSQL; master encryption key (`AI_ENCRYPTION_KEY`) stored strictly as a server environment variable. In-memory decryption occurs only within server-side AI adapters.
2. **Static Environment Variables Only (`.env`)**: Simple, but prevents Admin users from dynamically configuring, rotating, or testing provider credentials via the UI as required by canonical specs.
3. **Cloud KMS / Vault SaaS (AWS KMS / HashiCorp Vault)**: Enterprise-grade; powerful but introduces significant operational complexity and recurring infrastructure costs for v1.

## Decision
Adopt a **Provider-Agnostic AI Gateway with AES-256-GCM Credential Encryption**:

1. **AI Gateway & Adapter Interface**:
   - Internal `AIProvider` interface implementing `generateStructured()`, `generateText()`, `healthCheck()`, and `listModels()`.
   - Native adapters for **OpenAI**, **Anthropic**, and **Google Gemini** utilizing official TypeScript SDKs.
   - Reusable **AI Profiles** (`PRODUCT_RESEARCH_FAST`, `PRODUCT_RESEARCH_DEEP`, `SEO_COPY`, `PRODUCT_STORY`, `BATCH_IMPORT`, `CUSTOMER_SUPPORT`).
2. **Credential Security Architecture**:
   - Provider API keys submitted via `/admin/settings/ai` are encrypted using **AES-256-GCM** with a unique initialization vector (IV) and authentication tag per credential record before being written to PostgreSQL.
   - The master key (`AI_ENCRYPTION_KEY`, 256-bit) is injected securely at server runtime via environment variables, completely separated from the database.
   - Decryption is strictly restricted to server-side AI adapter execution.
   - The Admin UI displays only masked identifiers (e.g. `sk-...4a9f`) and health check statuses; plaintext secrets are never returned to the client.
3. **Customer Assistant Isolation**:
   - Public chat requests route through an allowlisted Tool & Retrieval Gateway.
   - Customer identity is derived exclusively from the verified server-side session cookie, never from LLM prompt parameters.
   - Direct database access is blocked; tool calls return filtered, sanitized JSON objects.

## Consequences
- **Positive**: Zero vendor lock-in, dynamic admin key management with military-grade encryption at rest, complete prompt injection protection for customer private data, schema-validated structured outputs.
- **Negative**: Requires maintaining and securely backing up the master encryption key.

## Security / SEO / Performance Impact
- **Security**: Complete protection against database compromise; ciphertext cannot be decrypted without the separate runtime master key.
- **SEO**: AI-generated copy is schema-validated and stored as static HTML/JSON in the catalog, ensuring optimal search engine crawling.
- **Performance**: AI calls run asynchronously in background jobs for import workflows, preventing browser request timeouts.

## Migration / Reversal
The `AIProvider` interface allows adding or replacing any LLM vendor (e.g., Mistral, local Ollama models) by implementing a single adapter class.
