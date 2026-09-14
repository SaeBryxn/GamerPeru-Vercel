# STATUS: SUPERSEDED / HISTORICAL ONLY / NOT IMPLEMENTATION AUTHORITY

> This contract was previously externally approved and frozen. It was subsequently
> superseded by an explicit project-owner decision on 2026-09-14 and must not be used to
> authorize or guide future storefront implementation. The WLMOUSE high-fidelity convergence
> mandate is cancelled. The historical text below is retained for auditability only. No agent
> may execute CHK1 through CHK6 from this contract unless the owner explicitly reauthorizes
> GP-026A in a future reviewed decision.

# GP-026A Contract --- WLMOUSE Storefront Visual Convergence

## 1. Status

IN DISCOVERY / CONTRACT CANDIDATE / PENDING EXTERNAL APPROVAL

## 2. Canonical Baseline

- **Repository**: `latamcreativa/GamerPeru`
- **Baseline Commit (origin/main)**: `03598514ffced3ee854bc5a7a715362683383100` (`docs(roadmap): close GP-025 with external approval [skip ci]`)
- **Original CHK0 Candidate Commit**: `5744d331e2b0f8f2f98a4dc57b05099e9474d8ad`
- **CHK0-BR1 Candidate Commit**: `9f637f09b9a27ca5dbd14a5e3955aeb4447dbc4d`
- **CHK0-BR2 Candidate Commit**: `d29cfac0d606ac8afb75d4cd2711fb5b945159c9`
- **Remediation Working Branch**: `audit/gp026a-chk0-br3`
- **Branch Lineage**: Branched strictly and directly from candidate `d29cfac0d606ac8afb75d4cd2711fb5b945159c9`.
- **Zero-Candidate Isolation**: Completely isolated from unmerged GP-026 candidate `e239298b01e6b0eb409118dc6b5e31c1ce75b9ae` and experimental branches `audit/gp026-chk0` / `audit/gp026-chk0-br1`.
- **Gate Authorization**: This remediation candidate does not authorize CHK1 or any runtime work.

## 3. Owner Intent

The project owner has explicitly established that the current customer-facing storefront of Gamer Perú is not visually satisfactory and that the binding visual and user-experience benchmark is the public digital property of **WLMOUSE** (`https://www.wlmouse.com`).

The mandate is **HIGH-FIDELITY STOREFRONT CONVERGENCE**:

- Equivalent component inventory where applicable across all major public surfaces.
- Equivalent information hierarchy, prioritizing industrial hardware design, materials, and competitive specifications.
- Equivalent composition and product-first visual dominance over generic promotional banners or abstract graphics.
- Closely matched layout proportions, grid densities, and maximum content bounds.
- Closely matched spacing rhythm and fluid clamp curves.
- Closely matched typography scale, letter-spacing, line-heights, and hierarchical contrast.
- Closely matched product-card anatomy (including horizontal specification highlight carousels and deterministic quick-add).
- Closely matched PDP commerce anatomy (adaptive gallery, sticky commerce panel, visual thumbnail color swatches, tactile switch selectors, inline quantity controls, and sticky buy bar).
- Closely matched desktop and mobile touch ergonomics.
- Closely matched long-form Product Story presentation for modular below-the-fold narrative blocks.

**Gamer Perú Brand & Operational Independence**:
Gamer Perú must retain its own branding, logo, Peruvian copy, high-resolution product media, catalog routes, Soles (`PEN` / `S/`) currency, manual Yape/Plin payment verification, multi-brand taxonomy, and backend architecture. No proprietary WLMOUSE source code, copyrighted copy, trademarks, or raw photography may be copied.

## 4. Reason for Execution-Priority Change

Before implementing GP-026 (Product Story Builder in Admin), the storefront presentation layer that the Story Builder authors must be fully converged and frozen. Developing the authoring interface before the public storefront presentation is visually finalized would introduce severe architectural rework, schema churn, and misaligned authoring controls.

Therefore, GP-026 implementation is paused, and GP-026A is inserted as an exceptional gate to reconstruct and visually elevate the customer-facing storefront. Once GP-026A achieves visual closure, GP-026 discovery will resume to provide Admin authoring for these proven, finalized storefront surfaces.

## 5. Relationship to GP-001

GP-001 (_WLMOUSE Visual & UX Reference_, August 2026) served as the initial exploratory reference. While GP-001 accurately captured high-level principles, its historical text was interpreted too loosely during subsequent implementations (resulting in "WLMOUSE-inspired boutique ecommerce" rather than structural and visual convergence).

GP-026A supersedes visual assumptions for future storefront work. Historical documents [GP-001.md](./GP-001.md), [GP-001-CLOSURE.md](./GP-001-CLOSURE.md), and [WLMOUSE_REFERENCE_SPEC.md](../design/WLMOUSE_REFERENCE_SPEC.md) remain untouched as historical records; this contract governs all subsequent execution.

Crucially, GP-001 established that commercial carrier integrations, specific delivery SLAs, warranty duration terms, and support channels remain TBD business decisions. This contract strictly adheres to those boundaries.

## 6. Relationship to GP-002

GP-002 established Gamer Perú's canonical design language ("Machinery Obsidian & Signal Crimson"). GP-026A retains this core identity:

- Dark Obsidian background (`#09090b` / `#121215`) for high-contrast hardware stages and editorial video bands.
- Clean White canvas (`#ffffff` / `#fafafa`) for restrained commerce listings and product cards.
- Signal Crimson (`#e11d48` / `#be123c`) as the focused action and sale accent, replacing WLMOUSE's rose/amber accents.
- Modern geometric grotesque typography (`Inter` / `Plus Jakarta Sans`) with tight negative letter-spacing (`-0.03em`) on headings.
- 6px border radius (`0.375rem`) for buttons and inputs, and 6px–12px for cards, matching WLMOUSE's refined geometric silhouettes.

## 7. Relationship to GP-009, GP-010, GP-011, GP-012, GP-013, GP-014, GP-017

These previously completed gates established canonical domain foundations:

- **GP-009**: Global navigation structure, accessible skip links, semantic header landmarks.
- **GP-010**: Server-rendered homepage routing and section ordering.
- **GP-011**: Category and Brand catalog routing (`/categorias/[slug]`, `/marcas/[slug]`).
- **GP-012**: Search routing (`/buscar`) and URL query synchronizers.
- **GP-013**: Catalog facet filtering and sorting logic.
- **GP-014**: Product Detail Page (PDP) routing, metadata generation, and JSON-LD structured data.
- **GP-017**: Cart state management, drawer container, item mutations, and session persistence.

**Domain and Read-Model Boundary**:
Domain write semantics, checkout sessions, orders, authentication, and RBAC remain 100% authoritative and unchanged. However, the existing catalog read queries (`ProductDiscoveryItem`, `ProductDetailEntity`) do not currently expose the secondary media, card specification highlights, same-variant pricing tuple, or available-to-sell inventory required for visual parity. Therefore, additive public read projections are authorized to fulfill visual convergence without mutating backend write logic or database schemas.

## 8. Relationship to GP-026

- **Status**: GP-026 is officially **PAUSED / BLOCKED BY GP-026A**.
- **Lineage Boundary**: The rejected/unmerged GP-026 CHK0 candidate commit (`e239298b01e6b0eb409118dc6b5e31c1ce75b9ae`) carries zero authority.
- **Scope Boundary**: GP-026A owns the **customer-facing presentation** of all 13 canonical Story block types. GP-026 owns the **Admin authoring interface** (block insertion, ordering, preview, draft persistence, publishing).
- **Post-GP-026A Action**: When GP-026A closes, GP-026 discovery will be freshly executed against the finalized public Story components.

## 9. Current GamerPeru Storefront Reality

A comprehensive code audit of `src/app/(storefront)` and `src/components/*` reveals the following divergence from WLMOUSE:

1. **Homepage Dominance**: Current homepage (`src/components/home/*`) relies on abstract geometric wireframes (`media: { kind: "abstract" }`) and textual descriptions rather than real hardware photography, video loops, and purchasable product sections.
2. **Product Card Read Model**: Current `ProductDiscoveryItem` only contains basic fields (`id`, `name`, `slug`, `subtitle`, `brand`, `category`, `primaryMedia`, `startingPriceCents`). It lacks secondary media, specification highlights, variant ID context, and compare-at pricing, forcing the card to render a static image without hover flip or spec carousels.
3. **PDP Inventory & Commerce Anatomy**: Current `ProductDetailEntity` / `ProductVariantDetail` does not expose authoritative available-to-sell inventory counts. Current `ProductCommercePanel` renders radio text buttons without visual image-swatches for colors, lacks top-of-panel spec highlight pills, hardcodes quantity to 1, and lacks a sticky buy bar on scroll.
4. **Gallery Architecture**: Current `ProductMediaGallery` uses standard thumbnail strips without fluid adaptive ratios, swipe-dot indicators, or full-bleed lightbox magnification.
5. **Global Navigation**: Header lacks the high-contrast minimalist balance of WLMOUSE, drawer menus lack smooth spring animations, and announcement bars lack fluid multi-message rotation.
6. **Product Story Presentation**: Current `src/components/product-story/blocks/*` renders blocks with standard card layouts rather than bold, full-bleed high-contrast editorial spreads.

