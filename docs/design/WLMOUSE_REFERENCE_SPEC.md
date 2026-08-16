# WLMOUSE Visual & UX Reference Specification

---

## 1. Executive Summary

This specification establishes the visual and user-experience benchmark for Gamer Perú (`gamerperu.com`), derived from a structured analysis of the public WLMOUSE storefront (`wlmouse.com`).

WLMOUSE represents an industry benchmark for ultra-premium gaming peripheral presentation: high-contrast restrained interfaces, product-dominant visual hierarchy, large-scale hardware photography, technical specifications leveraged as primary marketing narratives, and modular editorial product storytelling.

However, WLMOUSE operates as a single-brand manufacturer with a boutique catalog of proprietary hardware (magnesium mice, HE keyboards, audio, and accessories). Gamer Perú is a **multi-brand, Peru-first gaming peripherals e-commerce retailer**. This document extracts the underlying UX principles and presentation standards that make WLMOUSE compelling, while translating those principles into an original, scalable, accessible, SEO-compliant, and legally distinct architecture for Gamer Perú.

**Core Mandates**:

- Adopt the premium product-first visual philosophy without cloning WLMOUSE's proprietary code, brand identity, copy, imagery, 3D assets, icons, logos, or distinctive compositions.
- Maintain a strict boundary between _WLMOUSE Observations_, _Gamer Perú Translations_, and _Future / TBD Business Decisions_.
- Preserve canonical Gamer Perú v1 constraints (manual Yape/Plin payment verification, multi-brand retail taxonomy, TBD logistics/warranty policies).
- Establish high-level design and performance principles while deferring exact design-token selections to **GP-002** and technical architecture to **GP-003**.

---

## 2. Review Scope & Date

- **Review Date**: August 16, 2026
- **Target Subject**: Live public digital properties of WLMOUSE (`https://www.wlmouse.com`)
- **Surfaces Inspected**:
  1. **Global Shell**: Header, navigation, announcement bar, drawer search, drawer cart (`Concept` theme baseline), country selector, footer, and trust modules.
  2. **Homepage**: Hero banners, product-line transitions, numeric stat callouts, feature highlights, and footer transitions.
  3. **Collection / Catalog**: All-products index, series-specific collections (`Beast X`, `Sword`, `Huan`, `Ying`, `Accessories`), grid density, card layout, and variant exposure.
  4. **Product Detail Pages (PDP)**:
     - Mice: _Beast X Pro_ (`/products/x-pro`), _Beast X Max_, _Beast X Mini Pro_, _Huan Wireless Gaming Mouse_, _Sword X_, _Ying Carbon Fiber_.
     - Keyboards: _Ying63_, _Ying75_, _Huan63 HE_ (Magnetic switch / Rapid Trigger).
     - Audio: _Huan IEM_ (Hybrid 1DD+8BA magnesium earphone).
     - Accessories: _Grip Tape_, _PTFE & Glass Skates_, _Cat/Cube 8K Dongles with LCD displays_.
  5. **Technical Infrastructure & Design System**: Responsive CSS tokens, fluid typography clamp curves, spacing scales, micro-interactions, modal drawers, and asset loading pipelines.

---

## 3. North-Star Principles

1. **Product as the Hero**: Products are never treated as generic commodity thumbnails. Every peripheral is showcased with large-scale, high-fidelity media highlighting industrial design, materials (magnesium alloy, carbon fiber, PBT), cutouts, and texture.
2. **Technical Specifications as Narrative**: Technical specifications (weight in grams, 8000Hz polling rate, PAW3950 sensors, Nordic MCUs, Hall Effect magnetic actuation) are not hidden in boring tables; they serve as bold visual marketing highlights.
3. **Restrained, High-Contrast UI**: The user interface recedes into the background. Neutral monochrome bases with crisp typography, generous whitespace, and minimal decorative clutter allow hardware colors and textures to command attention.
4. **Editorial Storytelling on PDP**: Below-the-fold product pages function as editorial deep-dives featuring exploded component views, structural engineering highlights, dimensional schematics, and package contents grids.
5. **Mobile-First Intentionality**: Mobile layouts are designed with distinct touch ergonomics (drawer-based navigation, horizontal media carousels, sticky commerce controls, and thumb-friendly action bars) rather than shrunk-down desktop pages.
6. **Multi-Brand Retail Scalability**: The experience balances boutique brand focus with scalable multi-brand discovery, category filtering, faceted search, and brand landing pages.

