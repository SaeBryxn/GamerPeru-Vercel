# GP-026A Contract --- WLMOUSE Storefront Visual Convergence

## 1. Status

IN DISCOVERY / CONTRACT CANDIDATE / PENDING EXTERNAL APPROVAL

## 2. Canonical Baseline

- **Repository**: `latamcreativa/GamerPeru`
- **Baseline Commit (origin/main)**: `03598514ffced3ee854bc5a7a715362683383100` (`docs(roadmap): close GP-025 with external approval [skip ci]`)
- **Working Branch**: `audit/gp026a-chk0`
- **Branch Lineage**: Branched strictly and directly from commit `03598514ffced3ee854bc5a7a715362683383100`.
- **Zero-Candidate Isolation**: Completely isolated from unmerged GP-026 candidate `e239298b01e6b0eb409118dc6b5e31c1ce75b9ae` and experimental branches `audit/gp026-chk0` / `audit/gp026-chk0-br1`.

## 3. Owner Intent

The project owner has explicitly established that the current customer-facing storefront of Gamer Perú is not visually satisfactory and that the binding visual and user-experience benchmark is the public digital property of **WLMOUSE** (`https://www.wlmouse.com`).

The mandate is **HIGH-FIDELITY STOREFRONT CONVERGENCE**:

- Equivalent component inventory where applicable across all major public surfaces.
- Equivalent information hierarchy, prioritizing industrial hardware design, materials, and competitive specifications.
- Equivalent composition and product-first visual dominance over generic promotional banners or abstract graphics.
- Closely matched layout proportions, grid densities, and maximum content bounds.
- Closely matched spacing rhythm and fluid clamp curves.
- Closely matched typography scale, letter-spacing, line-heights, and hierarchical contrast.
- Closely matched product-card anatomy (including horizontal specification highlight carousels).
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

GP-026A preserves 100% of the underlying state, queries, and business logic of these gates, while replacing their visual presentation components with WLMOUSE-converged implementations.

## 8. Relationship to GP-026

- **Status**: GP-026 is officially **PAUSED / BLOCKED BY GP-026A**.
- **Lineage Boundary**: The rejected/unmerged GP-026 CHK0 candidate commit (`e239298b01e6b0eb409118dc6b5e31c1ce75b9ae`) carries zero authority.
- **Scope Boundary**: GP-026A owns the **customer-facing presentation** of all 13 canonical Story block types. GP-026 owns the **Admin authoring interface** (block insertion, ordering, preview, draft persistence, publishing).
- **Post-GP-026A Action**: When GP-026A closes, GP-026 discovery will be freshly executed against the finalized public Story components.

## 9. Current GamerPeru Storefront Reality

A comprehensive code audit of `src/app/(storefront)` and `src/components/*` reveals the following divergence from WLMOUSE:

1. **Homepage Dominance**: Current homepage (`src/components/home/*`) relies on abstract geometric wireframes (`media: { kind: "abstract" }`) and generic textual callouts rather than real hardware photography, video loops, and purchasable product sections.
2. **Product Card Anatomy**: Current `ProductCard` (`src/components/catalog/product-card/product-card.tsx`) renders a static 4:5 image without hover flip, lacking technical specification highlight carousels, sale badges, and quick-action buttons.
3. **PDP Commerce Anatomy**: Current `ProductCommercePanel` renders basic radio buttons without visual image-swatches for colors, lacks top-of-panel spec highlight pills, lacks an inline quantity counter, lacks a sticky purchase bar on scroll, and lacks add-ons/accessories modules.
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

1. **Announcement Bar**: Multi-message ticker/slide with announcement text, shipping notes, and links.
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
15. **Trust Strip (`multicolumn-with-icons`)**: 4-item horizontal value proposition strip (Shipping, Authenticity, Guarantee, Direct Support).
16. **Minimalist Footer (`footer` + `footer-copyright`)**: Clean multi-column directory, newsletter input, and copyright notice.

## 12. Current WLMOUSE Navigation Inventory

