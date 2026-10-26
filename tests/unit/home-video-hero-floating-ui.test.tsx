// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { VideoHero, buildHeroEmbedSrc } from "@/components/home/video-hero/video-hero";
import { ProductCarousel } from "@/components/home/product-carousel/product-carousel";
import { FeatureVideo, buildFeatureEmbedSrc } from "@/components/home/feature-video/feature-video";
import {
  BentoShowcase,
  CatalogRail,
  CommunityBanner,
  CompareSlider,
  SplitShowcase,
  TrustStrip,
} from "@/components/home";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";
import { SocialRail, WhatsAppButton } from "@/components/floating";
import { ACTIVE_SOCIAL_LINKS, PROMO_PILL, PROMO_PILL_ENABLED } from "@/config/social-links";

const publicEnvMock = vi.hoisted(() => ({
  NEXT_PUBLIC_WHATSAPP_NUMBER: undefined as string | undefined,
}));
vi.mock("@/config/public-env", () => ({ publicEnv: publicEnvMock }));

beforeAll(() => {
  // jsdom has no IntersectionObserver; whileInView only needs it to exist.
  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: StubObserver });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    writable: true,
    value: StubObserver,
  });
});

describe("Video hero", () => {
  it("embeds the background video muted, looping and chromeless on the privacy host", () => {
    const url = new URL(buildHeroEmbedSrc("2gX-vyQwHsA"));
    expect(url.host).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/2gX-vyQwHsA");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("mute")).toBe("1");
    expect(url.searchParams.get("loop")).toBe("1");
    // YouTube only loops a single video when it is also the playlist.
    expect(url.searchParams.get("playlist")).toBe("2gX-vyQwHsA");
    expect(url.searchParams.get("controls")).toBe("0");
  });

  it("keeps the page H1 and exposes the reveal control", () => {
    const html = renderToStaticMarkup(
      <VideoHero
        heading="Periféricos gaming de alto rendimiento"
        scrollHintLabel="Desliza para ver la tienda"
        video={{ kind: "youtube", videoId: "2gX-vyQwHsA" }}
        revealTargetId="destacado"
      />
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Periféricos gaming de alto rendimiento");
    expect(html).toContain("Desliza para ver la tienda");
    // The motion preference is unknown on the server, so the embed starts after hydration.
    expect(html).not.toContain("youtube-nocookie.com");
  });

  it("mounts the embed in the browser when motion is welcome", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
    render(
      <VideoHero
        heading="Periféricos gaming de alto rendimiento"
        scrollHintLabel="Desliza para ver la tienda"
        video={{ kind: "youtube", videoId: "2gX-vyQwHsA" }}
        revealTargetId="destacado"
      />
    );
    expect(screen.getByTestId("video-hero-frame").getAttribute("src")).toContain(
      "youtube-nocookie.com"
    );
  });
});

describe("Social rail", () => {
  it("links every configured profile and hides the promo pill while it is switched off", () => {
    const html = renderToStaticMarkup(<SocialRail />);
    const svgCount = (html.match(/<svg/g) ?? []).length;
    expect(svgCount).toBe(ACTIVE_SOCIAL_LINKS.length);
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('href="#"');

    for (const link of ACTIVE_SOCIAL_LINKS) {
      expect(html).toContain(`href="${link.href}"`);
    }
    expect(PROMO_PILL_ENABLED).toBe(false);
    expect(html).not.toContain(PROMO_PILL.label);
  });
});