---

## 4. Global Navigation Analysis

### 4.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - Observed on reference]`: **Announcement Bar**: Ultra-slim top bar displaying shipping or product availability updates with high contrast.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Header Layout**: Minimalist sticky header with brand wordmark centered/left, surrounded by clean horizontal navigation links.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Navigation Architecture**: Organized strictly by proprietary product families (_Beast X Series_, _Sword Series_, _Huan Series_, _Keyboards_, _Accessories_, _Support_, _Software/Hub_).
- `[WLMOUSE OBSERVATION - NON-BINDING]`: **Utility Actions**: Search, User Account, and Cart icons utilizing light stroke iconography (approx. 1.5px stroke weight in CSS baseline).
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Drawer Overlays**: Search and Cart open in off-canvas slide-out drawers rather than redirecting to separate utility pages.

### 4.2 Gamer Perú Translation

- `[GAMER PERÚ TRANSLATION]`: **Multi-Brand Retail Taxonomy**: Replace manufacturer product-family links with a structured e-commerce navigation tree:
  - By Category: Mice, Keyboards, Mousepads, Audio/Headsets, Microphones, Controllers, Accessories.
  - By Brand: Curated multi-brand catalog (WLMOUSE, Lamzu, Ninjutso, Endgame Gear, Pulsar, ATK, VXE, Finalmouse, etc.).
  - By Specification / Grip: Ultra-lightweight (<45g), Ergonomic, Symmetrical, Small/Medium/Large grip.
- `[GAMER PERÚ TRANSLATION]`: **Mega-Menu / Dropdown**: Multi-column desktop mega-menu with featured product highlights and brand logos alongside structured category links.
- `[GAMER PERÚ TRANSLATION]`: **Search Integration**: Interactive predictive search drawer returning instant matching products, brands, and categories with live pricing and thumbnail previews.
- `[GAMER PERÚ TRANSLATION]`: **Utility Iconography**: Clean, restrained stroke iconography (exact stroke width, grid alignment, and icon tokens defined in GP-002).

---

## 5. Homepage Analysis

### 5.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - Observed on reference]`: **Hero Composition**: Full-bleed hero banner with dramatic edge lighting, high-detail product silhouette, concise primary headline, sub-headline highlighting weight/material, and high-contrast CTA button.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Whitespace & Scale**: Generous vertical section spacing creating a high-end luxury editorial rhythm.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Numeric Stat Callouts**: Massive numerical typography (`39g`, `8000Hz`, `0.125ms`) juxtaposed with concise technical labels.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Alternating Contrast Blocks**: Alternating dark and light background sections separating distinct hardware categories.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Seamless Transitions**: Soft gradient fades and crisp borders separating editorial hardware features from collection carousels.

### 5.2 Gamer Perú Translation

- `[GAMER PERÚ TRANSLATION]`: **Hero Carousel / Feature Grid**: Hero showcasing curated flagship drops across multiple brands with Gamer Perú availability callouts.
- `[GAMER PERÚ TRANSLATION]`: **Category Visual Entry Points**: Visual category tiles displaying iconic hardware categories rather than single-product focus.
- `[GAMER PERÚ TRANSLATION]`: **Competitive Gaming Curations**: Curated sections based on competitive gaming profiles (e.g., "Top Mice for Tactical FPS", "Rapid Trigger Keyboards", "Glass & Control Mousepads").
- `[GAMER PERÚ TRANSLATION]`: **Trust & Guarantee Strip**: Highlighting localized Peruvian value propositions:
  - Stock transparency (`[TBD BUSINESS DECISION: Stock display policy]`).
  - Nationwide shipping coverage (`[TBD BUSINESS DECISION: Courier provider TBD]`).
  - Warranty / returns information — configured from approved Gamer Perú policy; terms TBD (`[TBD BUSINESS DECISION]`).
  - Yape / Plin manual verification (`[CANONICAL V1 PAYMENT]`).

---

## 6. Collection & Listing Experience

