# Gamer Perú — Design System Implementation Specification

---

## 1. Source-of-Truth Hierarchy

1. **Visual Authority**: [`docs/design/GAMER_PERU_DESIGN_LANGUAGE.md`](./GAMER_PERU_DESIGN_LANGUAGE.md) (GP-002) is the canonical visual authority and design token source of truth.
2. **High-Level Guardrails**: [`docs/design/VISUAL_DIRECTION.md`](./VISUAL_DIRECTION.md) establishes high-level brand philosophy.
3. **Benchmark Research**: [`docs/design/WLMOUSE_REFERENCE_SPEC.md`](./WLMOUSE_REFERENCE_SPEC.md) represents reference research only (never copied pixel-for-pixel or asset-for-asset).
4. **Code Implementation**: This document maps the canonical design language to production code in `src/styles/` and `src/components/ui/`.

---

## 2. CSS Architecture & Standards

- **Technology Stack**: Standard CSS Custom Properties (`src/styles/tokens.css`, `src/styles/typography.css`) paired with component-scoped CSS Modules (`*.module.css`) and Next.js native CSS support.
- **Mapping Precision**:
  - **Semantic Runtime Value Tokens**: Implemented as CSS Custom Properties (`var(--color-...)`, `var(--space-...)`, `var(--radius-...)`, `var(--motion-...)`).
  - **Typography Scale**: Implemented as fluid semantic classes (`.type-display`, `.type-h1`, etc.).
  - **Responsive Breakpoint Thresholds**: Implemented directly as standard numeric constants in CSS media queries (`@media (min-width: 480px)` etc.), as CSS Custom Properties are not supported by the CSS specification within `@media` query conditions.
- **No Third-Party CSS Frameworks**: Tailwind, styled-components, Emotion, MUI, Chakra, and Bootstrap are strictly avoided.
- **Zero Runtime Overhead**: Styles are evaluated and compiled at build time into static CSS with zero runtime JavaScript styling overhead.

---

## 3. Responsive Breakpoint Thresholds

The canonical breakpoints from GP-002 Section 9 are implemented across layout primitives:

| Breakpoint       | Minimum Width | Usage & Target Surfaces             |
| ---------------- | ------------- | ----------------------------------- |
| Minimum Viewport | `360px`       | Base mobile viewport baseline       |
| `bp.sm`          | `480px`       | Standard smartphones / large mobile |
| `bp.md`          | `768px`       | Tablets portrait                    |
| `bp.lg`          | `1024px`      | Tablets landscape / small laptops   |
| `bp.xl`          | `1280px`      | Desktop standard                    |
| `bp.2xl`         | `1536px`      | Wide desktop / high-res monitors    |

---

## 4. Token Implementation (`src/styles/tokens.css`)

All canonical design tokens from GP-002 are exposed as CSS Custom Properties:

### 4.1 Brand Accent ("Signal Crimson")

- `--color-brand-primary`: `#E11D48` (Crimson 600 — Primary CTA buttons, key indicators)
- `--color-brand-hover`: `#BE123C` (Crimson 700 — Interactive hover states)
- `--color-brand-active`: `#9F1239` (Crimson 800 — Pressed states)
- `--color-brand-subtle-light`: `#FFF1F2` (Rose 50 — Promo/tag tint on light)
- `--color-brand-subtle-dark`: `#4C0519` (Rose 950 — Promo/tag tint on dark)
- `--color-brand-text-on-accent`: `#FFFFFF` (Contrast text on crimson)

### 4.2 Light Surfaces

- `--color-surface-canvas`: `#FAFAFA` (Default page background)
- `--color-surface-card`: `#FFFFFF` (Default card surface)
- `--color-surface-elevated`: `#FFFFFF` (Dropdowns, floating popovers)
- `--color-surface-secondary`: `#F4F4F5` (Secondary wells, inactive tabs)
- `--color-surface-tertiary`: `#E4E4E7` (Subtle section fills, disabled controls)
- `--color-surface-overlay`: `rgba(9, 9, 11, 0.65)` (Modal backdrops)

