"use client";

import React from "react";
import Image from "next/image";
import { m, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { HomeImage } from "@/components/home/home-image";
import { DomeLink } from "@/components/ui";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import styles from "./distributor-hero.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;
const FLOAT_OFFSETS = [
  { x: "-8%", y: "6%", rotate: -10, delay: 0.25 },
  { x: "18%", y: "-10%", rotate: 8, delay: 0.35 },
  { x: "30%", y: "22%", rotate: -4, delay: 0.45 },
];

/**
 * Full-bleed hero. The stage is the dark canvas with a red glow, and real catalog products float
 * on the right as the visual. Set this to a file under public/ (e.g. "/images/soporte/
 * distribuidores.jpg") to lay an editorial photo underneath.
 */
const DISTRIBUTOR_HERO_IMAGE: string = "";

export function DistributorHero({ products }: { products: ProductDiscoveryItem[] }) {
  const reduceMotion = useReducedMotion();
  const floating = products
    .filter((product) => product.primaryMedia)
    .slice(0, FLOAT_OFFSETS.length);

  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  return (
    <section className={styles.hero} aria-labelledby="distribuidores-title">
      {DISTRIBUTOR_HERO_IMAGE && (
        <div className={styles.backdrop} aria-hidden="true">
          <HomeImage
            src={DISTRIBUTOR_HERO_IMAGE}
            alt=""
            sizes="100vw"
            className={styles.photo}
            priority
          />
        </div>
      )}

      <div className={styles.inner}>
        <div className={styles.copy}>
          <m.p className={styles.eyebrow} {...enter(0)}>
            Distribuidores
          </m.p>
          <m.h1 id="distribuidores-title" className={styles.title} {...enter(0.08)}>
            Lleva periféricos de alto rendimiento a tu negocio
          </m.h1>
          <m.p className={styles.lead} {...enter(0.16)}>
            Trabajamos con tiendas, centros gamer y equipos de esports de todo el Perú. Cuéntanos
            sobre tu negocio y conversemos.
          </m.p>
          <m.div {...enter(0.24)}>
            <DomeLink href="#solicitud" tone="light" domeRise="-60%" className={styles.cta}>
              Solicitar información
              <ArrowDown size={16} aria-hidden="true" />
            </DomeLink>
          </m.div>
        </div>

        {floating.length > 0 && (
          <div className={styles.stage} aria-hidden="true">
            {floating.map((product, index) => {
              const offset = FLOAT_OFFSETS[index]!;
              const url = resolvePublicMediaUrl(product.primaryMedia?.objectKey);
              if (!url) return null;
              return (
                <m.div
                  key={product.id}
                  className={styles.floatItem}
                  style={{ left: offset.x, top: offset.y }}
                  initial={reduceMotion ? false : { opacity: 0, y: 40, rotate: 0 }}
                  animate={
                    reduceMotion
                      ? { opacity: 1, rotate: offset.rotate }
                      : { opacity: 1, y: [0, -10, 0], rotate: offset.rotate }
                  }
                  transition={{
                    opacity: { duration: 0.8, delay: offset.delay },
                    rotate: { duration: 0.8, ease: EASE, delay: offset.delay },
                    y: {
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: offset.delay + index,
                    },
                  }}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(max-width: 1023px) 40vw, 320px"
                    className={styles.productImage}
                  />
                </m.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
