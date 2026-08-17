# Gamer Perú — Homepage Implementation Specification (GP-010)

---

## 1. Purpose & Authority

This document defines the canonical architecture, visual design system translation, component model, media contracts, and accessibility standards for the Gamer Perú Homepage (`src/app/(storefront)/page.tsx`), implemented in **GP-010**.

**Canonical Authorities**:

- [AGENTS.md](file:///d:/Documentos/GamerPeru/AGENTS.md) — Core operating contract (multi-brand, Peru-first, zero warning policy).
- [GAMER_PERU_DESIGN_LANGUAGE.md](file:///d:/Documentos/GamerPeru/docs/design/GAMER_PERU_DESIGN_LANGUAGE.md) — Visual authority ("Machinery Obsidian & Signal Crimson").
- [DESIGN_SYSTEM_IMPLEMENTATION.md](file:///d:/Documentos/GamerPeru/docs/design/DESIGN_SYSTEM_IMPLEMENTATION.md) — GP-008 Design System tokens and primitives.
- [GLOBAL_NAVIGATION_IMPLEMENTATION.md](file:///d:/Documentos/GamerPeru/docs/design/GLOBAL_NAVIGATION_IMPLEMENTATION.md) — GP-009 Storefront shell integration.
- [WLMOUSE_REFERENCE_SPEC.md](file:///d:/Documentos/GamerPeru/docs/design/WLMOUSE_REFERENCE_SPEC.md) — Visual reference benchmark principles.

---

## 2. WLMOUSE Reference Observations & Originality Boundary

The owner-supplied visual reference repository (`https://github.com/latamcreativa/wlmouse.git`) served as a visual and UX benchmark.

### Benchmark Principles Extracted:

- **Product-First Dominance**: Hardware media commands visual authority with large scale and high contrast.
- **Fluid Typographic Scale**: Oversized headings (`clamp(38px, 5.2vw, 72px)`) with tight line-heights and negative tracking.
- **Generous Whitespace & Section Pacing**: Uncluttered sections with rhythmic vertical spacing (~96px on desktop).
- **Alternating Surface Rhythm**: High-contrast oscillation between dark canvas and light content blocks.
- **Quiet UI**: Minimalist card chrome, neutral media stages (`#F4F4F5`), and subtle hover transitions.

### Strict Originality Boundaries (Deliberately NOT Copied):

- **Zero Proprietary Code**: No HTML, CSS, or JavaScript was copied or ported from the reference.
- **Zero Proprietary Media**: No WLMOUSE product renders, videos (`hero-pro.mp4`), cutouts, or brand logos are used.
- **Zero Trademark Encroachment**: Gamer Perú represents an original multi-brand identity for the Peruvian competitive gaming community.
- **Zero Fabricated Commercial Claims**: No fake prices, discounts, stock counts, review ratings, or unverified shipping promises.

---

## 3. Visual Hierarchy & Section Classification

To maintain an editorial rhythm and prevent the page from feeling like a generic ecommerce template, sections are strictly classified into visual weight tiers:

| Tier         | Sections                                          | Visual Role & Typographic Scale                                                                                                                                      |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOMINANT** | 1. Cinematic Hero<br>5. Technical Editorial       | High-contrast visual anchors; full-bleed or wide dark canvas; giant fluid typography (`clamp(38px, 5.2vw, 72px)` and `.type-stat-giant`); dramatic ambient lighting. |
| **MAJOR**    | 2. Featured Editorial<br>3. Category Visual Doors | Large-scale editorial storytelling; open asymmetric layout; generous media fields; large fluid headings (`clamp(28px, 3.2vw, 48px)`).                                |
| **MEDIUM**   | 4. Curated Gear Shelf<br>6. Multi-Brand Discovery | Clean, quiet structured grids; minimal card chrome; crisp typography (`14px - 18px`); high product dominance.                                                        |
| **COMPACT**  | 7. Trust + SEO Discovery                          | Restrained transition block before Footer; compact typography-led trust row; subtle dividers; quiet directory links.                                                 |

---

## 4. Final Seven-Part Section Hierarchy

1. **Cinematic Hero** (`HomeHero`) — _DOMINANT / Dark `#09090B`_
2. **Featured Editorial** (`FeaturedEditorial`) — _MAJOR / Light `#FFFFFF`_
3. **Category Visual Doors** (`CategoryShowcase`) — _MAJOR / Light + Neutral/Dark stages_
4. **Curated Gear Shelf** (`CuratedGear`) — _MEDIUM / Light `#FFFFFF`_
5. **Technical Editorial** (`TechnicalEditorial`) — _DOMINANT / Dark `#09090B`_
6. **Multi-Brand Discovery** (`BrandDiscovery`) — _MEDIUM / Light `#FFFFFF`_
7. **Compact Local Trust + SEO Discovery** (`HomeDiscoveryFooter`) — _COMPACT / Subtle `#F4F4F5`_
8. Followed by the existing GP-009 Global Footer (Dark `#09090B`).

---

## 5. Hero Architecture & Art Direction

- **Outer Dimension**: Full-bleed section with height `calc(100svh - 100px)` (min-height `590px`).
- **Inner Content Alignment**: Bounded inside `Container size="default"` (1440px max width) with responsive gutters.
- **Visible H1**: Eyebrow `"Gamer Perú"`, H1 `"Periféricos gaming de alto rendimiento"`.
- **Multi-Brand CTAs**:
  - Primary: `"Ver mouses"` -> `/categorias/mouses` (Signal Crimson accent).
  - Secondary: `"Explorar categorías"` -> `#categorias` (Inverted ghost button).
- **Art Direction Media API**:
  - Independent `desktopImageSrc` and `mobileImageSrc` supported via Next.js `getImageProps()` + `<picture>`.
  - Single image supported via Next.js `Image` with `preload`.
  - Current abstract fallback renders a dark canvas with ambient radial lighting and subtle machining grid lines.

---

## 6. Owner Media Integration Contract

Specifications for future production media:

| Slot                     | Media Role            | Recommended Aspect / Size                | Transparency   | Preferred Format | Crop / Art-Direction Notes                                             |
| ------------------------ | --------------------- | ---------------------------------------- | -------------- | ---------------- | ---------------------------------------------------------------------- |
| **Hero Desktop**         | Flagship backdrop     | 16:9 or 21:9 (`2560x1440` / `1920x1080`) | Opaque         | WebP / AVIF      | Edge-lit flagship peripheral on dark background; center/right-weighted |
| **Hero Mobile**          | Flagship mobile       | 4:5 or 1:1 (`800x1000`)                  | Opaque         | WebP / AVIF      | Vertical composition with top-weighted hardware                        |
| **Featured Editorial**   | Editorial spotlight   | 16:10 (`1200x750`)                       | Opaque / Stage | WebP / AVIF      | High-detail hardware macro on light/neutral studio stage               |
| **Category Mouses**      | Category visual door  | 16:10 (`800x500`)                        | Transparent    | WebP / PNG       | Ultralight mouse profile with ambient drop shadow                      |
| **Category Teclados**    | Category visual door  | 16:10 (`800x500`)                        | Transparent    | WebP / PNG       | Compact magnetic keyboard profile                                      |
| **Category Mousepads**   | Category visual door  | 16:10 (`800x500`)                        | Transparent    | WebP / PNG       | Textured surface / glass pad profile                                   |
| **Category Audio**       | Category visual door  | 16:10 (`800x500`)                        | Transparent    | WebP / PNG       | IEM / audio monitor profile                                            |
| **Category Accesorios**  | Category visual door  | 16:10 (`800x500`)                        | Transparent    | WebP / PNG       | Dongle 8K / skate set profile                                          |
| **Curated Gear Preview** | Shelf gear stage      | 1:1 (`600x600`)                          | Transparent    | WebP / PNG       | Isolated peripheral on neutral `#F4F4F5` stage                         |
| **Technical Editorial**  | Engineering deep-dive | 16:9 (`1600x900`)                        | Opaque         | WebP / AVIF      | Exploded PCB / switch / magnetic sensor schematic                      |

---

## 7. Server / Client Component Boundaries

- **Homepage-specific Client Components**: **ZERO (`0`)**.
- 100% React Server Component composition for all Homepage layout and content.
- GP-009 client islands (`MobileDrawer`, `HeaderUtilities`, `DesktopNav`) continue operating independently.

---

## 8. Static Presentation Seed Boundary

`src/components/home/home-data.ts` serves strictly as presentation configuration for layout and narrative structure. It is NOT database authority or canonical commerce truth.

- Zero fake prices.
- Zero fake stock numbers.
- Zero fake review ratings.
- Zero fake sales rankings ("Best Seller").
- Zero unverified shipping promises ("Envíos a todo el Perú").

---

## 9. Performance & SEO Strategy

- **LCP Optimization**: Above-the-fold Hero image candidate configured with Next.js Image `preload`. Zero preload issued when abstract fallback is rendered.
- **CLS Prevention**: Stable media containers with defined aspect ratios (`16:9`, `16:10`, `1:1`) reduce media-induced reflow risk across all viewports.
- **Single `<h1>`**: Exactly one `<h1>` inside `HomeHero`.
- **Crawlability**: All category, brand, and directory links use semantic `<Link href="...">` present in initial static SSR HTML.

---

## 10. Accessibility (a11y) & Motion

- **Touch Targets**: Dedicated interactive controls (buttons, category cards, brand cards) satisfy minimum `44x44px` hit areas.
- **Focus Rings**: Canonical GP-008 focus outline: `outline: 2px solid var(--focus-ring-color, var(--color-border-focus)); outline-offset: 2px;`.
- **Reduced Motion**: All hover scale transitions and reveals collapse under `@media (prefers-reduced-motion: reduce)` to `<= 0.01ms`.
- **Axe Scanning**: Validated with zero detected Axe violations on the tested Homepage surface.