- **Header Structure**: Sticky header (`is="sticky-header"`), transparent on hero scroll, solid on background content, height ~64px desktop / ~56px mobile.
- **Logo Treatment**: Centered wordmark typography, clean uppercase, letter-spaced.
- **Left Utilities**: Instant search icon drawer button + hamburger navigation drawer button.
- **Desktop Navigation**: Horizontal product-family links with subtle hover underlines and dropdown mega-menus containing product family cards with images.
- **Right Utilities**: Country/Currency selector (`USD $`), Account login link, and slide-out Cart Drawer button with live badge counter.
- **Search Drawer**: Slide-down or slide-in drawer with live predictive search, showing query results grouped by Products, Collections, and Articles with live pricing and thumbnails.
- **Cart Drawer**: Slide-out right panel (`cart-drawer`), free shipping threshold progress bar, line items with image, variant subtitle, quantity counter, remove button, discount code accordion, order notes, and checkout CTA.

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
  - **Spec Highlight Carousel (`scroll-shadow` + `icons-carousel`)**: Horizontal scrollable container below title/price displaying 3–5 key technical attributes:
    - SVG icon (24x24) + Category attribute name (`Polling Rate`, `MCU`, `Material`, `Switch`, `Sensor`).
    - Attribute value (`8K Wireless`, `Nordic 54L15`, `Magnesium Alloy`, `Omron Optical`).
    - Horizontal scroll with left/right fade masks (`scroll-shadow`).

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
  - **Price Cluster**: Strikethrough regular price, prominent sale price, installment text.
  - **Spec Highlight Badges**: Category-specific hardware pill badges (e.g. `39g Ultra-light`, `PAW3950HS`, `8000Hz Polling`, `Nordic 54L15`).
  - **Color Selector**: Circular thumbnail swatches (`swatches--round`) with active ring outline, tooltip on hover, and selected color name displayed in the label (`Color: Black Gold`).
  - **Switch / Technical Option Selector**: Pill buttons (e.g. `OMRON Opticals`, `TTC Mechanicals`) with active solid background.
  - **Side Style / Size Selector**: Pill buttons (e.g. `Side Slits`, `Solid Sides`).
  - **Quantity Selector**: Compact inline counter with minus, numeric input, and plus buttons.
  - **Primary CTA**: Full-width high-contrast button (`Add to cart` / `Sold Out` / `Notify me when it’s available`).
  - **Express Checkout**: Secondary button for accelerated checkout.
  - **Sticky Purchase Bar (`product-sticky-form`)**: Floats at the top or bottom of the viewport when scrolling past the main buy button, displaying product thumbnail, title, price, and instant Add to Cart.
  - **Trust & Assurance**: Secure checkout badges, local delivery estimates, and authenticity guarantee.
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
- **Mobile Product Card**: Quick-action button is permanently accessible or simplified to an icon, spec highlight strip scrolls horizontally via touch with subtle edge fade.
- **Mobile PDP Commerce**:
  - Gallery becomes a 100vw horizontal touch carousel with pagination dots.
  - Commerce panel stacks directly beneath gallery with comfortable touch targets (minimum 44x44px).
  - Swatches expand to full-width wrap.
  - Sticky bottom action bar (`product-sticky-form`) anchors to the bottom of the mobile viewport, providing instant Add-to-Cart without scrolling back up.
- **Mobile Story Blocks**: Full-bleed media retains edge-to-edge impact; multi-column spec grids collapse cleanly to 1-column or 2-column cards; stat callouts stack vertically.

## 16. ADOPT / ADAPT / REJECT Matrix

| Category              | Reference Feature (WLMOUSE)                  | Gamer Perú Decision | Architectural Justification                                                                                                       |
| :-------------------- | :------------------------------------------- | :------------------ | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Branding**          | Single-brand manufacturer identity           | **REJECT**          | Gamer Perú is a multi-brand retailer representing WLMOUSE, Lamzu, Ninjutso, Pulsar, etc. Brand labeling must remain clear.        |
| **Color System**      | Monochrome base with rose/amber accents      | **ADAPT**           | Adopt monochrome black/white base (`#09090b` / `#ffffff`), but use Gamer Perú Signal Crimson (`#e11d48`) for action/sale accents. |
| **Typography**        | Inter with tight heading tracking            | **ADOPT**           | Adopt clean geometric grotesque (`Inter` / `Plus Jakarta Sans`), -0.03em tracking on headings, 1.0–1.2 line heights.              |
| **Product Dominance** | Large-scale hardware media as primary visual | **ADOPT**           | Eliminate abstract SVG wireframes; use real high-resolution hardware photography and video for all key stages.                    |
| **Product Card V2**   | Spec carousel + hover flip + quick options   | **ADOPT**           | Full adoption of WLMOUSE card structure adapted to multi-brand data and Soles currency.                                           |
| **PDP Commerce**      | Sticky buy panel + swatches + spec pills     | **ADOPT**           | Full adoption of WLMOUSE top commerce anatomy, integrating existing Gamer Perú cart state.                                        |
| **Sticky Buy Bar**    | Floating purchase bar on scroll              | **ADOPT**           | Essential conversion feature for long PDPs on desktop and mobile.                                                                 |
| **Homepage Commerce** | Purchasable product on homepage              | **ADOPT**           | Embed fully functional featured product commerce block on homepage.                                                               |
| **Currency / Pay**    | USD / Klarna / AfterPay / Shopify Pay        | **REJECT**          | Gamer Perú operates in Peruvian Soles (`PEN`) with manual Yape/Plin verification.                                                 |
| **Shipping Policy**   | Global 103-country international courier     | **REJECT**          | Gamer Perú operates Lima same-day/next-day and Olva/Shalom national province shipping.                                            |
| **Navigation**        | Brand product-family hierarchy               | **ADAPT**           | Adapt single-brand family menus into multi-brand category + curated brand showcase menus.                                         |
| **Story Blocks**      | Concept theme proprietary liquid sections    | **ADAPT**           | Rebuild presentation of Gamer Perú's 13 canonical Story block types to match WLMOUSE editorial impact.                            |
| **Search / Cart**     | Slide-out drawers with instant search/cart   | **ADOPT**           | Adopt slide-out drawer pattern for both search and cart.                                                                          |