### 6.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - Observed on reference]`: **Grid Density**: Multi-column desktop grid adapting to 1 or 2 columns on mobile.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Card Ratios**: Vertical aspect ratios giving maximum height to product photography.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Filtering**: Minimalist toolbar due to manufacturer's small SKU count.

### 6.2 Gamer Perú Translation

- `[GAMER PERÚ TRANSLATION]`: **Faceted Navigation Sidebar**: Robust multi-brand filter engine on collection and category pages:
  - Category-specific attributes: Weight range slider, Sensor model, Polling rate (1K, 4K, 8K), Connectivity (Wireless 2.4GHz, Bluetooth, Wired), Switch technology (Optical, Mechanical, Magnetic HE).
  - Commercial filters: Brand, Price Range (S/), Stock availability, Colorway.
- `[GAMER PERÚ TRANSLATION]`: **Sort Controls**: Price low-to-high, Price high-to-low, Newest Arrivals, Weight, Best Sellers.
- `[GAMER PERÚ TRANSLATION]`: **Active Filter Chips**: Dismissible filter chips above the grid with instant clear-all.
- `[GAMER PERÚ TRANSLATION]`: **Crawl-Safe Filter Architecture**: Structured SEO landing pages for primary category/brand combinations, while preventing crawl traps on dynamic multi-facet combinations.

---

## 7. Product Card Analysis

### 7.1 Category-Aware Attribute Strategy

`[GAMER PERÚ TRANSLATION]`: Product cards must avoid generic e-commerce layouts. Each card features prominent product imagery, brand badge, product title, current price (with compare-at price when discounted), stock badge, and **category-specific technical tags**:

```text
+---------------------------------------------+
| [BRAND BADGE]           [STOCK / SALE BADGE]|
|                                             |
|                                             |
|             [HIGH-RES PRODUCT MEDIA]        |
|             (Secondary angle on hover)      |
|                                             |
|                                             |
+---------------------------------------------+
| Brand Name                                  |
| Product Full Model Name                     |
|                                             |
| [ SPEC PILL 1 ]  [ SPEC PILL 2 ]  [ 8K ]    |
|                                             |
| S/ 449.00  S/ 499.00                        |
| [ Color Swatches ]                          |
+---------------------------------------------+
```

### 7.2 Category-Specific Attribute Matrix (`[GAMER PERÚ TRANSLATION]`)

| Category            | Primary Spec Pill 1                 | Primary Spec Pill 2                | Primary Spec Pill 3            |
| ------------------- | ----------------------------------- | ---------------------------------- | ------------------------------ |
| **Gaming Mice**     | Weight (e.g. `39g`, `42g`)          | Sensor (e.g. `PAW3950HS`)          | Polling Rate (e.g. `8000Hz`)   |
| **Keyboards**       | Switch Type (e.g. `Magnetic HE`)    | Layout (e.g. `75%`, `60%`)         | Feature (e.g. `Rapid Trigger`) |
| **Mousepads**       | Surface (e.g. `Glass`, `Cloth`)     | Dimensions (e.g. `490x420mm`)      | Base Material (e.g. `PORON`)   |
| **Headsets / IEMs** | Driver Configuration                | Connection (e.g. `2.4GHz / 3.5mm`) | Weight / Mic feature           |
| **Accessories**     | Compatibility (e.g. Model specific) | Material (e.g. `PTFE / Glass`)     | Color / Profile                |

---

## 8. Product Detail Page (PDP) Analysis

### 8.1 Above-The-Fold Commerce Architecture

- `[WLMOUSE OBSERVATION - Observed on reference]`:
  - Interactive media gallery with full-height product shots, detail macros of cutouts, dongle display, and bundled accessories.
  - Right-side commerce column with title, price, color swatches with immediate image switching, technical variant selectors, and Add to Cart button.
