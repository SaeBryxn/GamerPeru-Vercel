# Gamer Perú — Canonical Design Language Specification

---

## 1. Executive Summary

This document establishes the canonical visual design language for **Gamer Perú** (`gamerperu.com`). It serves as the primary visual authority and design token source of truth for all future frontend implementation, design systems, and administrative interfaces.

Building upon the benchmark principles researched in `WLMOUSE_REFERENCE_SPEC.md` (GP-001) and the high-level intent in `VISUAL_DIRECTION.md`, this specification defines an **original, proprietary visual identity** engineered specifically for a high-performance multi-brand gaming peripherals retailer in the Peruvian market.

**Core Mandates**:
1. **Product Dominance**: Hardware industrial design, metallic/matte textures, structural cutouts, and physical ergonomics remain the primary visual focal points.
2. **Technological Restraint**: Clean monochrome foundations, high contrast, and disciplined precision replace generic RGB gamer tropes, distracting neon glows, and template clutter.
3. **Multi-Brand Neutrality**: The interface provides an elegant, high-contrast backdrop that harmonizes with peripherals of any colorway (from matte black and arctic white to vibrant pastels, anodized red, and gold).
4. **Dual-Surface Expression**: Seamlessly adapts from an expansive, editorial Storefront into a dense, high-efficiency operational Admin interface.
5. **Implementation-Agnostic Tokens**: All design tokens are defined semantically and conceptually, ready for mapping to future tech stacks (GP-003/GP-008) without premature framework lock-in.

---

## 2. Brand Personality & Mood

Gamer Perú occupies the intersection of **esports engineering, high-end industrial design, and Peruvian gaming culture**:

| Trait | What It Is | What It Is NOT |
|---|---|---|
| **Precision** | Surgical lines, tight typography, exact numeric specs (`39g`, `8000Hz`) | Decorative fake technical grids or sci-fi HUD clutter |
| **Maturity** | Sophisticated dark/light contrast, deep obsidian canvas, generous whitespace | Childish neon gaming glows, RGB rainbow gradients |
| **Editorial** | Magazine-style hardware deep dives, blueprint schematics, exploded views | Commodity marketplace rows of squeezed thumbnail cards |
| **Authenticity** | Direct Peruvian relevance (Soles pricing, Yape/Plin trust, domestic stock clarity) | Generic drop-shipping templates or patriotic flag clichés |
| **Performance** | Snappy transitions, immediate interactions, zero layout shifts | Heavy bloated 3D canvases or scroll-hijacked animations |

---

## 3. Visual Principles

1. **Hierarchy Through Contrast & Scale**: Visual priority is achieved through bold typographic scale and crisp contrast rather than ornamental borders, drop shadows, or background noise.
2. **Technical Data as Visual Narrative**: Specifications are marketing assets. Weight, sensor models, MCU architectures, and polling rates are highlighted using dedicated numeric typography and category-aware spec pills.
3. **Restrained Accent Deployment**: Color is used deliberately and sparingly to guide conversion actions, highlight real-time availability, and indicate system states.
4. **Generous Sectional Rhythm**: Storefront surfaces breathe with intentional whitespace (48px to 128px vertical section gaps), elevating hardware photography to luxury status.
5. **Architectural Density on Admin**: Admin surfaces compress whitespace (8px to 24px spacing) to maximize tabular data density, status auditing, and operational throughput.

---

## 4. Selected Visual Direction & Rationale

### Selected Canonical Direction: "Machinery Obsidian & Signal Crimson"
- **Canvas & Surface Palette**: Deep precision obsidian (`#09090B`) paired with clinical crisp canvas (`#FAFAFA`), structured by neutral slate-tinted zinc neutrals (`#18181B`, `#27272A`, `#E4E4E7`, `#FFFFFF`).
- **Brand Accent**: **Signal Crimson** (`#E11D48` / `#BE123C`), a laser-precise, saturated crimson inspired by optical sensor beams, anodized aluminum switches, and an authentic, non-cliché nod to Peruvian national identity.
- **Why This Direction Won**:
  - **Multi-Brand Compatibility**: Neutral obsidian/zinc foundation allows vibrant peripheral colors (e.g. WLMOUSE Beast X violet, Lamzu Maya red, Pulsar blue, Finalmouse gold) to stand out without chromatic clash.
  - **Premium Perception**: Delivers the tactile, luxurious feel of high-end consumer hardware (like Leica or Teenage Engineering) rather than cheap plastic toys.
  - **High Conversion Clarity**: The crisp crimson accent provides unmistakable CTA prominence with WCAG AA compliance (4.7:1+ contrast on white/dark).
  - **Long-Term Timelessness**: Avoids trendy aesthetic fads that degrade quickly.

---

## 5. Rejected Alternative Directions

### Rejected Concept 1: "Cyber Volt & Pitch Black"
- *Description*: Pure black background with electric neon green/yellow accents and glowing borders.
- *Reason for Rejection*: Highly clichéd "gamer" aesthetic; creates severe visual fatigue; clashes aggressively with multi-brand peripheral colorways (e.g., pink or pastel mice look jarring next to neon green); fails professional and luxury quality bars.

### Rejected Concept 2: "Boutique Minimalist Champagne Gold"
- *Description*: Warm grey canvas with muted champagne gold accents and serif display typography.
- *Reason for Rejection*: Feels like a luxury jewelry or perfume boutique; lacks the visceral punch, competitive energy, and high-visibility status signaling required for esports hardware.

---

## 6. Color System

All colors are defined as canonical semantic hex tokens.

### 6.1 Brand Accent Palette

```text
+-----------------------+-----------------------+-----------------------+
|  Brand Primary        |  Brand Hover          |  Brand Active         |
|  #E11D48 (Crimson 600)|  #BE123C (Crimson 700)|  #9F1239 (Crimson 800)|
+-----------------------+-----------------------+-----------------------+
|  Brand Subtle (Light) |  Brand Subtle (Dark)  |  Brand Text On Accent |
|  #FFF1F2 (Rose 50)    |  #4C0519 (Rose 950)   |  #FFFFFF (Pure White) |
+-----------------------+-----------------------+-----------------------+
```

| Token Name | Canonical Value | Semantic Usage |
|---|---|---|
| `color.brand.primary` | `#E11D48` | Primary CTA buttons, key active indicators, price highlights |
| `color.brand.hover` | `#BE123C` | Hover state for primary buttons and interactive brand elements |
| `color.brand.active` | `#9F1239` | Pressed / active state for brand controls |
| `color.brand.subtle_light`| `#FFF1F2` | Background tint for sale tags and promo banners on light surfaces |
| `color.brand.subtle_dark` | `#4C0519` | Background tint for sale tags and promo banners on dark surfaces |
| `color.brand.text_on_accent`| `#FFFFFF` | Text rendered on top of `color.brand.primary` / `hover` |

### 6.2 Neutral Surfaces (Light Context)

| Token Name | Canonical Value | Semantic Usage |
|---|---|---|
| `color.surface.canvas` | `#FAFAFA` | Default page background for light storefront sections & Admin |
| `color.surface.card` | `#FFFFFF` | Default product card, table container, and content block surface |
| `color.surface.elevated` | `#FFFFFF` | Dropdowns, popovers, and floating cards (with elevation shadow) |
| `color.surface.secondary` | `#F4F4F5` | Secondary card wells, filter toolbars, and inactive tab strips |
| `color.surface.tertiary` | `#E4E4E7` | Subtle section backgrounds and table header rows in Admin |
| `color.surface.overlay` | `rgba(9, 9, 11, 0.65)`| Semi-transparent backdrop for modal dialogs and slide-out drawers |

### 6.3 Inverted Neutral Surfaces (Dark Context & Dark Editorial Sections)

