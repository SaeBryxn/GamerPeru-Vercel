// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TwitchLive } from "@/components/home/video-hero/twitch-live";
import { normalizeTwitchChannel } from "@/lib/home/twitch-channel";
import { VideoHeroContentSchema } from "@/lib/home/section-schemas";

afterEach(() => {
  cleanup();
  delete window.Twitch;
  vi.unstubAllGlobals();
});
const media = (matches: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );

it("normaliza el canal y mantiene compatibles las portadas sin Twitch", () => {
  expect(normalizeTwitchChannel("https://www.twitch.tv/maxkillgg/about")).toBe("maxkillgg");
  expect(normalizeTwitchChannel("https://twitch.tv.ejemplo.com/maxkillgg")).toBeNull();
  expect(normalizeTwitchChannel("https://twitch.tv@ejemplo.com/maxkillgg")).toBeNull();
  expect(normalizeTwitchChannel("javascript:alert(1)")).toBeNull();
  const hero = {
    heading: "Portada",
    scrollHintLabel: "Ver tienda",
    video: { kind: "youtube", videoId: "abcdefghijk" },
  };
  expect(VideoHeroContentSchema.safeParse(hero).success).toBe(true);
  expect(
    VideoHeroContentSchema.safeParse({ ...hero, twitch: { enabled: true, channel: "" } }).success
  ).toBe(false);
});

it("cambia entre directo y respaldo con eventos reales del reproductor, sin chat", async () => {
  media(true);
  const events = new Map<string, () => void>();
  const play = vi.fn(),
    pause = vi.fn();
  class FakePlayer {
    static ONLINE = "online";
    static OFFLINE = "offline";
    static READY = "ready";
    static ENDED = "ended";
    play = play;
    pause = pause;
    addEventListener(event: string, callback: () => void) {
      events.set(event, callback);
    }
  }
  window.Twitch = { Player: FakePlayer };
  const changed = vi.fn();
  const view = render(
    <TwitchLive channel="maxkillgg" linkLabel="Ver Twitch" onLiveChange={changed} />
  );
  await waitFor(() => expect(events.has("online")).toBe(true));
  expect(screen.getByTestId("twitch-live-stage").getAttribute("data-online")).toBe("false");
  act(() => {
    events.get("ready")?.();
    events.get("online")?.();
  });
  expect(screen.getByTestId("twitch-live-stage").getAttribute("data-online")).toBe("true");
  expect(changed).toHaveBeenLastCalledWith(true);
  act(() => events.get("offline")?.());
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(screen.getByTestId("twitch-channel-link").getAttribute("href")).toBe(
    "https://www.twitch.tv/maxkillgg"
  );
  expect(document.querySelector('iframe[src*="chat"]')).toBeNull();
  view.unmount();
  expect(pause).toHaveBeenCalled();
});

it("conserva el video habitual en pantallas menores al mínimo de Twitch", () => {
  media(false);
  const constructor = vi.fn();
  window.Twitch = { Player: constructor as unknown as NonNullable<Window["Twitch"]>["Player"] };
  render(<TwitchLive channel="maxkillgg" linkLabel="Ver Twitch" onLiveChange={vi.fn()} />);
  expect(constructor).not.toHaveBeenCalled();
  expect(screen.getByTestId("twitch-live-stage").getAttribute("aria-hidden")).toBe("true");
});
