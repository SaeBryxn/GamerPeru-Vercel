# Gamer Perú — Global Navigation Implementation Specification

---

## 1. Purpose

This document specifies the architecture, components, interaction contracts, and accessibility standards for the global Storefront shell of **Gamer Perú** (GP-009). The shell establishes the responsive, crawlable, and accessible framing for all customer-facing storefront pages.

---

## 2. Scope

- **In Scope (GP-009)**:
  - Skip navigation link (`SkipLink`)
  - Announcement bar (`AnnouncementBar`)
  - Desktop header (`SiteHeader` / `BrandMark` / `DesktopNav` / `HeaderUtilities`)
  - Desktop mega-menu interaction shell (full-width dropdown)
  - Mobile header (`MobileHeader`)
  - Native dialog mobile navigation drawer (`MobileDrawer`)
  - Site footer (`SiteFooter` with 4 canonical columns)
  - Storefront layout integration (`src/app/(storefront)/layout.tsx`)
  - Storefront Route-Intent Contract
  - Static navigation presentation seed data model
- **Out of Scope (Owned by later GPs)**:
  - Homepage merchandising / hero / grids (GP-010)
  - Category and Brand page implementations / published discovery data (GP-011)
  - Search backend / predictive search / query execution (GP-012)
  - Cart state / CartDrawer / checkout flows (Future Cart Owner)
  - Wishlist state / wishlist management (Future Wishlist Owner)
  - Authentication / Supabase Auth / customer accounts (GP-015)
  - Admin UI / management console (GP-022)
  - Database schema / domain tables / remote Supabase infrastructure

---

## 3. Source-of-Truth Hierarchy

1. **Visual Authority**: [`docs/design/GAMER_PERU_DESIGN_LANGUAGE.md`](./GAMER_PERU_DESIGN_LANGUAGE.md) (GP-002) is the canonical visual authority and design token source of truth.
2. **Design System Specification**: [`docs/design/DESIGN_SYSTEM_IMPLEMENTATION.md`](./DESIGN_SYSTEM_IMPLEMENTATION.md) (GP-008) provides production component tokens and primitives.
3. **Reference Research**: [`docs/design/WLMOUSE_REFERENCE_SPEC.md`](./WLMOUSE_REFERENCE_SPEC.md) represents reference research only (never copied pixel-for-pixel or asset-for-asset).
4. **Code Implementation**: This document maps the global navigation shell to production code in `src/components/navigation/`.

---

## 4. Storefront Shell Ownership

The global navigation shell is owned strictly by the `(storefront)` route group in `src/app/(storefront)/layout.tsx`. It does not bleed into root application layout or other future route groups (e.g. `(admin)`), which possess distinct layout and authentication requirements.

```tsx
// src/app/(storefront)/layout.tsx
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <AnnouncementBar message={...} />
      <SiteHeader config={...} />
      {children}
      <SiteFooter columns={...} />
    </>
  );
}
```

---

## 5. Announcement Bar

- **Dimensions**: Exact height `36px`.
- **Surface**: `var(--color-surface-dark-canvas)` (`#09090B`).
- **Text**: `var(--color-text-dark-primary)` (`#F4F4F5`).
- **Typography**: Explicitly resolved to `font-family: var(--font-body)`, `font-size: 13px`, `font-weight: 500`.
- **Omission Contract**: If no announcement message is provided, the component renders `null` and collapses to 0px without reserving empty layout space.
- **Content Boundary**: Factual, neutral brand identity notice ("Periféricos gaming multimarca para Perú"). Zero invented delivery guarantees, sales percentages, or warranty claims.

---

## 6. Desktop Header

- **Breakpoint Threshold**: Desktop layout active at `>= 1024px` (`@media (min-width: 1024px)`).
- **Dimensions**: Exact height `64px`.
- **Positioning**: `position: sticky; top: 0; z-index: 100;`. Acts as the full-width containing block for the absolute MegaMenu panel.
- **Surface & Visuals**: `var(--color-surface-header)` (`rgba(255, 255, 255, 0.95)`) with `backdrop-filter: blur(8px)` and bottom border `1px solid var(--color-border-subtle)`.
- **Layout Grid**: 3-part layout inside `Container size="default"` (1440px max width):
  - Left: `BrandMark`
  - Center: `DesktopNav`
  - Right: `HeaderUtilities`