| Token Name | Canonical Value | Semantic Usage |
|---|---|---|
| `color.surface.dark_canvas` | `#09090B` | Obsidian dark page background for hero sections and dark PDP story blocks |
| `color.surface.dark_card` | `#121215` | Elevated card surface on dark canvas |
| `color.surface.dark_secondary` | `#18181B` | Secondary wells, dark spec callout boxes, dark table rows |
| `color.surface.dark_tertiary` | `#27272A` | Inverted input fields and dark control backgrounds |

### 6.4 Text & Typography Tokens

| Token Name | Canonical Value | Context & Usage |
|---|---|---|
| `color.text.primary` | `#09090B` | Primary headings, product titles, and body copy on light surfaces |
| `color.text.secondary` | `#52525B` | Subheadings, descriptions, and metadata on light surfaces |
| `color.text.muted` | `#71717A` | Secondary spec pills, breadcrumbs, placeholder text (large/spec contexts) |
| `color.text.disabled` | `#A1A1AA` | Disabled button and input labels |
| `color.text.link` | `#E11D48` | Inline text hyperlinks on light surfaces |
| `color.text.dark_primary` | `#F4F4F5` | Primary text and headlines on dark/inverted surfaces |
| `color.text.dark_secondary`| `#A1A1AA` | Secondary body text and spec descriptions on dark surfaces |
| `color.text.dark_muted` | `#9CA3AF` | Captions, footprints, and muted descriptions on dark surfaces ($\ge 5.8:1$ contrast) |
| `color.text.dark_link` | `#FB7185` | Inline hyperlinks on dark surfaces |

### 6.5 Border & Divider Tokens

| Token Name | Canonical Value | Usage |
|---|---|---|
| `color.border.subtle` | `#E4E4E7` (Dark: `#27272A`) | Subtle decorative card outlines, row dividers, tab borders |
| `color.border.default` | `#D4D4D8` (Dark: `#3F3F46`) | Standard container boundaries, table header dividers |
| `color.border.control` | `#71717A` (Dark: `#8E8E93`) | Accessible structural boundary for inputs, selects, and checkboxes ($\ge 4.6:1$ light / $\ge 4.5:1$ dark) |
| `color.border.strong` | `#52525B` (Dark: `#A1A1AA`) | Active borders, selected swatch rings, hovered controls |
| `color.border.focus` | `#09090B` (Dark: `#F4F4F5`) | High-contrast 2px focus ring for keyboard accessibility |

### 6.6 Semantic Status Tokens

| Status | Text Color | Background (Light) | Border Color | Dark Canvas Text |
|---|---|---|---|---|
| **Success** | `#15803D` (Green 700) | `#F0FDF4` (Green 50) | `#BBF7D0` (Green 200) | `#4ADE80` (Green 400) |
| **Warning** | `#B45309` (Amber 700) | `#FFFBEB` (Amber 50) | `#FDE68A` (Amber 200) | `#FBBF24` (Amber 400) |
| **Danger / Error** | `#BE123C` (Rose 700) | `#FFF1F2` (Rose 50) | `#FECDD3` (Rose 200) | `#FB7185` (Rose 400) |
| **Information** | `#0369A1` (Sky 700) | `#F0F9FF` (Sky 50) | `#BAE6FD` (Sky 200) | `#38BDF8` (Sky 400) |

---

## 7. Typography System

### 7.1 Font Pair Architecture

1. **Heading & Numeric Font**: `Plus Jakarta Sans`
   - *Weights*: `500` (Medium), `600` (SemiBold), `700` (Bold), `800` (ExtraBold).
   - *Rationale*: A modern geometric grotesque with crisp technical geometry, tight apertures, and outstanding numerical figures for specifications (`39g`, `8000Hz`, `PAW3950`). Fully open-source (OFL), distinct from generic Inter headings, high-end feel.
2. **Body & Interface Font**: `Inter`
   - *Weights*: `400` (Regular), `500` (Medium), `600` (SemiBold).
   - *Rationale*: Exceptional micro-legibility in Spanish, outstanding rendering in dense Admin tables, robust cross-browser rendering.
3. **Monospace & Code Font**: `JetBrains Mono`
   - *Weights*: `400` (Regular), `500` (Medium).
   - *Rationale*: Tabular figures for SKUs, order tracking codes, Yape/Plin operation IDs, and MCU/sensor technical registers.

### 7.2 Typographic Hierarchy & Fluid Scales

```text
========================================================================================
DISPLAY / HERO    Plus Jakarta Sans 800 | 44px -> 72px | Line-Height: 1.05 | -0.035em
H1 / PAGE TITLE   Plus Jakarta Sans 700 | 32px -> 44px | Line-Height: 1.15 | -0.030em
H2 / SECTION      Plus Jakarta Sans 700 | 24px -> 32px | Line-Height: 1.20 | -0.025em
H3 / SUBSECTION   Plus Jakarta Sans 600 | 18px -> 22px | Line-Height: 1.30 | -0.020em
H4 / COMPONENT    Plus Jakarta Sans 600 | 16px         | Line-Height: 1.35 | -0.010em
BODY LARGE        Inter 400             | 18px         | Line-Height: 1.60 | 0.000em
BODY DEFAULT      Inter 400             | 15px         | Line-Height: 1.50 | 0.000em
BODY SMALL        Inter 400             | 13px         | Line-Height: 1.45 | 0.000em
CAPTION (NON-CRIT)Inter 500 / Plus J. 600| 11px        | Line-Height: 1.30 | +0.020em (Upper)
CARD TITLE        Plus Jakarta Sans 600 | 16px         | Line-Height: 1.30 | -0.010em
CARD PRICE        Plus Jakarta Sans 700 | 18px         | Line-Height: 1.20 | -0.020em
STAT GIANT        Plus Jakarta Sans 800 | 56px -> 96px | Line-Height: 0.95 | -0.040em
CODE MONO         JetBrains Mono 400    | 13px         | Line-Height: 1.40 | 0.000em
========================================================================================
```

| Typographic Level | Font Family | Weight | Size (Mobile $\to$ Desktop) | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| `type.display` | Plus Jakarta Sans | 800 | `clamp(2.75rem, 6vw, 4.5rem)` | `1.05` | `-0.035em` |
| `type.h1` | Plus Jakarta Sans | 700 | `clamp(2.0rem, 4vw, 2.75rem)` | `1.15` | `-0.03em` |
| `type.h2` | Plus Jakarta Sans | 700 | `clamp(1.5rem, 3vw, 2.0rem)` | `1.20` | `-0.025em` |
| `type.h3` | Plus Jakarta Sans | 600 | `clamp(1.125rem, 2vw, 1.375rem)`| `1.30` | `-0.02em` |
| `type.h4` | Plus Jakarta Sans | 600 | `1.0rem` (16px) | `1.35` | `-0.01em` |
| `type.card.title` | Plus Jakarta Sans | 600 | `1.0rem` (16px) | `1.30` | `-0.01em` |
| `type.card.price` | Plus Jakarta Sans | 700 | `1.125rem` (18px) | `1.20` | `-0.02em` |
| `type.body.large` | Inter | 400 | `1.125rem` (18px) | `1.60` | `0.0em` |
| `type.body.default`| Inter | 400 / 500 | `0.9375rem` (15px) | `1.50` | `0.0em` |
| `type.body.small` | Inter | 400 / 500 | `0.8125rem` (13px) | `1.45` | `0.0em` |
| `type.caption` | Inter | 500 | `0.6875rem` (11px) | `1.30` | `+0.02em` (Uppercase) |
| `type.button` | Plus Jakarta Sans | 600 | `0.875rem` (14px) | `1.0` | `+0.01em` |
| `type.stat.giant` | Plus Jakarta Sans | 800 | `clamp(3.5rem, 8vw, 6.0rem)` | `0.95` | `-0.04em` |
| `type.code.mono` | JetBrains Mono | 400 / 500 | `0.8125rem` (13px) | `1.40` | `0.0em` |

