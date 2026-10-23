import React from "react";
import type { Metadata } from "next";
import { HomeSections } from "@/components/home/home-sections";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import { getStorefrontHome } from "@/lib/home/read-home-sections";
import styles from "./page.module.css";

// Must be a literal for static analysis; keep in step with CATALOG_REVALIDATE_SECONDS. Without it
// the home page would keep the products read at build time until the next deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Gamer Perú | Periféricos Gaming de Alto Rendimiento",
  description:
    "Tienda boutique multimarca de periféricos gaming en Perú. Mouses ultraligeros, teclados magnéticos Rapid Trigger, mousepads y accesorios competitivos.",
};

const FALLBACK_HEADING =
  DEFAULT_HOME_SECTIONS[0]?.type === "video_hero"
    ? DEFAULT_HOME_SECTIONS[0].content.heading
    : "Gamer Perú";

/**
 * Storefront Homepage
 *
 * The sections, their order, visibility and copy are managed from Admin (ADR-012); see
 * `src/lib/home`. The hero, when visible, is a full-screen stage pinned under the store layer and
 * owns the page H1; without it the H1 stays for search engines and screen readers only.
 *
 * Owns <main id="main-content"> (SkipLink target from GP-009).
 */
export default async function HomePage(): Promise<React.JSX.Element> {
  const home = await getStorefrontHome();
  const hasHero = home.sections[0]?.type === "video_hero";

  return (
    <main id="main-content">
      {!hasHero && <h1 className={styles.visuallyHidden}>{FALLBACK_HEADING}</h1>}
      <HomeSections home={home} storeLayerClassName={styles.storeLayer} />
    </main>
  );
}
