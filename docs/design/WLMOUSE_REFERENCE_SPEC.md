# WLMOUSE Visual & UX Reference Specification

---

## 1. Executive Summary

This specification establishes the visual and user-experience benchmark for Gamer Perú (`gamerperu.com`), derived from a structured analysis of the public WLMOUSE storefront (`wlmouse.com`). 

WLMOUSE represents an industry benchmark for ultra-premium gaming peripheral presentation: high-contrast restrained interfaces, product-dominant visual hierarchy, large-scale hardware photography, technical specifications leveraged as primary marketing narratives, and modular editorial product storytelling.

However, WLMOUSE operates as a single-brand manufacturer with a boutique catalog of proprietary hardware (magnesium mice, HE keyboards, audio, and accessories). Gamer Perú is a **multi-brand, Peru-first gaming peripherals e-commerce retailer**. This document extracts the underlying UX principles and presentation standards that make WLMOUSE compelling, while translating those principles into an original, scalable, accessible, SEO-compliant, and legally distinct architecture for Gamer Perú.

**Core Mandate**: Adopt the premium product-first visual philosophy without cloning WLMOUSE's proprietary code, brand identity, copy, imagery, 3D assets, icons, logos, or distinctive compositions.

---

## 2. Review Scope & Date

* **Review Date**: August 16, 2026
* **Target Subject**: Live public digital properties of WLMOUSE (`https://www.wlmouse.com`)
* **Surfaces Inspected**:
  1. **Global Shell**: Header, navigation, announcement bar, drawer search, drawer cart, country selector, footer, and trust modules.
  2. **Homepage**: Hero banners, product-line transitions, numeric stat callouts, feature highlights, and footer transitions.
  3. **Collection / Catalog**: All-products index, series-specific collections (`Beast X`, `Sword`, `Huan`, `Ying`, `Accessories`), grid density, card layout, and variant exposure.
  4. **Product Detail Pages (PDP)**:
     - Mice: *Beast X Pro* (`/products/x-pro`), *Beast X Max*, *Beast X Mini Pro*, *Huan Wireless Gaming Mouse*, *Sword X*, *Ying Carbon Fiber*.
     - Keyboards: *Ying63*, *Ying75*, *Huan63 HE* (Magnetic switch / Rapid Trigger).
     - Audio: *Huan IEM* (Hybrid 1DD+8BA magnesium earphone).
     - Accessories: *Grip Tape*, *PTFE & Glass Skates*, *Cat/Cube 8K Dongles with LCD displays*.
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

### Observations
* **Announcement Bar**: Ultra-slim top bar displaying critical shipping, pre-order, or warranty updates with high contrast.
* **Header Layout**: Minimalist sticky header. Brand wordmark placed prominently, surrounded by clean horizontal navigation links.
* **Navigation Architecture**: Organized strictly by proprietary product families (*Beast X Series*, *Sword Series*, *Huan Series*, *Keyboards*, *Accessories*, *Support*, *Software/Hub*).
* **Utility Actions**: Search, User Account, and Cart icons utilizing light 1.5px stroke iconography, keeping visual weight minimal.
* **Drawer Overlays**: Search and Cart open in seamless off-canvas slide-out drawers rather than redirecting to separate thin utility pages.

### Multi-Brand Retail Translation for Gamer Perú
* **Taxonomy Evolution**: Replace manufacturer product-family links with a structured e-commerce taxonomy:
  - By Category: Mice, Keyboards, Mousepads, Audio/Headsets, Microphones, Controllers, Accessories.
  - By Brand: WLMOUSE, Lamzu, Ninjutso, Endgame Gear, Pulsar, ATK, VXE, Finalmouse, etc.
  - By Use Case / Hand Size: Ultra-lightweight (<45g), Ergonomic, Symmetrical, Small/Medium/Large grip.
* **Mega-Menu / Dropdown**: Multi-column desktop mega-menu with featured product callouts and brand logos alongside structured category links.
* **Search Integration**: Interactive predictive search drawer returning instant matching products, brands, and categories with live pricing and thumbnail previews.

