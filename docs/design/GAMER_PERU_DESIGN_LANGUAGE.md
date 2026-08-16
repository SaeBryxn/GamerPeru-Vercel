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

### Selected Canonical Concept: "Machinery Obsidian & Signal Crimson"
- **Canvas & Surface Palette**: Deep precision obsidian (`#09090B`) paired with clinical crisp canvas (`#FAFAFA`), structured by slate-tinted zinc neutrals (`#18181B`, `#27272A`, `#E4E4E7`, `#FFFFFF`).
- **Brand Accent**: **Signal Crimson** (`#E11D48` / `#BE123C`), a laser-precise, saturated crimson inspired by optical sensor beams, anodized aluminum switches, and a subtle nod to Peruvian national identity without literal flag motifs.
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
| `color.text.muted` | `#71717A` | Placeholder text, breadcrumb links, and inactive icons on light surfaces |
| `color.text.disabled` | `#A1A1AA` | Disabled button and input labels |
| `color.text.link` | `#E11D48` | Inline text hyperlinks on light surfaces |
| `color.text.dark_primary` | `#F4F4F5` | Primary text and headlines on dark/inverted surfaces |
| `color.text.dark_secondary`| `#A1A1AA` | Secondary body text and spec descriptions on dark surfaces |
| `color.text.dark_muted` | `#71717A` | Captions, footprints, and inactive icons on dark surfaces |
| `color.text.dark_link` | `#FB7185` | Inline hyperlinks on dark surfaces |

### 6.5 Border & Divider Tokens