## 10. Current WLMOUSE Review Methodology

- **Review Date**: September 13, 2026.
- **Subject**: Live production storefront `https://www.wlmouse.com/` (running Shopify `Concept` theme v6.0.2).
- **Inspected URLs**:
  - Homepage: `https://www.wlmouse.com/`
  - All Products: `https://www.wlmouse.com/collections/all`
  - Category Collections: `/collections/keyboard`, `/collections/mousepad`, `/collections/huan`, `/collections/beast-x-series`, `/collections/swordx`, `/collections/strider`.
  - Representative PDPs:
    - _Beast X Pro_ (`/products/x-pro`): Magnesium flagship mouse.
    - _HUAN M_ (`/products/huan-m-black`): Stainless magnesium alloy mouse.
    - _Sword X_ (`/products/jianlai`): Ergonomic magnesium mouse.
    - _YING75_ (`/products/ying75`): Forged carbon fiber Hall Effect magnetic keyboard.
    - _Purple Mousepad_ (`/products/wl-mouse-pad`): Premium textile gaming surface.
- **Methodology**: Source code analysis of live CSS custom properties, layout tokens, DOM structure, custom elements (`variant-picker`, `media-gallery`, `product-card`, `scroll-shadow`, `product-sticky-form`), responsive viewports, and interaction dynamics.

## 11. Current WLMOUSE Homepage Inventory

The live WLMOUSE homepage exhibits a deliberate 16-stage editorial rhythm:

1. **Announcement Bar**: Multi-message ticker/slide with announcement text and links.
2. **Minimalist Header**: Centered logo, left-aligned search link and hamburger menu, right-aligned currency, account, and slide-out cart icon.
3. **Slideshow Hero**: Full-bleed campaign hero showcasing flagship hardware in high resolution, large headline, material subtitle, and primary button.
4. **Collection Family Doors (`collection-list`)**: Visual card doors for each hardware series (_HUAN_, _Beast G_, _Beast X_, _Ying_, _Sword_, _Strider_, _HE Keyboards_, _Mousepads_, _IEMs_, _Skates_, _Grip Tape_).
5. **Ambient Video Banner (`video-with-text-overlay`)**: Full-width looping hardware production video.
6. **Technical Editorial Strip (`images_with_text`)**: "Built with Magnesium" narrative block contrasting raw alloy frames with finished peripherals.
7. **Purchasable Featured Product (`featured_product`)**: Full commerce block embedded directly on the homepage, allowing customers to select colors (with visual swatches), configure switches, choose quantities, and Add to Cart without leaving the homepage.
8. **Interactive Comparison Block (`image-comparison`)**: Interactive before/after split slider (e.g. solid sides vs. side slits).
9. **Featured Mice Shelf (`featured_collection`)**: 4-column product grid with ProductCard components.
10. **Collaboration Editorial Banner (`video_with_text_overlay`)**: Brand story / limited edition video band.
11. **Featured Keyboards Shelf (`featured_collection`)**: 3-column product grid for Hall Effect keyboards.
12. **Curated Collage Section (`collage`)**: Asymmetric 3-tile editorial grid highlighting accessories and skates.
13. **Featured Mousepads Shelf (`featured_collection`)**: Grid showcasing mousepad surfaces and textures.
14. **Community Showcase (`image_with_text_overlay`)**: Discord / social community call to action.
15. **Trust Strip (`multicolumn-with-icons`)**: 4-item horizontal value proposition strip.
16. **Minimalist Footer (`footer` + `footer-copyright`)**: Clean multi-column directory, newsletter input, and copyright notice.

## 12. Current WLMOUSE Navigation Inventory

- **Header Structure**: Sticky header (`is="sticky-header"`), transparent on hero scroll, solid on background content, height ~64px desktop / ~56px mobile.
- **Logo Treatment**: Centered wordmark typography, clean uppercase, letter-spaced.
- **Left Utilities**: Instant search icon drawer button + hamburger navigation drawer button.
- **Desktop Navigation**: Horizontal product-family links with subtle hover underlines and dropdown mega-menus containing product family cards with images.
- **Right Utilities**: Country/Currency selector (`USD $`), Account login link, and slide-out Cart Drawer button with live badge counter.
- **Search Drawer**: Slide-down or slide-in drawer with live predictive search, showing query results grouped by Products, Collections, and Articles with live pricing and thumbnails.
- **Cart Drawer**: Slide-out right panel (`cart-drawer`), line items with image, variant subtitle, quantity counter, remove button, order notes, and checkout CTA.

## 13. Current WLMOUSE Collection & Card Inventory

- **Collection Header**: Clean, minimal title, optional collection description, and subtle product count (`64 results`).
- **Facet Toolbar (`facets-topbar`)**: Sticky horizontal bar with filter toggle button (`Filter and sort (0)`) and desktop sorting dropdown (`Featured`, `Price: Low to High`, `Price: High to Low`, `Newest`).
- **Filter Drawer (`drawer-element`)**: Slide-out drawer with accordion filters (Availability, Price Range slider, Series, Switch Type, Color).
- **Product Card Anatomy**:
  - **Outer Frame**: Card container (`product-card--card flex flex-col relative`), 0px card border, subtle box shadow on hover, border radius `clamp(10px, 1.05vw, 20px)`.
  - **Media Area**: Aspect-ratio adaptive (1:1 or 4:5), primary image with secondary image fade/zoom flip on hover.
  - **Quick View Button**: Discrete eye icon button top-right, fades in on hover.
  - **Quick Action Button**: Bottom-anchored button ("Choose options" or "Add to cart") sliding up on hover.
  - **Card Header**: Product title in medium typography, price row (with sale price in accent red/rose and strikethrough compare-at price).
  - **Spec Highlight Carousel (`scroll-shadow` + `icons-carousel`)**: Horizontal scrollable container below title/price displaying 3–5 key technical attributes with 24x24 SVG icons and two-line labels.

## 14. Current WLMOUSE PDP Inventory

- **Layout Structure**: Two-column layout on desktop (`gap: clamp(40px, 5vw, 60px)`), with left gallery column (~58% width) and right sticky commerce column (~42% width, `lg:sticky top-6`).
- **Media Gallery (`media-gallery`)**:
  - Main display with smooth swipe/transition.
  - Aspect ratio: Adaptive (1:1 square or hardware silhouette).
  - Thumbnail slider below or alongside main image.
  - Zoom / Lightbox overlay trigger on click.
  - Variant synchronization: Selecting a color variant scrolls the gallery to the matching variant image.
- **Top Commerce Section (`product-info`)**:
  - **Brand & Series**: Subtle uppercase category/brand eyebrow.
  - **Product Title**: Large, high-contrast heading (`split-words` reveal animation).
  - **Price Cluster**: Strikethrough regular price, prominent sale price.
  - **Spec Highlight Badges**: Category-specific hardware pill badges (e.g. `39g Ultra-light`, `PAW3950HS`, `8000Hz Polling`, `Nordic 54L15`).
  - **Color Selector**: Circular thumbnail swatches (`swatches--round`) with active ring outline, tooltip on hover, and selected color name displayed in the label (`Color: Black Gold`).
  - **Switch / Technical Option Selector**: Pill buttons (e.g. `OMRON Opticals`, `TTC Mechanicals`) with active solid background.
  - **Side Style / Size Selector**: Pill buttons (e.g. `Side Slits`, `Solid Sides`).
  - **Quantity Selector**: Compact inline counter with minus, numeric input, and plus buttons.
  - **Primary CTA**: Full-width high-contrast button (`Add to cart` / `Sold Out`).
  - **Sticky Purchase Bar (`product-sticky-form`)**: Floats at the top or bottom of the viewport when scrolling past the main buy button, displaying product thumbnail, title, price, and instant Add to Cart.
- **Below-the-Fold Product Story**:
  - Exploded mechanical schematics.
  - Stat highlight callouts (`39g`, `8K`, `0.005mm RT`).
  - Interactive comparison sliders (`image-comparison`).
  - Technical specification tables and dimensions schematics.
  - What's in the box visual grid.
  - Expandable FAQ accordions.

## 15. Current WLMOUSE Mobile Findings

- **Mobile Header**: Compact 56px height, hamburger menu left, centered logo, cart icon right with quantity badge.
- **Navigation Drawer**: Full-screen off-canvas drawer with smooth slide-in, categorizing product families with expandable nested links and high-contrast social links at the bottom.
- **Homepage Mobile Layout**: Hero adjusts to vertical aspect ratio (4:5 or 9:16), single-column collection lists, horizontal swipeable product shelves with touch snap.
- **Mobile Product Card**: Quick-action button is touch accessible, spec highlight strip scrolls horizontally via touch with subtle edge fade.
- **Mobile PDP Commerce**:
  - Gallery becomes a 100vw horizontal touch carousel with pagination dots.
  - Commerce panel stacks directly beneath gallery with comfortable touch targets (minimum 44x44px).
  - Swatches expand to full-width wrap.
  - Sticky bottom action bar (`product-sticky-form`) anchors to the bottom of the mobile viewport, providing instant Add-to-Cart without scrolling back up.