### 7.3 Caption & Small-Text Safety Rule
`type.caption` (`11px`) is strictly restricted to secondary/non-essential metadata (such as brand category tags or micro timestamps). **11px typography must NEVER be used for**:
- Payment instructions or verification notices;
- Form validation error messages;
- Warranty, returns, or shipping terms;
- Essential accessibility status messages or transaction details.
All critical copy must use `type.body.small` (`13px`) or `type.body.default` (`15px`).

---

## 8. Spacing Scale

Gamer Perú utilizes a geometric base-4/base-8 spacing scale.

| Token Name | Exact Value | Rem Equiv. | Semantic Application |
|---|---|---|---|
| `space.0` | `0px` | `0rem` | Reset |
| `space.1` | `4px` | `0.25rem` | Micro padding, icon gaps, status dot offsets |
| `space.2` | `8px` | `0.5rem` | Tight tag padding, input inner vertical padding, badge gaps |
| `space.3` | `12px` | `0.75rem` | Button vertical padding, card inner gutter, form input gaps |
| `space.4` | `16px` | `1.0rem` | Standard component padding, mobile page gutters, list item gaps |
| `space.5` | `20px` | `1.25rem` | Medium component padding, tablet card gaps |
| `space.6` | `24px` | `1.5rem` | Card padding, desktop grid gutters, header height padding |
| `space.8` | `32px` | `2.0rem` | Large card padding, modal inner padding, desktop section gutters |
| `space.10` | `40px` | `2.5rem` | Sub-section spacing, filter sidebar margin |
| `space.12` | `48px` | `3.0rem` | Standard section vertical spacing (Storefront) |
| `space.16` | `64px` | `4.0rem` | Major section vertical spacing (Storefront desktop) |
| `space.20` | `80px` | `5.0rem` | Editorial section vertical gaps |
| `space.24` | `96px` | `6.0rem` | Large Product Story transition blocks |
| `space.32` | `128px` | `8.0rem` | Hero and flagship product showcase spacing |

---

## 9. Grid & Container System

### 9.1 Container Strategy
- **Standard Container (`container.default`)**: `max-width: 1440px` with responsive gutters. Used for catalog, listings, PDP commerce blocks, and footer.
- **Narrow Container (`container.prose`)**: `max-width: 840px`. Used for customer account forms, policy pages, checkout, and text-heavy editorial.
- **Full-Bleed Container (`container.full`)**: `max-width: 1920px` with clamp gutters. Used for hero storytelling, macro hardware banners, and exploded 3D diagrams.
- **Admin Fluid Container (`container.admin`)**: `max-width: 1600px` with fixed 24px gutters. Optimizes horizontal space for complex data tables.

### 9.2 Page Gutters
- Compact Mobile (`< 480px`): `16px`
- Standard Mobile (`480px - 767px`): `20px`
- Tablet (`768px - 1023px`): `24px`
- Desktop (`1024px - 1279px`): `32px`
- Large Desktop (`1280px - 1535px`): `48px`
- Wide Desktop (`1536px+`): `64px`

---

## 10. Responsive Breakpoints

To prevent ambiguity for coding agents, Gamer Perú defines exact viewport thresholds:
- **Minimum Supported Viewport**: `360px` (All interfaces must remain completely functional and overflow-free at 360px).

| Token Name | Breakpoint Threshold | Semantic Target |
|---|---|---|
| `bp.xs` | `< 480px` | Compact Mobile viewports (Reference range: 360px - 479px) |
| `bp.sm` | `480px` | Standard Mobile (Large smartphones / phablets) |
| `bp.md` | `768px` | Tablet Portrait |
| `bp.lg` | `1024px` | Tablet Landscape / Small Laptop (Header drawer $\to$ mega-menu switch) |
| `bp.xl` | `1280px` | Standard Desktop (4-column product grid threshold) |
| `bp.2xl` | `1536px` | Wide Desktop (Max container clamping active) |

---

## 11. Radius, Border & Elevation System

### 11.1 Corner Radius Tokens

```text
[ radius.xs: 2px ]  [ radius.sm: 4px ]  [ radius.md: 8px ]  [ radius.lg: 12px ]  [ radius.full: 9999px ]
(Spec Pills)        (Buttons / Inputs)  (Cards / Alerts)    (Drawers / Modals)   (Swatches / Dots)
```

| Token Name | Exact Value | Semantic Target |
|---|---|---|
| `radius.none` | `0px` | Full-bleed banners, table square cells |
| `radius.xs` | `2px` | Micro status tags, spec pills |
| `radius.sm` | `4px` | Primary/secondary buttons, input fields, select dropdowns |
| `radius.md` | `8px` | Product cards, dialog boxes, toast notifications, story containers |
| `radius.lg` | `12px` | Modal dialogs, slide-out drawer panels |
| `radius.full` | `9999px` | Color swatch circles, status indicator pills, avatar circles |

### 11.2 Border Width Tokens
- `border.width.thin`: `1px` (Standard card borders, input borders, divider lines)
- `border.width.medium`: `2px` (Selected swatch rings, active focus rings, tab indicators)
- `border.width.thick`: `3px` (Heavy highlight badges)

### 11.3 Elevation & Shadow Tokens
- `elevation.none`: `none`
- `elevation.low`: `0 1px 3px 0 rgba(9, 9, 11, 0.04), 0 1px 2px -1px rgba(9, 9, 11, 0.04)` (Product cards resting on canvas)
- `elevation.mid`: `0 4px 6px -1px rgba(9, 9, 11, 0.08), 0 2px 4px -2px rgba(9, 9, 11, 0.06)` (Product card on hover, search dropdowns)
- `elevation.high`: `0 20px 25px -5px rgba(9, 9, 11, 0.14), 0 8px 10px -6px rgba(9, 9, 11, 0.08)` (Slide-out drawers, modal overlays)

---

## 12. Iconography Language

1. **Style**: Outline / Stroke-first iconography with precision geometric terminal cuts.
2. **Visual Weight**: Consistent `1.5px` stroke weight on a `24x24px` bounding box (`1.25px` on `16x16px` micro-icons).
3. **Corner Treatment**: Subtle 1px corner radius on geometric shapes; never bubbly or cartoonish.
4. **Standard Sizing Scales**:
   - `icon.size.sm`: `16x16px` (Inline table status, input field icons, spec pill icons)
   - `icon.size.md`: `20x20px` (Button leading icons, dropdown carets, badge icons)
   - `icon.size.lg`: `24x24px` (Header navigation icons: Search, User, Cart, Menu)
   - `icon.size.xl`: `32x32px` (Feature story highlights, empty state indicators)
5. **Implementation Independence**: No specific icon library package is mandated in GP-002; GP-003/implementation will select an open-source library matching this stroke and sizing geometry.

---

## 13. Motion System

Gamer Perú's motion philosophy is **tactile, snappy, and non-blocking**. Animations serve exclusively to confirm physical hardware interactions, convey visual hierarchy, and enhance perceived performance.

### 13.1 Canonical Motion Tokens

