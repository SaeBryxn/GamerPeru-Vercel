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
- **No Third-Party CSS Frameworks**: Tailwind, styled-components, Emotion, MUI, Chakra, and Bootstrap are strictly avoided.
- **Zero Runtime Overhead**: Styles are evaluated and compiled at build time into static CSS with zero runtime JavaScript styling overhead.

---

## 3. Token Implementation (`src/styles/tokens.css`)

All canonical design tokens from GP-002 are exposed as CSS Custom Properties:

### 3.1 Brand Accent ("Signal Crimson")

- `--color-brand-primary`: `#E11D48` (Crimson 600 — Primary CTA buttons, key indicators)
- `--color-brand-hover`: `#BE123C` (Crimson 700 — Interactive hover states)
- `--color-brand-active`: `#9F1239` (Crimson 800 — Pressed states)
- `--color-brand-subtle-light`: `#FFF1F2` (Rose 50 — Promo/tag tint on light)
- `--color-brand-subtle-dark`: `#4C0519` (Rose 950 — Promo/tag tint on dark)
- `--color-brand-text-on-accent`: `#FFFFFF` (Contrast text on crimson)

### 3.2 Light Surfaces

- `--color-surface-canvas`: `#FAFAFA` (Default page background)
- `--color-surface-card`: `#FFFFFF` (Default card surface)
- `--color-surface-elevated`: `#FFFFFF` (Dropdowns, floating popovers)
- `--color-surface-secondary`: `#F4F4F5` (Secondary wells, inactive tabs)
- `--color-surface-tertiary`: `#E4E4E7` (Subtle section fills, disabled controls)
- `--color-surface-overlay`: `rgba(9, 9, 11, 0.65)` (Modal backdrops)

### 3.3 Inverted Dark Surfaces ("Machinery Obsidian")

- `--color-surface-dark-canvas`: `#09090B` (Obsidian dark background)
- `--color-surface-dark-card`: `#121215` (Elevated dark card)
- `--color-surface-dark-secondary`: `#18181B` (Secondary dark well)
- `--color-surface-dark-tertiary`: `#27272A` (Inverted input fields)

### 3.4 Text Tokens

- Light: `--color-text-primary` (`#09090B`), `--color-text-secondary` (`#52525B`), `--color-text-muted` (`#71717A`), `--color-text-disabled` (`#A1A1AA`), `--color-text-link` (`#E11D48`).
- Dark: `--color-text-dark-primary` (`#F4F4F5`), `--color-text-dark-secondary` (`#A1A1AA`), `--color-text-dark-muted` (`#9CA3AF`), `--color-text-dark-link` (`#FB7185`).

### 3.5 Border Tokens

- Light: `--color-border-subtle` (`#E4E4E7`), `--color-border-default` (`#D4D4D8`), `--color-border-control` (`#71717A` — 4.6:1 input contrast), `--color-border-strong` (`#52525B`), `--color-border-focus` (`#09090B`).
- Dark: `--color-border-dark-subtle` (`#27272A`), `--color-border-dark-default` (`#3F3F46`), `--color-border-dark-control` (`#8E8E93`), `--color-border-dark-strong` (`#A1A1AA`), `--color-border-dark-focus` (`#F4F4F5`).

### 3.6 Semantic Status Tokens

- Success: Text `#15803D` / BG `#F0FDF4` / Border `#BBF7D0` (Dark text `#4ADE80`)
- Warning: Text `#B45309` / BG `#FFFBEB` / Border `#FDE68A` (Dark text `#FBBF24`)
- Danger: Text `#BE123C` / BG `#FFF1F2` / Border `#FECDD3` (Dark text `#FB7185`)
- Info: Text `#0369A1` / BG `#F0F9FF` / Border `#BAE6FD` (Dark text `#38BDF8`)

### 3.7 Spacing & Layout

- Geometric scale: `--space-0` (0px) to `--space-32` (128px).
- Containers: `--container-default` (1440px), `--container-prose` (840px), `--container-full` (1920px), `--container-admin` (1600px).
- Gutters: Mobile (16px/20px), Tablet (24px), Desktop (32px/48px/64px).
- Radius: `--radius-none` (0px), `--radius-xs` (2px), `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-full` (9999px).
- Elevation: `--elevation-none`, `--elevation-low`, `--elevation-mid`, `--elevation-high`.

---

## 4. Typography & Font Loading (`src/styles/typography.css`)

### 4.1 Font Pair Architecture

- **Headings & Numbers**: `Plus Jakarta Sans` (weights 500, 600, 700, 800) -> `--font-heading`
- **Body & Interface**: `Inter` (weights 400, 500, 600) -> `--font-body`
- **Technical & Monospace**: `JetBrains Mono` (weights 400, 500) -> `--font-mono`

### 4.2 Loading Mechanism