---

## 7. Brand Mark

- **Current Implementation**: Accessible text wordmark "Gamer Perú" with Signal Crimson accent dot (`.`), styled with `Plus Jakarta Sans 700 / 20px` linking to `/`.
- **Asset Replacement Boundary**: Encapsulated inside `src/components/navigation/brand-mark/brand-mark.tsx`. When the owner-approved brand mark asset is authorized, replacing it requires updating only this component.

---

## 8. Primary Navigation & Mega-Menu

- **Interaction Pattern**:
  - Primary category destination: semantic Next.js `<Link href="/categorias/...">` present in initial static SSR HTML.
  - Separate disclosure button: `<button aria-label="Abrir menú desplegable de..." aria-expanded="..." aria-controls="...">` with canonical ChevronDown Icon (`size="sm"`: 16x16 / 1.25 stroke) inside a minimum `44x44px` interactive touch target.
  - 2px Signal Crimson (`var(--color-brand-primary)`) bottom underline on hover, focus-within, and active expanded states.
  - Canonical keyboard focus ring: `outline: 2px solid var(--focus-ring-color, var(--color-border-focus)); outline-offset: 2px; border-radius: var(--radius-xs);`.
- **Containing-Block Architecture**:
  - `SiteHeader` (which is `position: sticky; width: 100%;`) acts as the containing block.
  - Intermediate wrappers (`.navItem`, `.navList`, `.desktopNav`) use static positioning.
  - `.megaMenuPanel` has `position: absolute; top: 100%; left: 0; right: 0; width: 100%;`, guaranteeing that rendered MegaMenu width equals 100% of `SiteHeader` across all desktop viewports.
- **Mega-Menu Panel (WLMOUSE-Inspired 2-Zone Layout)**:
  - Background `var(--color-surface-card)` (`#FFFFFF`), elevation `var(--elevation-high)`, border-bottom `1px solid var(--color-border-subtle)`.
  - Floating rounded container: `border-bottom-left-radius: var(--radius-lg); border-bottom-right-radius: var(--radius-lg);`.
  - **Left Zone (240px)**: Category collections hierarchy with large bold typography (`20px / 800`), brand filter chips (e.g. WLMOUSE, Pulsar, Lamzu, ATK), and bottom category destination link (`/categorias/[id]`).
  - **Right Zone (1fr)**: 4-column visual preview stage (1:1 aspect ratio) with subtle radial ambient glow, title, subtitle, and top-right "Explorar catálogo completo →" link.
  - Keyboard disclosure via Enter/Space; Escape closes panel and returns focus to disclosure button; click outside closes.

---

## 9. Header Utilities

- **Semantic Model**: Utility affordances (Search, Wishlist, Account, Cart) represent **Navigation Destinations** in GP-009, rendered as semantic Next.js `<Link>` elements (`HeaderUtilityLink`).
- **Icon Geometry**: Enforces canonical `lg` (24x24 / 1.5 stroke) Lucide icons (`Search`, `Heart`, `User`, `ShoppingCart`) with `aria-hidden="true"`.
- **Hit Targets**: Minimum `44x44px` bounding hit area with high-contrast `:focus-visible` outline.
- **Zero Fake State**: Renders zero fake cart items, fake wishlist counts, or fake authentication status.

---

## 10. Mobile Header

- **Breakpoint Threshold**: Mobile header active below `1024px` (`@media (max-width: 1023px)`).
- **Layout**: Left: Menu opener trigger (`IconButton` `iconSize="lg"`, hit target >= 44x44) + `BrandMark`; Right: Search link + Cart link.
- **Focus Return**: When the mobile drawer closes, focus explicitly returns to the Menu opener button.