describe("WhatsApp button", () => {
  it("opens a prefilled chat with the store number", () => {
    publicEnvMock.NEXT_PUBLIC_WHATSAPP_NUMBER = "51987654321";
    render(<WhatsAppButton />);

    const link = screen.getByRole("link", { name: "Escríbenos por WhatsApp" });
    const href = new URL(link.getAttribute("href")!);
    expect(href.origin + href.pathname).toBe("https://wa.me/51987654321");
    expect(href.searchParams.get("text")).toContain("Gamer Perú");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders nothing while no store number is configured", () => {
    publicEnvMock.NEXT_PUBLIC_WHATSAPP_NUMBER = undefined;
    const { container } = render(<WhatsAppButton />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Product carousel", () => {
  const products: ProductDiscoveryItem[] = [
    {
      id: "p1",
      name: "ATK A9 Plus 2.0 Black",
      slug: "atk-a9-plus-2-0-black",
      subtitle: null,
      brand: { name: "ATK", slug: "atk" },
      category: { name: "Mouses Gaming", slug: "mouses" },
      primaryMedia: {
        objectKey: "products/atk-a9-plus/black.webp",
        altText: "ATK A9 Plus negro",
        width: 1200,
        height: 1200,
      },
      startingPriceCents: 18900,
    },
    {
      id: "p2",
      name: "X-Raypad Aqua Control",
      slug: "x-raypad-aqua-control",
      subtitle: null,
      brand: { name: "X-Raypad", slug: "x-raypad" },
      category: { name: "Mousepads", slug: "mousepads" },
      primaryMedia: null,
      startingPriceCents: 21900,
    },
  ];

  it("renders the shared catalog card for every product it is given", () => {
    render(
      <ProductCarousel id="coleccion" eyebrow="Colección" title="Disponible" products={products} />
    );

    expect(screen.getAllByTestId("product-card")).toHaveLength(products.length);
    const card = screen.getAllByRole("link", { name: /ATK A9 Plus 2.0 Black/ })[0]!;
    expect(card.getAttribute("href")).toBe("/productos/atk-a9-plus-2-0-black");
  });

  it("keeps the section as the hero's reveal target when the catalog is empty", () => {
    const { container } = render(
      <ProductCarousel id="coleccion" eyebrow="Colección" title="Disponible" products={[]} />
    );

    expect(container.querySelector("section#coleccion")).not.toBeNull();
    expect(screen.queryByTestId("product-carousel-track")).toBeNull();
  });

  it("steps with the reused dome arrows, starting clamped at the left", () => {
    render(
      <ProductCarousel id="coleccion" eyebrow="Colección" title="Disponible" products={products} />
    );

    const prev = screen.getByTestId("product-carousel-prev");
    const next = screen.getByTestId("product-carousel-next");
    expect(prev).toHaveProperty("disabled", true);
    expect(next.getAttribute("aria-label")).toBe("Productos siguientes");
  });
});

describe("Feature video", () => {
  it("embeds the film chromeless, looping and with the JS API for its play control", () => {
    const url = new URL(buildFeatureEmbedSrc("3nAqLAV8JN0"));
    expect(url.host).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/3nAqLAV8JN0");
    expect(url.searchParams.get("mute")).toBe("1");
    expect(url.searchParams.get("loop")).toBe("1");
    expect(url.searchParams.get("playlist")).toBe("3nAqLAV8JN0");
    expect(url.searchParams.get("controls")).toBe("0");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
  });

  it("renders the overlay and toggles the play control", async () => {
    const user = userEvent.setup();
    render(
      <FeatureVideo
        video={{ kind: "youtube", videoId: "3nAqLAV8JN0" }}
        eyebrow="Nueva generación"
        title="ATK A9 PRO MAX"
        subtitle="El mouse insignia de ATK, disponible en Gamer Perú."
        cta={{ label: "Ver más", href: "/productos/atk-a9-pro-max-white" }}
      />
    );

    expect(screen.getByRole("heading", { name: /ATK A9 PRO MAX/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver más" }).getAttribute("href")).toBe(
      "/productos/atk-a9-pro-max-white"
    );

    const toggle = screen.getByTestId("feature-video-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Pausar el video");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Reproducir el video");
  });
});

const COMPARE_PROPS = {
  eyebrow: "Dos acabados del mismo modelo",
  title: "Elige el tuyo.",
  left: { kicker: "Clásico", name: "Negro", image: { src: "/images/home/a.png", alt: "Negro" } },
  right: { kicker: "Limpio", name: "Blanco", image: { src: "/images/home/b.png", alt: "Blanco" } },
};

describe("Home sections", () => {
  it("compares two finishes and lets the keyboard move the curtain", async () => {
    const user = userEvent.setup();
    render(<CompareSlider {...COMPARE_PROPS} />);

    expect(screen.getByText("Negro")).toBeTruthy();
    expect(screen.getByText("Blanco")).toBeTruthy();

    const handle = screen.getByRole("slider", { name: "Comparar Negro y Blanco" });
    expect(handle.getAttribute("aria-valuenow")).toBe("50");

    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
  });

  it("lists every showcase feature", () => {
    render(
      <SplitShowcase
        eyebrow="Multimarca"
        title="Armado para competir"
        features={[
          { title: "Uno", description: "Primero" },
          { title: "Dos", description: "Segundo" },
        ]}
        image={{ src: "/images/home/mouse.png", alt: "Mouse" }}
      />
    );

    expect(screen.getByRole("heading", { name: "Armado para competir" })).toBeTruthy();
    expect(screen.getAllByRole("term")).toHaveLength(2);
    expect(screen.getByText("Segundo")).toBeTruthy();
  });

  it("splits the bento headline so the second half carries the accent", () => {
    const { container } = render(
      <BentoShowcase
        title={["Explora nuestros", "mousepads"]}
        description="Superficies de control y de velocidad."
        images={[
          { src: "/images/home/1.jpg", alt: "Uno" },
          { src: "/images/home/2.jpg", alt: "Dos" },
          { src: "/images/home/3.jpg", alt: "Tres" },
        ]}
      />
    );

    const heading = screen.getByRole("heading", { name: /Explora nuestros mousepads/ });
    expect(heading.querySelector("span")?.textContent).toBe("mousepads");
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("keeps the community call to action inert until a profile is configured", () => {
    render(
      <CommunityBanner
        eyebrow="Gamer Perú"
        title={["Únete a nuestra", "comunidad"]}
        description="Novedades y lanzamientos."
        ctaLabel="Entrar al Discord"
        background={{ src: "/images/home/bg.jpg", alt: "Fondo" }}
      />
    );

    // Without its own link the banner falls back to the configured Discord invite.
    expect(screen.getByRole("link", { name: "Entrar al Discord" }).getAttribute("href")).toBe(
      "https://discord.gg/mehPGmxv7d"
    );
    expect(screen.getByTestId("community-banner-cta").textContent).toBe("Entrar al Discord");
  });

  it("renders only the claims it is given", () => {
    render(
      <TrustStrip
        items={[
          {
            icon: "whatsapp",
            title: "Atención por WhatsApp",
            description: "Te responde el equipo.",
          },
          { icon: "currency", title: "Precios en soles", description: "Catálogo en PEN." },
        ]}
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Precios en soles")).toBeTruthy();
  });

  it("renders catalog cards in the rail and hides the rail when empty", () => {
    const product: ProductDiscoveryItem = {
      id: "p1",
      name: "ATK A9 Plus 2.0 Black",
      slug: "atk-a9-plus-2-0-black",
      subtitle: null,
      brand: { name: "ATK", slug: "atk" },
      category: { name: "Mouses Gaming", slug: "mouses" },
      primaryMedia: null,
      startingPriceCents: 18900,
    };

    const { container, rerender } = render(
      <CatalogRail
        id="mouses"
        eyebrow="Mouses"
        title="Nuestros mouses"
        products={[product]}
        seeAll={{ label: "Ver todos", href: "/categorias/mouses" }}
      />
    );

    expect(screen.getByTestId("product-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver todos" }).getAttribute("href")).toBe(
      "/categorias/mouses"
    );

    rerender(
      <CatalogRail
        id="mouses"
        eyebrow="Mouses"
        title="Nuestros mouses"
        products={[]}
        seeAll={{ label: "Ver todos", href: "/categorias/mouses" }}
      />
    );
    expect(container.querySelector("section")).toBeNull();
  });
});