- **Mobile Story Blocks**: Full-bleed media retains edge-to-edge impact; multi-column spec grids collapse cleanly to 1-column or 2-column cards; stat callouts stack vertically.

## 16. ADOPT / ADAPT / REJECT Matrix

| Category                | Reference Feature (WLMOUSE)                  | Gamer Perú Decision | Architectural Justification                                                                                                                                                |
| :---------------------- | :------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Branding**            | Single-brand manufacturer identity           | **REJECT**          | Gamer Perú is a multi-brand retailer with multiple brands available in its catalog. Brand labeling must remain clear without implying an authorized-reseller relationship. |
| **Color System**        | Monochrome base with rose/amber accents      | **ADAPT**           | Adopt monochrome black/white base (`#09090b` / `#ffffff`), but use Gamer Perú Signal Crimson (`#e11d48`) for action/sale accents.                                          |
| **Typography**          | Inter with tight heading tracking            | **ADOPT**           | Adopt clean geometric grotesque (`Inter` / `Plus Jakarta Sans`), -0.03em tracking on headings, 1.0–1.2 line heights.                                                       |
| **Product Dominance**   | Large-scale hardware media as primary visual | **ADOPT**           | Eliminate abstract SVG wireframes; use real high-resolution hardware photography and video for all key stages.                                                             |
| **Product Card V2**     | Spec carousel + hover flip + quick options   | **ADOPT (CHK2)**    | Implemented in CHK2 backed by additive read projection (`secondaryMedia`, `specHighlights`, `displayPrice`, `quickAddVariantId`).                                          |
| **PDP Commerce**        | Sticky buy panel + swatches + spec pills     | **ADOPT (CHK3)**    | Implemented in CHK3 as shared commerce primitives (reused by Homepage FeaturedProduct in CHK3).                                                                            |
| **Sticky Buy Bar**      | Floating purchase bar on scroll              | **ADOPT (CHK3)**    | Essential conversion feature for long PDPs on desktop and mobile.                                                                                                          |
| **Homepage Commerce**   | Purchasable product on homepage              | **ADOPT (CHK3)**    | Implemented in CHK3 reusing shared commerce primitives driven by server-side presentation config.                                                                          |
| **Add-Ons Cross-Sell**  | Automated accessory bundle checkout          | **ADAPT (CHK3)**    | Model-specific curated mapping in server config; sequential cart mutations with partial failure reporting.                                                                 |
| **Back-In-Stock Form**  | Email/phone collection drawer                | **REJECT (V1)**     | DEFERRED. Non-functional data collection without authorized backend destination is prohibited.                                                                             |
| **Commercial Promises** | 12-month store warranty, global shipping     | **REJECT**          | Strict Policy-Source Rule. Unapproved couriers, 24h delivery, and warranty terms remain TBD. Slots without approved policy render nothing.                                 |
| **Currency / Pay**      | USD / Klarna / AfterPay / Shopify Pay        | **REJECT**          | Gamer Perú operates in Peruvian Soles (`PEN`) with manual Yape/Plin verification.                                                                                          |
| **Navigation**          | Brand product-family hierarchy               | **ADAPT (CHK1)**    | Adapt single-brand family menus into multi-brand category + curated brand showcase menus.                                                                                  |
| **Story Blocks**        | Concept theme proprietary liquid sections    | **ADAPT (CHK4)**    | Rebuild presentation of Gamer Perú's 13 canonical Story block types to match WLMOUSE editorial impact.                                                                     |
| **Search / Cart**       | Slide-out drawers with instant search/cart   | **ADOPT (CHK5)**    | Adopt slide-out drawer pattern for both search and cart.                                                                                                                   |

## 17. Component Parity Matrix

| WLMOUSE Component           | Gamer Perú Current     | Action       | Domain Logic Source                   | Visual Target                                                                       | Responsive Target                             | Accessibility Req                  | Data Requirement                      | Implementation Gate | Notes                           |
| :-------------------------- | :--------------------- | :----------- | :------------------------------------ | :---------------------------------------------------------------------------------- | :-------------------------------------------- | :--------------------------------- | :------------------------------------ | :------------------ | :------------------------------ |
| `announcement-bar`          | `AnnouncementBar`      | **REFACTOR** | Policy Rule Config                    | Slim 36px high-contrast bar, rotating approved facts only                           | Auto-fit text, hide secondary links on mobile | ARIA live region for ticker        | Approved policy facts only            | CHK1                | No unapproved couriers/SLAs     |
| `sticky-header`             | `SiteHeader`           | **REFACTOR** | `NAVIGATION_CONFIG`                   | 64px height, minimalist layout, 1.5px stroke icons                                  | 56px height, compact utilities                | Semantic `<header>`, focus-visible | Navigation config                     | CHK1                | Preserves skip-link             |
| `menu-drawer`               | `MobileDrawer`         | **REFACTOR** | `NAVIGATION_CONFIG`                   | Full-height slide-in, clean typography, category accordions                         | Full viewport width mobile                    | Focus trap, `Escape` key close     | Navigation config                     | CHK1                | Touch ergonomics                |
| `slideshow_hero`            | `HomeHero`             | **REPLACE**  | Server presentation config            | Full-bleed real hardware hero, bold typography, high-contrast CTA                   | 4:5 vertical framing on mobile                | Accessible heading hierarchy       | Campaign media keys                   | CHK1                | Eliminates abstract media       |
| `collection-list`           | `CategoryShowcase`     | **REFACTOR** | Server presentation config            | Visual hardware category tiles with real hardware photography                       | 2-column mobile grid                          | Semantic list `<nav>`              | Category catalog                      | CHK1                | Real category imagery           |
| `images_with_text`          | `TechnicalEditorial`   | **REFACTOR** | Server presentation config            | "Built with..." high-contrast dark section, exploded frame media                    | Single-column stacked                         | Semantic text & image alt          | Technical copy & media                | CHK1                | Engineering focus               |
| `image-comparison`          | None (in home)         | **CREATE**   | Server presentation config            | Interactive before/after split slider                                               | Touch-drag handle                             | Slider ARIA role, keyboard arrows  | Dual media keys                       | CHK1                | Visual hardware proof           |
| `multicolumn-with-icons`    | `HomeDiscoveryFooter`  | **REFACTOR** | Visual Slot Architecture              | 4-column horizontal trust strip with 1.5px stroke icons                             | 2x2 grid on mobile                            | Semantic icons + text              | Approved facts only (PEN, Yape, Plin) | CHK1                | Unconfigured slots omitted      |
| `footer`                    | `SiteFooter`           | **REFACTOR** | `NAVIGATION_CONFIG` + Policy Rule     | Minimalist dark footer, structured columns, copyright bar                           | Collapsible accordions on mobile              | Semantic links                     | Footer config                         | CHK1                | Clean multi-brand links         |
| `product-card`              | `ProductCard`          | **REPLACE**  | Additive `ProductDiscoveryProjection` | Aspect-adapt image, hover flip, deterministic quick-add ("Añadir" / "Ver opciones") | Compact card, mobile-optimized                | Accessible links, proper heading   | Additive discovery projection         | CHK2                | Direct quick-add if 1 variant   |
| `icons-carousel`            | None                   | **CREATE**   | Validated category spec schema        | Horizontal spec highlight strip (polling, MCU, switch, weight)                      | Horizontal touch scroll with fade masks       | Accessible text descriptions       | Validated `specValues`                | CHK2                | Omitted if specs absent         |
| `featured_collection`       | `CuratedGear`          | **REFACTOR** | Server config + Additive Projection   | 4-column product shelves (_Mouses_, _Teclados_, _Mousepads_)                        | 2-column or touch swipe shelf                 | Carousel ARIA controls             | Explicit product slug lists           | CHK2                | Reuses canonical ProductCard V2 |
| `facets-topbar`             | `DiscoveryToolbar`     | **REFACTOR** | Catalog URL params                    | Sticky minimal bar with filter count and sort dropdown                              | Compact sticky header                         | ARIA menu / listbox                | Filter state                          | CHK2                | Minimal clutter                 |
| `drawer-element` (filter)   | `FilterDrawer`         | **REFACTOR** | Catalog facets                        | Slide-out filter drawer with clean check pills and price range                      | Full-screen drawer                            | Focus trap, accessible inputs      | Active facet counts                   | CHK2                | Seamless filtering              |
| `media-gallery`             | `ProductMediaGallery`  | **REFACTOR** | `ProductMedia[]`                      | Large adaptive gallery, thumbnail strip, zoom modal                                 | 100vw touch slider with dots                  | Full keyboard navigation           | High-res media assets                 | CHK3                | Visual hardware dominance       |
| `product-info`              | `ProductCommercePanel` | **REFACTOR** | `ProductDetailView` + `useCart`       | Sticky commerce column, bold title, pricing cluster, spec pills                     | Standard flow above story                     | Semantic form, live regions        | Product + variant data                | CHK3                | Core shared commerce engine     |
| `variant-picker` (swatches) | `VariantSelector`      | **REFACTOR** | `ProductVariantDetail[]`              | Circular image swatches (`colorway`/`color`) with tooltips                          | Touch-friendly swatches (44px)                | Radio group ARIA semantics         | Variant media objects                 | CHK3                | Reusable commerce primitive     |
| `variant-picker` (pills)    | `VariantSelector`      | **REFACTOR** | `ProductVariantDetail[]`              | Tactile option pills for generic dynamic attributes                                 | Wrap pills                                    | Radio group ARIA semantics         | Generic attribute keys                | CHK3                | Dynamic dimension support       |
| `quantity-input`            | None (fixed 1)         | **CREATE**   | `useCart.addItem`                     | Inline counter with `-`, numeric input, `+`                                         | 44px touch targets                            | `aria-label`, numeric constraints  | Item quantity state                   | CHK3                | Reusable commerce primitive     |
| `product-sticky-form`       | None                   | **CREATE**   | Active variant + `useCart`            | Floating bar on scroll with thumbnail, price, Add to Cart                           | Fixed bottom mobile dock                      | Focus management                   | Active variant state                  | CHK3                | Conversion recovery             |
| `product-add-ons`           | None                   | **CREATE**   | Curated product mapping config        | Model-specific add-ons checkbox module                                              | Stacked checkbox pills                        | Accessible checkboxes              | Explicit add-on slugs                 | CHK3                | Sequential cart mutations       |
| `featured_product`          | None                   | **CREATE**   | Shared CHK3 Commerce Primitives       | Purchasable featured product on home (swatches, quantity, CTA)                      | Stacked layout, touch swatches                | Full keyboard form controls        | Explicit product slug in config       | CHK3                | Reuses shared CHK3 primitives   |
| Story Block Renderers (13)  | `ProductStoryRenderer` | **REFACTOR** | `ProductStory` JSON                   | High-contrast editorial spreads, large typography, stat counters                    | Responsive stacked layouts                    | Accessible semantic headings       | Story JSON payloads                   | CHK4                | Full public convergence         |
| `search-drawer`             | Basic search           | **CREATE**   | `useSearch` / API                     | Slide-out instant predictive search with thumbnail results                          | Full-screen mobile search                     | Search landmark, aria-expanded     | Product index search                  | CHK5                | Instant feedback                |
| `cart-drawer`               | `CartDrawer`           | **REFACTOR** | `useCart`                             | Slide-out drawer, line items, inline quantity, checkout CTA                         | Full mobile drawer                            | Focus trap, live announcements     | Cart session items                    | CHK5                | Instant frictionless cart       |