- `[GAMER PERÚ TRANSLATION]`:
  - **Brand Badge & Link**: Clickable link to dedicated Brand collection page.
  - **Pricing Block**: Clear currency formatting in Peruvian Soles (`S/`), discount badges, and list pricing.
  - **Variant Selectors**:
    - Colorway selector with visual circular swatches and color labels.
    - Technical variant selectors (e.g., Switch Type, Polling Dongle bundle).
  - **Stock Status**: Real-time stock status derived from deterministic inventory rules (`[TBD BUSINESS DECISION: Stock badge terminology TBD]`).
  - **Fulfillment & Shipping Block**: Real-time shipping estimator based on destination department/district (`[TBD BUSINESS DECISION: Courier provider TBD]`).
  - **Action Block**: Primary high-contrast **Añadir al Carrito** button + secondary Wishlist toggle.
  - **Payment Trust Block**: Prominent display of canonical v1 payment methods (**Yape** and **Plin** manual verification).
  - _Note on Gateways / Cards_: `[FUTURE / NOT PART OF V1 / PROVIDER TBD]`.

---

## 9. Modular Product Story System

`[GAMER PERÚ TRANSLATION]`: WLMOUSE's below-the-fold narrative structure is formalized into an **Admin-driven, reusable Product Story component library**:

### 9.1 Story Component Definitions

1. **`HeroMedia`**: Full-width cinematic banner featuring the peripheral in an atmospheric setting with title overlay and core value proposition.
2. **`FullBleedImage`**: Edge-to-edge high-resolution macro shot highlighting textures, materials (magnesium honeycomb, carbon fiber weave, CNC chamfers).
3. **`ImageText`**: 50/50 split section combining detailed hardware imagery with editorial prose explaining technical advantages (e.g., structural rigidity vs plastic).
4. **`StatHighlight`**: High-impact 2 to 4-column metric grid with giant numeric typography (`39g`, `8K Hz`, `30,000 DPI`, `0.125ms`) and concise explanations.
5. **`SpecFeature`**: Visual breakdown of a flagship feature (e.g., 8K Dongle LCD custom display screen, Rapid Trigger switch actuation curve).
6. **`Comparison`**: Spec and dimensional comparison against predecessor models or category benchmarks.
7. **`Dimensions`**: Blueprint orthographic drawings (top, side, front) indicating length, grip width, height, and recommended grip styles (Claw, Fingertip, Palm).
8. **`BoxContents`**: Structured visual grid listing everything inside the retail package (Peripheral, Receiver, Cable, Skates, Grip Tape, Manual).
9. **`TechnicalSpecs`**: Two-column comprehensive technical specification table covering Sensor, MCU, DPI, Tracking Speed, Acceleration, Polling Rate, Switches, Battery Life, Weight, Dimensions, Software compatibility.
10. **`FAQ`**: Category and product-specific frequently asked questions (firmware updates, web driver access, warranty coverage).
11. **`RelatedProducts`**: Curated complementary accessories (compatible grip tapes, glass skates, desk pads, custom cables).

---

## 10. Cart & Commerce Interaction Analysis

### 10.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - Observed on reference]`: **Slide-Out Drawer Cart**: Triggered instantly upon clicking "Add to Cart" without full page reload.
- `[WLMOUSE OBSERVATION - Observed on reference]`: **Drawer Information Hierarchy**: Selected item thumbnail, variant title, unit price, quantity increment/decrement controls, subtotal, and checkout CTA button.

### 10.2 Gamer Perú Translation

- `[GAMER PERÚ TRANSLATION]`: **Drawer Cart Architecture**:
  - Slide-out drawer cart supporting real-time item management and subtotal calculation.
  - Transparent notification of Peruvian payment verification process (Yape/Plin manual verification in v1).
  - Seamless transition to Gamer Perú checkout.
  - Cross-sell recommendations for relevant accessories (e.g., skates, grip tape).
  - _Note on Express Checkout / Saved Cards_: `[FUTURE / NOT PART OF V1 / PROVIDER TBD]`.

---

## 11. Search & Discovery Analysis

- `[WLMOUSE OBSERVATION - Observed on reference]`: **Search Drawer**: Slide-out/modal search drawer providing predictive text search.
- `[GAMER PERÚ TRANSLATION]`: **Multi-Brand Predictive Search**:
  - Instant matching for products, brands, and categories.
  - Keyword extraction by model identifiers (e.g., "PAW3950", "8K", "HE", "Beast").
  - Helpful zero-results fallback suggesting popular categories and support assistance.

---

## 12. Typography & Hierarchy Observations