---

## 5. Homepage Analysis

### Observations
* **Hero Composition**: Full-bleed hero banner with dramatic edge lighting, high-detail product silhouette, concise primary headline, sub-headline highlighting weight/material, and high-contrast CTA button ("Shop Now" / "Explore").
* **Whitespace & Scale**: Generous vertical section spacing (80px to 160px) creating a high-end luxury editorial rhythm.
* **Numeric Stat Callouts**: Massive numerical typography (`39g`, `8000Hz`, `0.125ms`) juxtaposed with concise technical labels.
* **Alternating Dark / Light Narrative Blocks**: Alternating background sections (pure dark `#171717` vs crisp light `#FFFFFF`) separating distinct hardware categories.
* **Seamless Transitions**: Soft gradient fades and crisp borders separating editorial hardware features from collection carousels.

### Gamer Perú Adaptation
* **Hero Carousel / Feature Grid**: Hero showcasing curated flagship drops across multiple brands with Gamer Perú localized availability ("En Stock en Lima", "Lanzamiento Exclusivo").
* **Category Visual Entry Points**: Visual category tiles displaying iconic hardware categories rather than single-product focus.
* **Trending & Pro Picks**: Curated sections based on competitive gaming popularity (e.g., "Top Mice for Valorant & CS2", "Rapid Trigger Keyboards", "Artisan & Glass Mousepads").
* **Trust & Guarantee Strip**: Highlighting local Peruvian value propositions (Immediate Lima Delivery, Nationwide Shipping via Olva/Shalom, Official Warranty, Yape/Plin verification).

---

## 6. Collection & Listing Experience

### Observations
* **Grid Density**: 3 to 4 columns on large desktop, 2 columns on tablet, 1 to 2 columns on mobile.
* **Card Ratios**: Vertical aspect ratios (approx. 1:1 or 4:5) giving maximum height to product photography.
* **Visual Filtering**: Minimalist filter toolbar on manufacturer site due to small SKU count.

### Gamer Perú Multi-Brand Translation
* **Faceted Navigation Sidebar**: Robust multi-brand filter engine on collection and category pages:
  - Category-specific attributes: Weight range slider (<40g, 40-50g, 50-60g, >60g), Sensor model, Polling rate (1K, 4K, 8K), Connectivity (Wireless 2.4GHz, Bluetooth, Wired), Switch technology (Optical, Mechanical, Magnetic HE).
  - Commercial filters: Brand, Price Range (S/), In Stock / Pre-order, Colorway.
* **Sort Controls**: Price low-to-high, Price high-to-low, Newest Arrivals, Weight, Best Sellers.
* **Active Filter Chips**: Dismissible filter chips above the grid with instant clear-all.
* **Crawl-Safe Filter Architecture**: Search engines index primary category/brand combinations (`/categoria/mouse/wlmouse`) while preventing crawl traps on dynamic multi-facet combinations through canonical tags and robots controls.

---

## 7. Product Card Analysis