## 18. Global Shell Contract

- **Visual Slot Architecture for Trust & Policy**:
  - All announcement, header, and trust messaging adheres strictly to the **Policy-Source Rule**.
  - Components define structural visual slots with 1.5px stroke icons.
  - **Slot Rule**: An unconfigured or unauthorized slot renders **NOTHING** (completely omitted). No fallback promises or generic assumptions may be rendered.
  - **Currently Approved Facts (Frozen for a Future Separately Authorized CHK1)**:
    - Currency: Peruvian Soles (`PEN` / `S/`).
    - Payment Verification: Manual verification via Yape and Plin upon order coordination.
    - Identity & Catalog: Gamer Perú has a multi-brand catalog.
  - **Still TBD (Strictly Prohibited from Rendering as Promises)**:
    - Courier brand names (Olva Courier, Shalom, Moto Express).
    - Shipping coverage guarantees, delivery SLAs and ETAs (e.g. "24h", "envío inmediato").
    - Shipping fees and free-shipping thresholds.
    - Warranty duration/scope and returns commitments.
    - Customer-support or advisory-service promises, channels (including WhatsApp), operating hours and response SLAs.
    - "Authorized reseller" or "authorized brands" relationship claims unless separately proven for the displayed brand.
- **Announcement Bar**:
  - Height: 36px fixed.
  - Colors: Dark Obsidian background (`#09090b`), White text (`#ffffff`), Crimson link hover (`#e11d48`).
  - Content: Rotating approved facts only (e.g. "Pagos en Soles con verificación manual Yape y Plin", "Catálogo multimarca").
- **Header**:
  - Height: 64px desktop / 56px mobile.
  - Background: Semi-transparent blur (`backdrop-filter: blur(12px)`) over hero; solid white (`#ffffff`) on page scroll with subtle bottom border (`#e4e4e7`).
  - Layout: Left: Search icon + Hamburger menu. Center: Gamer Perú logo wordmark. Right: Multi-brand navigation links, Account icon, Cart Drawer button with item counter.
  - Iconography: Restrained 1.5px stroke geometry (Lucide icons standardized to 20px / 1.5px stroke).
- **Navigation Architecture**:
  - Primary Categories: _Mouses_, _Teclados_, _Mousepads_, _Audio_, _Accesorios_.
  - Curated Brands dropdown: Curated list of brands available in the catalog; no reseller-authorization relationship is implied.
  - Visual Mega-Menu: Multi-column panel showing category links alongside a featured product image card.
- **Footer**:
  - Background: Dark Obsidian (`#09090b`), text in muted slate (`#a1a1aa`), headings in crisp white (`#f4f4f5`).
  - Columns: Navegación, Marcas, Información, Gamer Perú. Support, shipping, warranty and returns links render only when their destination and policy copy are separately configured and approved.
  - Bottom Bar: Copyright notice, RUC declaration, Peru payment method logos (Yape, Plin). Unapproved third-party courier or credit-card logos are omitted.

## 19. Homepage Contract

The homepage eliminates abstract wireframe placeholders and implements WLMOUSE's product-first structure through a phased gate sequence:

### CHK1 Phase: Homepage Visual Foundation

1. **Hero Stage (`HomeHero`)**:
   - Real hardware photography/video configured by object key.
   - Headline: Max font-size `clamp(2.5rem, 5vw, 4.5rem)`, -0.035em tracking.
   - Dual CTAs: Primary solid button (`Explorar Mouses`) + Secondary outline button (`Ver Catálogo`).
2. **Visual Category Doors (`CategoryShowcase`)**:
   - Hardware category cards displaying high-detail hardware cutouts on neutral tinted cards (`#f4f4f5` / `#121215`).
3. **Interactive Comparison Slider (`ProductComparisonSection`)**:
   - Interactive split-slider showcasing hardware engineering (e.g. solid shell vs. honeycomb magnesium cutouts) driven by configured dual media keys.
4. **Technical Engineering Band (`TechnicalEditorial`)**:
   - Full-width dark section (`#09090b`) detailing lightweight alloy structures, sensor precision, and high polling rates.
5. **Multi-Brand Showcase (`BrandDiscovery`)**:
   - Clean grid of selected brands available in the catalog, without an authorized-reseller claim.
6. **Trust Strip (`TrustStrip`)**:
   - Visual slot architecture rendering **ONLY** currently approved facts: _Pagos en Soles_ with manual Yape/Plin verification, _Catálogo Multimarca_, and _Precios en Soles_. The fourth slot and every unapproved slot render nothing.
7. **Shelves & Commerce Placeholder Boundaries**:
   - Section containers for product shelves and featured commerce may exist structurally in CHK1 layout, but **MUST NOT** implement duplicate ProductCard V2 or commerce logic.

### CHK2 Phase: Homepage Product Shelves

8. **Curated Product Shelves (`ProductShelf`)**:
   - Shelves for _Mouses_, _Teclados_, _Mousepads_ driven by explicit lists of product slugs in server-side presentation configuration.
   - Implemented canonically using the finalized `ProductCard` V2 and `ProductDiscoveryProjection`.

### CHK3 Phase: Purchasable Featured Product

9. **Purchasable Featured Product (`FeaturedProductSection`)**:
   - **Deterministic Source**: Configured strictly via an explicit published product slug in server-side presentation configuration.
   - **Shared Primitives Invariant**: Reuses the exact shared CHK3 commerce primitives (swatches, dynamic option pills, quantity counter, Add to Cart action, Sold Out state). Zero duplicate commerce logic.
   - **No Silently Substituted Fallback**: If the configured product is unavailable or unpublished, the commerce section is omitted safely, and a server-side diagnostic warning is emitted. Never substitute an arbitrary product.

## 20. Product Card V2 Contract

The `ProductCard` component will be completely rebuilt in **CHK2** to match the live WLMOUSE card anatomy, backed by an **additive public read projection**:

- **Additive Discovery Projection (`ProductDiscoveryProjection`)**:
  - `ProductDiscoveryItem` will be extended with optional read-only fields:
    - `secondaryMedia`: Deterministic second image resolving from `ProductMedia` joined to `MediaAsset`.
    - `specHighlights`: Array of `{ label: string; value: string; iconKey?: string }` extracted strictly from validated category specification schema and `specValues` (nullable).
    - `displayPrice`: Canonical pricing tuple derived from the same deterministic variant.
    - `quickAddVariantId`: Authoritative variant UUID for direct quick-add (nullable).