| Token Name | Canonical Value | Usage |
|---|---|---|
| `color.border.subtle` | `#E4E4E7` (Dark: `#27272A`) | Subtle card outlines, row dividers, tab borders |
| `color.border.default` | `#D4D4D8` (Dark: `#3F3F46`) | Standard input borders, card boundaries, table headers |
| `color.border.strong` | `#A1A1AA` (Dark: `#52525B`) | Active borders, selected swatch rings, focused controls |
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
=============================================================================
DISPLAY / HERO    Plus Jakarta Sans 800 | 48px -> 72px | Line-Height: 1.05
H1 / PAGE TITLE   Plus Jakarta Sans 700 | 32px -> 44px | Line-Height: 1.15
H2 / SECTION      Plus Jakarta Sans 700 | 24px -> 32px | Line-Height: 1.20
H3 / CARD TITLE   Plus Jakarta Sans 600 | 18px -> 22px | Line-Height: 1.30
BODY LARGE        Inter 400             | 18px         | Line-Height: 1.60
BODY DEFAULT      Inter 400             | 15px (0.9375rem) | Line-Height: 1.50
BODY SMALL        Inter 400             | 13px (0.8125rem) | Line-Height: 1.45
CAPTION / SPEC    Inter 500 / Plus J. 600| 11px - 12px  | Line-Height: 1.30
NUMERIC STAT HERO Plus Jakarta Sans 800 | 56px -> 96px | Line-Height: 0.95
=============================================================================
```

| Typographic Level | Font Family | Weight | Size (Mobile $\to$ Desktop) | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| `type.display` | Plus Jakarta Sans | 800 | `clamp(2.75rem, 6vw, 4.5rem)` | `1.05` | `-0.035em` |
| `type.h1` | Plus Jakarta Sans | 700 | `clamp(2.0rem, 4vw, 2.75rem)` | `1.15` | `-0.03em` |
| `type.h2` | Plus Jakarta Sans | 700 | `clamp(1.5rem, 3vw, 2.0rem)` | `1.20` | `-0.025em` |
| `type.h3` | Plus Jakarta Sans | 600 | `clamp(1.125rem, 2vw, 1.375rem)`| `1.30` | `-0.02em` |
| `type.h4` | Plus Jakarta Sans | 600 | `1.0rem` (16px) | `1.35` | `-0.01em` |
| `type.body.large` | Inter | 400 | `1.125rem` (18px) | `1.60` | `0.0em` |
| `type.body.default`| Inter | 400 / 500 | `0.9375rem` (15px) | `1.50` | `0.0em` |
| `type.body.small` | Inter | 400 / 500 | `0.8125rem` (13px) | `1.45` | `0.0em` |
| `type.caption` | Inter | 500 | `0.6875rem` (11px) | `1.30` | `+0.02em` (Uppercase) |
| `type.button` | Plus Jakarta Sans | 600 | `0.875rem` (14px) | `1.0` | `+0.01em` |
| `type.stat.giant` | Plus Jakarta Sans | 800 | `clamp(3.5rem, 8vw, 6.0rem)` | `0.95` | `-0.04em` |
| `type.code.mono` | JetBrains Mono | 400 / 500 | `0.8125rem` (13px) | `1.40` | `0.0em` |

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

### 9.2 Responsive Gutters & Breakpoints

| Breakpoint Name | Token Name | Viewport Range | Page Gutter | Max Grid Columns |
|---|---|---|---|---|
| **Compact Mobile** | `bp.xs` | `< 480px` | `16px` | 1 col (Cards: 1-2 cols) |
| **Standard Mobile**| `bp.sm` | `480px - 767px` | `16px` - `20px`| 2 cols |
| **Tablet Portrait**| `bp.md` | `768px - 1023px` | `24px` | 3 cols (Listing: 2-3 cols) |
| **Laptop / Desktop**| `bp.lg` | `1024px - 1279px`| `32px` | 4 cols (Listing: 3 cols) |
| **Standard Desktop**| `bp.xl` | `1280px - 1535px`| `48px` | 4 cols (Listing: 4 cols) |
| **Wide Desktop** | `bp.2xl` | `1536px+` | `64px` | 4-5 cols (Max 1440px box) |

---

## 10. Radius, Border & Elevation System

### 10.1 Corner Radius Tokens

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

### 10.2 Border Width Tokens
- `border.width.thin`: `1px` (Standard card borders, input borders, divider lines)
- `border.width.medium`: `2px` (Selected swatch rings, active focus rings, tab indicators)
- `border.width.thick`: `3px` (Heavy highlight badges)

### 10.3 Elevation & Shadow Tokens
- `elevation.none`: `none`
- `elevation.low`: `0 1px 3px 0 rgba(9, 9, 11, 0.04), 0 1px 2px -1px rgba(9, 9, 11, 0.04)` (Product cards resting on canvas)
- `elevation.mid`: `0 4px 6px -1px rgba(9, 9, 11, 0.08), 0 2px 4px -2px rgba(9, 9, 11, 0.06)` (Product card on hover, search dropdowns)
- `elevation.high`: `0 20px 25px -5px rgba(9, 9, 11, 0.14), 0 8px 10px -6px rgba(9, 9, 11, 0.08)` (Slide-out drawers, modal overlays)

---

## 11. Iconography Language

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

## 12. Motion System

Gamer Perú's motion philosophy is **tactile, snappy, and non-blocking**. Animations serve exclusively to confirm physical hardware interactions, convey visual hierarchy, and enhance perceived performance.

### 12.1 Canonical Motion Tokens

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

### 12.2 Specific Interaction Behaviors
- **Product Card Hover**: Subtle 3px vertical lift (`translateY(-3px)`) with smooth shadow transition (`elevation.low` $\to$ `elevation.mid`) over `250ms` using `motion.easing.snappy`. Secondary product view smoothly cross-fades via opacity.
- **Drawer Slide-in**: Slides horizontally from right viewport edge (`translateX(100%)` $\to$ `0`) over `350ms` with synchronized opacity backdrop fade (`0` $\to$ `1`).
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

## 13. Core Component Visual Language

### 13.1 Buttons
- **Primary Button**:
  - Background: `color.brand.primary` (`#E11D48`)
  - Text: `color.brand.text_on_accent` (`#FFFFFF`), `type.button` (Plus Jakarta Sans 600)
  - Height: `44px` (Desktop) / `48px` (Mobile touch target)
  - Padding: `0 24px`, Radius: `radius.sm` (`4px`)
  - Hover: Background `color.brand.hover` (`#BE123C`), `translateY(-1px)`
  - Active: Background `color.brand.active` (`#9F1239`), `translateY(0)`
  - Focus: 2px outline `color.border.focus` with 2px offset
  - Disabled: Background `color.surface.tertiary`, Text `color.text.disabled`, cursor `not-allowed`