---

## 11. Mobile Navigation Drawer

- **Implementation**: Native browser `<dialog>` element with `showModal()` / `close()` methods for top-layer modal containment and native background inertness.
- **Dimensions**: Left slide-out drawer, width `min(320px, 100vw)` (yielding exact 320px at 360px viewport).
- **Surface**: `var(--color-surface-card)` (`#FFFFFF`) with backdrop `var(--color-surface-overlay)` (`rgba(9, 9, 11, 0.65)`).
- **Close Controls**:
  - Close button: `IconButton` with `iconSize="md"` (20x20 / 1.5 stroke) inside a `>= 44x44px` target, `aria-label="Cerrar navegación"`.
  - Native Escape key cancellation with focus return.
  - Backdrop click handler with focus return (clicks inside drawer panel do not close).
- **Motion**: 350ms transition with `var(--motion-easing-snappy)` (`cubic-bezier(0.16, 1, 0.3, 1)`), collapsed under `prefers-reduced-motion: reduce`.
- **Sections**:
  - Header: BrandMark + Close button.
  - Scrollable navigation: Expandable category groups (Mouses, Teclados, Mousepads, Audio, Accesorios) with sub-links.
  - Pinned footer: Account link (`/cuenta`), Support link (`/ayuda`), Currency indicator (`PEN (S/)`).

---

## 12. Navigation Data Model

Navigation data is defined as a static presentation seed in `src/components/navigation/navigation-data.ts`.

> [!NOTE]
> **Presentation Seed vs. Database Catalog Truth**:
> Navigation data in GP-009 is presentation configuration for the shell. It is **NOT** database authority. GP-011 and future commerce tasks will derive dynamic navigation links from published database records. Modifying `navigation-data.ts` does not mutate commerce state.

---

## 13. Storefront Route-Intent Contract

GP-009 establishes the initial Storefront Route-Intent Contract for later route owners:

| Intent               | Route Destination        | GP-009 Implementation Status     | Future Owning GP                  |
| -------------------- | ------------------------ | -------------------------------- | --------------------------------- |
| Home                 | `/`                      | Implemented (verification shell) | GP-010 (Homepage)                 |
| Category: Mouses     | `/categorias/mouses`     | Destination contract only        | GP-011 (Catalog Discovery)        |
| Category: Teclados   | `/categorias/teclados`   | Destination contract only        | GP-011 (Catalog Discovery)        |
| Category: Mousepads  | `/categorias/mousepads`  | Destination contract only        | GP-011 (Catalog Discovery)        |
| Category: Audio      | `/categorias/audio`      | Destination contract only        | GP-011 (Catalog Discovery)        |
| Category: Accesorios | `/categorias/accesorios` | Destination contract only        | GP-011 (Catalog Discovery)        |
| Brand: WLMOUSE       | `/marcas/wlmouse`        | Destination contract only        | GP-011 (Brand Discovery)          |
| Brand: Pulsar        | `/marcas/pulsar`         | Destination contract only        | GP-011 (Brand Discovery)          |
| Brand: Lamzu         | `/marcas/lamzu`          | Destination contract only        | GP-011 (Brand Discovery)          |
| Brand: ATK           | `/marcas/atk`            | Destination contract only        | GP-011 (Brand Discovery)          |
| Search               | `/buscar`                | Destination contract only        | GP-012 (Search Experience)        |
| Account              | `/cuenta`                | Destination contract only        | GP-015 (Authentication / Account) |
| Wishlist             | `/favoritos`             | Destination contract only        | Future Wishlist Owner             |
| Cart                 | `/carrito`               | Destination contract only        | Future Cart Owner                 |
| Help / Support       | `/ayuda`                 | Destination contract only        | Future Support / Content Owner    |
| Shipping Info        | `/envios`                | Destination contract only        | Future Shipping / Content Owner   |
| Returns & Exchanges  | `/devoluciones`          | Destination contract only        | Future Support / Content Owner    |
| Privacy Policy       | `/privacidad`            | Destination contract only        | Future Legal / Content Owner      |
| Terms of Service     | `/terminos`              | Destination contract only        | Future Legal / Content Owner      |