## 17. Component Parity Matrix

| WLMOUSE Component           | Gamer Perú Current     | Action       | Domain Logic Source                | Visual Target                                                     | Responsive Target                                   | Accessibility Req                  | Data Requirement          | Implementation Gate | Notes                       |
| :-------------------------- | :--------------------- | :----------- | :--------------------------------- | :---------------------------------------------------------------- | :-------------------------------------------------- | :--------------------------------- | :------------------------ | :------------------ | :-------------------------- |
| `announcement-bar`          | `AnnouncementBar`      | **REFACTOR** | `NAVIGATION_CONFIG`                | Slim 36px high-contrast bar, multi-message rotation               | Auto-fit text, hide secondary links on small mobile | ARIA live region for ticker        | String array or config    | CHK1                | Preserves existing links    |
| `sticky-header`             | `SiteHeader`           | **REFACTOR** | `NAVIGATION_CONFIG`                | 64px height, minimalist layout, 1.5px stroke icons                | 56px height, compact utilities                      | Semantic `<header>`, focus-visible | Navigation config         | CHK1                | Preserves skip-link         |
| `menu-drawer`               | `MobileDrawer`         | **REFACTOR** | `NAVIGATION_CONFIG`                | Full-height slide-in, clean typography, category accordions       | Full viewport width mobile                          | Focus trap, `Escape` key close     | Navigation config         | CHK1                | Touch ergonomics            |
| `slideshow_hero`            | `HomeHero`             | **REPLACE**  | `HOMEPAGE_DATA`                    | Full-bleed real hardware hero, bold typography, high-contrast CTA | 4:5 vertical framing on mobile                      | Accessible heading hierarchy       | Flagship product media    | CHK1                | Eliminates abstract media   |
| `collection-list`           | `CategoryShowcase`     | **REFACTOR** | `HOMEPAGE_DATA`                    | Visual hardware category tiles with real hardware photography     | 2-column mobile grid                                | Semantic list `<nav>`              | Category catalog          | CHK1                | Real category imagery       |
| `featured_product`          | None                   | **CREATE**   | Catalog query / `getCachedProduct` | Purchasable featured product on home (swatches, quantity, CTA)    | Stacked layout, touch swatches                      | Full keyboard form controls        | Flagship product ID       | CHK1                | Crucial WLMOUSE pattern     |
| `image-comparison`          | None (in home)         | **CREATE**   | Presentation seed / story          | Interactive before/after split slider                             | Touch-drag handle                                   | Slider ARIA role, keyboard arrows  | Dual media URLs           | CHK1                | Visual hardware proof       |
| `featured_collection`       | `CuratedGear`          | **REFACTOR** | Catalog queries                    | 4-column product shelf with ProductCard V2                        | 2-column or touch swipe shelf                       | Carousel ARIA controls             | Curated product slugs     | CHK1                | Hardware-first              |
| `images_with_text`          | `TechnicalEditorial`   | **REFACTOR** | Presentation seed                  | "Built with..." high-contrast dark section, exploded frame media  | Single-column stacked                               | Semantic text & image alt          | Technical copy & media    | CHK1                | Engineering focus           |
| `multicolumn-with-icons`    | `HomeDiscoveryFooter`  | **REFACTOR** | Static trust config                | 4-column horizontal trust strip with 1.5px stroke icons           | 2x2 grid on mobile                                  | Semantic icons + text              | Peruvian trust facts      | CHK1                | Yape/Plin, Olva, Garantía   |
| `footer`                    | `SiteFooter`           | **REFACTOR** | `NAVIGATION_CONFIG`                | Minimalist dark footer, structured columns, copyright bar         | Collapsible accordions on mobile                    | Semantic links                     | Footer config             | CHK1                | Clean multi-brand links     |
| `product-card`              | `ProductCard`          | **REPLACE**  | `ProductDiscoveryItem`             | Aspect-adapt image, hover flip, quick options button, price row   | Compact card, mobile-optimized                      | Accessible links, proper heading   | Primary + secondary media | CHK2                | Clean industrial design     |
| `icons-carousel`            | None                   | **CREATE**   | `product.specifications`           | Horizontal spec highlight strip (polling, MCU, switch, weight)    | Horizontal touch scroll with fade masks             | Accessible text descriptions       | Category spec fields      | CHK2                | Distinctive WLMOUSE feature |
| `facets-topbar`             | `DiscoveryToolbar`     | **REFACTOR** | Catalog URL params                 | Sticky minimal bar with filter count and sort dropdown            | Compact sticky header                               | ARIA menu / listbox                | Filter state              | CHK2                | Minimal clutter             |
| `drawer-element` (filter)   | `FilterDrawer`         | **REFACTOR** | Catalog facets                     | Slide-out filter drawer with clean check pills and price range    | Full-screen drawer                                  | Focus trap, accessible inputs      | Active facet counts       | CHK2                | Seamless filtering          |
| `search-drawer`             | Basic search           | **CREATE**   | `useSearch` / API                  | Slide-out instant predictive search with thumbnail results        | Full-screen mobile search                           | Search landmark, aria-expanded     | Product index search      | CHK2 / CHK5         | Instant feedback            |
| `media-gallery`             | `ProductMediaGallery`  | **REFACTOR** | `ProductMedia[]`                   | Large adaptive gallery, thumbnail strip, zoom modal               | 100vw touch slider with dots                        | Full keyboard navigation           | High-res media assets     | CHK3                | Visual hardware dominance   |
| `product-info`              | `ProductCommercePanel` | **REFACTOR** | `ProductDetailView` + `useCart`    | Sticky commerce column, bold title, pricing cluster, spec pills   | Standard flow above story                           | Semantic form, live regions        | Product + variant data    | CHK3                | Core commerce engine        |
| `variant-picker` (swatches) | `VariantSelector`      | **REFACTOR** | `ProductVariantDetail[]`           | Circular image swatches with tooltips and active rings            | Touch-friendly swatches (44px)                      | Radio group ARIA semantics         | Variant media objects     | CHK3                | Real color previews         |
| `variant-picker` (pills)    | `VariantSelector`      | **REFACTOR** | `ProductVariantDetail[]`           | Tactile option pills for switches, side styles, layouts           | Wrap pills                                          | Radio group ARIA semantics         | Variant option values     | CHK3                | Clean tactile selection     |
| `quantity-input`            | None (fixed 1)         | **CREATE**   | `useCart.addItem`                  | Inline counter with `-`, numeric input, `+`                       | 44px touch targets                                  | `aria-label`, numeric constraints  | Item quantity state       | CHK3                | Customer purchase control   |
| `product-sticky-form`       | None                   | **CREATE**   | Active variant + `useCart`         | Floating bar on scroll with thumbnail, price, Add to Cart         | Fixed bottom mobile dock                            | Focus management                   | Active variant state      | CHK3                | Conversion recovery         |
| `share-drawer` / modal      | None                   | **CREATE**   | Web Share API / fallback           | Minimal share popover/drawer with copy link                       | Native mobile share sheet                           | Dialog ARIA semantics              | Page canonical URL        | CHK3                | Viral social sharing        |
| `cart-drawer`               | `CartDrawer`           | **REFACTOR** | `useCart`                          | Slide-out drawer, free shipping bar, item cards, checkout CTA     | Full mobile drawer                                  | Focus trap, live announcements     | Cart session items        | CHK5                | Instant frictionless cart   |
| Story Block Renderers (13)  | `ProductStoryRenderer` | **REFACTOR** | `ProductStory` JSON                | High-contrast editorial spreads, large typography, stat counters  | Responsive stacked layouts                          | Accessible semantic headings       | Story JSON payloads       | CHK4                | Full public convergence     |