- **Current Primary-Media Projection Reality**:
  - `ProductDiscoveryItem.primaryMedia` exposes only `objectKey`, `altText`, `width`, and `height`; it exposes neither `id` nor `mediaAssetId`.
  - Primary exclusion is therefore a database-query concern. It MUST NOT require a new browser-visible internal identifier merely to compare identities.
- **Secondary Media Eligibility Rules**:
  - Must come from `ProductMedia` joined to `MediaAsset`.
  - Must have `MediaAsset.securityClass = 'PUBLIC_MEDIA'`.
  - Must have `MediaAsset.mediaType = 'IMAGE'`.
  - Must have `ProductMedia.variantId IS NULL` (product-level media, avoiding unselected variant context).
  - When `products.primaryMediaId` is non-null, candidate identity MUST satisfy `MediaAsset.id != products.primaryMediaId` inside the query.
  - `ProductMedia.id` identifies the attachment row and MUST NOT be compared with `MediaAsset.id`; labels, alt text and presentation keys are also not identity substitutes.
  - Eligible candidates use deterministic ordering: `ProductMedia.displayOrder ASC`, then `ProductMedia.id ASC`.
  - Candidates remain deterministically bounded in that order; the selected `secondaryMedia.objectKey` must be the first candidate that resolves through the existing safe public media resolver (`resolvePublicMediaUrl`).
  - If no eligible secondary image exists: `secondaryMedia = null` and hover flip is safely omitted.
  - Prohibited: Falling back to `VIDEO`, `DOCUMENT`, `PRIVATE`/`INTERNAL` media, arbitrary variant imagery, or raw unvalidated URLs.
- **Same-Variant Display Pricing Rule**:
  - The variant that determines the displayed selling price **MUST** also determine the compare-at price used for that display.
  - Strongly typed read structure:
    ```ts
    displayPrice: {
      variantId: string;
      priceCents: number;
      compareAtPriceCents: number | null;
    }
    ```
  - For backward compatibility with existing public types, `startingPriceCents = displayPrice.priceCents`.
  - Deterministic tie-breaking rule if multiple active variants share the lowest price:
    `priceCents ASC`, then `displayOrder ASC`, then `id ASC`.
  - Sale Badge Rule: A discount badge (-X%) renders **ONLY** when `compareAtPriceCents !== null` and `compareAtPriceCents > priceCents`. Never fabricate a sale badge.
- **Authoritative Quick-Add Contract**:
  - **Always Linkable**: The product card always provides a canonical link to the PDP (`/productos/[slug]`).
  - **Single-Variant Eligibility**: Direct Quick Add is permitted **ONLY** when the additive discovery projection proves there is **exactly ONE** eligible public sellable `ACTIVE` variant for that product.
  - In that exact case: `quickAddVariantId = variant.id`.
  - If zero eligible variants, more than one variant (multi-variant product), or variant eligibility is ambiguous:
    `quickAddVariantId = null`.
  - When `quickAddVariantId !== null`: Card action button displays "Añadir al carrito" and dispatches authoritative cart addition.
  - When `quickAddVariantId === null`: Card action button displays "Ver opciones" and navigates to the PDP.
  - **Strict Prohibition**: ProductCard must **NEVER** choose the first variant implicitly, choose lowest-price variant implicitly for cart addition, derive variant IDs in the browser from labels, or trust a client-composed variant ID.
- **Geometry & Spec Carousel**:
  - Adaptive 1:1 or 4:5 image container with neutral light gray background (`#f8f8f8`).
  - Horizontal spec highlight carousel (`scroll-shadow` + `icons-carousel`) displaying 3–5 category attributes with 20px SVG icons. Omitted if specs absent or invalid.

## 21. Category & Brand Collection Contract

- **Top Toolbar**:
  - Sticky minimal bar with active product count, filter drawer trigger button with active badge count, and sorting dropdown.
- **Grid Density**:
  - Desktop (>= 1280px): 4 columns.
  - Tablet (768px – 1024px): 3 columns.
  - Mobile (< 768px): 2 columns.
- **Filter Drawer**:
  - Slide-out right drawer with accordions for:
    - _Disponibilidad_: En catálogo / Activo.
    - _Rango de Precio_: Dual range slider in Soles.
    - _Marca_: Checkbox list for multi-brand catalog.
- **Brand Pages (`/marcas/[slug]`)**:
  - Hero banner with brand logo and narrative.
  - Filtered grid of brand products using ProductCard V2.

## 22. Search Surface Contract

- **Search Drawer (`SearchDrawer`)**:
  - Accessible from the header magnifying glass icon.
  - Instant predictive search triggering on 2+ characters.
  - Live results split into: _Productos Sugeridos_ (with thumbnail, title, price, brand) and _Categorías / Marcas Relacionadas_.
  - Full search results link leading to `/buscar?q=...`.
- **Search Results Page (`/buscar`)**:
  - Clean query header ("Resultados para '...'").
  - Filter toolbar and product grid matching collection layout.
  - Dedicated empty state with recommendations if zero products match.

## 23. PDP V2 Commerce-Shell Contract

The Product Detail Page top section will be completely restructured in **CHK3** into two synchronized columns, establishing the shared commerce primitives:

- **Desktop Proportions**: 58% Gallery / 42% Sticky Commerce Panel (`max-width: 1440px`, centered, padding `clamp(20px, 3vw, 48px)`).
- **Column Behavior**:
  - Gallery column scrolls naturally or presents high-impact hardware media.
  - Commerce panel remains sticky (`position: sticky; top: 80px; align-self: start;`) so buy actions remain in view.
- **Shared Primitives Invariant**: Primitives created here (swatches, option pills, quantity counter, buy action, sticky buy bar) are shared directly with the Homepage FeaturedProduct commerce section.
- **Policy-Source Rule**: Payment trust box displays approved Yape/Plin manual verification in Soles. All unapproved delivery SLAs, courier names, and warranty duration terms are omitted.

## 24. Gallery Contract

- **Structure**: High-impact media stage with primary active image, thumbnail rail (desktop side or bottom, mobile horizontal swipe), and full-screen lightbox magnification.
- **Adaptive Ratios**: Preserves hardware silhouette without awkward cropping (`object-fit: contain` on clean white/subtle gray canvas).
- **Variant Sync**: When the user clicks a color swatch, the gallery automatically scrolls/switches to the corresponding variant photo.
- **Mobile Touch**: 100vw edge-to-edge touch carousel with pagination indicator dots.
- **Zoom / Lightbox**: Click-to-zoom opens full-screen high-resolution modal with pan/pinch capability.

## 25. Spec-Highlight Contract

- **Position**: Located directly below the product title/price cluster at the top of the commerce panel.
- **Extraction Rule**: Must derive strictly from validated category specification schema + `specValues`. Do NOT refer to fictional direct object paths. If a spec value is missing, the corresponding badge is omitted.
- **Category-Aware Mapping**:
  - _Mouses_: Peso (g), Sensor, Polling Rate, Switches (if present in `specValues`).
  - _Teclados_: Switches, Rapid Trigger, Material, Layout (if present in `specValues`).
  - _Mousepads_: Superficie, Base, Grosor, Dimensiones (if present in `specValues`).
  - _Audio_: Drivers, Impedancia, Conexión (if present in `specValues`).

## 26. Variant / Option-Selector Contract

- **Generic Attribute Resolution**: `ProductVariant.attributes` is a generic `Record<string, string>`. Multidimensional option resolution must dynamically parse actual attribute keys present on the variants.
- **Color Aliases**: Color swatches recognize the canonical aliases `colorway` and `color`. Rendered as circular buttons (36px desktop / 44px mobile) with image thumbnail background, active double-ring outline, tooltip on hover, and selected color name displayed in the label (`Color: [Nombre]`).
- **Other Dimensions**: Tactile pill buttons dynamically generated from attribute keys (e.g. switches, side styles, layout). Active state: solid black background with white text. Inactive state: subtle border.
- **Fallback Rule**: Unknown, inconsistent, or incomplete dimensions fall back safely to full variant title selection as currently implemented.

## 27. Add-Ons Contract

- **Anti-Inference Rule**: Add-on compatibility must **NEVER** be inferred solely from category, brand, or generic product type (e.g. mouse skates and grip tapes are model-specific).
- **Curated Server Configuration**: Explicit server-side curated product -> add-on product slug mapping in presentation configuration.
- **Validation Rules**:
  - Mappings are manual, explicit, and model-specific.
  - Each referenced add-on must resolve to an active, published sellable product/variant.
  - Missing or invalid add-ons are silently omitted from the UI.
- **Cart Mutation Semantics**:
  - The existing cart API is single-variant mutation oriented (`addItem(variantId, quantity)`).
  - Main product addition occurs first using authoritative cart logic.
  - Selected add-ons are added sequentially through subsequent existing cart mutations.
  - Partial add-on failure is surfaced clearly to the user (e.g. "Producto principal añadido al carrito. El accesorio no pudo ser agregado: [motivo]").
  - The already-added main product is never falsely reported as rolled back.
  - No false claim of atomic multi-item bundle transactions.

