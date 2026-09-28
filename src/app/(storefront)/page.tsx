import React from "react";
import type { Metadata } from "next";
import {
  BentoShowcase,
  CatalogRail,
  CommunityBanner,
  CompareSlider,
  FeatureVideo,
  ProductCarousel,
  SplitShowcase,
  TrustStrip,
  VideoHero,
} from "@/components/home";
import { loadRailProducts, loadShowcaseProducts } from "@/components/home/home-catalog";
import styles from "./page.module.css";

/** Page H1: kept for SEO and screen readers while the stage stays wordless. */
const HOME_HEADING = "Periféricos gaming de alto rendimiento";

// Must be a literal for static analysis; keep in step with CATALOG_REVALIDATE_SECONDS. Without it
// the home page would keep the products read at build time until the next deploy.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Gamer Perú | Periféricos Gaming de Alto Rendimiento",
  description:
    "Tienda boutique multimarca de periféricos gaming en Perú. Mouses ultraligeros, teclados magnéticos Rapid Trigger, mousepads y accesorios competitivos.",
};

/**
 * Storefront Homepage
 *
 * Visual rhythm:
 * 1. Full-screen video stage (Dominant / Dark), pinned while the store layer
 *    below scrolls over it.
 * 2. Product rail (Major / Subtle)
 * 3. Flagship product film (Dominant / Dark)
 * 4. Split showcase (Major / Light)
 * 5. Comparison curtain (Major / Light)
 * 6. Mouse rail from the catalog (Major / Light)
 * 7. Mousepad bento + rail (Major / Light)
 * 8. Community banner + trust strip (Dark / Light)
 *
 * Landmark Architecture:
 * - Owns <main id="main-content"> (preserves SkipLink target from GP-009).
 * - Server Component; the animated blocks are client islands.
 */
export default async function HomePage(): Promise<React.JSX.Element> {
  const [showcase, mice, mousepads] = await Promise.all([
    loadShowcaseProducts(),
    loadRailProducts("mouses"),
    loadRailProducts("mousepads"),
  ]);

  return (
    <main id="main-content">
      {/* 1. Full-screen video stage */}
      <VideoHero heading={HOME_HEADING} revealTargetId="coleccion" />

      <div className={styles.storeLayer}>
        {/* 2. Product rail sliding over the stage */}
        <ProductCarousel
          id="coleccion"
          eyebrow="Colección"
          title="Lo que tenemos disponible"
          products={showcase}
        />

        {/* 3. Flagship product film */}
        <FeatureVideo
          videoId="3nAqLAV8JN0"
          eyebrow="Nueva generación"
          title="ATK A9 PRO MAX"
          subtitle="El mouse insignia de ATK, disponible en Gamer Perú."
          cta={{ label: "Ver más", href: "/productos/atk-a9-pro-max-white" }}
        />

        {/* 4. Split showcase */}
        <SplitShowcase
          eyebrow="Multimarca · Precios en soles · Soporte local"
          title="Armado para competir"
          features={[
            {
              title: "Marcas que cuestan encontrar",
              description: "Trabajamos con ATK, Mchose, JINMS y X-Raypad.",
            },
            {
              title: "Precios en soles",
              description: "Todo el catálogo en PEN, sin conversiones ni sorpresas al pagar.",
            },
            {
              title: "Pago con Yape o Plin",
              description: "Coordinamos y verificamos cada pago contigo antes de despachar.",
            },
            {
              title: "Atención por WhatsApp",
              description: "Te responde una persona del equipo, no un robot.",
            },
          ]}
          image={{
            src: "/images/home/mouse-destacado.png",
            alt: "Mouse gaming destacado de Gamer Perú",
          }}
        />

        {/* 5. Comparison curtain */}
        <CompareSlider
          eyebrow="Dos acabados del mismo modelo"
          title="Elige el tuyo."
          left={{
            kicker: "Clásico",
            name: "Negro",
            image: {
              src: "/images/home/mouse-negro.png",
              alt: "Mouse gaming en color negro, vista de perfil",
            },
          }}
          right={{
            kicker: "Limpio",
            name: "Blanco",
            image: {
              src: "/images/home/mouse-blanco.png",
              alt: "Mouse gaming en color blanco, vista de perfil",
            },
          }}
        />

        {/* 6. Mouse rail from the catalog */}
        <CatalogRail
          id="mouses"
          eyebrow="Mouses"
          title="Nuestros mouses"
          products={mice}
          seeAll={{ label: "Ver todos", href: "/categorias/mouses" }}
        />

        {/* 7. Mousepad bento + rail */}
        <BentoShowcase
          title={["Explora nuestros", "mousepads"]}
          description="Superficies de control y de velocidad, en tamaño grande o compacto según tu sensibilidad."
          images={[
            { src: "/images/home/mousepad-1.jpg", alt: "Mousepad grande sobre un escritorio" },
            { src: "/images/home/mousepad-2.jpg", alt: "Detalle del borde cosido de un mousepad" },
            { src: "/images/home/mousepad-3.jpg", alt: "Mousepad con diseño ilustrado" },
          ]}
        />

        <CatalogRail
          id="mousepads"
          eyebrow="Mousepads"
          title="Nuestros mousepads"
          products={mousepads}
          seeAll={{ label: "Ver todos", href: "/categorias/mousepads" }}
        />

        {/* 8. Community banner + trust strip */}
        <CommunityBanner
          eyebrow="Gamer Perú"
          title={["Únete a nuestra", "comunidad"]}
          description="Novedades, lanzamientos y recomendaciones directo del equipo que arma la tienda."
          ctaLabel="Entrar al Discord"
          background={{
            src: "/images/home/comunidad-fondo.jpg",
            alt: "Ilustración de la comunidad Gamer Perú",
          }}
        />

        <TrustStrip
          items={[
            {
              icon: "whatsapp",
              title: "Atención por WhatsApp",
              description: "Te responde una persona del equipo.",
            },
            {
              icon: "payment",
              title: "Pago con Yape o Plin",
              description: "Verificamos cada pago al coordinar tu pedido.",
            },
            {
              icon: "currency",
              title: "Precios en soles",
              description: "Todo el catálogo en PEN, sin conversiones.",
            },
            {
              icon: "catalog",
              title: "Catálogo multimarca",
              description: "ATK, Mchose, JINMS y X-Raypad.",
            },
          ]}
        />
      </div>
    </main>
  );
}