### 12.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - NON-BINDING]`:
  - Primary font: Inter (`Inter, sans-serif`) with weights 400 (regular), 500 (medium), and 700 (bold).
  - Heading characteristics: Tight letter-spacing (approx. `-0.03em`), tight line-height (`1.0` to `1.1`), clean modern technical style.
  - Fluid typography: CSS `clamp()` scaling adapting font sizes across mobile and wide viewports.

### 12.2 Principle for GP-002 (`[GAMER PERÚ TRANSLATION]`)

- `[GAMER PERÚ TRANSLATION]`: Gamer Perú will define its own original typography pairings and fluid scales in **GP-002**, adhering to the core principle of confident, tight technical headings and highly legible body text.
- _Non-binding Reference Note_: WLMOUSE font family and exact scale equations are recorded for research context only. GP-002 is solely responsible for creating Gamer Perú's canonical typography.

---

## 13. Grid, Spacing & Whitespace Observations

### 13.1 Observations from Reference (WLMOUSE)

- `[WLMOUSE OBSERVATION - NON-BINDING]`:
  - Fluid container expanding up to 2000px on ultra-wide viewports with responsive horizontal gutters.
  - Restrained component radii (approx. 4px to 8px) on interactive controls and cards.

### 13.2 Principle for GP-002 (`[GAMER PERÚ TRANSLATION]`)

- `[GAMER PERÚ TRANSLATION]`: Gamer Perú will establish an original spacing scale, layout container system, and component radius scale in **GP-002**, utilizing generous whitespace to elevate hardware photography while maintaining structured density on data-heavy product matrices.

---

## 14. Media Treatment

- `[WLMOUSE OBSERVATION - Observed on reference]`: High-resolution hardware photography with sharp lighting capturing metallic, matte, and cutout textures against dark and light backdrops.
- `[GAMER PERÚ TRANSLATION]`:
  - High-fidelity product photography with consistent aspect ratios across catalog grids and storytelling banners (exact aspect ratio tokens defined in GP-002).
  - Gamer Perú must use an optimized responsive media pipeline using modern efficient formats appropriate to the architecture selected later, such as WebP/AVIF where applicable, with explicit container dimensions to prevent layout shifts.

---

## 15. Motion & Micro-interactions

### 15.1 Observations & Translation

- `[WLMOUSE OBSERVATION - NON-BINDING]`: Subtle card hover transitions (secondary image crossfade) and smooth, fast drawer slide-ins in reference theme.
- `[GAMER PERÚ TRANSLATION - Adopted Motion Principles]`:
  - Subtle hover lift and visual feedback on product cards without jarring shifts.
  - Smooth cross-fade between primary and secondary product views on card hover.
  - Snappy, lightweight off-canvas drawer transitions.
  - Accordion transitions for specifications and FAQ sections.
  - _Note on Motion Tokens_: Exact Gamer Perú transition durations, easing curves, and transforms will be defined in **GP-002**. Motion must never delay purchasing interactions.
- `[GAMER PERÚ TRANSLATION - Rejected Motion]`:
  - Scroll hijacking / forced full-page snapping.
  - Unbudgeted 3D canvas rendering that causes thread blocking or battery drain.
  - Animations that delay interactive Add to Cart actions.
- `[GAMER PERÚ TRANSLATION - Accessibility Requirement]`: Complete `prefers-reduced-motion` compliance collapsing animations to instantaneous opacity transitions.

---

## 16. Mobile Behavior

`[GAMER PERÚ TRANSLATION]`: Mobile is an intentional, first-class experience:

1. **Header & Navigation**: Compact header with brand mark, search trigger, cart badge, and clean hamburger slide-out drawer containing category trees and brand lists.
2. **Product Detail Page Hierarchy**:
   - Swipeable horizontal media gallery with visual pagination counter.
   - Sticky bottom action bar when scrolling past main Add to Cart: displays mini title, price, and instant "Añadir al Carrito" button.
   - Variant selection via horizontal scrolling pill chips.
   - Collapsible accordion blocks for Specs, Box Contents, Shipping, and Warranty to prevent infinite page scroll fatigue.
3. **Touch Targets**: All interactive elements (buttons, swatches, menu items, quantity selectors) meet accessibility guidelines for touch ergonomics (e.g., WCAG 44x44px minimum target size).
4. **Mobile Performance**: Priority loading for mobile-optimized image crops and touch-optimized gestures.