### Category-Aware Attribute Strategy
Product cards must avoid generic e-commerce layouts. Each card features prominent product imagery, brand badge, product title, current price (with compare-at price when discounted), stock badge, and **category-specific technical tags**:

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
| [ 3 Color Swatches: ⚫ ⚪ 🔴 ]              |
+---------------------------------------------+
```

### Category-Specific Attribute Matrix

| Category | Primary Spec Pill 1 | Primary Spec Pill 2 | Primary Spec Pill 3 |
|---|---|---|---|
| **Gaming Mice** | Weight (`39g`, `42g`) | Sensor (`PAW3950HS`) | Polling Rate (`8000Hz Wireless`) |
| **Keyboards** | Switch Type (`Magnetic HE`) | Layout (`75%`, `60%`) | Feature (`Rapid Trigger / 0.01mm`) |
| **Mousepads** | Surface (`Glass`, `Cordura`, `Cloth`) | Dimensions (`490x420x4mm`) | Base Material (`PORON Base`) |
| **Headsets / IEMs** | Driver Configuration (`1DD+8BA`) | Connection (`2.4GHz / 3.5mm`) | Weight / Mic (`Detachable Mic`) |
| **Accessories** | Compatibility (`Beast X Series`) | Material (`PTFE / Glass`) | Color / Profile |

---

## 8. Product Detail Page (PDP) Analysis

### 8.1 Above-The-Fold Commerce Architecture
* **Interactive Media Gallery (Left 55-60% Desktop)**:
  - High-resolution main viewer with zoom.
  - Multi-angle thumbnails: top shell, side grip profile, bottom base & skates, exploded internals, packaging & bundled dongle.
  - Video integration for sound tests (keyboards) or 360-degree rotations.
* **Commerce & Configuration Column (Right 40-45% Desktop)**:
  - Brand identity with clickable link to brand collection.
  - Product title with model sub-identifier.
  - Pricing block with clear currency formatting (`S/` Peruvian Soles), discount badges, and installment messaging.
  - Variant Selectors:
    * Colorway selector with visual circular swatches and color names.
    * Technical variant selectors (e.g., Switch Type: Omron Optical vs TTC Nihil; Polling Dongle included: Standard 1K vs 8K LCD).
  - Real-Time Stock Status: "En Stock en Almacén Lima", "Últimas unidades", or "Preventa con entrega estimada".
  - Shipping & Local Delivery Estimator: Real-time calculation based on Peruvian departments/districts.
  - Action Block: Primary high-contrast **Añadir al Carrito** button + secondary Wishlist toggle.
  - Local Payment Trust Box: Yape, Plin, Transferencia BCP/BBVA, Tarjetas.

---

## 9. Modular Product Story System

WLMOUSE's greatest strength is its below-the-fold narrative structure. Gamer Perú standardizes this into an **Admin-driven, reusable Product Story component library**:

### 9.1 Story Component Definitions

1. **`HeroMedia`**: Full-width cinematic banner featuring the peripheral in an atmospheric setting with title overlay and core value proposition.
2. **`FullBleedImage`**: Edge-to-edge high-resolution macro shot highlighting textures, materials (magnesium honeycomb, carbon fiber weave, CNC chamfers).
3. **`ImageText`**: 50/50 split section combining detailed hardware imagery with editorial prose explaining technical advantages (e.g., structural rigidity vs plastic).
4. **`StatHighlight`**: High-impact 2 to 4-column metric grid with giant numeric typography (`39g`, `8K Hz`, `30,000 DPI`, `0.125ms`) and concise explanations.
5. **`SpecFeature`**: Interactive or visual breakdown of a flagship feature (e.g., 8K Dongle LCD custom display screen, Rapid Trigger switch actuation curve).
6. **`Comparison`**: Interactive spec and dimensional comparison against predecessor models or category benchmarks.
7. **`Dimensions`**: Precise blueprint orthographic drawings (top, side, front) indicating length, grip width, height, and recommended grip styles (Claw, Fingertip, Palm).
8. **`BoxContents`**: Structured visual grid listing everything inside the retail package (Mouse, 8K Dongle, Type-C Paracord Cable, Extra PTFE Skates, Glass Skates, Grip Tape, Carrying Pouch, Manual).
9. **`TechnicalSpecs`**: Two-column comprehensive technical specification table covering Sensor, MCU, DPI, Tracking Speed, Acceleration, Polling Rate, Switches, Battery Life, Weight, Dimensions, Software compatibility.
10. **`FAQ`**: Category and product-specific frequently asked questions (firmware updates, web driver access, warranty coverage).
11. **`RelatedProducts`**: Curated complementary accessories (compatible grip tapes, glass skates, desk pads, custom cables).

---

## 10. Cart & Commerce Interaction Analysis

### Observations
* **Slide-Out Drawer Cart**: Triggered instantly upon clicking "Add to Cart" without page reload.
* **Information Hierarchy in Drawer**:
  - Selected item thumbnail, full variant name, unit price, quantity increment/decrement controls, remove button.
  - Free shipping progress bar dynamically updating with cart value.
  - Order notes / gift instructions accordion.
  - Subtotal calculation, discount code field, and primary "Finalizar Compra" checkout button.
  - Cross-sell recommendations ("Frequently Bought Together", e.g., grip tape or skate upgrades).

### Gamer Perú Adaptation
* Express checkout integration retaining drawer capability.
* Clear notice of Peruvian payment methods (Yape, Plin, Card) inside drawer.
* Seamless transition to secure multi-step or one-page checkout.

---

## 11. Search & Discovery Analysis

* **Predictive Search Modal**: Full-screen or off-canvas overlay triggered by header search icon or hotkey (`/` or `Cmd+K`).
* **Live Search Results**:
  - Instant product results with image, title, category, and price.
  - Brand matching (e.g., typing "WL" surfaces WLMOUSE brand page).
  - Popular search queries and recently viewed items.
* **Zero-Results State**: Helpful fallbacks suggesting popular categories, top-rated mice, or contacting support assistant.

---

## 12. Typography & Hierarchy Observations

### Observations
* **Font Family**: Inter (`Inter, sans-serif`) with weights 400 (regular), 500 (medium), and 700 (bold).
* **Heading Characteristics**: Tight letter-spacing (`-0.03em` tracking), tight line-height (`1.0` to `1.1`), clean uppercase or sentence-case treatment.
* **Body Text**: Generous line-height (`1.4` to `1.6`), neutral tones for secondary text (`#737373` / `#A3A3A3`).
* **Fluid Scaling**: CSS `clamp()` typography smoothly adapting font size from mobile viewports (360px) to ultra-wide desktop (2000px+).