- **Secondary Button**:
  - Background: `color.surface.card` (`#FFFFFF`), Border: 1px `color.border.default`
  - Text: `color.text.primary` (`#09090B`), Hover: Background `color.surface.secondary`
- **Ghost / Tertiary Button**:
  - Background: Transparent, Text: `color.text.primary`, Hover: Background `color.surface.secondary`
- **Destructive Button**:
  - Background: `color.status.danger`, Text: `#FFFFFF`

### 13.2 Inputs & Forms
- Height: `40px` (Admin / Desktop) / `44px` (Mobile)
- Background: `color.surface.card`, Border: 1px `color.border.default`, Radius: `radius.sm`
- Typography: `type.body.default` (`15px`), Text: `color.text.primary`
- Placeholder: `color.text.muted` (`#71717A`)
- Hover: Border `color.border.strong`
- Focus: Border `color.border.focus` (1px solid `#09090B`), 2px subtle ring
- Error State: Border `color.status.danger` (`#BE123C`), inline error caption in `color.status.danger`

### 13.3 Badges, Pills & Status Indicators
- **Spec Pill (Technical Metric)**:
  - Background: `color.surface.secondary` (`#F4F4F5`) (Dark: `#18181B`)
  - Text: `color.text.secondary` (`#52525B`) (Dark: `#A1A1AA`), Typography: Plus Jakarta Sans 600, `11px`
  - Padding: `2px 8px`, Radius: `radius.xs` (`2px`), Border: 1px `color.border.subtle`
- **Stock Badge**:
  - In Stock: Text `#15803D`, Background `#F0FDF4`, Border `#BBF7D0` (with 6px pulsing green dot)
  - Low Stock: Text `#B45309`, Background `#FFFBEB`, Border `#FDE68A`
  - Pre-order: Text `#0369A1`, Background `#F0F9FF`, Border `#BAE6FD`
- **Sale / Discount Tag**:
  - Background: `color.brand.primary` (`#E11D48`), Text: `#FFFFFF`, Typography: Plus Jakarta Sans 700, `11px`

---

## 14. Product Card Language

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
4. **Product Title**: `type.h3` (Plus Jakarta Sans 600, 16px), 2-line clamp with overflow protection.
5. **Category Spec Pills**: 2 to 3 category-specific pills rendered dynamically:
   - Mice: Weight (`39g`), Sensor (`PAW3950`), Polling (`8K`).
   - Keyboards: Switch (`Magnetic HE`), Layout (`75%`), Feature (`Rapid Trigger`).
   - Mousepads: Surface (`Glass/Cloth`), Dimensions (`490x420mm`), Base (`PORON`).
6. **Pricing Block**: Current price in `type.h3` (Plus Jakarta Sans 700, Crimson or Primary), Compare-at price in `type.body.small` strikethrough (`color.text.muted`).
7. **Colorway Swatches**: 14px circular color dots with 2px white gap and subtle hover ring.
8. **Wishlist Icon**: Top right corner overlay, 32x32px circular hit target, accessible via keyboard focus.

---

## 15. Product Detail Page (PDP) Language

### 15.1 Desktop PDP Composition
- **Left Column (58% width)**: Sticky interactive media gallery:
  - Main hero stage with fluid zoom capability.
  - Horizontal thumbnail row with active crimson bottom bar.
  - Visual badges for bundled items (e.g., 8K Dongle included, Extra Glass Skates).
