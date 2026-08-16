# Gamer Perú --- Master Specification v1.2

## Product

`gamerperu.com` is a premium multi-brand e-commerce specialized in
gaming peripherals, initially focused on Peru.

## Experience

Premium, minimal, editorial and product-first. WLMOUSE is the principal
visual/UX quality benchmark, but Gamer Perú must use its own brand,
design tokens, copy, media, compositions and implementation.

## v1 domains

-   Storefront
-   Catalog, variants and inventory
-   Search and category-aware filtering
-   Modular Product Story
-   Customer accounts and wishlist
-   Cart and checkout
-   Orders and fulfillment
-   Manual Yape/Plin payment verification
-   Promotions
-   Reviews foundation
-   Referrals and affiliates
-   Admin
-   Content management
-   Transactional communications
-   Technical and content SEO
-   Commerce/business analytics
-   AI Product Research & Import
-   AI Customer Assistant
-   Provider-agnostic AI infrastructure
-   Security, accessibility, performance, observability and recovery
-   EC OS integration contract

## AI Product Assistant

An administrator may start from product names/model identifiers and use
AI to research specifications, sources, media candidates, original
product copy and SEO drafts. Results are structured, sourced and
reviewable. Products remain drafts until authorized human approval by
default.

## AI Customer Assistant

The storefront includes an AI assistant capable of grounded product
discovery, recommendations, comparisons, public Gamer Perú information,
product links/cards and authorized customer-owned order support.

The public assistant never receives unrestricted database access.
Internal margins, supplier costs/terms, Admin notes, unpublished
information, secrets, other customers' data and private EC OS
information are excluded from its retrieval boundary.

## AI Provider Principle

AI business features use an internal provider abstraction and reusable
AI Profiles. Provider/model selection must be configurable without
rewriting product or chatbot business logic. API credentials remain
server-side secrets.

## Core principles

-   Mobile is intentional, not compressed desktop.
-   Product Story is modular and Admin-managed.
-   Commerce data is structured and deterministic.
-   SEO is architectural.
-   Manual payments are replaceable through a payment-method
    abstraction.
-   Sensitive operations are auditable.
-   AI assists; it is not the source of truth for price, inventory,
    payment or authorization.
-   EC OS is integrated downstream and is never required for storefront
    checkout availability.
