import React from "react";
import type { FormattedSpecRow } from "./hardware-specifications";
import type { PdpAccessory } from "./pdp-accessories";
import type { CommerceHeroProjection } from "./types";
import { ProductDetailHero } from "./product-detail-hero";
import styles from "./commerce-hero-container.module.css";

export interface CommerceHeroContainerProps {
  projection: CommerceHeroProjection;
  specHighlights?: FormattedSpecRow[];
  accessories?: PdpAccessory[];
  /** Server-rendered sections (accordions) slotted under the purchase actions. */
  details?: React.ReactNode;
}

/**
 * Server Component: CommerceHeroContainer
 *
 * Wraps the interactive ProductDetailHero client island.
 */
export function CommerceHeroContainer({
  projection,
  specHighlights,
  accessories,
  details,
}: CommerceHeroContainerProps): React.JSX.Element {
  return (
    <div className={styles.container}>
      <ProductDetailHero
        projection={projection}
        specHighlights={specHighlights}
        accessories={accessories}
        details={details}
      />
    </div>
  );
}