## 18. Global Shell Contract

- **Announcement Bar**:
  - Height: 36px fixed.
  - Colors: Dark Obsidian background (`#09090b`), White text (`#ffffff`), Crimson link hover (`#e11d48`).
  - Content: 2–3 rotating announcements (e.g. "Envíos a todo el Perú vía Olva y Shalom", "Pagos seguros con Yape y Plin", "Garantía local y soporte técnico en Lima").
- **Header**:
  - Height: 64px desktop / 56px mobile.
  - Background: Semi-transparent blur (`backdrop-filter: blur(12px)`) over hero; solid white (`#ffffff`) on page scroll with subtle bottom border (`#e4e4e7`).
  - Layout: Left: Search icon + Hamburger menu. Center: Gamer Perú logo wordmark. Right: Multi-brand navigation links, Account icon, Cart Drawer button with item counter.
  - Iconography: Restrained 1.5px stroke geometry (Lucide icons standardized to 20px / 1.5px stroke).
- **Navigation Architecture**:
  - Primary Categories: _Mouses_, _Teclados_, _Mousepads_, _Audio_, _Accesorios_.
  - Curated Brands dropdown: _WLMOUSE_, _Lamzu_, _Pulsar_, _Ninjutso_, _ATK_, _VXE_.
  - Visual Mega-Menu: Multi-column panel showing category links alongside a featured product image card.
- **Footer**:
  - Background: Dark Obsidian (`#09090b`), text in muted slate (`#a1a1aa`), headings in crisp white (`#f4f4f5`).
  - Columns: Navegación, Marcas, Soporte y Garantía, Gamer Perú (Libro de Reclamaciones, Términos).
  - Bottom Bar: Copyright notice, RUC declaration, Peru payment method logos (Yape, Plin, Transferencias).

## 19. Homepage Contract

The homepage must be restructured to eliminate abstract wireframe placeholders and adopt the WLMOUSE editorial rhythm:

1. **Hero Stage (`HomeHero`)**:
   - High-contrast visual stage with real product photography/video.
   - Headline: Max font-size `clamp(2.5rem, 5vw, 4.5rem)`, -0.035em tracking.
   - Dual CTAs: Primary solid button (`Explorar Mouses`) + Secondary outline button (`Ver Lanzamientos`).