### Principle for GP-002
Gamer Perú will define its own original typographic scale and font pairing in GP-002, adhering to this principle of tight, confident modern technical headings and readable, scannable body text.

---

## 13. Grid, Spacing & Whitespace Observations

* **Container Max-Width**: Fluid container expanding up to 2000px for full-bleed editorial sections, with content gutters clamped between 20px (mobile) and 80px (wide desktop).
* **Vertical Rhythm**: Micro spacing (4px, 8px, 12px, 16px, 24px) for UI controls; Macro spacing (48px, 64px, 96px, 128px) between major PDP storytelling sections.
* **Component Corner Radii**: Restrained radii (4px to 8px) on interactive buttons and inputs, avoiding bubbly or overly rounded aesthetics.

---

## 14. Media Treatment

* **High-Detail Hardware Photography**: Crisp isolation of matte and metallic textures against deep contrast backgrounds.
* **Macro Cutout Photography**: Close-ups capturing honeycomb structural cutouts, screw placements, sensor lenses, and scroll-wheel knurling.
* **Consistent Aspect Ratios**: Square (1:1) or vertical (4:5) for catalog grids; 16:9 or 21:9 for cinematic storytelling banners.
* **Asset Pipeline Requirements**: All production assets must be served via modern formats (WebP, AVIF) with responsive `srcset` definitions and pre-computed aspect-ratio containers to eliminate Layout Shifts (CLS).

---

## 15. Motion & Micro-interactions

### Restrained, Purposeful Animation Rules
* **Adopted Motion**:
  - Subtle hover lift on product cards (2-4px Y-translation with smooth cubic-bezier easing).
  - Smooth cross-fade between primary and secondary product images on card hover.
  - Snappy off-canvas drawer slide-in (250ms - 300ms ease-out).
  - Accordion expansion with hardware-accelerated height/opacity transitions.
* **Explicitly Rejected Motion**:
  - Scroll hijacking / forced full-page snapping.
  - Gratuitous 3D canvas rendering that blocks thread execution or battery life.
  - Animations that delay interactive Add to Cart actions.
  - Excessive mobile parallax causing viewport jank.