| Token Name | Value | Purpose & Application |
|---|---|---|
| `motion.duration.instant`| `0ms` | For users with `prefers-reduced-motion: reduce` |
| `motion.duration.fast` | `150ms` | Button hover states, input border focus, color transitions |
| `motion.duration.normal` | `250ms` | Card hover lift, dropdown menu expand, accordion open/close |
| `motion.duration.moderate`| `350ms` | Off-canvas drawer slide-in, modal dialog entrance |
| `motion.duration.slow` | `500ms` | Hero carousel crossfades, large storytelling block reveal |
| `motion.easing.snappy` | `cubic-bezier(0.16, 1, 0.3, 1)` | Standard deceleration curve for entrances and interactive controls |
| `motion.easing.standard`| `cubic-bezier(0.4, 0, 0.2, 1)` | General in-out transitions |
| `motion.easing.linear` | `linear` | Continuous spinners and progress indicators |

### 13.2 Specific Interaction Behaviors
- **Product Card Hover**: Subtle 3px vertical lift (`translateY(-3px)`) with smooth shadow transition (`elevation.low` $\to$ `elevation.mid`) over `250ms` using `motion.easing.snappy`. Secondary product view smoothly cross-fades via opacity.
- **Drawer Slide-in**: Slides horizontally from right viewport edge (`translateX(100%)` $\to$ `0`) over `350ms` with synchronized opacity backdrop fade (`0` $\to$ `1`).
- **No Permanent Stock Pulse**: Stock indicators use a solid, static state dot. No continuous ambient pulsing animation.
- **Reduced Motion Support**:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```

---

## 14. Accessibility Foundations & Validation

### 14.1 Complete WCAG 2.1 AA Contrast Validation Table

| Foreground Token | Background Token | Context / Role | Ratio | Requirement | Result |
|---|---|---|---|---|---|
| `color.text.primary` (`#09090B`) | `color.surface.canvas` (`#FAFAFA`) | Body / Headings on Light | **19.06:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.primary` (`#09090B`) | `color.surface.card` (`#FFFFFF`) | Body on White Card | **19.89:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.secondary` (`#52525B`)| `color.surface.canvas` (`#FAFAFA`) | Secondary Text on Light | **7.41:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.secondary` (`#52525B`)| `color.surface.card` (`#FFFFFF`) | Secondary on Card | **7.73:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.muted` (`#71717A`) | `color.surface.canvas` (`#FAFAFA`) | Spec Text (Large/Pill) | **4.63:1** | $\ge 3.0:1$ | **PASS** |
| `color.brand.primary` (`#E11D48`) | `color.surface.canvas` (`#FAFAFA`) | Brand Accent / Big Price | **4.50:1** | $\ge 3.0:1$ | **PASS** |
| `color.brand.hover` (`#BE123C`) | `color.surface.canvas` (`#FAFAFA`) | Hover Brand Link | **6.02:1** | $\ge 4.5:1$ | **PASS** |
| `color.brand.text_on_accent` (`#FFFFFF`) | `color.brand.primary` (`#E11D48`) | White on Primary Button | **4.70:1** | $\ge 4.5:1$ | **PASS** |
| `color.brand.text_on_accent` (`#FFFFFF`) | `color.brand.hover` (`#BE123C`) | White on Hover Button | **6.29:1** | $\ge 4.5:1$ | **PASS** |
| `color.border.control` (`#71717A`)| `color.surface.canvas` (`#FAFAFA`) | Input Boundary (Non-text)| **4.63:1** | $\ge 3.0:1$ | **PASS** |
| `color.border.control` (`#71717A`)| `color.surface.card` (`#FFFFFF`) | Input Boundary on Card | **4.83:1** | $\ge 3.0:1$ | **PASS** |
| `color.border.focus` (`#09090B`) | `color.surface.canvas` (`#FAFAFA`) | Keyboard Focus Ring | **19.06:1** | $\ge 3.0:1$ | **PASS** |
| `color.text.dark_primary` (`#F4F4F5`)| `color.surface.dark_canvas` (`#09090B`)| Dark Canvas Headings | **18.10:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.dark_secondary` (`#A1A1AA`)| `color.surface.dark_canvas` (`#09090B`)| Dark Canvas Body | **7.76:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.dark_muted` (`#9CA3AF`)| `color.surface.dark_canvas` (`#09090B`)| Dark Canvas Muted | **7.84:1** | $\ge 4.5:1$ | **PASS** |
| `color.text.dark_muted` (`#9CA3AF`)| `color.surface.dark_tertiary` (`#27272A`)| Dark Tertiary Muted | **5.87:1** | $\ge 4.5:1$ | **PASS** |
| `color.border.dark_control` (`#8E8E93`)| `color.surface.dark_canvas` (`#09090B`)| Dark Input Boundary | **6.10:1** | $\ge 3.0:1$ | **PASS** |
| `color.status.success` (`#15803D`)| `#F0FDF4` (Success Bg) | Success Label | **4.79:1** | $\ge 4.5:1$ | **PASS** |
| `color.status.warning` (`#B45309`)| `#FFFBEB` (Warning Bg) | Warning Label | **4.84:1** | $\ge 4.5:1$ | **PASS** |
| `color.status.danger` (`#BE123C`) | `#FFF1F2` (Danger Bg) | Error Label | **5.72:1** | $\ge 4.5:1$ | **PASS** |
| `color.status.info` (`#0369A1`) | `#F0F9FF` (Info Bg) | Info Label | **5.57:1** | $\ge 4.5:1$ | **PASS** |

### 14.2 Focus & Touch Ergonomics
1. **Focus Ring Visibility**: Interactive elements display a dedicated 2px high-contrast outline (`color.border.focus`: `#09090B` on light canvas, `#F4F4F5` on dark canvas) with a 2px offset on keyboard navigation (`:focus-visible`).
2. **Touch-Target Standard**: All interactive buttons, checkboxes, links, and drawer triggers target a minimum of `44x44px` touch bounding area as a Gamer Perú usability standard.
3. **Color-Independent Status**: Badges, stock indicators, and error fields always pair color with text labels or distinct geometric icons (never relying on color alone).

---

## 15. Buttons

- **Primary Button**:
  - Background: `color.brand.primary` (`#E11D48`), Text: `color.brand.text_on_accent` (`#FFFFFF`), Typography: `type.button` (Plus Jakarta Sans 600, 14px)
  - Height: `44px` (Desktop) / `48px` (Mobile touch target), Padding: `0 24px`, Radius: `radius.sm` (`4px`)
  - Hover: Background `color.brand.hover` (`#BE123C`), `translateY(-1px)`
  - Active: Background `color.brand.active` (`#9F1239`), `translateY(0)`
  - Focus: 2px outline `color.border.focus` with 2px offset
  - Disabled: Background `color.surface.tertiary`, Text `color.text.disabled`, cursor `not-allowed`
- **Secondary Button**:
  - Background: `color.surface.card` (`#FFFFFF`), Border: 1px `color.border.default` (`#D4D4D8`)
  - Text: `color.text.primary` (`#09090B`), Hover: Background `color.surface.secondary`
- **Ghost / Tertiary Button**:
  - Background: Transparent, Text: `color.text.primary`, Hover: Background `color.surface.secondary`
- **Destructive Button**:
  - Background: `color.status.danger`, Text: `#FFFFFF`

---

## 16. Inputs & Forms

- Height: `40px` (Admin / Desktop) / `44px` (Mobile)
- Background: `color.surface.card`, Border: 1px `color.border.control` (`#71717A` - 4.6:1 contrast), Radius: `radius.sm`
- Typography: `type.body.default` (`15px`), Text: `color.text.primary`
- Placeholder: `color.text.muted` (`#71717A`)
- Hover: Border `color.border.strong` (`#52525B`)
- Focus: Border `color.border.focus` (1px solid `#09090B`), 2px subtle ring
- Error State: Border `color.status.danger` (`#BE123C`), inline error caption in `color.status.danger` (13px `type.body.small`)

---

## 17. Badges, Pills & Status Indicators