_Destination pages are NOT implemented in GP-009 merely to avoid temporary 404s._

---

## 14. Site Footer

- **Surface**: `var(--color-surface-dark-canvas)` (`#09090B`) with top border `1px solid var(--color-border-dark-subtle)`.
- **Typography & Colors**: Text `var(--color-text-dark-secondary)` (`#A1A1AA`), headings `var(--color-text-dark-primary)` (`#F4F4F5`).
- **4-Column Canonical Desktop Structure**:
  1. **Brand Story**: Gamer Perú multi-brand mission.
  2. **Explorar Catálogo**: Direct category links (Mouses, Teclados, Mousepads, Audio, Accesorios).
  3. **Atención al Cliente**: Customer support & policy destinations (Centro de Ayuda, Envíos, Cambios y Devoluciones, Privacidad, Términos).
  4. **Métodos de Pago & Confianza**: `YAPE` and `PLIN` neutral text badges, Soles PEN currency notice ("Pagos en moneda nacional (PEN / S/)."). Zero unauthorized Transferencia chips or nationwide shipping promises.
- **Responsive Layout**: 4 columns on desktop (`>= 1024px`), 2 columns on tablet (`768px - 1023px`), 1 column stacked on mobile (`< 768px`).

---

## 15. Accessibility (a11y) Architecture

- **Semantic HTML5 Landmarks**: `<aside aria-label="Anuncio">`, `<header>`, `<nav aria-label="Navegación principal">`, `<dialog aria-label="Menú de navegación móvil">`, `<footer aria-label="Pie de página">`.
- **Keyboard Navigation**:
  - `SkipLink`: First Tab stop jumps to `#main-content`.
  - MegaMenu: Tab focuses disclosure button; Enter/Space toggles disclosure; Tab moves focus into MegaMenu sub-links; Escape closes and restores focus to disclosure button.
  - Mobile Drawer: Menu opener opens dialog; focus trapped inside `<dialog>`; Escape, close button, or backdrop click closes dialog and returns focus to Menu opener button.
- **Focus Rings**: Contextual `:focus-visible` 2px solid outline (`#09090B` on light, `#F4F4F5` on dark).
- **Touch Targets**: Minimum 44x44px on all interactive controls.
- **Automated Axe Audits**: Zero detected violations on desktop header, open MegaMenu, open mobile drawer, and footer.

---

## 16. Keyboard Behavior

| Component                       | Key               | Action                                                   |
| ------------------------------- | ----------------- | -------------------------------------------------------- |
| `SkipLink`                      | `Tab` / `Enter`   | Focuses and jumps focus to `#main-content`               |
| `DesktopNav` Category Link      | `Tab` / `Enter`   | Focuses and navigates to `/categorias/[slug]`            |
| `DesktopNav` Disclosure Trigger | `Enter` / `Space` | Toggles MegaMenu disclosure panel                        |
| `DesktopNav` Panel Link         | `Tab`             | Traverses links inside MegaMenu                          |
| `DesktopNav` Panel              | `Escape`          | Closes MegaMenu and restores focus to disclosure trigger |
| `MobileHeader` Opener           | `Enter` / `Space` | Opens `<dialog>` modal drawer and traps focus            |
| `MobileDrawer`                  | `Escape`          | Closes modal drawer and returns focus to opener          |
| `MobileDrawer` Close Button     | `Enter` / `Space` | Closes modal drawer and returns focus to opener          |

---

## 17. Focus Management

- **Modal Trap**: Native `<dialog>.showModal()` ensures assistive technologies and keyboard focus cannot escape into background document content while the mobile drawer is open.
- **Opener Return**: When closing the mobile drawer via Escape, backdrop click, or close button, focus returns to the opener `IconButton`.
- **Zero Suppression**: No blanket `:focus { outline: none; }` rules.

---

## 18. Responsive Behavior