- **Right Column (42% width)**: Purchase & Configuration panel:
  - Brand header with link to brand landing page.
  - Full product model title in `type.h1` (32px).
  - Price cluster with clear Soles formatting (`S/`).
  - Interactive variant selectors (Color chips with color names, Switch type buttons).
  - Real-time stock status block with warehouse location transparency.
  - Configurable shipping/delivery estimator slot (`[TBD BUSINESS DECISION: Courier TBD]`).
  - Primary high-impact **Añadir al Carrito** button + Wishlist button.
  - Canonical v1 Payment Trust Box: Yape & Plin manual verification badge.
  - Configurable warranty & support trust slot (`[TBD BUSINESS DECISION: Warranty policy TBD]`).

### 15.2 Mobile PDP Composition
- Swipeable 1:1 / 4:5 aspect ratio gallery with numerical counter pill (`1/7`).
- Purchase panel stacked immediately below hero gallery.
- Sticky bottom purchase bar triggered once user scrolls past main Add to Cart button: displays mini thumbnail, price, and instant "Añadir al Carrito" button.

---

## 16. Modular Product Story System

The below-the-fold PDP experience uses 11 standardized editorial story blocks:

```text
[ HERO MEDIA ]         -> Cinematic atmospheric banner
[ FULL BLEED IMAGE ]   -> Macro metallic texture / chassis cutouts
[ IMAGE + TEXT ]       -> 50/50 split detailing engineering benefits
[ STAT HIGHLIGHT ]     -> 3-column giant numeric specs (39g | 8K Hz | 30K DPI)
[ SPEC FEATURE ]       -> Deep dive on dongle LCD screen or Rapid Trigger switch
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
| **`Comparison`** | Visual matrix vs benchmark models | Light Canvas | Tabular Data |
| **`Dimensions`** | Orthographic blueprint drawings | Dark/Light Canvas| 70% Blueprint / 30% Text |
| **`BoxContents`** | Visual inventory of packaged items | Light Canvas | 60% Image Grid / 40% Text |
| **`TechnicalSpecs`**| Exhaustive technical spec table | Neutral Surface | 100% Tabular Text |
| **`FAQ`** | Expandable support accordions | Light Canvas | 100% Text |
| **`RelatedProducts`**| Catalog carousel of accessories | Light Canvas | Card Grid |

---

## 17. Storefront vs Admin Expressions

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

## 18. AI Customer Assistant Visual Compatibility

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

## 19. Media & 3D Art Direction

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

## 20. Responsive Behavior Rules

1. **Mobile-First Touch Ergonomics**:
   - Minimum `44x44px` interactive touch targets across all buttons, filter checkboxes, swatches, and drawer close targets.
   - Horizontal scrolling chip bars for variant selection and filter categories on mobile screens.
2. **Fluid Layout Transitions**:
   - Navigation collapses to an accessible slide-out drawer below `1024px` (`bp.lg`).
   - Multi-column product grids smoothly adjust from 4 columns (`> 1280px`) $\to$ 3 columns (`1024px`) $\to$ 2 columns (`768px`) $\to$ 1-2 columns (`< 480px`).
   - Faceted filter sidebar on desktop converts into a bottom slide-up modal filter drawer on mobile.
3. **No Horizontal Viewport Overflow**: All container widths and media wrappers enforce `max-width: 100%` and `overflow-x: hidden` constraints.

---

## 21. Accessibility (a11y) Design Validations

### 21.1 WCAG 2.1 AA Contrast Ratio Verification

| Foreground Token | Background Token | Ratio | Standard Required | Status |
|---|---|---|---|---|
| `color.text.primary` (`#09090B`) | `color.surface.canvas` (`#FAFAFA`) | **19.06:1** | $\ge 4.5:1$ (Normal text) | **PASS** |
| `color.text.secondary` (`#52525B`) | `color.surface.canvas` (`#FAFAFA`) | **7.41:1** | $\ge 4.5:1$ (Normal text) | **PASS** |
| `color.text.muted` (`#71717A`) | `color.surface.canvas` (`#FAFAFA`) | **4.63:1** | $\ge 3.0:1$ (Large / Spec) | **PASS** |
| `color.brand.primary` (`#E11D48`) | `color.surface.canvas` (`#FAFAFA`) | **4.50:1** | $\ge 3.0:1$ (UI / Large text)| **PASS** |
| `color.brand.hover` (`#BE123C`) | `color.surface.canvas` (`#FAFAFA`) | **6.02:1** | $\ge 4.5:1$ (Body text) | **PASS** |
| `color.brand.text_on_accent` (`#FFFFFF`) | `color.brand.primary` (`#E11D48`) | **4.70:1** | $\ge 4.5:1$ (Button text) | **PASS** |
| `color.brand.text_on_accent` (`#FFFFFF`) | `color.brand.hover` (`#BE123C`) | **6.29:1** | $\ge 4.5:1$ (Hover button) | **PASS** |
| `color.text.dark_primary` (`#F4F4F5`) | `color.surface.dark_canvas` (`#09090B`)| **18.10:1** | $\ge 4.5:1$ (Dark text) | **PASS** |
| `color.text.dark_secondary` (`#A1A1AA`) | `color.surface.dark_canvas` (`#09090B`)| **7.76:1** | $\ge 4.5:1$ (Dark text) | **PASS** |
| `color.text.dark_link` (`#FB7185`) | `color.surface.dark_canvas` (`#09090B`)| **7.39:1** | $\ge 4.5:1$ (Dark link) | **PASS** |
| `color.status.success` (`#15803D`) | `#F0FDF4` (Success Bg) | **4.79:1** | $\ge 4.5:1$ (Status text) | **PASS** |
| `color.status.warning` (`#B45309`) | `#FFFBEB` (Warning Bg) | **4.84:1** | $\ge 4.5:1$ (Status text) | **PASS** |
| `color.status.danger` (`#BE123C`) | `#FFF1F2` (Danger Bg) | **5.72:1** | $\ge 4.5:1$ (Status text) | **PASS** |
| `color.status.info` (`#0369A1`) | `#F0F9FF` (Info Bg) | **5.57:1** | $\ge 4.5:1$ (Status text) | **PASS** |