- **Spec Pill (Technical Metric)**:
  - Background: `color.surface.secondary` (`#F4F4F5`) (Dark: `#18181B`)
  - Text: `color.text.secondary` (`#52525B`) (Dark: `#A1A1AA`), Typography: Plus Jakarta Sans 600, `11px`
  - Padding: `2px 8px`, Radius: `radius.xs` (`2px`), Border: 1px `color.border.subtle`
- **Stock Badge**:
  - In Stock: Text `#15803D`, Background `#F0FDF4`, Border `#BBF7D0` (with static 6px green indicator dot)
  - Low Stock: Text `#B45309`, Background `#FFFBEB`, Border `#FDE68A`
  - Pre-order: Text `#0369A1`, Background `#F0F9FF`, Border `#BAE6FD`
- **Sale / Discount Tag**:
  - Background: `color.brand.primary` (`#E11D48`), Text: `#FFFFFF`, Typography: Plus Jakarta Sans 700, `11px`

---

## 18. Navigation Language

### 18.1 Announcement Bar
- Height: `36px`, Background: `color.surface.dark_canvas` (`#09090B`), Text: `color.text.dark_primary` (`#F4F4F5`), Typography: `type.body.small` (`13px` Inter 500).
- Purpose: High-visibility notifications (shipping notes, new brand launches, customer service announcements).

### 18.2 Desktop Header
- Sticky header with clean `64px` height, Background: `rgba(255, 255, 255, 0.95)` with backdrop blur and 1px bottom border (`color.border.subtle`).
- Brand Mark on left, horizontal category navigation in center (`type.body.default` Inter 500), utility actions on right (Search, Account, Wishlist, Cart with numeric counter badge).
- Hover States: Active links display a 2px bottom crimson indicator bar (`#E11D48`).

### 18.3 Mega-Menu
- Full-width dropdown panel resting on `elevation.high` shadow, Background: `color.surface.card` (`#FFFFFF`).
- 4-column layout: Featured product spotlight with photo (Col 1), Structured category sub-links (Col 2 & 3), Brand directory with logos (Col 4).

### 18.4 Mobile Navigation Drawer
- Left slide-out drawer (`320px` width on mobile), Background: `color.surface.card`.
- Accordion navigation tree: Categories $\to$ Brands $\to$ Featured Curations.
- Bottom pinned actions: Customer Account link, WhatsApp/Support link, Soles currency indicator.

### 18.5 Breadcrumbs
- Typography: `type.body.small` (`13px`), Color: `color.text.muted`, Active leaf: `color.text.primary` (SemiBold). Slash separators (`/`) in `color.border.default`.

### 18.6 Footer
- Background: `color.surface.dark_canvas` (`#09090B`), Text: `color.text.dark_secondary`, Border top: 1px `color.border.subtle`.
- 4-column structured layout: Brand story & store identity, Catalog directory, Customer support & policies, Payment & trust badges (Yape, Plin).

---

## 19. Drawers, Modals & Overlays

### 19.1 Surface Treatment & Backdrop
- Backdrop: `color.surface.overlay` (`rgba(9, 9, 11, 0.65)`) with smooth 350ms opacity transition.
- Panel Surface: `color.surface.card` (`#FFFFFF`) on light mode; `elevation.high` shadow.

### 19.2 Drawer vs. Modal Distinction
- **Drawers (Cart, Mobile Nav, Mobile Filters)**: Slide out from the right (or bottom on mobile filters) over `350ms` using `motion.easing.snappy`. Width: `420px` (Desktop) / `100vw` (Mobile).
- **Modals (Product Quick View, Verification Details)**: Centered floating dialog (`max-width: 600px` to `800px`), Radius: `radius.lg` (`12px`), scale-in transition (`scale(0.96) -> scale(1.0)`).

### 19.3 Header & Close Controls
- Sticky top header with bold title in `type.h3` and a 36x36px accessible close icon button (`aria-label="Cerrar"`).
- Keyboard: Pressing `Escape` immediately triggers smooth close transition. Focus is trapped within overlay while open.

---

## 20. Product Card Language

Product cards are the core visual currency of Gamer Perú:

```text
+-------------------------------------------------------+
| [ BRAND BADGE ]                   [ STOCK STATUS DOT ]|
|                                                       |
|                                                       |
|              [ 4:5 HIGH-RES PRODUCT PHOTO ]           |
|              (Smooth secondary angle on hover)        |
|                                                       |
|                                                       |
+-------------------------------------------------------+
| WLMOUSE                                               |
| Beast X Pro Magnesium Wireless                        |
|                                                       |
| [ 39g ]   [ PAW3950HS ]   [ 8000Hz Wireless ]         |
|                                                       |
| S/ 589.00  S/ 649.00                                  |
| [ ⚫ ⚪ 🔴 3 Colores ]                                |
+-------------------------------------------------------+
```

### Card Visual Anatomy
1. **Aspect Ratio**: 4:5 vertical proportion providing ample headroom and base room for hardware.
2. **Background**: Pure `color.surface.card` (`#FFFFFF`) with subtle 1px border (`color.border.subtle`).
3. **Brand Badge**: Subtle uppercase tracking (`type.caption`, `11px`, `color.text.muted`).
4. **Product Title**: `type.card.title` (Plus Jakarta Sans 600, 16px), 2-line clamp with overflow protection.
5. **Category Spec Pills**: 2 to 3 category-specific pills rendered dynamically:
   - Mice: Weight (`39g`), Sensor (`PAW3950`), Polling (`8K`).
   - Keyboards: Switch (`Magnetic HE`), Layout (`75%`), Feature (`Rapid Trigger`).
   - Mousepads: Surface (`Glass/Cloth`), Dimensions (`490x420mm`), Base (`PORON`).
6. **Pricing Block**: Current price in `type.card.price` (Plus Jakarta Sans 700, 18px, Crimson or Primary), Compare-at price in `type.body.small` strikethrough (`color.text.muted`).
7. **Colorway Swatches**: 14px circular color dots with 2px white gap and subtle hover ring.
8. **Wishlist Icon**: Top right corner overlay, 32x32px circular hit target, accessible via keyboard focus.

---

## 21. Category & Brand Page Language

### 21.1 Page Header & Editorial Intro
- Structured header displaying Category / Brand Title in `type.h1` (32px - 44px) alongside a concise 2-line technical overview in `type.body.large` (18px).
- Optional brand hero banner with authorized manufacturer emblem and verified distributor badge.

### 21.2 Layout & Filter Sidebar
- 2-column desktop layout: Left filter sidebar (`280px` fixed width) + Right product grid (Fluid 3 to 4 columns).
- Filter Sidebar: Collapsible accordion sections for Brand, Price Slider, Weight Range, Sensor, Connectivity, Switch Type, and Stock Status. All checkboxes use `color.border.control` with high-contrast active checkmarks.
- Active Filter Bar: Horizontal strip above grid displaying dismissible pill chips (e.g. `[ < 45g ✕ ]`, `[ WLMOUSE ✕ ]`) with "Limpiar Filtros" quick reset.
- Mobile Filter Experience: Collapsed into a sticky "Filtrar y Ordenar" button that opens a full-screen slide-up filter sheet.

---

## 22. Product Detail Page (PDP) Language

### 22.1 Desktop PDP Composition
- **Left Column (58% width)**: Sticky interactive media gallery:
  - Main hero stage with fluid zoom capability.
  - Horizontal thumbnail row with active crimson bottom bar.
  - Visual badges for bundled items (e.g., 8K Dongle included, Extra Glass Skates).