* **Accessibility (`prefers-reduced-motion`)**: When user has enabled reduced-motion settings, all animations immediately collapse to instant opacity fades or zero-duration transitions.

---

## 16. Mobile Behavior

Mobile is an intentional, first-class experience, not a shrunk desktop:

1. **Header & Navigation**: Compact 56px header with brand mark, search icon, cart badge, and clean hamburger slide-out drawer containing category trees and brand selectors.
2. **Product Detail Page Hierarchy**:
   - Swipeable horizontal gallery with pagination dots and counter (`1/8`).
   - Sticky bottom action bar when scrolling past main Add to Cart: displays mini product title, price, and instant "Añadir al Carrito" button.
   - Variant selection via horizontal scrolling pill chips rather than desktop dropdowns.
   - Collapsible accordion blocks for Specs, Box Contents, Shipping, and Warranty to prevent infinite page scroll fatigue.
3. **Touch Targets**: All interactive elements (buttons, swatches, menu items, quantity selectors) meet minimum 44x44px touch target guidelines.
4. **Mobile Performance**: Priority loading for mobile-optimized image crops, deferred non-critical media, and touch-optimized gestures.

---

## 17. Multi-Brand Retail Adaptation

| Dimension | Single-Brand Manufacturer (WLMOUSE) | Multi-Brand Retailer (Gamer Perú) |
|---|---|---|
| **Catalog Scope** | 1 brand, ~15 SKUs | Many brands, hundreds of SKUs |
| **Information Architecture** | Product lines (*Beast*, *Sword*, *Huan*) | Categories (*Mice*, *Keyboards*, *Audio*) + Brands + Attributes |
| **Discovery Model** | Linear marketing showcase | Dynamic search, faceted filters, sorting, recommendations |
| **Product Detail Page** | Bespoke single-model editorial | Dynamic Product Story builder combining structured specs + modular blocks |
| **Commercial Trust** | Direct factory shipping & warranty | Local Peruvian stock, instant delivery, local warranty, Yape/Plin verification |
| **Customer Accounts** | Basic order tracking | Wishlists, address book, saved payment preferences, referral links |
| **SEO Strategy** | Brand/model name search | Commercial intent search ("mouse gamer inalámbrico perú", category landing pages, buying guides) |

---

## 18. Peru-Specific Trust Adaptation

Gamer Perú adapts global e-commerce trust patterns for the Peruvian gaming ecosystem:

1. **Local Payment Verification**: Clear visual guidance for **Yape** and **Plin** QR payments, including transaction code submission and human confirmation timelines.
2. **Stock Truth & Fulfillment Transparency**: Explicit stock badges ("En Stock en Lima", "Envío Hoy Mismo", "Envío a Provincias por Olva / Shalom").
3. **Warranty & Local RMA Support**: Prominent assurance of local Gamer Perú warranty coverage, eliminating customer fears of international RMA shipping costs.
4. **Physical Pickup & Customer Service**: Direct WhatsApp support link and customer assistance options.

---

## 19. SEO Implications

1. **Semantic HTML Hierarchy**: Strict single `<h1>` per page (Product Title, Category Name, Brand Name), semantic `<section>`, `<article>`, `<header>`, `<footer>`, and `<nav>`.
2. **Indexable Content vs Image Text**: **Never bake product descriptions, specs, or marketing copy into static image graphics**. All text remains machine-readable semantic HTML.
3. **Structured Data (Schema.org JSON-LD)**:
   - `Product` schema with name, description, brand, SKU, offers (price, currency `PEN`, availability), aggregateRating, and review.
   - `BreadcrumbList` schema for seamless Google search snippet breadcrumbs.
   - `Organization` schema for local knowledge graph authority.
4. **Crawlable Navigation**: All category, brand, and subcategory links use clean standard anchor tags (`<a href="/categoria/mouse">`) rather than JavaScript-only event handlers.
5. **Canonical Consistency**: Faceted filter URLs enforce canonical tags to the base collection URL to prevent duplicate content indexation.

