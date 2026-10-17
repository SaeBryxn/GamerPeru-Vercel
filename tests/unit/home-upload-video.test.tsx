// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { VideoHero } from "@/components/home/video-hero/video-hero";
import { FeatureVideo } from "@/components/home/feature-video/feature-video";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import {
  VideoHeroContentSchema,
  homeSlotMediaType,
  listHomeSectionMediaSlots,
} from "@/lib/home/section-schemas";
import type * as FramerMotion from "framer-motion";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof FramerMotion>()),
  useReducedMotion: () => motion.reduced,
}));

beforeAll(() => {
  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: StubObserver });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? motion.reduced : false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // jsdom does not implement media playback.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    writable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { writable: true, value: () => {} });
});

const VIDEO_ID = "01a1c000-0000-7000-8000-0000000000b1";
const POSTER_ID = "01a1c000-0000-7000-8000-0000000000b2";
const UPLOAD = {
  kind: "upload",
  src: "https://cdn.test/v.mp4",
  posterSrc: "https://cdn.test/p.webp",
} as const;

describe("Uploaded home video content", () => {
  it("requires a poster with the file", () => {
    const hero = DEFAULT_HOME_SECTIONS[0]!.content;
    expect(
      VideoHeroContentSchema.safeParse({
        ...hero,
        video: { kind: "upload", videoAssetId: VIDEO_ID },
      }).success
    ).toBe(false);
    expect(
      VideoHeroContentSchema.safeParse({
        ...hero,
        video: { kind: "upload", videoAssetId: VIDEO_ID, posterAssetId: POSTER_ID },
      }).success
    ).toBe(true);
  });

  it("registers the file as a video slot and the poster as an image slot", () => {
    const hero = structuredClone(DEFAULT_HOME_SECTIONS[0]!);
    if (hero.type !== "video_hero") throw new Error("expected hero");
    hero.content.video = { kind: "upload", videoAssetId: VIDEO_ID, posterAssetId: POSTER_ID };
    const slots = listHomeSectionMediaSlots(hero);
    expect([...slots]).toEqual([
      ["video.file", VIDEO_ID],
      ["video.poster", POSTER_ID],
    ]);
    expect(homeSlotMediaType("video.file")).toBe("VIDEO");
    expect(homeSlotMediaType("video.poster")).toBe("IMAGE");
  });
});

describe("Uploaded video on the storefront", () => {
  it("plays the hero file muted, inline and looping with its poster", () => {
    motion.reduced = false;
    render(
      <VideoHero
        heading="Periféricos"
        scrollHintLabel="Desliza"
        video={UPLOAD}
        revealTargetId="tienda"
      />
    );
    const video = screen.getByTestId<HTMLVideoElement>("video-hero-file");
    expect(video.getAttribute("src")).toBe(UPLOAD.src);
    expect(video.getAttribute("poster")).toBe(UPLOAD.posterSrc);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(screen.queryByTestId("video-hero-frame")).toBeNull();
  });

  it("shows only the poster to reduced-motion visitors", () => {
    motion.reduced = true;
    render(
      <VideoHero
        heading="Periféricos"
        scrollHintLabel="Desliza"
        video={UPLOAD}
        revealTargetId="tienda"
      />
    );
    const video = screen.getByTestId<HTMLVideoElement>("video-hero-file");
    expect(video.getAttribute("src")).toBeNull();
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute("poster")).toBe(UPLOAD.posterSrc);
    motion.reduced = false;
  });

  it("gives the feature film a file with a play control", () => {
    render(
      <FeatureVideo
        video={UPLOAD}
        eyebrow="Nueva generación"
        title="ATK A9 PRO MAX"
        subtitle="Disponible en Gamer Perú."
        cta={{ label: "Ver más", href: "/productos/atk-a9-pro-max-white" }}
      />
    );
    expect(screen.getByTestId("feature-video-file").getAttribute("poster")).toBe(UPLOAD.posterSrc);
    expect(screen.queryByTestId("feature-video-frame")).toBeNull();
    expect(screen.getByTestId("feature-video-toggle").getAttribute("aria-label")).toBe(
      "Pausar el video"
    );
  });
});