### 4.3 Inverted Dark Surfaces ("Machinery Obsidian")

- `--color-surface-dark-canvas`: `#09090B` (Obsidian dark background)
- `--color-surface-dark-card`: `#121215` (Elevated dark card)
- `--color-surface-dark-secondary`: `#18181B` (Secondary dark well)
- `--color-surface-dark-tertiary`: `#27272A` (Inverted input fields)

### 4.4 Text Tokens

- Light: `--color-text-primary` (`#09090B`), `--color-text-secondary` (`#52525B`), `--color-text-muted` (`#71717A`), `--color-text-disabled` (`#A1A1AA`), `--color-text-link` (`#E11D48`).
- Dark: `--color-text-dark-primary` (`#F4F4F5`), `--color-text-dark-secondary` (`#A1A1AA`), `--color-text-dark-muted` (`#9CA3AF`), `--color-text-dark-link` (`#FB7185`).

### 4.5 Border Tokens

- Light: `--color-border-subtle` (`#E4E4E7`), `--color-border-default` (`#D4D4D8`), `--color-border-control` (`#71717A` — 4.6:1 input contrast), `--color-border-strong` (`#52525B`), `--color-border-focus` (`#09090B`).
- Dark: `--color-border-dark-subtle` (`#27272A`), `--color-border-dark-default` (`#3F3F46`), `--color-border-dark-control` (`#8E8E93` — 6.1:1), `--color-border-dark-strong` (`#A1A1AA`), `--color-border-dark-focus` (`#F4F4F5`).

### 4.6 Semantic Status Tokens

- Success: Text `#15803D` / BG `#F0FDF4` / Border `#BBF7D0` (Dark text `#4ADE80`)
- Warning: Text `#B45309` / BG `#FFFBEB` / Border `#FDE68A` (Dark text `#FBBF24`)
- Danger: Text `#BE123C` / BG `#FFF1F2` / Border `#FECDD3` (Dark text `#FB7185`)
- Info: Text `#0369A1` / BG `#F0F9FF` / Border `#BAE6FD` (Dark text `#38BDF8`)

### 4.7 Spacing & Layout

- Geometric scale: `--space-0` (0px) to `--space-32` (128px).
- Containers: `--container-default` (1440px), `--container-prose` (840px), `--container-full` (1920px), `--container-admin` (1600px).
- Gutters: Mobile (16px/20px), Tablet (24px), Desktop (32px/48px/64px).
- Radius: `--radius-none` (0px), `--radius-xs` (2px), `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-full` (9999px).
- Elevation: `--elevation-none`, `--elevation-low`, `--elevation-mid`, `--elevation-high`.

---

## 5. Focus Contract & Accessibility Architecture

### 5.1 Contextual Focus Ring

- **Light Context**: `:root` defines `--focus-ring-color: var(--color-border-focus)` (`#09090B`).
- **Dark Context**: `.surface-dark`, `.surface-dark-card`, and `Card surface="dark" / "dark-card"` override `--focus-ring-color: var(--color-border-dark-focus)` (`#F4F4F5`).
- **Focus Rule**: `:focus-visible { outline: 2px solid var(--focus-ring-color); outline-offset: 2px; }`.
- **Zero Focus Suppression**: Blanket `:focus { outline: none; }` rules are strictly forbidden across globals and component CSS.

### 5.2 Touch Targets & Control Heights

- **Dedicated Touch Controls**: Meet or exceed `44x44px` interactive touch targets.
- **Button**: Desktop height `44px`, Mobile touch target height `48px`.
- **IconButton**: `44x44px` minimum bounding hit area.
- **Input / TextField**: Desktop/Admin height `40px`, Mobile height `44px` (per GP-002 Section 6).

---

## 6. Typography & Font Loading (`src/styles/typography.css`)

### 6.1 Font Pair Architecture

- **Headings & Numbers**: `Plus Jakarta Sans` (weights 500, 600, 700, 800) -> `--font-heading`
- **Body & Interface**: `Inter` (weights 400, 500, 600) -> `--font-body`
- **Technical & Monospace**: `JetBrains Mono` (weights 400, 500) -> `--font-mono`