### 21.2 Focus & Interaction Accessibility
1. **Focus Ring Visibility**: Interactive elements display a dedicated 2px high-contrast outline (`#09090B` on light canvas, `#F4F4F5` on dark canvas) with a 2px offset on keyboard navigation (`:focus-visible`).
2. **Color-Independent Status**: Badges, stock indicators, and error fields always pair color with text labels or distinct geometric icons (never relying on color alone).

---

## 22. SEO-Aware Visual Rules

1. **Semantic Heading Order**: Every visual title is anchored to genuine semantic HTML elements (`<h1>` for page/product title, `<h2>` for major sections, `<h3>` for cards).
2. **Machine-Readable Specifications**: Technical specs, box contents, and dimensions must be styled semantic HTML strings, never pre-rendered graphic text.
3. **Crawlable Navigation Elements**: Category and brand links are true anchor tags (`<a>`), visually styled without breaking search engine link graph traversal.
4. **Desktop/Mobile Content Parity**: Responsive mobile layouts must not hide or remove SEO-critical product descriptions, structured data, or specifications present on desktop.

---

## 23. Performance-Aware Visual Rules

1. **Viewport-Critical Media Hierarchy**:
   - Above-the-fold hero and PDP main images are treated as high-priority LCP targets (preloaded, no lazy loading).
   - Below-the-fold Product Story blocks, customer reviews, and grid cards outside initial viewport use deferred/lazy loading.
2. **Pre-allocated Aspect Ratios**: All image and video containers enforce explicit aspect-ratio CSS properties (e.g. `aspect-ratio: 4/5` or `aspect-ratio: 16/9`) to guarantee zero Cumulative Layout Shift (CLS = 0).
3. **Restrained Video & Animation**: Autoplaying background videos must be silent, lightweight, and automatically paused when outside the active viewport.

---

## 24. Business-Policy Boundary

To prevent scope creep and maintain architectural boundaries:

1. **Payment Methods in v1**:
   - The design system visually accommodates **Yape** and **Plin** manual verification flows:
     * `Payment Instructions` (Display QR code + instructions).
     * `Payment Submitted` (Customer inputs operation code / optional screenshot).
     * `Payment Verification` (Order placed in verification state; explicitly warns customer that submission does NOT equal confirmed payment).
     * `Confirmed Payment` (Updated only after human Admin confirmation).
   - *Gateways / Cards*: Any future payment gateways or card fields are labeled `[FUTURE / NOT PART OF V1 / PROVIDER TBD]`.
2. **Configurable Logistics & Trust Slots**:
   - Couriers, shipping rates, and delivery SLAs are rendered via dynamic placeholders configured from business policies (`[TBD BUSINESS DECISION]`).
   - Warranty terms and customer support channels are rendered via dynamic CMS slots (`[TBD BUSINESS DECISION]`).

---

## 25. Originality & Non-Infringement Boundary

Gamer Perú enforces complete intellectual property separation from WLMOUSE and third-party brands:
- Original color token values (Machinery Obsidian `#09090B`, Signal Crimson `#E11D48`, Canvas `#FAFAFA`).
- Original typography pairing (`Plus Jakarta Sans` + `Inter`).
- Original component anatomy, card layout ratios, and button geometries.
- Zero proprietary WLMOUSE copy, slogans, icons, 3D models, or theme code.

---

## 26. Token Reference Matrix

Implementation-agnostic token reference matrix for future development phases:

```text
========================================================================================
CATEGORY        TOKEN NAME                      CANONICAL VALUE         DESCRIPTION
========================================================================================
Color Brand     color.brand.primary             #E11D48                 Signal Crimson (Primary CTA)
Color Brand     color.brand.hover               #BE123C                 Crimson Hover (Active state)
Color Brand     color.brand.active              #9F1239                 Crimson Pressed
Color Brand     color.brand.subtle_light        #FFF1F2                 Rose 50 (Sale tag light bg)
Color Brand     color.brand.subtle_dark         #4C0519                 Rose 950 (Sale tag dark bg)
Color Brand     color.brand.text_on_accent      #FFFFFF                 White on Crimson (4.7:1)

Color Surface   color.surface.canvas            #FAFAFA                 Light page background
Color Surface   color.surface.card              #FFFFFF                 Pure white card surface
Color Surface   color.surface.secondary         #F4F4F5                 Secondary well / bar
Color Surface   color.surface.tertiary          #E4E4E7                 Section divider background
Color Surface   color.surface.overlay           rgba(9,9,11,0.65)       Modal/drawer backdrop
Color Surface   color.surface.dark_canvas       #09090B                 Obsidian dark hero canvas
Color Surface   color.surface.dark_card         #121215                 Elevated dark card surface
Color Surface   color.surface.dark_secondary    #18181B                 Dark secondary well

Color Text      color.text.primary              #09090B                 Primary text on light (19:1)
Color Text      color.text.secondary            #52525B                 Secondary text on light (7.4:1)
Color Text      color.text.muted                #71717A                 Placeholder text on light (4.6:1)
Color Text      color.text.disabled             #A1A1AA                 Disabled control text
Color Text      color.text.link                 #E11D48                 Link on light canvas
Color Text      color.text.dark_primary         #F4F4F5                 Primary text on dark (18:1)
Color Text      color.text.dark_secondary       #A1A1AA                 Secondary text on dark (7.7:1)
Color Text      color.text.dark_link            #FB7185                 Link on dark canvas

Color Border    color.border.subtle             #E4E4E7 / #27272A       Subtle divider / border
Color Border    color.border.default            #D4D4D8 / #3F3F46       Standard input / card border
Color Border    color.border.strong             #A1A1AA / #52525B       Active border / focus ring
Color Border    color.border.focus              #09090B / #F4F4F5       Focus indicator outline

Color Status    color.status.success            #15803D (Bg: #F0FDF4)   Success state
Color Status    color.status.warning            #B45309 (Bg: #FFFBEB)   Warning state
Color Status    color.status.danger             #BE123C (Bg: #FFF1F2)   Error / danger state
Color Status    color.status.info               #0369A1 (Bg: #F0F9FF)   Informational note

Typography      type.font.heading               Plus Jakarta Sans       Display and headings
Typography      type.font.body                  Inter                   Body, UI controls, Admin
Typography      type.font.mono                  JetBrains Mono          SKUs, Ops codes, Registers

Spacing         space.1                         4px (0.25rem)           Micro gap
Spacing         space.2                         8px (0.5rem)            Tight gap
Spacing         space.3                         12px (0.75rem)          Control padding
Spacing         space.4                         16px (1.0rem)           Standard component padding
Spacing         space.6                         24px (1.5rem)           Card inner padding / gutters
Spacing         space.8                         32px (2.0rem)           Large card padding
Spacing         space.12                        48px (3.0rem)           Section vertical padding
Spacing         space.16                        64px (4.0rem)           Major section gap
Spacing         space.24                        96px (6.0rem)           Product Story section gap

Radius          radius.xs                       2px                     Micro pills / spec tags
Radius          radius.sm                       4px                     Buttons / input controls
Radius          radius.md                       8px                     Product cards / toasts
Radius          radius.lg                       12px                    Modals / slide-out drawers
Radius          radius.full                     9999px                  Circular swatches / avatars

Motion          motion.duration.fast            150ms                   Hover states & fades
Motion          motion.duration.normal          250ms                   Card hover lift / accordions
Motion          motion.duration.moderate        350ms                   Drawer & modal entrances
Motion          motion.easing.snappy            cubic-bezier(0.16,1,0.3,1) Energetic deceleration
========================================================================================
```