- **360px (Compact Mobile)**: Mobile header active, 320px drawer slide-out, footer stacked 1-column, zero horizontal overflow.
- **768px (Tablet)**: Mobile header active, 2-column footer grid, zero horizontal overflow.
- **1023px (Breakpoint Boundary)**: Mobile header active, desktop nav hidden.
- **1024px (Breakpoint Boundary)**: Desktop header active (64px), desktop nav visible, full-width MegaMenu, mobile header hidden.
- **1280px / 1536px (Desktop & Wide)**: Full desktop navigation and full-width mega-menu active, 4-column footer, max container 1440px clamped.

---

## 19. Motion & Reduced Motion

- **Drawer Slide-out**: `350ms` with `var(--motion-easing-snappy)` (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **MegaMenu Fade**: `150ms` with `var(--motion-easing-snappy)`.
- **Reduced Motion**: Under `@media (prefers-reduced-motion: reduce)`, all transitions collapse to `0.01ms`.

---

## 20. SEO & Crawlability

- **Semantic Anchors**: All primary category and utility destinations use standard Next.js `<Link>` elements rendering `<a href="...">`.
- **No JavaScript Dependency for Discovery**: Primary category destinations exist in initial server-renderable HTML markup before interaction.
- **Zero Empty / Hash Links**: No `href="#"`, `href=""`, or `javascript:` links.
- **Brand Mark**: Always points to `/` with descriptive accessible text.

---

## 21. Performance & Client-JS Boundary

- **Server-First Shell**:
  - `StorefrontLayout` (Server)
  - `SkipLink` (Server)
  - `AnnouncementBar` (Server)
  - `BrandMark` (Server)
  - `SiteHeader` (Server shell)
  - `SiteFooter` (Server)
- **Minimal Client Islands**:
  - `DesktopNav` (`"use client"` for MegaMenu disclosure state)
  - `MobileHeader` / `MobileDrawer` (`"use client"` for `<dialog>` modal disclosure state)
- **Zero Third-Party Packages**: Zero additional runtime dependencies (no Radix, no Headless UI, no Framer Motion).

---

## 22. Future Feature Ownership

- **GP-010**: Homepage merchandising, hero sections, and product showcases.
- **GP-011**: Category and Brand discovery pages (`/categorias/...`, `/marcas/...`).
- **GP-012**: Search experience (`/buscar`).
- **GP-015**: Authentication flows and Customer Account management (`/cuenta`).
- **Future Cart Owner**: Cart state, CartDrawer, and checkout (`/carrito`).
- **Future Wishlist Owner**: Wishlist state and management (`/favoritos`).
- **Future Content Owner**: Customer support policies and CMS announcements.

---

## 23. Business-Policy Boundaries

- **No Fake SLAs**: Zero hardcoded shipping delivery promises, support phone numbers, or warranty guarantees.
- **Payment Badges**: Yape and Plin are presented as text chips without claiming instant automated gateway validation, official partnerships, or unauthorized bank transfer payment methods.

---

## 24. Definition of Done (DoD)

- [x] `SkipLink` functional and jumps to `#main-content`.
- [x] `AnnouncementBar` conforms to 36px, `#09090B`, 13px Inter 500, neutral copy.
- [x] `SiteHeader` sticky 64px with `--color-surface-header`.
- [x] `BrandMark` text wordmark links to `/`.
- [x] `DesktopNav` with semantic category destination links, separate disclosure buttons, and full-width MegaMenu.
- [x] `HeaderUtilities` semantic `<Link>` elements with 24px/1.5 icons and 44x44 targets.
- [x] `MobileHeader` and native `<dialog>` `MobileDrawer` (exact 320px at 360px viewport, 20px close icon, Escape close, backdrop close, focus return).
- [x] `SiteFooter` exactly 4-column dark layout with Yape/Plin badges.
- [x] Verified breakpoint boundary at 1023px vs 1024px.
- [x] 100% test pass rate across unit contracts, Playwright E2E, and Axe audits.
