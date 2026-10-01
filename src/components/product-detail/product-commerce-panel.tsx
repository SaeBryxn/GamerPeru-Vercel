"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, MessageCircle, ShieldCheck, Tag } from "lucide-react";
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
import { StickyBuyBar } from "./sticky-buy-bar";
import { WhatsAppIcon } from "./whatsapp-icon";
import styles from "./product-commerce-panel.module.css";

export interface ProductCommercePanelProps {
  product: {
    id: string;
    name: string;
    subtitle: string | null;
  };
  brand: {
    name: string;
    slug: string;
  };
  variants: ProductVariantDetail[];
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

  const isPending = isMutating || pendingVariantIds.has(selectedVariant.id);
  const isAvailable = selectedVariant.status === "ACTIVE";
  const isProfileRequired = status === "PROFILE_REQUIRED";

  const handleSelectVariant = (variant: ProductVariantDetail) => {
    setHasAttemptedAdd(false);
    onSelectVariant(variant);
  };

  const handleAddToCart = async (returnFocusTo: HTMLElement | null = addButtonRef.current) => {
    setHasAttemptedAdd(true);
    const success = await addItem(selectedVariant.id, quantity);
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
    <div className={styles.panelContainer} data-testid="product-commerce-panel">
      <div className={styles.titleBlock}>
        <Link href={`/marcas/${brand.slug}`} className={styles.brandLink}>
          {brand.name}
        </Link>
        <h1 className={styles.title}>{product.name}</h1>
        {product.subtitle && <p className={styles.subtitle}>{product.subtitle}</p>}

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

      <PdpSpecGrid rows={specHighlights} />

      <VariantSelector
        variants={variants}
        selectedVariant={selectedVariant}
        onSelectVariant={handleSelectVariant}
      />

      {accessories && accessories.length > 0 && <PdpAccessories accessories={accessories} />}

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
        <li className={styles.assuranceItem}>
          <Icon icon={ShieldCheck} size="md" aria-hidden="true" />
          <span>
            Pago seguro en soles con <strong>Yape</strong> o <strong>Plin</strong>, verificado
            manualmente al coordinar tu pedido.
          </span>
        </li>
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