---

## 20. Performance Implications

1. **Largest Contentful Paint (LCP) Budget**:
   - Hero and PDP main images must load within **< 1.8s** on standard 4G mobile connections.
   - Main product images preloaded via `<link rel="preload">`.
2. **Modern Image Formats**: Automatic WebP and AVIF generation with responsive `srcset` and `sizes` attributes.
3. **Cumulative Layout Shift (CLS = 0)**: Explicit `width` and `height` (or CSS `aspect-ratio`) defined on all media containers to eliminate layout jumping during asset downloads.
4. **Lazy Loading**: Native `loading="lazy"` applied to all below-the-fold storytelling media and collection grid images.
5. **Video Optimization**: Silent looping video blocks must use lightweight MP4/WebM with explicit `poster` frames, `muted`, `playsinline`, and `autoplay` only when in viewport.

---

## 21. Accessibility (a11y) Implications

1. **Color Contrast (WCAG 2.1 AA)**: All text elements maintain a minimum contrast ratio of **4.5:1** against backgrounds (and **3:1** for large text/UI components).
2. **Keyboard Navigation**: Complete keyboard navigability (Tab, Shift+Tab, Enter, Space, Escape) across navigation, filter drawers, product carousels, modal drawers, and variant selectors.
3. **Focus States**: Clear, visible focus indicators (minimum 2px contrasting outline) on all interactive elements.
4. **Screen Reader Support (ARIA)**: Proper `aria-expanded`, `aria-controls`, `aria-label`, and `role` attributes on drawers, dropdowns, variant swatches, and accordions.
5. **Descriptive Alt Text**: All product media includes descriptive alt text detailing product model, colorway, and view angle.

---

## 22. ADOPT Matrix

| Pattern / Principle | Source Reference | Gamer Perú Translation |
|---|---|---|
| **Product-Dominant Visual Scale** | WLMOUSE Homepage & PDP | Large, high-resolution product photography dominating layout with crisp contrast |
| **Technical Specs as Visual Marketing** | WLMOUSE Hero & Stat Callouts | Bold numeric metrics (`39g`, `8000Hz`, `PAW3950`) as primary marketing elements |
| **Restrained Monochrome UI** | WLMOUSE Global Shell | Neutral dark/light backdrop allowing vibrant hardware finishes to stand out |
| **Modular Long-Form PDP Storytelling** | WLMOUSE Editorial PDP sections | Admin-driven Product Story block system below the fold |
| **Slide-Out Drawer Cart** | WLMOUSE Cart Drawer | Off-canvas drawer cart with free shipping meter, quick cross-sells, and checkout CTA |
| **Predictive Search Overlay** | WLMOUSE Search Drawer | Instant search drawer returning products, brands, and categories |
| **Minimalist Thin Iconography** | WLMOUSE Utility Header | 1.5px stroke weight icons for search, user account, wishlist, and cart |

---

## 23. ADAPT Matrix

| Pattern / Principle | WLMOUSE Original | Gamer Perú Adaptation |
|---|---|---|
| **Information Architecture** | Proprietary product-family navigation | Multi-brand retail taxonomy (Categories + Brands + Specs + Use Cases) |
| **Product Cards** | Single-product image + title + price | Category-aware cards with dynamic spec pills (Weight, Sensor, Switches, Layout) |
| **Filtering & Sorting** | Minimal/no filtering | Multi-attribute faceted filter engine with URL state and canonical tags |
| **Product Configuration** | Specific WLMOUSE switch/dongle choices | Universal variant selectors handling colorways, switch types, layouts, bundles |
| **Trust & Guarantees** | Global shipping messaging | Peru-specific trust: Lima same-day, Olva/Shalom nationwide, Local warranty, Yape/Plin |
| **Media Delivery** | Standard Shopify CDN | Responsive asset pipeline with automated WebP/AVIF generation and strict budgets |
| **Customer Accounts** | Basic Shopify customer hub | Gamer Perú accounts with wishlist, order tracking, address book, referral program |

