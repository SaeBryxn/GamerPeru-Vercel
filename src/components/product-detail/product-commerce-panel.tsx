"use client";

import type { ProductCommerceConfig } from "@/lib/catalog/product-pdp-config";

import React, { useRef, useState } from "react";
import Link from "@/components/app-link";
import {
  AlertCircle,
  Award,
  BookOpen,
  Gift,
  MessageCircle,
  ShieldCheck,
  Tag,
  Truck,
  Zap,
} from "lucide-react";
import { useCart } from "@/components/cart";
import { DomeButton, DomeLink, Icon } from "@/components/ui";
import { WishlistButton } from "@/components/wishlist";
import { publicEnv } from "@/config/public-env";
import { MAX_CART_LINE_QUANTITY } from "@/lib/cart/constants";
import type { ProductVariantDetail } from "@/lib/catalog/product-detail-types";
import { formatCurrency } from "@/lib/utils/currency";
import type { FormattedSpecRow } from "./hardware-specifications";
import { PdpAccessories, type PdpAccessory } from "./pdp-accessories";
import { PdpQuantityStepper } from "./pdp-quantity-stepper";
import { PdpSpecGrid } from "./pdp-spec-grid";
import { VariantSelector } from "./variant-selector";
import type { ProductMediaItem } from "@/lib/catalog/product-detail-types";
import { StickyBuyBar } from "./sticky-buy-bar";
import { WhatsAppIcon } from "./whatsapp-icon";
import styles from "./product-commerce-panel.module.css";

export interface ProductCommercePanelProps {
  product: {
    id: string;
    name: string;
    subtitle: string | null;
    pdpConfig?: ProductCommerceConfig;
  };
  brand: {
    name: string;
    slug: string;
  };
  variants: ProductVariantDetail[];
  media?: ProductMediaItem[];
  selectedVariant: ProductVariantDetail;
  onSelectVariant: (variant: ProductVariantDetail) => void;
  /** Object key of the photo shown for the selected variant, for the sticky buy bar. */
  thumbnailKey?: string | null;
  /** Formatted spec rows for the highlights grid (already display-ready). */
  specHighlights?: FormattedSpecRow[];
  /** Optional add-on list; omitted when the catalog has no accessories to offer. */
  accessories?: PdpAccessory[];
  /** Server-rendered detail sections (accordions) placed under the actions. */
  details?: React.ReactNode;
}

/**
 * wa.me deep link with a prefilled message. Without a configured store number
 * the button only renders outside production, pointing at WhatsApp itself so
 * the layout can be reviewed locally.
 */