---

## 27. Design Decision Boundaries & TBD Policies

1. **Design Tokens Owned by GP-002**: Colors, Typography pairings, Spacing scale, Radius scale, Elevation shadows, Grid breakpoints, and Motion tokens.
2. **Decisions Deferred to GP-003**: Technology framework selection (Vite, Next.js, etc.), CSS implementation tooling (Tailwind vs Vanilla CSS), Image pipeline infrastructure, Component library packaging.
3. **Decisions Deferred to GP-004**: Product domain entity schemas, category attribute models, variant data models.
4. **Commercial Decisions (TBD Business Policy)**:
   - Courier provider integration (`[TBD BUSINESS DECISION]`).
   - Warranty policy duration and RMA terms (`[TBD BUSINESS DECISION]`).
   - Customer support communication channels (`[TBD BUSINESS DECISION]`).

---

## 28. Inputs for GP-003 and GP-008

This document directly feeds into the upcoming engineering tasks:
- **GP-003 (System Architecture & Technology Selection)**: Informs CSS architecture requirements, font asset loading strategy, fluid clamp tooling, and image rendering pipelines.
- **GP-008 (Design Tokens & Base UI Component Library)**: Provides exact token values, component anatomies, states, and responsive rules for code implementation.

---

## 29. GP-002 Definition of Done

* [x] Original Gamer Perú visual identity defined ("Machinery Obsidian & Signal Crimson").
* [x] Alternative aesthetic directions evaluated and documented with rejection rationales.
* [x] Complete semantic color system defined with exact hex tokens.
* [x] Typographic hierarchy and fluid scaling defined (`Plus Jakarta Sans` + `Inter` + `JetBrains Mono`).
* [x] Base-4/base-8 spacing scale and responsive layout grid defined.
* [x] Radius, border width, and elevation shadow tokens defined.
* [x] Canonical motion tokens and interaction guidelines established (with reduced-motion support).
* [x] Visual anatomies defined for Core Components, Product Cards, PDP, and Product Story blocks.
* [x] Dual-surface expressions specified for Storefront and Admin interfaces.
* [x] AI Customer Assistant future visual compatibility rules established.
* [x] WCAG 2.1 AA color contrast validation executed and 100% passed.
* [x] SEO-aware and performance-aware visual rules preserved.
* [x] Canonical Yape/Plin v1 payment model respected without unapproved business commitments.
* [x] Zero application UI or production source code implemented.
