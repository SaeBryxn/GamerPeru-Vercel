import React from "react";
import Image from "next/image";
import Link from "@/components/app-link";
import type { BrandDiscoveryEntity } from "@/lib/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./brand-strip.module.css";

/** Below this the strip would read as a short list, so it is not shown. */
const MIN_BRANDS = 2;

export interface BrandStripProps {
  brands: BrandDiscoveryEntity[];
}

/**
 * Brands the store sells, as an endless strip that pauses on hover. Each brand links to its page;
 * a brand without a logo shows its name. The list is drawn twice so the loop has no seam; the
 * copy is hidden from assistive tech and from the tab order.
 */
export function BrandStrip({ brands }: BrandStripProps): React.JSX.Element | null {
  if (brands.length < MIN_BRANDS) return null;

  const renderList = (copy: boolean) => (
    <ul className={styles.list} aria-hidden={copy || undefined}>
      {brands.map((brand) => {
        const logoUrl = brand.logo ? resolvePublicMediaUrl(brand.logo.objectKey) : null;
        return (
          <li key={brand.id} className={styles.item}>
            <Link
              href={`/marcas/${brand.slug}`}
              className={styles.link}
              tabIndex={copy ? -1 : undefined}
              aria-label={copy ? undefined : brand.name}
            >
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={160} height={48} className={styles.logo} />
              ) : (
                <span className={styles.wordmark}>{brand.name}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className={styles.section} aria-labelledby="home-brands-title">
      <h2 id="home-brands-title" className={styles.title}>
        Nuestras marcas
      </h2>
      <div className={styles.viewport}>
        <div className={styles.track}>
          {renderList(false)}
          {renderList(true)}
        </div>
      </div>
    </section>
  );
}