## 28. Quantity & Purchase Contract

- **Quantity Selector**:
  - Inline component: Minus button (`-`), numeric input, Plus button (`+`).
  - Minimum 1.
- **Stock & Inventory Reality**:
  - **CRITICAL**: `ProductVariant.status = 'ACTIVE'` does NOT equal "in stock". Active merely denotes sellable catalog status.
  - The existing public `ProductVariantDetail` read model does not currently expose authoritative available-to-sell counts.
  - **V1 Fallback Rule**:
    - Do NOT display numeric low-stock claims or exact remaining quantities.
    - Do NOT claim "Envío inmediato".
    - Quantity selector operates with a safe UI ceiling (e.g. 10) unless a canonical public inventory read projection is introduced in CHK3.
    - Server-side cart addition (`addItem`) remains the authoritative purchase validator.
- **Primary Action Button (`Add to Cart`)**:
  - High-contrast solid black button, 48px height, 6px border radius, bold typography.
  - Loading state: Subtle spinner with "Añadiendo...".
  - Success state: Automatically opens Cart Drawer with added item highlighted.
- **Profile Required Box**:
  - When user profile is incomplete (from GP-015/016), displays clear prompt with "Completar perfil" button.

## 29. Availability & Notify Contract

- **Sold Out Visual State**:
  - When inventory is confirmed unavailable or variant status is inactive, Add to Cart button is disabled and displays "Agotado".
- **Back-in-Stock Subscription (DEFERRED)**:
  - **Strict Rule**: GP-026A MUST NOT ship a non-functional form that collects customer email/phone without a durable, authorized backend destination.
  - The "Notify Me" drawer is removed from mandatory CHK3 implementation.
  - Documented as **DEFERRED FUTURE CAPABILITY** pending an authorized backend gate defining storage, privacy, consent, and delivery.

## 30. Size-Guide & Dimensions Contract

- **Authoritative Data Rule**: Every rendered value or recommendation must belong to the exact Product/model. No global or category-level inference is allowed.
- **Presentation Rules**:
  - Exact physical dimensions render **ONLY** from validated `ProductSpecificationDetail.specValues` when that Product's category schema defines the relevant dimensions, or from its canonical `dimensions` Story payload.
  - Grip recommendations render **ONLY** when explicitly authored for that exact Product/model; no category-derived recommendation is permitted.
  - Hand-size recommendations render **ONLY** when explicitly authored for that exact Product/model. Global tiers such as Small <17cm, Medium 17–19cm, or Large >19cm are prohibited unless separately present as authoritative Product content.
  - If any subsection lacks product-authoritative data, that subsection is omitted.
  - GP-026A does not create schema or fabricate values merely to satisfy visual parity.
  - The visual modal matches WLMOUSE's clean schematic anatomy without inventing advice.

## 31. Product Story Renderer Contract

The public rendering of all 13 canonical Story block types will be redesigned in **CHK4** for WLMOUSE editorial parity:

1. `hero_media`: Full-bleed cinematic product showcase, ambient looping video or high-res image, bold overlay title and subtitle.
2. `full_bleed_image`: Edge-to-edge photography highlighting materials, textures, and CNC machining.
3. `image_text`: 50/50 alternating split section with high-resolution hardware photography and technical engineering narrative.
4. `stat_highlight`: Large-scale numeric typography (e.g. `39g`, `8000Hz`, `0.005mm`) with concise technical labels.
5. `spec_feature`: 3-column or 4-column feature grid with custom icons and engineering bullet points.
6. `video`: High-definition video player with custom sound toggle, ambient autoplay, and fullscreen capability.
7. `gallery`: Multi-image masonry or interactive carousel of lifestyle and tournament setups.
8. `comparison`: Interactive before/after split slider or structured comparison matrix.
9. `dimensions`: Industrial engineering schematic showing exact dimensions (L x W x H in mm) with callouts.
10. `box_contents`: Visual grid detailing every item included in the retail packaging (cables, dongles, skates, grips).
11. `technical_specs`: Clean two-column technical specification table with crisp divider lines.
12. `faq`: Minimalist accordion list with smooth expand/collapse animations for common hardware questions.
13. `related_products`: Curated cross-sell carousel of complementary hardware and accessories using ProductCard V2.

## 32. Trust Strip Contract

- **Visual Slot Architecture**:
  - Rendered on Homepage, PDP, and Cart Drawer.
  - 4-column horizontal layout on desktop, 2x2 grid on mobile.
  - Each slot possesses an icon and title/description container.
- **Strict Omission Rule**:
  - An unconfigured slot renders **NOTHING**.
  - Unapproved claims are strictly prohibited from rendering.
- **Currently Approved Facts (Frozen for a Future Separately Authorized CHK1 Default Render)**:
  - Slot 1: _Pagos en Soles_: La confirmación de pagos Yape / Plin es manual.
  - Slot 2: _Catálogo Multimarca_: Marcas disponibles en el catálogo.
  - Slot 3: _Precios en Soles_: Precios mostrados en PEN (`S/`).
  - Slot 4 (Unconfigured Slot): Omitted from the rendered DOM until separately authorized.
- **Still TBD (NON-RENDERABLE EXAMPLES / MUST NOT RENDER AS PROMISES)**:
  - _Courier Brands_: Olva Courier, Shalom, Moto Express.
  - _Delivery Coverage Guarantees_: "Envíos a todo el Perú garantizados".
  - _Delivery SLAs_: "Lima en 24h", "Envío inmediato".
  - _Shipping Fees & Thresholds_: Free-shipping bars or minimum spend promises.
  - _Warranty Scope/Duration_: "12 meses de garantía".
  - _Returns Commitments_: "Devoluciones sin costo".
  - _Customer Support & Advisory Services_: Any support/advisory promise, WhatsApp number, operating hours or response SLA.
  - _Commercial Relationship_: "Authorized reseller" or "authorized brands" unless proven for every displayed brand.

## 33. Footer Contract

- **Structure**: 4 clean columns + bottom legal/payment strip.
- **Design**: Dark Obsidian background (`#09090b`), high-contrast hierarchy, restrained padding (`clamp(48px, 6vw, 80px)`).
- **Columns**:
  - _Catálogo_: Mouses, Teclados, Mousepads, Audio, Accesorios.
  - _Marcas_: Marcas disponibles en el catálogo; no authorized-reseller status is implied.
  - _Información_: Only configured routes with approved copy. Support, shipping, warranty, returns and FAQ destinations are omitted when not configured/authorized.
  - _Gamer Perú_: Nosotros, Libro de Reclamaciones, Términos y Condiciones, Privacidad.
- **Bottom Bar**: Copyright text, RUC registration, Peru payment method logos (Yape, Plin). Unapproved third-party courier or credit-card logos are omitted.

## 34. Cart & Supporting Surfaces Contract

- **Slide-Out Cart Drawer (`CartDrawer`)**:
  - Implemented in **CHK5**.
  - Triggered immediately upon Add to Cart or clicking cart icon.
  - Line items: Product image, title, variant subtitle (color/switch), price, inline quantity updater, and remove button.
  - Order Note accordion for delivery instructions.
  - Subtotal in Soles (`S/`).
  - Checkout Button: High-contrast button directing to `/checkout`.
  - Payment reminder: "Tu pedido se confirmará mediante verificación manual Yape o Plin".
  - Free shipping progress bar: Omitted unless an explicitly approved threshold policy is configured.

## 35. Multi-Brand Adaptation

Unlike WLMOUSE (which sells only its own products), Gamer Perú must balance single-brand visual luxury with multi-brand retail functionality:

- **Brand Badges**: Subtle brand link displayed above product titles on cards and PDPs.
- **Brand Pages**: Dedicated `/marcas/[slug]` landing pages with brand narrative and filtered product catalog.
- **Brand Filters**: Instant brand faceted filtering across all category and collection views.
- **Related Products**: Cross-brand compatibility (e.g. recommending a compatible mousepad on a mouse PDP).

## 36. Peru-First Adaptation

- **Currency**: Strictly Peruvian Soles (`PEN`), formatted canonically as `S/ 549.00`.
- **Payment Verification**: Prominent notice of manual Yape/Plin verification workflow; no misleading automated credit card icons.
- **Policy Adherence**: Courier, shipping coverage, delivery SLA/ETA, warranty, returns, customer support/advisory services, and authorized-reseller relationship claims derive strictly from approved policy configuration or evidence. Unapproved claims are omitted.

## 37. Data Gap Matrix