### 6.2 Loading Mechanism

- Fonts are loaded via `next/font/google` in `src/app/layout.tsx`.
- **Zero Runtime External Requests**: Next.js downloads font files during the build and self-hosts them as static assets. The browser makes zero runtime requests to `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Zero Layout Shift**: Configured with `display: "swap"` and precalculated fallback metrics.

---

## 7. Iconography System (`src/components/ui/icon/`)

- **Package**: `lucide-react@1.31.0` (exact pin, 0 runtime dependencies, ISC license).
- **Canonical Primitive**: `Icon` component with enforced geometric mappings:
  - `sm`: `16px` width/height, `strokeWidth: 1.25`
  - `md`: `20px` width/height, `strokeWidth: 1.5`
  - `lg`: `24px` width/height, `strokeWidth: 1.5`
  - `xl`: `32px` width/height, `strokeWidth: 1.5`
- **IconButton Enforcement**: `IconButton` accepts `icon={IconDefinition}` and `iconSize` to automatically render the canonical `Icon` primitive with `aria-hidden="true"`.

---

## 8. Core Component Inventory (`src/components/ui/`)

| Primitive        | Directory                            | Key Responsibilities                                                                                                                                    |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`         | `src/components/ui/button/`          | Native `<button>`, variants (`primary`, `secondary`, `ghost`, `destructive`), 44px desktop / 48px touch height, loading spinner with `aria-busy`.       |
| `IconButton`     | `src/components/ui/icon-button/`     | 44x44px minimum touch area, mandatory `aria-label`, enforced canonical icon geometry.                                                                   |
| `Icon`           | `src/components/ui/icon/`            | Enforced icon geometry mapping (`sm`: 16px/1.25, `md`/`lg`/`xl`: 20/24/32px/1.5).                                                                       |
| `Input`          | `src/components/ui/input/`           | Accessible `<input>`, 40px desktop / 44px mobile, border `color.border.control` (`#71717A`).                                                            |
| `TextField`      | `src/components/ui/input/`           | Integrated form field with automatic `label`, `description`, and `error` ARIA linkage (`useId`, `aria-describedby`, `aria-invalid`).                    |
| `Badge`          | `src/components/ui/badge/`           | Category and general metadata badge (`neutral`, `brand`, `subtle`).                                                                                     |
| `SpecPill`       | `src/components/ui/badge/`           | Technical metric pill (`39g`, `8000Hz`) with 2px radius and light/dark surface support.                                                                 |
| `StatusBadge`    | `src/components/ui/badge/`           | Semantic status indicator (`success`, `warning`, `danger`, `info`, `neutral`) with mandatory visible text label and optional static indicator dot.      |
| `Card`           | `src/components/ui/card/`            | Compositional neutral surface (`canvas`, `card`, `secondary`, `dark`, `dark-card`), padding options, elevation options. Sets contextual focus variable. |
| `Container`      | `src/components/ui/container/`       | Responsive layout container (`default`, `prose`, `full`, `admin`) with canonical gutters.                                                               |
| `VisuallyHidden` | `src/components/ui/visually-hidden/` | Screen-reader utility for accessible names without visual layout footprint.                                                                             |
| `Stack`          | `src/components/ui/stack/`           | Finite typed flex layout helper with canonical token-mapped gaps (`0` to `12`).                                                                         |

---

## 9. Extension Rules for Future Components

1. **Consume Semantic Tokens**: Future components must consume CSS Custom Properties from `src/styles/tokens.css` rather than hardcoding colors, borders, shadows, or spacing.
2. **Use Existing Primitives**: Compose existing primitives (`Button`, `IconButton`, `Icon`, `TextField`, `Card`, `Container`) before creating new UI controls.
3. **No Parallel Mini-Design-Systems**: Features in GP-009+ must not define separate component frameworks, ad-hoc utilities, or inline color codes.
4. **Boundary Isolation**: GP-008 owns shared design tokens and primitives; feature-specific components (`ProductCard`, `Navbar`, `CartDrawer`, `CheckoutForm`) belong strictly to their assigned GPs.
