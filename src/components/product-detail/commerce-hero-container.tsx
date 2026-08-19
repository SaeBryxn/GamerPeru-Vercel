import React from "react";
import type { CommerceHeroProjection } from "./types";
import { ProductDetailHero } from "./product-detail-hero";
import styles from "./commerce-hero-container.module.css";

export interface CommerceHeroContainerProps {
  projection: CommerceHeroProjection;
}

/**
 * Server Component: CommerceHeroContainer
 *
 * Wraps the interactive ProductDetailHero client island.
 */
export function CommerceHeroContainer({
  projection,
}: CommerceHeroContainerProps): React.JSX.Element {
  return (
    <div className={styles.container}>
      <ProductDetailHero projection={projection} />
    </div>
  );
}