- **Right Column (42% width)**: Purchase & Configuration panel:
  - Brand header with link to brand landing page.
  - Full product model title in `type.h1` (32px).
  - Price cluster with clear Soles formatting (`S/`).
  - Interactive variant selectors (Color chips with color names, Switch type buttons).
  - Real-time stock status block (`[TBD BUSINESS DECISION: Stock display policy]`).
  - Configurable shipping/delivery estimator slot (`[TBD BUSINESS DECISION: Courier provider TBD]`).
  - Primary high-impact **Añadir al Carrito** button + Wishlist button.
  - Canonical v1 Payment Trust Box: Yape & Plin manual verification badge.
  - Configurable warranty & support trust slot (`[TBD BUSINESS DECISION: Warranty policy TBD]`).

### 22.2 Mobile PDP Composition
- Swipeable 1:1 / 4:5 aspect ratio gallery with numerical counter pill (`1/7`).
- Purchase panel stacked immediately below hero gallery.
- Sticky bottom purchase bar triggered once user scrolls past main Add to Cart button: displays mini thumbnail, price, and instant "Añadir al Carrito" button.

---

## 23. Product Story Language

The below-the-fold PDP experience uses 13 standardized editorial story blocks:

```text
[ HERO MEDIA ]         -> Cinematic atmospheric banner
[ FULL BLEED IMAGE ]   -> Macro metallic texture / chassis cutouts
[ IMAGE + TEXT ]       -> 50/50 split detailing engineering benefits
[ STAT HIGHLIGHT ]     -> 3-column giant numeric specs (39g | 8K Hz | 30K DPI)
[ SPEC FEATURE ]       -> Deep dive on dongle LCD screen or Rapid Trigger switch
[ VIDEO ]              -> Silent looping hardware demonstration or sound test
[ GALLERY ]            -> Multi-angle sequenced image showcase
[ COMPARISON TABLE ]   -> Predecessor vs Flagship spec diff
[ BLUEPRINT DIMENSIONS]-> Orthographic schematics with grip compatibility
[ BOX CONTENTS GRID ]  -> High-contrast visual inventory of package items
[ TECHNICAL SPECS ]    -> Comprehensive 2-column tabular specification matrix
[ FAQ ACCORDION ]      -> Searchable product FAQs and web-driver guidance
[ RELATED PERIPHERALS] -> Cross-sell complementary accessories (skates, pads)
```

| Component Name | Visual Purpose | Light/Dark Mode | Media/Text Ratio |
|---|---|---|---|
| **`HeroMedia`** | Full-width cinematic introduction | Dark Canvas | 80% Media / 20% Text |
| **`FullBleedImage`**| Macro texture & material showcase | Either | 100% Media |
| **`ImageText`** | Editorial engineering explanation | Either | 50% Media / 50% Text |
| **`StatHighlight`** | Giant metric visual marketing | Dark Canvas | 30% Media / 70% Typography |
| **`SpecFeature`** | Detailed flagship feature spotlight | Light Canvas | 60% Media / 40% Text |
| **`Video`** | Hardware motion / sound test | Dark/Light Canvas| 80% Video / 20% Text |
| **`Gallery`** | Multi-angle curated photo sequence | Light Canvas | 90% Gallery / 10% Captions |
| **`Comparison`** | Visual matrix vs benchmark models | Light Canvas | Tabular Data |
| **`Dimensions`** | Orthographic blueprint drawings | Dark/Light Canvas| 70% Blueprint / 30% Text |
| **`BoxContents`** | Visual inventory of packaged items | Light Canvas | 60% Image Grid / 40% Text |
| **`TechnicalSpecs`**| Exhaustive technical spec table | Neutral Surface | 100% Tabular Text |
| **`FAQ`** | Expandable support accordions | Light Canvas | 100% Text |
| **`RelatedProducts`**| Catalog carousel of accessories | Light Canvas | Card Grid |

### Video & Gallery Specifications
- **`Video`**: Silent looping video blocks must include an explicit `poster` frame image, `muted`, `playsinline`, and `autoplay` only when in active viewport. Video controls must be accessible for keyboard pause/play.
- **`Gallery`**: 3 to 6 high-resolution images arranged in a clean masonry or horizontal scroll layout on mobile, with descriptive alt text on every frame.

---

## 24. Cart & Checkout Language

### 24.1 Cart Drawer & Full Cart Page
- Item rows: Clean thumbnail (80x80px), Brand & Title, Variant descriptor (e.g. `Negro / Omron Optical`), unit price in Soles, plus/minus quantity stepper, and remove button.
- Subtotal block: Clear Soles calculation, promotional discount field, and primary "Proceder al Pago" CTA button.
- Canonical v1 Payment Trust Box: Explicit notice that payment is completed via **Yape** or **Plin** manual verification upon order placement.

### 24.2 Checkout Visual Clarity
- 2-column layout: Customer & Shipping form (Left) + Order Summary & Payment Verification instructions (Right).
- Form inputs follow strict accessible control borders (`color.border.control`).
- Step clarity: 1. Datos de Contacto $\to$ 2. Dirección de Envío $\to$ 3. Pago con Yape/Plin $\to$ 4. Confirmación de Pedido.

---

## 25. Customer Account Language

Visual templates for authenticated customer hub:
1. **Profile & Security**: Clean form cards for name, email, phone, and password update.
2. **Address Book**: Multi-card grid with "Predeterminada" badge and edit/delete actions.
3. **Order History & Detail**: Tabular list with Order ID (`type.code.mono`), date, total in Soles, and payment verification status pill (`Verificando Pago`, `Pago Confirmado`, `Enviado`).
4. **Wishlist**: Responsive grid of saved product cards with instant "Mover al Carrito" action.
5. **Referral Program**: High-contrast shareable link box with copy-to-clipboard button and referral credit ledger.

---

## 26. Storefront vs. Admin Expressions

Gamer Perú maintains a single unified token system with two distinct functional surface expressions:

```text
+---------------------------------------+---------------------------------------+
| STOREFRONT EXPRESSION                 | ADMIN OPERATIONAL EXPRESSION          |
+---------------------------------------+---------------------------------------+
| - Generous vertical spacing (48-128px)| - Compact vertical spacing (8-24px)   |
| - Dominant 4:5 & 16:9 media           | - Data-dense tables & audit feeds     |
| - High-contrast editorial hero blocks | - Monochrome utilitarian forms        |
| - Fluid clamp() display typography    | - Strict 13px/14px tabular typography |
| - Emotional hardware storytelling     | - Fast keyboard shortcuts & batch ops |
| - Customer trust & conversion focus   | - Operational audit & payment verify  |
+---------------------------------------+---------------------------------------+
```

### Shared Foundations vs Surface Divergence

| Dimension | Storefront Expression | Admin Operational Expression |
|---|---|---|
| **Color Tokens** | Shared Canonical Palette (`#09090B`, `#E11D48`, `#FAFAFA`) | Shared Palette with heavy emphasis on status colors (`#15803D`, `#B45309`, `#BE123C`) |
| **Typography** | Plus Jakarta Sans (Headings) + Inter (Body) | Inter (UI) + JetBrains Mono (SKUs, IDs, Operations) |
| **Table Density** | Relaxed (48px row height) | Compact (32px row height with border dividers) |
| **Corner Radius** | `radius.md` (8px cards) | `radius.sm` (4px data containers) |
| **Motion** | Editorial reveals, card lifts (`250ms`) | Instant / Micro (`150ms`) for operational speed |

---

## 27. AI Customer Assistant Visual Compatibility

To ensure the future AI Assistant (GP-035) integrates natively into the visual hierarchy without visual friction:

1. **Floating Trigger / Launcher**:
   - Fixed bottom-right placement (`24px` offset desktop, `16px` mobile).
   - `52x52px` circular obsidian container (`#09090B`) with subtle Crimson active ring (`#E11D48`).
   - Clean custom assistant glyph (distinct from third-party vendor chatbots).