2. **Visual Category Doors (`CategoryShowcase`)**:
   - 5 hardware category cards displaying high-detail hardware cutouts on neutral tinted cards (`#f4f4f5` / `#121215`).
3. **Purchasable Featured Product (`FeaturedProductSection`)**:
   - Embeds a flagship peripheral directly on the homepage.
   - Allows users to select colors via image swatches, inspect specs, and click `Añadir al Carrito`.
4. **Interactive Comparison Slider (`ProductComparisonSection`)**:
   - Interactive split-slider showcasing hardware engineering (e.g. solid shell vs. honeycomb magnesium cutouts).
5. **Curated Product Shelves (`ProductShelf`)**:
   - 3 curated shelves: _Mouses Competitivos_, _Teclados Rapid Trigger_, _Superficies & Mousepads_.
   - Rendered using `ProductCard` V2.
6. **Technical Engineering Band (`TechnicalEditorial`)**:
   - Full-width dark section (`#09090b`) detailing lightweight alloy structures, sensor precision (PAW3950), and 8K polling rate.
7. **Multi-Brand Showcase (`BrandDiscovery`)**:
   - Clean grid of authorized boutique brands.
8. **Trust Strip (`TrustStrip`)**:
   - 4-column value propositions: _Envíos Seguros a Todo el Perú_, _Garantía Local Gamer Perú_, _Verificación Manual Yape/Plin_, _Soporte Competitivo Dedicado_.

## 20. Product Card V2 Contract

The `ProductCard` component will be completely rebuilt to match the live WLMOUSE card anatomy:

- **Geometry & Aspect Ratio**: Adaptive 1:1 or 4:5 image container with neutral light gray background (`#f8f8f8`).
- **Media Behavior**:
  - Primary image: High-res hardware silhouette.
  - Secondary image: Alternate angle (bottom plate, side view, or sensor detail) fading in smoothly on hover (`transition: opacity 300ms ease`).
- **Quick-Action Hover Button**:
  - Floating button at bottom of image ("Ver opciones" / "Añadir al carrito"), sliding up on hover (`transform: translateY(0)`).
  - On mobile: Touch-accessible action or persistent minimal cart icon.
- **Quick View Eye Button**:
  - Discrete icon button top-right, fading in on desktop hover, opening quick-view modal.
- **Card Content Row**:
  - Title: Left-aligned or balanced, `font-weight: 500`, `font-size: 0.9375rem`, color `#09090b`.
  - Brand Eyebrow: Subtle brand link above title (`#71717a`, uppercase, `0.6875rem`).
  - Price: Clean pricing display. Strikethrough regular price (`#71717a`) when on sale, prominent bold price (`#09090b` or `#e11d48` when discounted).
- **Horizontal Spec Highlight Carousel (`scroll-shadow` + `icons-carousel`)**:
  - Positioned directly below title/price block.
  - Horizontal scrollable row displaying 3–5 category-specific technical attributes with 20px SVG icons.
  - Gradient fade masks on left and right edges indicating scrollability.

## 21. Category & Brand Collection Contract

- **Top Toolbar**:
  - Sticky minimal bar with active product count, filter drawer trigger button with active badge count, and sorting dropdown.
- **Grid Density**:
  - Desktop (>= 1280px): 4 columns.
  - Tablet (768px – 1024px): 3 columns.
  - Mobile (< 768px): 2 columns.
- **Filter Drawer**:
  - Slide-out right drawer with accordions for:
    - _Disponibilidad_: En stock / Por encargo.
    - _Rango de Precio_: Dual range slider in Soles.
    - _Marca_: Checkbox list for multi-brand catalog.
    - _Switches_: Ópticos / Mecánicos / Magnéticos Hall Effect.
    - _Peso_: Ultraligero (<40g, 40-50g, >50g).
    - _Conectividad_: Inalámbrico 8K / Cableado.
- **Brand Pages (`/marcas/[slug]`)**:
  - Hero banner with brand logo, brand origin, and brand manifesto.
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

The Product Detail Page top section will be completely restructured into two synchronized columns:

- **Desktop Proportions**: 58% Gallery / 42% Sticky Commerce Panel (`max-width: 1440px`, centered, padding `clamp(20px, 3vw, 48px)`).
- **Column Behavior**:
  - Gallery column scrolls naturally or presents high-impact hardware media.
  - Commerce panel remains sticky (`position: sticky; top: 80px; align-self: start;`) so buy actions remain in view.

## 24. Gallery Contract

- **Structure**: High-impact media stage with primary active image, thumbnail rail (desktop side or bottom, mobile horizontal swipe), and full-screen lightbox magnification.
- **Adaptive Ratios**: Preserves hardware silhouette without awkward cropping (`object-fit: contain` on clean white/subtle gray canvas).
- **Variant Sync**: When the user clicks a color swatch, the gallery automatically scrolls/switches to the corresponding variant photo.
- **Mobile Touch**: 100vw edge-to-edge touch carousel with pagination indicator dots.
- **Zoom / Lightbox**: Click-to-zoom opens full-screen high-resolution modal with pan/pinch capability.