---

## 24. REJECT Matrix

| Pattern / Anti-Pattern | Reason for Rejection | Gamer Perú Standard |
|---|---|---|
| **Manufacturer-Only IA** | Cannot scale to multi-brand retail catalog | Comprehensive category and brand navigation hierarchy |
| **Text Baked into Graphics** | Destroys SEO indexability, accessibility, and translation | All descriptions, titles, and specs rendered as semantic HTML |
| **Scroll Hijacking / Forced Snapping** | Degrades user control, creates mobile friction | Native, fluid scrolling with hardware-accelerated transitions |
| **Unbudgeted Video / 3D Canvas** | Harms Core Web Vitals and mobile performance | Budgeted, optimized video with poster frames; 3D only when optional/performant |
| **Pixel-for-Pixel Layout Copies** | Intellectual property infringement and lack of brand distinction | Original Gamer Perú design system, layouts, components, and brand identity |
| **Single-Currency Global Pricing** | Irrelevant for Peruvian domestic market | Primary pricing in Peruvian Soles (`S/`) with localized tax and payment details |

---

## 25. Anti-Clone & IP Boundaries

To ensure complete legal and brand distinction:

1. **Strict Code Isolation**: No HTML, CSS, JavaScript, or theme assets from WLMOUSE may be copied into Gamer Perú.
2. **Proprietary Media Prohibition**: No WLMOUSE product photography, renders, diagrams, marketing graphics, or logos may be committed into the repository or used as Gamer Perú production assets without explicit authorized distributor licensing.
3. **Copy & Marketing Isolation**: All product copy, SEO metadata, slogans, and category descriptions must be original Gamer Perú editorial copy.
4. **Distinctive Brand Identity**: Gamer Perú will establish its own logo, typography, color tokens, iconography, and styling in GP-002.

---

## 26. Inputs Required by GP-002

This specification provides the foundational inputs for **GP-002 — Gamer Perú Design Language**:

1. **Design Tokens Requirements**:
   - Palette: Deep rich darks, pure crisp whites, neutral scale (`#171717`, `#262626`, `#737373`, `#E5E5E5`), and distinct Gamer Perú accent colors.
   - Typography: Clean technical heading font paired with highly legible body font, with defined fluid scaling equations.
   - Spacing & Radius: Micro scale (2-24px) and macro section spacing (32-128px); restrained corner radii (4-8px).
2. **Component Primitives**:
   - Buttons (Primary, Secondary, Ghost, Icon).
   - Badges & Spec Pills (Stock, Sale, Weight, Polling Rate, Sensor).
   - Card Components (Product Card, Category Card, Brand Card, Story Card).
   - Form Inputs (Search, Filters, Selectors, Swatches).
   - Navigation Primitives (Header, Mega-Menu, Drawer, Footer).
3. **Product Story Block Specifications**:
   - Layout blueprints and responsive behavior for all 11 modular story components.

---

## 27. Open Questions

* *None blocking*. All UX translations, multi-brand adaptations, and IP boundaries are locked for GP-002 execution.

---

## 28. GP-001 Definition of Done

* [x] Fresh public WLMOUSE storefront review completed and documented (August 16, 2026).
* [x] Comprehensive visual and UX analysis covering Global Shell, Homepage, Collections, Cards, PDP, Storytelling, Cart, Search, Mobile, and Motion.
* [x] Complete ADOPT, ADAPT, and REJECT classification matrices defined across all relevant dimensions.
* [x] Multi-brand retail adaptation explicitly mapped out.
* [x] Category-aware product card strategy defined for mice, keyboards, mousepads, audio, and accessories.
* [x] Modular Product Story block library defined for future implementation.
* [x] Cross-cutting SEO, Performance, Accessibility, and Peru-specific trust constraints formalized.
* [x] Strict Anti-Clone and Intellectual Property protection boundaries established.
* [x] Actionable design inputs established for GP-002.