---

## 17. Multi-Brand Retail Adaptation

| Dimension                    | Single-Brand Manufacturer (WLMOUSE)                  | Multi-Brand Retailer (Gamer Perú)                                                               |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Catalog Scope**            | 1 brand, boutique SKU count                          | Multi-brand catalog, scalable SKU architecture                                                  |
| **Information Architecture** | Proprietary product lines (_Beast_, _Sword_, _Huan_) | Categories (_Mice_, _Keyboards_, _Audio_) + Brands + Technical Attributes                       |
| **Discovery Model**          | Linear marketing showcase                            | Dynamic search, faceted filters, sorting, recommendations                                       |
| **Product Detail Page**      | Bespoke single-model editorial                       | Dynamic Product Story builder combining structured specs + modular blocks                       |
| **Commercial Trust**         | Direct factory shipping                              | Local Peruvian stock, domestic fulfillment, warranty transparency, Yape/Plin verification       |
| **Customer Accounts**        | Basic order tracking                                 | Customer accounts with wishlists, order history, address book, referral program                 |
| **SEO Strategy**             | Brand/model name search                              | Broad commercial search ("mouse gamer inalámbrico perú", category landing pages, buying guides) |

---

## 18. Peru-Specific Trust Adaptation

Gamer Perú adapts global e-commerce trust patterns for the Peruvian domestic market:

1. **Local Payment Verification (v1)**: Clear visual guidance for **Yape** and **Plin** QR payments, including transaction code submission and Admin human verification timelines (`[CANONICAL V1 PAYMENT]`).
2. **Stock Transparency**: Explicit stock badges derived from inventory rules (`[TBD BUSINESS DECISION: Stock badge terminology TBD]`).
3. **Fulfillment Transparency**: Dynamic delivery estimation based on destination (`[TBD BUSINESS DECISION: Courier provider & delivery SLA TBD]`).
4. **Warranty & Returns Transparency**: Prominent slot for warranty and return policy details, configured from approved Gamer Perú policy; terms TBD (`[TBD BUSINESS DECISION]`).
5. **Customer Assistance**: Accessible customer service options (`[TBD BUSINESS DECISION: Support channel TBD]`).

---

## 19. SEO Implications

1. **Semantic HTML Hierarchy**: Strict single `<h1>` per page (Product Title, Category Name, Brand Name), semantic `<section>`, `<article>`, `<header>`, `<footer>`, and `<nav>`.
2. **Indexable Content vs Image Text**: **Never bake product descriptions, specs, or marketing copy into static image graphics**. All text remains machine-readable semantic HTML.
3. **Structured Data (Schema.org JSON-LD)**:
   - `Product` schema with name, description, brand, SKU, offers (price, currency `PEN`, availability).
   - `aggregateRating` and `review` properties are **conditional**: emitted ONLY when genuine qualifying reviews exist (never fabricated).
   - `BreadcrumbList` schema for Google search snippet breadcrumbs.
   - `Organization` schema for store identity.
4. **Crawlable Navigation**: All category, brand, and subcategory links use clean standard anchor tags (`<a href="/categoria/mouse">`) rather than client-only event handlers.
5. **Faceted Navigation Indexing**:
   - Primary curated category and brand landing pages may be intentionally indexable.
   - Uncontrolled dynamic multi-facet combinations are prevented from creating crawl traps through canonical tags or robots directives.
   - Exact facet indexing policies are finalized in dedicated SEO tasks (GP-036 to GP-039).

---

## 20. Performance Implications

1. **Provisional Performance Targets (`[PROVISIONAL / ASPIRATIONAL]` Goal)**:
   - Aggressive LCP optimization (provisional target: < 1.8s on 4G mobile for hero and main PDP media).
   - Near-zero layout shifts (provisional target: CLS = 0).
   - _Final architecture performance budgets are validated during GP-003 and GP-044._