function buildWhatsAppHref(productName: string, variantTitle: string): string | null {
  const number = publicEnv.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!number && process.env.NODE_ENV === "production") return null;

  const message = `Hola, quiero consultar por ${productName} (${variantTitle}).`;
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`;
}

export function ProductCommercePanel({
  product,
  brand,
  variants,
  media = [],
  selectedVariant,
  onSelectVariant,
  thumbnailKey = null,
  specHighlights = [],
  accessories,
  details,
}: ProductCommercePanelProps): React.JSX.Element {
  const { status, isMutating, pendingVariantIds, addItem, openDrawer, lastError } = useCart();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [hasAttemptedAdd, setHasAttemptedAdd] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedAccessoryIds, setSelectedAccessoryIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const pdpConfig = product.pdpConfig;

  const isPending = isMutating || pendingVariantIds.has(selectedVariant.id);
  const isAvailable = selectedVariant.status === "ACTIVE";
  const isProfileRequired = status === "PROFILE_REQUIRED";

  const handleSelectVariant = (variant: ProductVariantDetail) => {
    setHasAttemptedAdd(false);
    onSelectVariant(variant);
  };

  const handleAddToCart = async (returnFocusTo: HTMLElement | null = addButtonRef.current) => {
    setHasAttemptedAdd(true);
    const success = await addItem(
      selectedVariant.id,
      quantity,
      accessories?.filter((item) => selectedAccessoryIds.has(item.id)).map((item) => item.id)
    );
    if (success) {
      openDrawer({ returnFocusTo });
    }
  };

  const addLabel = !isAvailable
    ? "No disponible"
    : isPending
      ? "Añadiendo..."
      : "Añadir al carrito";

  const showCompareAt =
    selectedVariant.compareAtPriceCents !== null &&
    selectedVariant.compareAtPriceCents > selectedVariant.priceCents;

  const discountPercent = showCompareAt
    ? Math.round(
        ((selectedVariant.compareAtPriceCents! - selectedVariant.priceCents) /
          selectedVariant.compareAtPriceCents!) *
          100
      )
    : null;

  const showPdpError = hasAttemptedAdd && Boolean(lastError) && !isPending && !isProfileRequired;
  const whatsappHref = buildWhatsAppHref(product.name, selectedVariant.title);

  return (
    <div
      className={styles.panelContainer}
      data-testid="product-commerce-panel"
      data-cart-status={status}
    >
      <div className={styles.titleBlock}>
        <Link href={`/marcas/${brand.slug}`} className={styles.brandLink}>
          {brand.name}
        </Link>
        <h1 className={styles.title}>{product.name}</h1>
        {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

        {pdpConfig?.rating.enabled &&
          pdpConfig.rating.average !== null &&
          pdpConfig.rating.count !== null &&
          pdpConfig.rating.count > 0 && (
            <div
              className={styles.rating}
              aria-label={`Calificación ${pdpConfig.rating.average} de 5, ${pdpConfig.rating.count} reseñas`}
            >
              <span aria-hidden="true">
                {"★".repeat(Math.round(pdpConfig.rating.average))}
                {"☆".repeat(5 - Math.round(pdpConfig.rating.average))}
              </span>
              <strong>{pdpConfig.rating.average.toFixed(1)}</strong>
              <span>({pdpConfig.rating.count} reseñas)</span>
            </div>
          )}

        <div className={styles.priceCluster} data-testid="price-cluster">
          <span className={styles.sellingPrice} data-testid="selling-price">
            {formatCurrency(selectedVariant.priceCents)}
          </span>

          {showCompareAt && (
            <span className={styles.compareAtPrice} data-testid="compare-at-price">
              {formatCurrency(selectedVariant.compareAtPriceCents!)}
            </span>
          )}

          {discountPercent !== null && discountPercent > 0 && (
            <span className={styles.discountBadge} data-testid="discount-badge">
              -{discountPercent}%
            </span>
          )}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.skuTag} data-testid="variant-sku">
            SKU: {selectedVariant.sku}
          </span>
          {selectedVariant.weightGrams !== null && (
            <span className={styles.weightTag} data-testid="variant-weight">
              Peso: {selectedVariant.weightGrams} g
            </span>
          )}
        </div>
      </div>

      {pdpConfig?.highlightsEnabled !== false && <PdpSpecGrid rows={specHighlights} />}

      {pdpConfig?.gift.enabled && pdpConfig.gift.title && (
        <section className={styles.giftBox}>
          <span className={styles.giftLabel}>{pdpConfig.gift.label}</span>
          <div className={styles.giftContent}>
            <Gift size={18} aria-hidden="true" />
            <div>
              <strong>{pdpConfig.gift.title}</strong>
              <p>{pdpConfig.gift.description}</p>
            </div>
          </div>
        </section>
      )}

      <VariantSelector
        variants={variants}
        media={media}
        selectedVariant={selectedVariant}
        onSelectVariant={handleSelectVariant}
      />

      {accessories && accessories.length > 0 && (
        <PdpAccessories
          accessories={accessories}
          selected={selectedAccessoryIds}
          onToggle={(id) =>
            setSelectedAccessoryIds((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          disabled={isPending || isProfileRequired}
        />
      )}

      <div className={styles.actions}>
        {isProfileRequired ? (
          <div className={styles.profileRequiredBox} data-testid="pdp-profile-required-box">
            <div className={styles.profileRequiredMessage}>
              <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
              <span>Debes completar tu perfil para utilizar el carrito de compras.</span>
            </div>
            <Link
              href="/auth/completar-perfil"
              className={styles.profileRequiredLink}
              data-testid="pdp-complete-profile-link"
            >
              Completar perfil
            </Link>
          </div>
        ) : (
          <div className={styles.purchaseRow}>
            <PdpQuantityStepper
              value={quantity}
              max={MAX_CART_LINE_QUANTITY}
              onChange={setQuantity}
              disabled={!isAvailable || isPending}
            />
            <DomeButton
              ref={addButtonRef}
              tone="dark"
              className={styles.primaryAction}
              onClick={() => void handleAddToCart()}
              disabled={!isAvailable || isPending}
              data-testid="pdp-add-to-cart-button"
            >
              {addLabel}
            </DomeButton>
            <WishlistButton productId={product.id} productName={product.name} variant="inline" />
          </div>
        )}

        {whatsappHref && (
          <DomeLink
            href={whatsappHref}
            tone="light"
            className={styles.secondaryAction}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pdp-whatsapp-button"
          >
            <WhatsAppIcon size={18} />
            Contactar por WhatsApp
          </DomeLink>
        )}

        {showPdpError && (
          <div role="alert" className={styles.errorBox} data-testid="pdp-add-to-cart-error">
            <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
            <span>{lastError}</span>
          </div>
        )}
      </div>

      {details}

      {/* Only claims the store can stand behind: no stock or warranty promises. */}
      <ul className={styles.assuranceBox} data-testid="payment-trust-box">
        {pdpConfig?.support.warranty && (
          <li className={styles.assuranceItem}>
            <Award size={18} aria-hidden="true" />
            <span>{pdpConfig.support.warranty}</span>
          </li>
        )}
        {pdpConfig?.support.manualUrl && (
          <li className={styles.assuranceItem}>
            <BookOpen size={18} aria-hidden="true" />
            <a href={pdpConfig.support.manualUrl} target="_blank" rel="noopener noreferrer">
              Manual de usuario
            </a>
          </li>
        )}
        {pdpConfig?.support.driverUrl && (
          <li className={styles.assuranceItem}>
            <Zap size={18} aria-hidden="true" />
            <a href={pdpConfig.support.driverUrl} target="_blank" rel="noopener noreferrer">
              Web-hub / Software Driver
            </a>
          </li>
        )}
        <li className={styles.assuranceItem}>
          <Icon icon={ShieldCheck} size="md" aria-hidden="true" />
          <span>
            Pago seguro en soles con <strong>Yape</strong> o <strong>Plin</strong>, verificado
            manualmente al coordinar tu pedido.
          </span>
        </li>
        {pdpConfig?.support.shippingNote && (
          <li className={styles.assuranceItem}>
            <Truck size={18} aria-hidden="true" />
            <span>{pdpConfig.support.shippingNote}</span>
          </li>
        )}
        <li className={styles.assuranceItem}>
          <Icon icon={Tag} size="md" aria-hidden="true" />
          <span>Precios finales en soles (PEN).</span>
        </li>
        {whatsappHref && (
          <li className={styles.assuranceItem}>
            <Icon icon={MessageCircle} size="md" aria-hidden="true" />
            <span>Atención directa por WhatsApp.</span>
          </li>
        )}
      </ul>

      {!isProfileRequired && (
        <StickyBuyBar
          anchorRef={addButtonRef}
          productName={product.name}
          variantTitle={selectedVariant.title}
          thumbnailKey={thumbnailKey}
          priceCents={selectedVariant.priceCents}
          label={addLabel}
          disabled={!isAvailable || isPending}
          onAdd={(button) => void handleAddToCart(button)}
        />
      )}
    </div>
  );
}
