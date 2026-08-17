# Gamer Perú — Homepage Implementation Specification (GP-010)

---

## 1. Purpose & Authority

This document defines the canonical architecture, visual design system translation, component model, media contracts, and accessibility standards for the Gamer Perú Homepage (`src/app/(storefront)/page.tsx`), implemented and visually converged in **GP-010**.

**Canonical Authorities**:

- [AGENTS.md](file:///d:/Documentos/GamerPeru/AGENTS.md) — Core operating contract (multi-brand, Peru-first, zero warning policy).
- [GAMER_PERU_DESIGN_LANGUAGE.md](file:///d:/Documentos/GamerPeru/docs/design/GAMER_PERU_DESIGN_LANGUAGE.md) — Visual authority ("Machinery Obsidian & Signal Crimson").
- [DESIGN_SYSTEM_IMPLEMENTATION.md](file:///d:/Documentos/GamerPeru/docs/design/DESIGN_SYSTEM_IMPLEMENTATION.md) — GP-008 Design System tokens and primitives.
- [GLOBAL_NAVIGATION_IMPLEMENTATION.md](file:///d:/Documentos/GamerPeru/docs/design/GLOBAL_NAVIGATION_IMPLEMENTATION.md) — GP-009 Storefront shell integration.
- [WLMOUSE_REFERENCE_SPEC.md](file:///d:/Documentos/GamerPeru/docs/design/WLMOUSE_REFERENCE_SPEC.md) — Visual reference benchmark principles.

---

## 2. WLMOUSE Reference Visual Convergence & Originality Boundary

The owner-supplied visual reference repository (`https://github.com/latamcreativa/wlmouse.git`) served as the structural and aesthetic target for near-parity in layout proportions, geometry, whitespace, card proportions, typography scale, product/media dominance, grid rhythm, viewport use, and responsive composition.

### Visual Parity Standards Implemented:

- **Product-First Dominance**: Hardware media commands visual authority with 70–80% area dominance on category tiles and 1:1 square media stages on curated shelves.
- **Fluid Typographic Scale**: Oversized display headings (`clamp(38px, 5.2vw, 72px)`) with tight line-heights (0.95–1.05) and negative tracking (-0.03em to -0.05em).
- **Generous Whitespace & Section Pacing**: Uncluttered sections with rhythmic vertical spacing (`var(--space-12)` on desktop).
- **Surface Rhythm**: Predominantly clean white (`#FFFFFF`) and neutral light gray (`#F4F4F5`) surfaces, with dark canvas (`#09090B`) used as deliberate cinematic events (Flagship Hero, Technical Editorial, SiteFooter).
- **Global MegaMenu Convergence**: Full-width floating white panel with canonical `--radius-lg` rounded bottom corners, 240px collection sidebar with bold category links and brand chips, and 4-column 1:1 preview stage grid with ambient radial lighting.

### Strict Originality Boundaries (Deliberately NOT Copied):

- **Zero Proprietary Code**: No HTML, CSS, or JavaScript was copied or ported from the reference.
- **Zero Proprietary Media**: No WLMOUSE product renders, videos (`hero-pro.mp4`), cutouts, or brand logos are used.
- **Zero Trademark Encroachment**: Gamer Perú represents an original multi-brand identity for the Peruvian competitive gaming community.
- **Zero Fabricated Commercial Claims**: No fake prices, discounts, stock counts, review ratings, or unverified shipping/distributor promises.

---

## 3. Visual Hierarchy & Section Classification

To maintain an editorial rhythm and prevent the page from feeling like a generic ecommerce template, sections are strictly classified into visual weight tiers:

| Tier         | Sections                                          | Visual Role & Typographic Scale                                                                                                                                      |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOMINANT** | 1. Cinematic Hero<br>5. Technical Editorial       | High-contrast visual anchors; full-bleed or wide dark canvas; giant fluid typography (`clamp(38px, 5.2vw, 72px)` and `.type-stat-giant`); dramatic ambient lighting. |
| **MAJOR**    | 2. Featured Editorial<br>3. Category Visual Doors | Large-scale editorial storytelling; open asymmetric layout; generous media fields; large fluid headings (`clamp(28px, 3.2vw, 48px)`).                                |
| **MEDIUM**   | 4. Curated Gear Shelf<br>6. Multi-Brand Discovery | Clean, quiet structured grids; minimal card chrome; crisp typography (`14px - 18px`); high product dominance.                                                        |
| **COMPACT**  | 7. Trust + SEO Discovery                          | Restrained transition block before Footer; compact typography-led trust row; subtle dividers; quiet directory links; `VisuallyHidden` H2 hierarchy.                  |

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

## 5. Media Architecture & Polymorphism Contract

Every media slot adheres to the finite `HomeMedia` contract:

```ts
export type HomeMedia =
  | {
      kind: "abstract";
    }
  | {
      kind: "image";
      src: string;
      mobileSrc?: string;
      altText: string;
    };
```

- **Art-Direction**: When both `src` and `mobileSrc` are configured on Hero, renders via `getImageProps()` + `<picture>` using `fetchPriority="high"` and `loading="eager"` without duplicate preload tags.
- **Single Image**: Uses Next.js `<Image ... fetchPriority="high" loading="eager" />`.
- **Abstract Ambient Fallback**: Pure CSS token-driven ambient lighting stages with zero network image requests and zero image preloads.

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

- `src/app/(storefront)/page.tsx`: **Server Component** (0 client JS).
- All 7 home components (`HomeHero`, `FeaturedEditorial`, `CategoryShowcase`, `CuratedGear`, `TechnicalEditorial`, `BrandDiscovery`, `HomeDiscoveryFooter`): **Server Components** (0 client JS).
- Pure static presentation seed in `home-data.ts`.
- Zero database queries, zero cookies access, zero authentication access on the Homepage.