2. **Modern Image Formats**: Use of modern efficient image formats (such as WebP/AVIF) with responsive `srcset` and `sizes` attributes appropriate to the selected platform architecture.
3. **Layout Shift Prevention**: Pre-allocation of container dimensions / aspect-ratio containers to prevent layout jumping.
4. **Viewport-Critical Media Loading Strategy**:
   - Above-the-fold / LCP-critical media must NOT be lazily loaded (preloaded/prioritized where applicable).
   - Below-the-fold non-critical storytelling media should be deferred/lazy-loaded where appropriate.
   - Collection-grid loading strategy must prioritize initially visible products and defer off-screen media.
   - Exact implementation mechanism is chosen in later architecture phases (GP-003 / GP-007).
5. **Video Optimization**: Silent looping video blocks must use lightweight formats (e.g., MP4/WebM) with explicit `poster` frames, `muted`, `playsinline`, and `autoplay` only when in viewport.

---

## 21. Accessibility (a11y) Implications

1. **Color Contrast (WCAG 2.1 AA)**: All text elements maintain a minimum contrast ratio of **4.5:1** against backgrounds (and **3:1** for large text/UI components).
2. **Keyboard Navigation**: Complete keyboard navigability (Tab, Shift+Tab, Enter, Space, Escape) across navigation, filter drawers, product carousels, modal drawers, and variant selectors.
3. **Focus States**: Clear, visible focus indicators (minimum 2px contrasting outline) on all interactive elements.
4. **Screen Reader Support (ARIA)**: Proper `aria-expanded`, `aria-controls`, `aria-label`, and `role` attributes on drawers, dropdowns, variant swatches, and accordions.
5. **Descriptive Alt Text**: All product media includes descriptive alt text detailing product model, colorway, and view angle.

---

## 22. ADOPT Matrix

| Pattern / Principle                     | Source Reference               | Gamer Perú Translation                                                           |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| **Product-Dominant Visual Scale**       | WLMOUSE Homepage & PDP         | Large, high-resolution product photography dominating layout with crisp contrast |
| **Technical Specs as Visual Marketing** | WLMOUSE Hero & Stat Callouts   | Bold numeric metrics (`39g`, `8000Hz`, `PAW3950`) as primary marketing elements  |
| **Restrained Monochrome UI**            | WLMOUSE Global Shell           | Neutral dark/light backdrop allowing vibrant hardware finishes to stand out      |
| **Modular Long-Form PDP Storytelling**  | WLMOUSE Editorial PDP sections | Admin-driven Product Story block system below the fold                           |
| **Slide-Out Drawer Cart**               | WLMOUSE Cart Drawer            | Off-canvas drawer cart with clear subtotal and checkout CTA                      |
| **Predictive Search Overlay**           | WLMOUSE Search Drawer          | Instant search drawer returning products, brands, and categories                 |
| **Minimalist Thin Iconography**         | WLMOUSE Utility Header         | Light stroke weight iconography across the global shell                          |

---

## 23. ADAPT Matrix

| Pattern / Principle          | WLMOUSE Original                       | Gamer Perú Adaptation                                                                                 |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Information Architecture** | Proprietary product-family navigation  | Multi-brand retail taxonomy (Categories + Brands + Specs + Use Cases)                                 |
| **Product Cards**            | Single-product image + title + price   | Category-aware cards with dynamic spec pills (Weight, Sensor, Switches, Layout)                       |
| **Filtering & Sorting**      | Minimal/no filtering                   | Multi-attribute faceted filter engine with crawl-safe URLs                                            |
| **Product Configuration**    | Specific WLMOUSE switch/dongle choices | Universal variant selectors handling colorways, switch types, layouts, bundles                        |
| **Trust & Guarantees**       | Global shipping messaging              | Peru-specific trust: Domestic delivery ETA TBD, Warranty / returns policy TBD, Yape/Plin verification |
| **Media Delivery**           | Standard theme delivery                | Responsive asset pipeline using modern formats (e.g. WebP/AVIF) and viewport-critical loading         |
| **Customer Accounts**        | Basic customer hub                     | Gamer Perú accounts with wishlist, order tracking, address book, referral program                     |

---

## 24. REJECT Matrix