## 25. Spec-Highlight Contract

- **Position**: Located directly below the product title/price cluster at the top of the commerce panel.
- **Visual Design**: Horizontal row or 2x2 grid of compact hardware spec badges (e.g. `⚡ 39g Ultraligero`, `🎯 PAW3950 30K DPI`, `📶 8000Hz Polling Rate`, `🕹️ Omron Ópticos`).
- **Category-Aware Mapping**:
  - _Mouses_: Peso (g), Sensor, Polling Rate, Switches, Conectividad.
  - _Teclados_: Switches (Magnéticos/Mecánicos), Rapid Trigger, Material (Carbono/Aluminio), Layout.
  - _Mousepads_: Superficie (Control/Speed), Base (Poron), Grosor, Dimensiones.
  - _Audio_: Drivers (Híbrido DD+BA), Impedancia, Conexión.
  - _Accesorios_: Compatibilidad, Material.

## 26. Variant / Option-Selector Contract

- **Color Swatches (`swatches--round`)**:
  - Circular buttons (36px desktop / 44px mobile) with high-resolution image thumbnail background.
  - Active state: Distinctive double-ring outline (`ring-2 ring-offset-2 ring-black`).
  - Label: Displays selected color name dynamically (e.g. `Color: Negro Obsidiana`).
  - Hover tooltip: Tooltip displaying the color variant name.
- **Technical Option Selectors (Switches / Side Style / Size)**:
  - Tactile pill buttons (`padding: 8px 16px; border-radius: 6px; font-size: 0.875rem;`).
  - Active state: Solid black background with white text (`bg-black text-white`).
  - Inactive state: Bordered button (`border border-zinc-300 text-zinc-900 hover:border-black`).
  - Disabled/Out-of-Stock state: Strikethrough diagonal line with subtle opacity.

## 27. Add-Ons Contract

- **Cross-Sell Module**: Located directly above or below the primary Add to Cart button.
- **Items**: 1–2 essential accessories (e.g. _Skates de Vidrio / PTFE para Beast X_, _Grip Tape Oficial_, _Dongle 8K Cat LCD_).
- **Interaction**: Checkbox with thumbnail, accessory title, and price (`+ S/ 49.00`). Checking the box bundles the accessory into the cart addition.

## 28. Quantity & Purchase Contract

- **Quantity Selector**:
  - Inline component: Minus button (`-`), numeric input, Plus button (`+`).
  - Minimum 1, maximum matching available inventory.
  - Height matched to primary Add to Cart button (48px).
- **Primary Action Button (`Add to Cart`)**:
  - High-contrast solid black button (`bg-black text-white hover:bg-zinc-800`), 48px height, 6px border radius, bold typography.
  - Loading state: Subtle spinner with "Añadiendo...".
  - Success state: Automatically opens Cart Drawer with added item highlighted.
- **Profile Required Box**:
  - When user profile is incomplete (from GP-015/016), displays clear prompt with "Completar perfil" button.

## 29. Availability & Notify Contract

- **Active Stock**: Add to Cart button enabled with clear stock indicator ("En stock en Lima — Envío inmediato").
- **Low Stock**: Alert badge when stock <= 3 ("¡Últimas unidades disponibles!").
- **Sold Out State**:
  - Add to Cart button disabled and replaced with "Agotado".
  - "Notificarme cuando esté disponible" button opens back-in-stock notification drawer/modal.
  - Collects customer email/phone for notification when restocked.

## 30. Size-Guide & Dimensions Contract

- **Trigger Link**: "Guía de tamaños y dimensiones" link near the variant selectors.
- **Modal / Drawer**:
  - Visual 3D silhouette schematic showing Length, Width, Height in millimeters.
  - Grip style compatibility guide: Palm Grip, Claw Grip, Fingertip Grip suitability indicators.
  - Hand size recommendations (Small: <17cm, Medium: 17–19cm, Large: >19cm).

## 31. Product Story Renderer Contract

The public rendering of all 13 canonical Story block types will be redesigned for WLMOUSE editorial parity:

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

- **Surface**: Rendered on Homepage, PDP, and Cart Drawer.
- **Layout**: 4-column horizontal layout on desktop, 2x2 grid on mobile.
- **Items Adapted to Gamer Perú**:
  1. _Envíos Rápidos a Todo el Perú_: Lima en 24h / Provincias vía Olva Courier y Shalom con seguimiento.
  2. _Garantía Oficial Gamer Perú_: 12 meses de garantía directa contra defectos de fabricación.
  3. _Pagos Seguros en Soles_: Verificación manual transparente vía Yape y Plin sin recargos.
  4. _Soporte Competitivo Especializado_: Atención personalizada por entusiastas de hardware en Lima.

## 33. Footer Contract