2. **Chat Panel Surface**:
   - `380px` width desktop floating panel (Full-screen sheet on mobile).
   - Background: `color.surface.card` (`#FFFFFF`) with `elevation.high` shadow.
   - Header: Obsidian bar with status badge ("Asistente Gamer Perú • En línea").
3. **In-Chat Product Recommendations**:
   - Compact horizontal cards (`280px` width) displaying thumbnail, title, price in Soles, key spec pill, and direct "Ver Producto" link.
4. **Boundary Guard**: No AI logic, streaming SDK, or third-party chatbot styling is implemented in GP-002.

---

## 28. Media & 3D Art Direction

Original product photography and 3D renders are core brand assets that elevate Gamer Perú above commodity marketplaces:

1. **Lighting & Atmosphere**: High-contrast directional edge lighting that catches metallic chamfers, CNC cutouts, and matte polymer textures without excessive glare.
2. **Background Treatment**: Clean studio neutral backgrounds (`#FAFAFA` light or `#09090B` deep dark) with soft, realistic contact shadows.
3. **Angles & Perspectives**:
   - *Hero Angle*: 3/4 perspective elevated at 30 degrees showcasing top shell cutouts and side grip curves.
   - *Orthographic Angles*: Exact top-down, side-profile, and bottom base shots with skates visible.
   - *Exploded Internal Views*: Floating component layers (Shell $\to$ PCB $\to$ Battery $\to$ Sensor $\to$ Base).
4. **Multi-Brand Normalization**: When vendor-provided media varies in style, Gamer Perú card layouts apply consistent padding and neutral background wells to maintain unified catalog quality.
5. **Zero Text in Images**: Never bake marketing slogans, price points, or spec text into static image files. All copy must be crawlable semantic HTML.

---

## 29. SEO-Aware Visual Rules

1. **Semantic Heading Order**: Every visual title is anchored to genuine semantic HTML elements (`<h1>` for page/product title, `<h2>` for major sections, `<h3>` for cards).
2. **Machine-Readable Specifications**: Technical specs, box contents, and dimensions must be styled semantic HTML strings, never pre-rendered graphic text.
3. **Crawlable Navigation Elements**: Category and brand links are true anchor tags (`<a>`), visually styled without breaking search engine link graph traversal.
4. **Desktop/Mobile Content Parity**: Responsive mobile layouts must not hide or remove SEO-critical product descriptions, structured data, or specifications present on desktop.

---

## 30. Performance-Aware Visual Rules

1. **Viewport-Critical Media Hierarchy**:
   - Above-the-fold hero and PDP main images are treated as high-priority LCP targets (preloaded/prioritized, no lazy loading).
   - Below-the-fold Product Story blocks, customer reviews, and grid cards outside initial viewport use deferred/lazy loading.
2. **Pre-allocated Aspect Ratios**: All image and video containers enforce explicit aspect-ratio CSS properties (e.g. `aspect-ratio: 4/5` or `aspect-ratio: 16/9`) to prevent avoidable layout shifts and target near-zero CLS.
3. **Restrained Video & Animation**: Autoplaying background videos must be silent, lightweight, and automatically paused when outside the active viewport.

---

## 31. Mobile Design Rules

1. **Mobile-First Touch Ergonomics**:
   - Minimum `44x44px` interactive touch targets across all buttons, filter checkboxes, swatches, and drawer close targets as an internal usability standard.
   - Horizontal scrolling chip bars for variant selection and filter categories on mobile screens.
2. **Fluid Layout Transitions**:
   - Navigation collapses to an accessible slide-out drawer below `1024px` (`bp.lg`).
   - Multi-column product grids smoothly adjust from 4 columns (`> 1280px`) $\to$ 3 columns (`1024px`) $\to$ 2 columns (`768px`) $\to$ 1-2 columns (`< 480px`).
   - Faceted filter sidebar on desktop converts into a bottom slide-up modal filter drawer on mobile.
3. **No Horizontal Viewport Overflow**: All container widths and media wrappers enforce `max-width: 100%` and `overflow-x: hidden` constraints.

---

## 32. Token Reference Matrix

Implementation-agnostic canonical token reference matrix for future development phases:

```text
====================================================================================================
CATEGORY        TOKEN NAME                      CANONICAL VALUE                 DESCRIPTION
====================================================================================================
Color Brand     color.brand.primary             #E11D48                         Signal Crimson (Primary CTA)
Color Brand     color.brand.hover               #BE123C                         Crimson Hover (Active state)
Color Brand     color.brand.active              #9F1239                         Crimson Pressed
Color Brand     color.brand.subtle_light        #FFF1F2                         Rose 50 (Sale tag light bg)
Color Brand     color.brand.subtle_dark         #4C0519                         Rose 950 (Sale tag dark bg)
Color Brand     color.brand.text_on_accent      #FFFFFF                         White on Crimson (4.7:1)

Color Surface   color.surface.canvas            #FAFAFA                         Light page background
Color Surface   color.surface.card              #FFFFFF                         Pure white card surface
Color Surface   color.surface.elevated          #FFFFFF                         Elevated dropdown surface
Color Surface   color.surface.secondary         #F4F4F5                         Secondary well / toolbar
Color Surface   color.surface.tertiary          #E4E4E7                         Section divider background
Color Surface   color.surface.overlay           rgba(9,9,11,0.65)               Modal/drawer backdrop
Color Surface   color.surface.dark_canvas       #09090B                         Obsidian dark hero canvas
Color Surface   color.surface.dark_card         #121215                         Elevated dark card surface
Color Surface   color.surface.dark_secondary    #18181B                         Dark secondary well
Color Surface   color.surface.dark_tertiary     #27272A                         Dark control well

Color Text      color.text.primary              #09090B                         Primary text on light (19.1:1)
Color Text      color.text.secondary            #52525B                         Secondary text on light (7.4:1)
Color Text      color.text.muted                #71717A                         Spec/placeholder text (4.6:1)
Color Text      color.text.disabled             #A1A1AA                         Disabled control text
Color Text      color.text.link                 #E11D48                         Link on light canvas (4.5:1)
Color Text      color.text.dark_primary         #F4F4F5                         Primary text on dark (18.1:1)
Color Text      color.text.dark_secondary       #A1A1AA                         Secondary text on dark (7.8:1)
Color Text      color.text.dark_muted           #9CA3AF                         Dark muted text (7.8:1 / 5.9:1)
Color Text      color.text.dark_link            #FB7185                         Link on dark canvas (7.4:1)

Color Border    color.border.subtle             #E4E4E7 / #27272A               Decorative card divider
Color Border    color.border.default            #D4D4D8 / #3F3F46               Standard container border
Color Border    color.border.control            #71717A                         Accessible input border (4.6:1)
Color Border    color.border.dark_control       #8E8E93                         Dark input border (6.1:1)
Color Border    color.border.strong             #52525B / #A1A1AA               Active border / swatch ring
Color Border    color.border.focus              #09090B / #F4F4F5               Keyboard focus outline (18:1+)

Color Status    color.status.success            #15803D (Bg: #F0FDF4)           Success state (4.8:1)
Color Status    color.status.warning            #B45309 (Bg: #FFFBEB)           Warning state (4.8:1)
Color Status    color.status.danger             #BE123C (Bg: #FFF1F2)           Error / danger state (5.7:1)
Color Status    color.status.info               #0369A1 (Bg: #F0F9FF)           Informational note (5.6:1)

Typography      type.display                    Plus Jakarta Sans 800           clamp(2.75rem, 6vw, 4.5rem) / 1.05
Typography      type.h1                         Plus Jakarta Sans 700           clamp(2.0rem, 4vw, 2.75rem) / 1.15
Typography      type.h2                         Plus Jakarta Sans 700           clamp(1.5rem, 3vw, 2.0rem) / 1.20
Typography      type.h3                         Plus Jakarta Sans 600           clamp(1.125rem, 2vw, 1.375rem) / 1.30
Typography      type.h4                         Plus Jakarta Sans 600           1.0rem (16px) / 1.35
Typography      type.card.title                 Plus Jakarta Sans 600           1.0rem (16px) / 1.30 / -0.01em
Typography      type.card.price                 Plus Jakarta Sans 700           1.125rem (18px) / 1.20 / -0.02em
Typography      type.body.large                 Inter 400                       1.125rem (18px) / 1.60
Typography      type.body.default               Inter 400 / 500                 0.9375rem (15px) / 1.50
Typography      type.body.small                 Inter 400 / 500                 0.8125rem (13px) / 1.45
Typography      type.caption                    Inter 500                       0.6875rem (11px) / 1.30 / +0.02em
Typography      type.button                     Plus Jakarta Sans 600           0.875rem (14px) / 1.0
Typography      type.stat.giant                 Plus Jakarta Sans 800           clamp(3.5rem, 8vw, 6.0rem) / 0.95
Typography      type.code.mono                  JetBrains Mono 400/500          0.8125rem (13px) / 1.40

Spacing         space.0                         0px                             Reset
Spacing         space.1                         4px (0.25rem)                   Micro gap
Spacing         space.2                         8px (0.5rem)                    Tight gap
Spacing         space.3                         12px (0.75rem)                  Control padding
Spacing         space.4                         16px (1.0rem)                   Standard component padding
Spacing         space.5                         20px (1.25rem)                  Tablet card gap
Spacing         space.6                         24px (1.5rem)                   Card inner padding / gutters
Spacing         space.8                         32px (2.0rem)                   Large card padding
Spacing         space.10                        40px (2.5rem)                   Sub-section spacing
Spacing         space.12                        48px (3.0rem)                   Section vertical padding
Spacing         space.16                        64px (4.0rem)                   Major section gap
Spacing         space.20                        80px (5.0rem)                   Editorial section gap
Spacing         space.24                        96px (6.0rem)                   Product Story transition gap
Spacing         space.32                        128px (8.0rem)                  Hero showcase gap

Containers      container.default               1440px max-width                Standard catalog/PDP container
Containers      container.prose                 840px max-width                 Forms / checkout / prose
Containers      container.full                  1920px max-width                Hero storytelling banner
Containers      container.admin                 1600px max-width                Admin fluid data container

Breakpoints     bp.xs                           < 480px (Ref: 360px)            Compact Mobile threshold
Breakpoints     bp.sm                           480px                           Standard Mobile threshold
Breakpoints     bp.md                           768px                           Tablet Portrait threshold
Breakpoints     bp.lg                           1024px                          Desktop / Laptop threshold
Breakpoints     bp.xl                           1280px                          Standard Desktop threshold
Breakpoints     bp.2xl                          1536px                          Wide Desktop threshold

Radius          radius.none                     0px                             Square container
Radius          radius.xs                       2px                             Micro pills / spec tags
Radius          radius.sm                       4px                             Buttons / input controls
Radius          radius.md                       8px                             Product cards / toasts
Radius          radius.lg                       12px                            Modals / slide-out drawers
Radius          radius.full                     9999px                          Circular swatches / avatars

Border Width    border.width.thin               1px                             Standard input/card border
Border Width    border.width.medium             2px                             Active ring / focus outline
Border Width    border.width.thick              3px                             Heavy badge border

Elevation       elevation.none                  none                            Flat surface
Elevation       elevation.low                   0 1px 3px 0 rgba(9,9,11,0.04)   Resting product card
Elevation       elevation.mid                   0 4px 6px -1px rgba(9,9,11,0.08)Hover card / popover
Elevation       elevation.high                  0 20px 25px -5px rgba(9,9,11,0.14)Drawer / modal overlay

Iconography     icon.size.sm                    16x16px                         Table status / spec pill
Iconography     icon.size.md                    20x20px                         Button leading / caret
Iconography     icon.size.lg                    24x24px                         Header navigation icon
Iconography     icon.size.xl                    32x32px                         Story feature highlight
Iconography     icon.stroke.default             1.5px                           Standard stroke weight
Iconography     icon.stroke.sm                  1.25px                          Micro icon stroke weight

Motion          motion.duration.instant         0ms                             Reduced motion
Motion          motion.duration.fast            150ms                           Hover states & micro fades
Motion          motion.duration.normal          250ms                           Card hover lift / accordions
Motion          motion.duration.moderate        350ms                           Drawer & modal entrances
Motion          motion.duration.slow            500ms                           Hero banner crossfades
Motion          motion.easing.snappy            cubic-bezier(0.16,1,0.3,1)      Energetic deceleration
Motion          motion.easing.standard          cubic-bezier(0.4,0,0.2,1)       General in-out transition
Motion          motion.easing.linear            linear                          Continuous progress/spin
====================================================================================================
```

---

## 33. Design Decision Boundaries & TBD Policies

1. **Design Tokens Owned by GP-002**: Colors, Typography pairings, Spacing scale, Radius scale, Elevation shadows, Grid breakpoints, and Motion tokens.
2. **Decisions Deferred to GP-003**: Technology framework selection (Vite, Next.js, etc.), CSS implementation tooling (Tailwind vs Vanilla CSS), Image pipeline infrastructure, Component library packaging.
3. **Decisions Deferred to GP-004**: Product domain entity schemas, category attribute models, variant data models.
4. **Commercial Decisions (TBD Business Policy)**:
   - Courier provider integration (`[TBD BUSINESS DECISION]`).
   - Warranty policy duration and RMA terms (`[TBD BUSINESS DECISION]`).
   - Customer support communication channels (`[TBD BUSINESS DECISION]`).
   - Stock and warehouse display details (`[TBD BUSINESS DECISION]`).

---

## 34. Inputs for GP-003 and GP-008

This document directly feeds into the upcoming engineering tasks:
- **GP-003 (System Architecture & Technology Selection)**: Informs CSS architecture requirements, font asset loading strategy, fluid clamp tooling, and image rendering pipelines.
- **GP-008 (Design Tokens & Base UI Component Library)**: Provides exact token values, component anatomies, states, and responsive rules for code implementation.

---

## 35. GP-002 Definition of Done

* [x] Original Gamer Perú visual identity defined ("Machinery Obsidian & Signal Crimson").
* [x] Alternative aesthetic directions evaluated and documented with rejection rationales.
* [x] Complete semantic color system defined with exact hex tokens and dedicated accessible control borders.
* [x] Typographic hierarchy and fluid scaling defined (`Plus Jakarta Sans` + `Inter` + `JetBrains Mono`).
* [x] Base-4/base-8 spacing scale and responsive layout grid defined.
* [x] Radius, border width, and elevation shadow tokens defined.
* [x] Canonical motion tokens and interaction guidelines established (without ambient stock pulses, with reduced-motion support).
* [x] Visual anatomies defined for Core Components, Navigation, Drawers/Modals, Product Cards, Category/Brand Pages, PDP, Product Story blocks (all 13 blocks), Cart/Checkout, and Customer Accounts.
* [x] Dual-surface expressions specified for Storefront and Admin interfaces.
* [x] AI Customer Assistant future visual compatibility rules established.
* [x] WCAG 2.1 AA color contrast validation executed and 100% passed across all canonical pairs.
* [x] SEO-aware and performance-aware visual rules preserved.
* [x] Canonical Yape/Plin v1 payment model respected without unapproved business commitments or warehouse location claims.
* [x] Complete Token Reference Matrix documented with unambiguous breakpoint semantics.
* [x] Zero application UI or production source code implemented.