| Pattern / Anti-Pattern                 | Reason for Rejection                                             | Gamer Perú Standard                                                             |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Manufacturer-Only IA**               | Cannot scale to multi-brand retail catalog                       | Comprehensive category and brand navigation hierarchy                           |
| **Text Baked into Graphics**           | Destroys SEO indexability, accessibility, and translation        | All descriptions, titles, and specs rendered as semantic HTML                   |
| **Scroll Hijacking / Forced Snapping** | Degrades user control, creates mobile friction                   | Native, fluid scrolling with hardware-accelerated transitions                   |
| **Unbudgeted Video / 3D Canvas**       | Harms Core Web Vitals and mobile performance                     | Budgeted, optimized video with poster frames; 3D only when optional/performant  |
| **Pixel-for-Pixel Layout Copies**      | Intellectual property infringement and lack of brand distinction | Original Gamer Perú design system, layouts, components, and brand identity      |
| **Global Single-Currency Pricing**     | Irrelevant for Peruvian domestic market                          | Primary pricing in Peruvian Soles (`S/`) with localized tax and payment details |

---

## 25. Anti-Clone & IP Boundaries

To ensure complete legal and brand distinction:

1. **Strict Code Isolation**: No HTML, CSS, JavaScript, or theme assets from WLMOUSE may be copied into Gamer Perú.
2. **Proprietary Media Prohibition**: No WLMOUSE product photography, renders, diagrams, marketing graphics, or logos may be committed into the repository or used as Gamer Perú production assets without explicit authorized distributor licensing.
3. **Copy & Marketing Isolation**: All product copy, SEO metadata, slogans, and category descriptions must be original Gamer Perú editorial copy.
4. **Distinctive Brand Identity**: Gamer Perú will establish its own logo, typography, color tokens, iconography, and styling in GP-002.

---

## 26. Inputs Required by GP-002

This specification provides the foundational conceptual inputs for **GP-002 — Gamer Perú Design Language**:

1. **Design System Requirements (To be created originally in GP-002)**:
   - Palette: Deep rich darks, pure crisp whites, neutral scale, and distinct Gamer Perú accent colors. _(GP-002 will create original color tokens; no hex codes are locked by GP-001)._
   - Typography: Clean technical heading font paired with highly legible body font, with defined fluid scaling equations. _(GP-002 will select original font pairings and scale)._
   - Spacing & Radius: Micro scale and macro section spacing; restrained corner radii. _(GP-002 will define original spacing/radius scales)._
   - Motion Tokens: Duration tokens, easing curves, and transform values. _(GP-002 will define original motion tokens)._
   - Iconography & Component Styling: Stroke weights, grid alignment, and styling tokens. _(GP-002 will define original icon and component systems)._
2. **Component Primitives to be Designed in GP-002**:
   - Buttons (Primary, Secondary, Ghost, Icon).
   - Badges & Spec Pills (Stock, Sale, Weight, Polling Rate, Sensor).
   - Card Components (Category-aware Product Card, Category Card, Brand Card, Story Card).
   - Form Inputs (Search, Filters, Selectors, Swatches).
   - Navigation Primitives (Header, Mega-Menu, Drawer, Footer).
3. **Product Story Block Layouts to be Defined in GP-002**:
   - Layout blueprints and responsive behavior for all 11 modular story components.

_Reference Observation — Non-binding: WLMOUSE palette, dimensions, and motion values recorded during research are non-binding reference material. GP-002 is solely responsible for defining original Gamer Perú design tokens independently._

---

## 27. Open Questions

- _None blocking_. All UX translations, multi-brand adaptations, and IP boundaries are locked for GP-002 execution. Commercial policies (courier selection, warranty terms, support channels) remain configurable TBD slots.

---

## 28. GP-001 Definition of Done

- [x] Fresh public WLMOUSE storefront review completed and documented (August 16, 2026).
- [x] Comprehensive visual and UX analysis covering Global Shell, Homepage, Collections, Cards, PDP, Storytelling, Cart, Search, Mobile, and Motion.
- [x] Complete ADOPT, ADAPT, and REJECT classification matrices defined across all relevant dimensions.
- [x] Multi-brand retail adaptation explicitly mapped out.
- [x] Category-aware product card strategy defined for mice, keyboards, mousepads, audio, and accessories.
- [x] Modular Product Story block library defined for future implementation.
- [x] Cross-cutting SEO, Performance, Accessibility, and Peru-specific trust constraints formalized without unapproved business policies.
- [x] Strict Anti-Clone and Intellectual Property protection boundaries established.
- [x] Actionable conceptual design inputs established for GP-002 without premature token locking.