- Fonts are loaded via `next/font/google` in `src/app/layout.tsx`.
- **Zero Runtime External Requests**: Next.js downloads font files during the build and self-hosts them as static assets. The browser makes zero runtime requests to `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Zero Layout Shift**: Configured with `display: "swap"` and precalculated fallback metrics.

### 4.3 Typography Scale Classes

- `.type-display`: `clamp(2.75rem, 6vw, 4.5rem)` / 800 weight / 1.05 line-height / -0.035em tracking.
- `.type-h1`: `clamp(2.0rem, 4vw, 2.75rem)` / 700 weight / 1.15 line-height / -0.030em tracking.
- `.type-h2`: `clamp(1.5rem, 3vw, 2.0rem)` / 700 weight / 1.20 line-height / -0.025em tracking.
- `.type-h3`: `clamp(1.125rem, 2vw, 1.375rem)` / 600 weight / 1.30 line-height / -0.020em tracking.
- `.type-h4`: `1.0rem` (16px) / 600 weight / 1.35 line-height / -0.010em tracking.
- `.type-body-large`: `1.125rem` (18px) / 400 weight / 1.60 line-height.
- `.type-body-default`: `0.9375rem` (15px) / 400 weight / 1.50 line-height.
- `.type-body-small`: `0.8125rem` (13px) / 400 weight / 1.45 line-height.
- `.type-caption`: `0.6875rem` (11px) / 500 weight / 1.30 line-height / +0.020em tracking / uppercase.
- `.type-button`: `0.875rem` (14px) / 600 weight / 1.00 line-height / +0.010em tracking.
- `.type-stat-giant`: `clamp(3.5rem, 8vw, 6.0rem)` / 800 weight / 0.95 line-height / -0.040em tracking.
- `.type-code-mono`: `0.8125rem` (13px) / 400 weight / 1.40 line-height.

---

## 5. Iconography Architecture

- **Library**: `lucide-react` pinned exactly at `1.31.0`.
- **Stroke Geometry**:
  - `16px` micro icon (`sm`): `strokeWidth={1.25}`
  - `20px` / `24px` / `32px` normal icons (`md`, `lg`, `xl`): `strokeWidth={1.5}`
- **Accessibility**: Decorative icons accompanying visible text are hidden with `aria-hidden="true"`. Standalone icon buttons require explicit `aria-label`.

---

## 6. Core Component Inventory (`src/components/ui/`)

| Primitive        | Directory                            | Key Responsibilities                                                                                                                               |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`         | `src/components/ui/button/`          | Native `<button>`, variants (`primary`, `secondary`, `ghost`, `destructive`), 44px desktop / 48px touch height, loading spinner with `aria-busy`.  |
| `IconButton`     | `src/components/ui/icon-button/`     | 44x44px minimum interactive hit area, mandatory `aria-label`, centered glyph.                                                                      |
| `Input`          | `src/components/ui/input/`           | Accessible `<input>`, 40px desktop / 44px mobile, border `color.border.control` (`#71717A`).                                                       |
| `TextField`      | `src/components/ui/input/`           | Integrated form field with automatic `label`, `description`, and `error` ARIA linkage (`useId`, `aria-describedby`, `aria-invalid`).               |
| `Badge`          | `src/components/ui/badge/`           | Category and general metadata badge (`neutral`, `brand`, `subtle`).                                                                                |
| `SpecPill`       | `src/components/ui/badge/`           | Technical metric pill (`39g`, `8000Hz`) with 2px radius and light/dark surface support.                                                            |
| `StatusBadge`    | `src/components/ui/badge/`           | Semantic status indicator (`success`, `warning`, `danger`, `info`, `neutral`) with mandatory visible text label and optional static indicator dot. |
| `Card`           | `src/components/ui/card/`            | Compositional neutral surface (`canvas`, `card`, `secondary`, `dark`, `dark-card`), padding options, elevation options.                            |
| `Container`      | `src/components/ui/container/`       | Responsive layout container (`default`, `prose`, `full`, `admin`) with canonical gutters.                                                          |
| `VisuallyHidden` | `src/components/ui/visually-hidden/` | Screen-reader utility for accessible names without visual layout footprint.                                                                        |
| `Stack`          | `src/components/ui/stack/`           | Finite typed flex layout helper with canonical token-mapped gaps (`0` to `12`).                                                                    |

---

## 7. Accessibility & Interaction Standards

1. **High-Contrast Focus**: Keyboard navigation uses `:focus-visible` with a 2px high-contrast outline (`#09090B` on light, `#F4F4F5` on dark) and 2px offset.
2. **Touch Ergonomics**: All interactive touch targets (buttons, icon buttons, inputs) meet or exceed the `44x44px` minimum bounding area standard.
3. **Color Independence**: Status indicators, error fields, and badges always pair color with text labels or distinct geometric icons.
4. **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by collapsing animations and transitions to `0.01ms`.

---

## 8. Extension Rules for Future Components

1. **Consume Semantic Tokens**: Future components must consume CSS Custom Properties from `src/styles/tokens.css` rather than hardcoding colors, borders, shadows, or spacing.
2. **Use Existing Primitives**: Compose existing primitives (`Button`, `TextField`, `Card`, `Container`) before creating new UI controls.
3. **No Parallel Mini-Design-Systems**: Features in GP-009+ must not define separate component frameworks, ad-hoc utilities, or inline color codes.
4. **Boundary Isolation**: GP-008 owns shared design tokens and primitives; feature-specific components (`ProductCard`, `Navbar`, `CartDrawer`, `CheckoutForm`) belong strictly to their assigned GPs.