- **Structure**: 4 clean columns + bottom legal/payment strip.
- **Design**: Dark Obsidian background (`#09090b`), high-contrast hierarchy, restrained padding (`clamp(48px, 6vw, 80px)`).
- **Columns**:
  - _Catálogo_: Mouses, Teclados, Mousepads, Audio, Accesorios, Nuevos Lanzamientos.
  - _Marcas_: WLMOUSE, Lamzu, Pulsar, Ninjutso, ATK, VXE.
  - _Soporte_: Seguimiento de Pedidos, Políticas de Envío, Garantía y Devoluciones, FAQ.
  - _Gamer Perú_: Nosotros, Libro de Reclamaciones, Términos y Condiciones, Privacidad.
- **Bottom Bar**: Copyright text, RUC registration, Peru payment method logos (Yape, Plin).

## 34. Cart & Supporting Surfaces Contract

- **Slide-Out Cart Drawer (`CartDrawer`)**:
  - Triggered immediately upon Add to Cart or clicking cart icon.
  - Free shipping progress bar adapted to Peru order thresholds.
  - Line items: Product image, title, variant subtitle (color/switch), price, inline quantity updater, and remove button.
  - Order Note accordion for delivery instructions.
  - Subtotal in Soles (`S/`).
  - Checkout Button: High-contrast button directing to `/checkout`.
  - Payment reminder: "Tu pedido se confirmará mediante verificación Yape o Plin".

## 35. Multi-Brand Adaptation

Unlike WLMOUSE (which sells only its own products), Gamer Perú must balance single-brand visual luxury with multi-brand retail functionality:

- **Brand Badges**: Subtle brand link displayed above product titles on cards and PDPs.
- **Brand Pages**: Dedicated `/marcas/[slug]` landing pages with brand narrative and filtered product catalog.
- **Brand Filters**: Instant brand faceted filtering across all category and collection views.
- **Related Products**: Cross-brand compatibility (e.g. recommending a Pulsar mousepad on a WLMOUSE mouse PDP).

## 36. Peru-First Adaptation

- **Currency**: Strictly Peruvian Soles (`PEN`), formatted canonically as `S/ 549.00`.
- **Payment Verification**: Prominent notice of manual Yape/Plin verification workflow; no misleading automated credit card icons.
- **Shipping Logistics**: Local courier realities (Olva Courier, Shalom, Moto Express en Lima Metropolitana).
- **Customer Support**: WhatsApp support link with localized Peruvian hours and Lima phone prefix (`+51`).

## 37. Data Gap Matrix

| Data Item                          | Purpose                      | Classification            | Resolution Strategy                                                                             |
| :--------------------------------- | :--------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------- |
| **Secondary Product Media**        | Card hover flip              | **ALREADY AVAILABLE**     | Derived from `ProductMedia` table order (second active image).                                  |
| **Card Spec Highlights**           | Polling, MCU, Switch, Weight | **DERIVABLE SAFELY**      | Extracted safely from `product.specifications` JSONB by category.                               |
| **Homepage Featured Product ID**   | Purchasable home product     | **NEEDS ADMIN AUTHORING** | Stored in homepage configuration or selected via flagship flag. Fallback to top active product. |
| **Homepage Campaign Media**        | Hero video/photography       | **ALREADY AVAILABLE**     | High-res media assets uploaded to R2, referenced by object key.                                 |
| **Color Swatch Thumbnail**         | Circular variant preview     | **DERIVABLE SAFELY**      | Derived from `ProductVariant.media` or primary variant image. Fallback to CSS color swatch.     |
| **Switch Option Type**             | Tactile option pills         | **ALREADY AVAILABLE**     | Present in `ProductVariant.attributes` (`switch_type`, `side_style`).                           |
| **Product Dimensions (L x W x H)** | Size guide modal             | **ALREADY AVAILABLE**     | Extracted from `product.specifications.dimensions`.                                             |
| **Box Contents List**              | Packaging contents           | **ALREADY AVAILABLE**     | Extracted from `product.specifications.box_contents` or Story block.                            |
| **Back-in-Stock Notification**     | Sold out notify drawer       | **DERIVABLE SAFELY**      | Client-side modal; logs notification intent in database (future gate).                          |
| **Product Add-Ons / Bundles**      | PDP cross-sell               | **DERIVABLE SAFELY**      | Derived from category accessories (e.g. Skates for Mouse).                                      |

_Note: Zero schema changes or migrations are required for CHK0. All visual parity data can be derived from existing tables (`Product`, `ProductVariant`, `ProductMedia`, `specifications` JSONB)._

## 38. Domain Logic Preservation Matrix

The visual redesign must strictly preserve validated domain behavior:

- **Catalog Queries**: `getCachedProduct`, `getCachedCatalogPage`, `getCachedStoryRelatedProducts` remain unchanged.
- **Database Schema**: PostgreSQL schema and Supabase tables remain 100% untouched.
- **Cart Engine**: `CartProvider`, `useCart`, `addItem`, `updateQuantity`, `removeItem` remain the exact state machine.
- **Checkout & Orders**: Checkout session validation, order creation, and Yape/Plin payment verification flows remain intact.
- **Authentication & RBAC**: Supabase Auth session checks and admin role guards remain active.
- **Public Media Resolver**: `resolvePublicMediaUrl` continues to sign and resolve secure Cloudflare R2 URLs.
- **SEO & JSON-LD**: `ProductJsonLd`, `BreadcrumbList`, and dynamic metadata generation remain intact.
- **Story Persistence**: The safe JSON validation schema for Product Story blocks remains the canonical standard.

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
- **Color Independence**: Color variant selections never rely on color alone; selected color name is explicitly rendered as text in the label (`Color: Negro`).
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
- Cloudflare R2 signed media URLs prevent hotlinking and protect private assets.
- Sanitized HTML rendering for any user-supplied or rich-text story content.

## 48. Testing Strategy

- **Automated Validation**:
  - Unit tests for new components (`ProductCardV2`, `VariantSelectorV2`, `StickyBuyBar`).
  - End-to-end Playwright tests (`pnpm test:e2e`) verifying cart addition, variant switching, drawer opening, and checkout navigation.
  - Lint and type checks (`pnpm check`).
- **Manual Verification**:
  - Viewport testing across Chromium, Safari/WebKit, and Firefox.
  - Mobile touch testing on simulated iOS and Android viewports.

## 49. Implementation Gate Plan

- **CHK0 (Current)**: Discovery, WLMOUSE Reference Audit, Existing Codebase Audit, Visual Convergence Contract Freeze. (Documentation only, zero runtime delta).
- **CHK1**: Global Shell & Homepage Convergence:
  - Refactor `SiteHeader`, `AnnouncementBar`, `MobileDrawer`, and `SiteFooter`.
  - Rebuild `HomePage` with real hardware hero, collection doors, purchasable featured product, comparison slider, product shelves, and trust strip.
- **CHK2**: Product Card V2 & Discovery Surfaces:
  - Implement `ProductCard` V2 with hover flip, spec carousel, quick options.
  - Refactor Category (`/categorias/[slug]`), Brand (`/marcas/[slug]`), and Search (`/buscar`) grids.
- **CHK3**: PDP V2 Commerce Shell Convergence:
  - Rebuild PDP top section: full-width adaptive gallery, sticky commerce panel, visual thumbnail swatches, switch options, quantity counter, sticky buy bar, trust box.
- **CHK4**: Public Product Story Renderer Convergence:
  - Redesign public renderers for all 13 canonical Story block types for high-impact editorial presentation.
- **CHK5**: Cart Drawer, Supporting Surfaces & Mobile Touch Ergonomics:
  - Refine `CartDrawer` with shipping progress and instant line-item controls.
  - Implement `SearchDrawer` with predictive search.
  - Complete mobile touch ergonomics (sticky mobile buy bar, drawer transitions).
- **CHK6**: Cross-Surface Visual Regression, Performance, Accessibility, SEO & Closure:
  - Full side-by-side screenshot verification, performance audits (LCP/CLS), WCAG 2.1 AA accessibility audit, and formal GP-026A Closure Report.

## 50. Freeze Rules

- **Zero Runtime Delta in CHK0**: No production code, no test modifications, no CSS changes, no database migrations.
- **Zero Schema Change**: Existing PostgreSQL schema is frozen; all visual convergence data is derived safely from existing tables.
- **Domain Logic Preservation**: Cart calculations, variant resolution, auth sessions, and order management logic must remain unmodified during presentation refactoring.

## 51. Explicit Non-Goals

- Admin UI redesign (Admin is internal and functional).
- Direct pixel-for-pixel copyright clone of WLMOUSE proprietary assets.
- Automated third-party payment gateway integrations.
- Modifying historical completed roadmap documents (GP-001, GP-002, etc.).

## 52. Open Owner Decisions

1. **Homepage Featured Product Selection**: Decision on whether the homepage featured purchasable product is hardcoded to a flagship item (e.g. _Beast X Pro_) or driven by an Admin "Featured on Home" toggle. (Default for CHK1: Display top active flagship peripheral).
2. **Back-in-Stock Notification Storage**: Decision on whether notification requests are stored in a new database table or queued via email service. (Deferred to post-convergence gate).

## 53. Acceptance Criteria

- [x] Canonical origin/main commit `03598514ffced3ee854bc5a7a715362683383100` verified and clean branch created.
- [x] Fresh audit of live `https://www.wlmouse.com/` conducted and documented across all major surfaces.
- [x] Audit of existing Gamer Perú storefront code conducted with detailed divergence analysis.
- [x] ROADMAP.md updated to insert GP-026A between GP-025 and GP-026 without renumbering later gates.
- [x] GP-026.md updated to paused status pending GP-026A.
- [x] GP-026A.md roadmap specification created.
- [x] GP-026A-CONTRACT.md created with all 53 mandatory sections.
- [x] Zero production code delta, zero test code delta, zero CSS delta, zero schema delta, zero migration delta.
- [x] Code formatting passes (`pnpm format:check`) and git diff is clean.