| Data Item                         | Purpose                      | Classification                                                 | Resolution Strategy                                                                                                                                                                                                                                                                                           |
| :-------------------------------- | :--------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Secondary Product Media**       | Card hover flip              | **DERIVABLE VIA ADDITIVE READ PROJECTION**                     | Join ProductMedia to MediaAsset; require `PUBLIC_MEDIA`, `IMAGE`, `ProductMedia.variantId IS NULL`; when the primary ID is non-null exclude `MediaAsset.id = products.primaryMediaId`; order by `ProductMedia.displayOrder ASC`, `ProductMedia.id ASC`; select the first key accepted by the public resolver. |
| **Card Spec Highlights**          | Polling, MCU, Switch, Weight | **DERIVABLE VIA ADDITIVE READ PROJECTION**                     | Additive read projection extracting validated category schema + `specValues`.                                                                                                                                                                                                                                 |
| **Same-Variant Display Pricing**  | Card price & compare-at      | **DERIVABLE VIA ADDITIVE READ PROJECTION**                     | Additive read projection returning `displayPrice` tuple from single deterministic variant.                                                                                                                                                                                                                    |
| **Quick-Add Variant Eligibility** | Card quick-add action        | **DERIVABLE VIA ADDITIVE READ PROJECTION**                     | Read projection returns `quickAddVariantId` iff exactly ONE eligible active variant exists.                                                                                                                                                                                                                   |
| **Homepage Featured Product**     | Purchasable home product     | **NEEDS PRESENTATION CONFIG / NO SCHEMA**                      | Explicit slug in server-side presentation config. Omitted if unpublished.                                                                                                                                                                                                                                     |
| **Homepage Shelf Products**       | Curated home shelves         | **NEEDS PRESENTATION CONFIG / NO SCHEMA**                      | Explicit slug arrays in server-side presentation config.                                                                                                                                                                                                                                                      |
| **Add-On Compatibility**          | Model-specific cross-sell    | **NEEDS PRESENTATION CONFIG / NO SCHEMA**                      | Explicit curated product-to-addon slug mapping in server config. No category inference.                                                                                                                                                                                                                       |
| **Approved Commercial Claims**    | Trust strip & announcements  | **NEEDS BUSINESS POLICY AUTHORIZATION / PRESENTATION CONFIG**  | Strictly governed by Policy-Source Rule. Unconfigured slots omitted. No schema required.                                                                                                                                                                                                                      |
| **Back-in-Stock Subscription**    | Restock notification form    | **DEFERRED**                                                   | Deferred future capability. Non-functional data collection prohibited in GP-026A.                                                                                                                                                                                                                             |
| **Color Swatch Thumbnail**        | Circular variant preview     | **DERIVABLE VIA ADDITIVE READ PROJECTION**                     | Derived from variant media or primary image using `colorway`/`color` aliases.                                                                                                                                                                                                                                 |
| **Generic Option Attributes**     | Dynamic switch/style pills   | **ALREADY AVAILABLE IN CANONICAL DATA**                        | Resolved dynamically from `ProductVariant.attributes` generic record.                                                                                                                                                                                                                                         |
| **Exact Physical Dimensions**     | Size guide schematic         | **CONDITIONALLY AVAILABLE IN CANONICAL DATA / OMIT IF ABSENT** | Read only from validated `ProductSpecificationDetail.specValues` when its category schema defines the dimensions, or the canonical `dimensions` Story payload. Never assume every Product has them.                                                                                                           |
| **Grip Recommendations**          | Product fit guidance         | **CONDITIONALLY AUTHORED PRODUCT CONTENT / OMIT IF ABSENT**    | Render only when explicitly authored for that exact Product/model. No global or category-derived recommendation.                                                                                                                                                                                              |
| **Hand-Size Recommendations**     | Product fit guidance         | **NEEDS PRODUCT AUTHORING / NO SCHEMA WHEN ABSENT**            | Render only when explicitly present for that exact Product/model. Never fabricate hand-size tiers; omission is canonical when absent.                                                                                                                                                                         |

_Note: Zero database schema changes or migrations are required for CHK0 or subsequent convergence checkpoints. All data requirements are resolved via server-side static configuration or additive read-only projections._

## 38. Domain Logic Preservation Matrix

The visual redesign preserves validated domain write behavior while authorizing additive read models:

- **Catalog Write Semantics**: Catalog mutations, admin actions, and database writes remain untouched.
- **Additive Public Read Projections**: Authorized for `ProductDiscoveryItem` (secondary media, spec highlights, display pricing tuple, `quickAddVariantId`) and PDP inventory under strict non-N+1 bounded query constraints.
- **Secondary-Media Identity**: The query compares candidate `MediaAsset.id` with `products.primaryMediaId`; it never compares `ProductMedia.id` to `MediaAsset.id` and does not expose an internal primary-media ID in the public presentation projection solely for exclusion.
- **Conditional Product Data**: Dimensions, grip guidance and hand-size guidance are omitted unless authoritative content exists for the exact Product/model. No visual-parity requirement creates schema or authorizes inference.
- **Database Schema**: PostgreSQL schema and Supabase tables remain 100% untouched.
- **Cart Engine**: `CartProvider`, `useCart`, `addItem`, `updateQuantity`, `removeItem` remain the exact state machine. Sequential cart mutations defined for add-ons.
- **Checkout & Orders**: Checkout session validation, order creation, and Yape/Plin payment verification flows remain intact.
- **Authentication & RBAC**: Supabase Auth session checks and admin role guards remain active.
- **Safe Public Media Resolver**: `resolvePublicMediaUrl` validates object keys, rejects directory traversal, rejects absolute URL injection, and rejects query/hash injection against configured public CDN/site origins. It does **NOT** generate signed URLs; GP-026A consumes only authorized `PUBLIC_MEDIA`.
- **SEO & JSON-LD**: `ProductJsonLd`, `BreadcrumbList`, and dynamic metadata generation remain intact.
- **Story Persistence**: Safe JSON validation schema for Product Story blocks remains the canonical standard.

## 39. Responsive & Mobile Contract

- **Breakpoints**:
  - `sm`: 640px (large phones / small tablets).
  - `md`: 768px (tablets portrait).
  - `lg`: 1024px (tablets landscape / small laptops).
  - `xl`: 1280px (standard desktop).
  - `2xl`: 1536px (wide screens).
  - Max page width: 2000px (matching WLMOUSE `--page-width`).
- **Touch Ergonomics**:
  - Minimum touch target: 44px x 44px for all interactive buttons, swatches, and links.
  - Safe-area-inset padding for iOS devices on fixed headers and sticky buy bars.
  - Horizontal swipe carousels utilize CSS scroll snap (`scroll-snap-type: x mandatory`).

## 40. Accessibility Contract (WCAG 2.1 AA)

- **Headings**: Single `<h1>` per page (Product Title on PDP, Brand Name on Homepage), strictly hierarchical `<h2>` and `<h3>`.
- **Keyboard Navigation**: All interactive elements (swatches, tabs, drawers, sliders) accessible via `Tab`, `Enter`, `Space`, and Arrow keys.
- **Focus Indicators**: High-contrast focus rings (`outline: 2px solid #09090b; outline-offset: 2px`).
- **Color Independence**: Color variant selections never rely on color alone; selected color name is explicitly rendered as text in the label (`Color: [Nombre]`).
- **Screen Reader Support**: Hidden `<span class="sr-only">` labels on icon buttons (Search, Menu, Cart, Close).
- **Reduced Motion**: All animations wrapped in `@media (prefers-reduced-motion: reduce)` disabling non-essential motion.

## 41. SEO Contract

- **Server-First Rendering**: Homepage, Category pages, Brand pages, and PDPs remain 100% Server Components with minimal Client Component leaf boundaries.
- **Structured Data**: Canonical `Product`, `Offer`, `BreadcrumbList`, and `Organization` JSON-LD schemas validated.
- **Crawlable URLs**: All product cards and category navigation items contain legitimate `<a href="...">` links.
- **Meta Tags**: Dynamic Open Graph and Twitter Card tags with high-res product imagery and currency specifications.

## 42. Performance Contract

- **LCP Target**: < 2.5 seconds on 4G mobile and desktop.
- **Responsive Images**: Every image leverages `next/image` with tailored `sizes` attribute and modern formats (`AVIF` / `WebP`).
- **Priority Loading**: Hero campaign images and PDP primary gallery images marked with `priority`.
- **Below-the-Fold Media**: Lazy-loaded with blur placeholders or native browser lazy loading.
- **Zero Monolithic Client Conversion**: Only interactive leaves (`VariantSelector`, `QuantityInput`, `CartDrawer`, `StickyBuyBar`) use `"use client"`.

## 43. Motion Contract

- **Timing Curves**: Snappy cubic-bezier curves (`cubic-bezier(0.16, 1, 0.3, 1)`) matching WLMOUSE Concept theme.
- **Durations**:
  - Instant: 150ms for hover states and button presses.
  - Standard: 250ms for menu drawer slides and dropdown transitions.
  - Moderate: 350ms for gallery slides and modal fade-ins.
- **Split-Words Effect**: Subtle fade-up reveal on product titles.

## 44. Visual Fidelity Metrics

Convergence will be evaluated against live WLMOUSE captures across:

- **Desktop (1440px / 1920px)**: Proportions, two-column ratios (58/42), whitespace rhythm, typography hierarchy.
- **Tablet (768px / 1024px)**: Transition from two-column to stacked layout, grid collapse.
- **Mobile (390px / 430px)**: 100vw gallery slider, touch swatches, sticky bottom buy bar.

## 45. Visual Regression Methodology

During implementation checkpoints (CHK1–CHK6), visual verification will follow a strict protocol:

1. Capture screenshots of live WLMOUSE reference pages at identical viewport widths (`1440px` desktop, `390px` mobile).
2. Capture screenshots of Gamer Perú implementation at the same viewports.
3. Compare typography scale, section padding, component anatomy, and whitespace side-by-side.
4. Document documented deltas and obtain owner sign-off before closure.

## 46. Copyright & Brand Boundary

- **Permitted**:
  - Adopting generic e-commerce layout patterns, component structures, spacing rhythms, and typography scales.
  - Using open-source geometric fonts (`Inter`, `Plus Jakarta Sans`).
  - Adapting hardware specification highlight concepts and gallery mechanics.
- **Strictly Prohibited**:
  - Copying proprietary WLMOUSE Shopify theme Liquid/JS source code.
  - Copying WLMOUSE copyrighted marketing copy, slogans, or trademarks.
  - Using WLMOUSE logos or proprietary 3D renders as Gamer Perú branding assets.

## 47. Security Boundaries

- Server-side authorization, price verification, and cart integrity remain strictly enforced.
- The public media resolver validates object keys, rejects directory traversal, and rejects absolute/query injection against configured public origins. No private assets are exposed.
- Sanitized HTML rendering for any user-supplied or rich-text story content.

## 48. Testing Strategy

- **Automated Validation**:
  - Unit tests for new components (`ProductCardV2`, `VariantSelectorV2`, `StickyBuyBar`, additive read projections).
  - End-to-end Playwright tests (`pnpm test:e2e`) verifying cart addition, variant switching, drawer opening, and checkout navigation.
  - Lint and type checks (`pnpm check`).
- **Manual Verification**:
  - Viewport testing across Chromium, Safari/WebKit, and Firefox.
  - Mobile touch testing on simulated iOS and Android viewports.

## 49. Implementation Gate Plan

The gate sequence is strictly ordered to prevent forward dependencies or temporary duplicate components:

- **CHK0 (Current)**: Discovery, WLMOUSE Reference Audit, Existing Codebase Audit, Visual Convergence Contract Freeze. (Documentation only, zero runtime delta).
- **Authorization Boundary**: The CHK1–CHK6 descriptions below are sequencing contracts only. This CHK0-BR3 candidate does not authorize any implementation gate.
- **CHK1**: Global Shell & Homepage Visual Foundation:
  - Refactor `SiteHeader`, `AnnouncementBar` (Policy-Source Rule), `MobileDrawer`, and `SiteFooter`.
  - Rebuild `HomePage` foundation: campaign Hero, visual category doors, non-transactional editorial bands, comparison slider, BrandDiscovery, and visual slot-based TrustStrip (rendering only currently approved commercial facts).
  - _Strict Exclusions_: CHK1 does NOT implement ProductCard V2, final product shelves, quick-add cards, or purchasable FeaturedProduct commerce logic.
- **CHK2**: Product Card V2, Discovery Read Projection, Catalog Discovery Surfaces & Homepage Shelves:
  - Implement additive `ProductDiscoveryProjection` (`secondaryMedia`, `specHighlights`, `displayPrice` tuple, `quickAddVariantId`).
  - Implement `ProductCard` V2 with hover flip, spec carousel, and deterministic quick-action button ("Añadir al carrito" for single-variant items, "Ver opciones" linking to PDP for multi-variant items).
  - Refactor Category (`/categorias/[slug]`), Brand (`/marcas/[slug]`), and Search (`/buscar`) grids.
  - Implement Homepage product shelves (_Mouses_, _Teclados_, _Mousepads_) canonically using ProductCard V2.
- **CHK3**: Shared Product Commerce Convergence, PDP V2 Commerce Shell, & Homepage Featured Product:
  - Rebuild PDP top section: full-width adaptive gallery, sticky commerce panel, visual thumbnail swatches, generic option pills, quantity counter, sticky buy bar, and static payment trust box.
  - Implement curated model-specific Add-ons module with sequential cart mutations.
  - Implement Sold Out state (Back-in-Stock subscription deferred).
  - Implement Homepage FeaturedProduct commerce section by reusing these exact shared commerce primitives (zero duplicated commerce code).
- **CHK4**: Public Product Story Renderer Convergence:
  - Redesign public renderers for all 13 canonical Story block types for high-impact editorial presentation.
- **CHK5**: Cart Drawer, Supporting Storefront Surfaces & Mobile Touch Ergonomics:
  - Refine `CartDrawer` with instant line-item controls.
  - Implement `SearchDrawer` with predictive search.
  - Complete mobile touch ergonomics (sticky mobile buy bar, drawer transitions).
- **CHK6**: Cross-Surface Visual Regression, Performance, Accessibility, SEO & Closure:
  - Full side-by-side screenshot verification, performance audits (LCP/CLS), WCAG 2.1 AA accessibility audit, and formal GP-026A Closure Report.

## 50. Freeze Rules

- **Zero Runtime Delta in CHK0**: No production code, no test modifications, no CSS changes, no database migrations.
- **Zero Schema Change**: Existing PostgreSQL schema is frozen; all visual convergence data is derived safely from server configuration or additive read projections.
- **Domain Write Preservation**: Cart calculations, variant resolution, auth sessions, and order management logic must remain unmodified during presentation refactoring.
- **No Duplicate Commerce Implementations**: Commerce primitives must be built once in CHK3 and reused by both PDP and Homepage FeaturedProduct.

## 51. Explicit Non-Goals

- Admin UI redesign (Admin is internal and functional).
- Direct pixel-for-pixel copyright clone of WLMOUSE proprietary assets.
- Automated third-party payment gateway integrations.
- Non-functional Back-in-Stock contact collection forms without durable authorized backend destination.
- Hardcoding unapproved commercial policies, couriers, SLAs, or warranty durations.
- Temporary duplicate card or commerce implementations in CHK1.

## 52. Open Owner Decisions

1. **Approved Business Policies**: When commercial policies for shipping carriers, delivery SLAs, warranty duration terms, and customer support channels are officially authorized by the owner, they will be supplied to the Policy-Source configuration. Until then, the storefront strictly omits them.
2. **Back-in-Stock System Architecture**: Authorized backend gate defining database storage, customer consent, privacy, and email/SMS notification dispatch for restocked items (deferred to a future roadmap gate).

## 53. Acceptance Criteria

- [x] Canonical origin/main commit `03598514ffced3ee854bc5a7a715362683383100` verified and clean branch created.
- [x] Fresh audit of live `https://www.wlmouse.com/` conducted and documented across all major surfaces.
- [x] Audit of existing Gamer Perú storefront code conducted with detailed divergence analysis.
- [x] ROADMAP.md updated to insert GP-026A between GP-025 and GP-026 without renumbering later gates.
- [x] GP-026.md updated to paused status pending GP-026A.
- [x] Implementation gate ordering strictly aligned: CHK1 visual foundation only; CHK2 owns ProductCard V2, additive projections, and Homepage shelves; CHK3 owns shared commerce primitives, PDP shell, and Homepage FeaturedProduct commerce.
- [x] Duplicate card or commerce implementations across CHK1 and later gates strictly prohibited.
- [x] Policy-Source Rule solidified: visual slot architecture defined; unconfigured slots omit rendering; unapproved claims (couriers, 24h SLA, 12m warranty, support channels) classified as non-renderable TBD examples.
- [x] TrustStrip default rendering restricted to currently approved facts (PEN prices, manual Yape/Plin verification, neutral multi-brand catalog identity); support/advisory and authorized-reseller claims removed, and every unconfigured slot omitted from the DOM.
- [x] Authoritative Quick-Add contract established: direct Quick Add allowed ONLY when exactly ONE eligible sellable active variant exists (`quickAddVariantId: UUID`); multi-variant or ambiguous products link to PDP ("Ver opciones"); no arbitrary variant selection.
- [x] Same-variant display pricing rule established: displayed selling price and compare-at price derive from the same deterministic variant (`displayPrice` tuple, tie-breaker: `priceCents ASC`, `displayOrder ASC`, `id ASC`).
- [x] Secondary media eligibility enforced with canonical identity: `ProductMedia` joined to `MediaAsset`; `PUBLIC_MEDIA`, `IMAGE`, `variantId IS NULL`; when the primary ID is non-null, candidate `MediaAsset.id != products.primaryMediaId`; deterministic `ProductMedia.displayOrder`/`ProductMedia.id`; public resolver; null/omitted hover fallback.
- [x] Data-gap matrix classifications corrected to reflect repository reality, including conditional dimensions and Product-authored grip/hand guidance with omission when absent.
- [x] Zero production code delta, zero test code delta, zero CSS delta, zero schema delta, zero migration delta.
- [x] Code formatting passes (`pnpm format:check`) and git diff is clean.
