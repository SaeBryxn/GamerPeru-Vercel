import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Injected test harness for HTMLMediaElement.play/pause and controlled IntersectionObserver dispatch.
 */
async function installStoryMediaTestHarness(page: Page) {
  await page.addInitScript(() => {
    interface MediaCallEntry {
      role: "content" | "hero" | "unknown";
      timestamp: number;
    }

    const mediaCalls = {
      playCalls: [] as MediaCallEntry[],
      pauseCalls: [] as MediaCallEntry[],
    };

    const pausedState = new WeakMap<HTMLMediaElement, boolean>();

    function classifyVideo(el: HTMLMediaElement): "content" | "hero" | "unknown" {
      if (el.closest('[data-testid="story-video-player"]')) return "content";
      if (el.closest('[data-testid="story-hero-media-block"]')) return "hero";
      return "unknown";
    }

    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      get(this: HTMLMediaElement) {
        return pausedState.has(this) ? pausedState.get(this)! : true;
      },
      configurable: true,
    });

    HTMLMediaElement.prototype.play = async function (this: HTMLMediaElement) {
      const role = classifyVideo(this);
      mediaCalls.playCalls.push({ role, timestamp: Date.now() });

      pausedState.set(this, false);
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));

      return Promise.resolve();
    };

    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      const role = classifyVideo(this);
      mediaCalls.pauseCalls.push({ role, timestamp: Date.now() });

      pausedState.set(this, true);
      this.dispatchEvent(new Event("pause"));
    };

    const activeObservers: Array<{
      targetElements: Element[];
      callback: IntersectionObserverCallback;
      options?: IntersectionObserverInit;
    }> = [];

    window.IntersectionObserver = class ControlledIntersectionObserver {
      private entry: {
        targetElements: Element[];
        callback: IntersectionObserverCallback;
        options?: IntersectionObserverInit;
      };

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.entry = { targetElements: [], callback, options };
        activeObservers.push(this.entry);
      }

      observe(target: Element) {
        if (!this.entry.targetElements.includes(target)) {
          this.entry.targetElements.push(target);
        }
      }

      unobserve(target: Element) {
        this.entry.targetElements = this.entry.targetElements.filter((t) => t !== target);
      }

      disconnect() {
        this.entry.targetElements = [];
        const idx = activeObservers.indexOf(this.entry);
        if (idx !== -1) {
          activeObservers.splice(idx, 1);
        }
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;

    (window as unknown as { __storyMediaTest: unknown }).__storyMediaTest = {
      mediaCalls,
      activeObservers,
      hasActiveObserver: (role: "content" | "hero") => {
        return activeObservers.some((obs) =>
          obs.targetElements.some((target) => {
            const isContent = Boolean(target.closest('[data-testid="story-video-player"]'));
            const isHero = Boolean(target.closest('[data-testid="story-hero-media-block"]'));
            return (role === "content" && isContent) || (role === "hero" && isHero);
          })
        );
      },
      dispatchIntersection: (role: "content" | "hero", ratio: number, isIntersecting = true) => {
        for (const obs of activeObservers) {
          for (const target of obs.targetElements) {
            const isContent = Boolean(target.closest('[data-testid="story-video-player"]'));
            const isHero = Boolean(target.closest('[data-testid="story-hero-media-block"]'));
            if ((role === "content" && isContent) || (role === "hero" && isHero)) {
              const entry: Partial<IntersectionObserverEntry> = {
                target,
                isIntersecting,
                intersectionRatio: ratio,
                boundingClientRect: target.getBoundingClientRect(),
                intersectionRect: target.getBoundingClientRect(),
                rootBounds: null,
                time: Date.now(),
              };
              obs.callback(
                [entry as IntersectionObserverEntry],
                obs as unknown as IntersectionObserver
              );
            }
          }
        }
      },
    };
  });
}

test.describe("GP-014 DB3C — Product Story Modular Renderer E2E Suite", () => {
  test("A: renders Product Story section with all 13 canonical block types on PDP", async ({
    page,
  }) => {
    const response = await page.goto("/productos/mouse-pro-mod-01");
    expect(response?.status()).toBe(200);

    const storySection = page.getByTestId("product-story-section");
    await expect(storySection).toBeVisible();

    // Verify all 13 canonical story blocks are present in the DOM
    await expect(page.getByTestId("story-hero-media-block")).toBeVisible();
    await expect(page.getByTestId("story-full-bleed-image-block")).toBeVisible();
    await expect(page.getByTestId("story-image-text-block")).toBeVisible();
    await expect(page.getByTestId("story-stat-highlight-block")).toBeVisible();
    await expect(page.getByTestId("story-spec-feature-block")).toBeVisible();
    await expect(page.getByTestId("story-video-block")).toBeVisible();
    await expect(page.getByTestId("story-gallery-block")).toBeVisible();
    await expect(page.getByTestId("story-comparison-block")).toBeVisible();
    await expect(page.getByTestId("story-dimensions-block")).toBeVisible();
    await expect(page.getByTestId("story-box-contents-block")).toBeVisible();
    await expect(page.getByTestId("story-technical-specs-block")).toBeVisible();
    await expect(page.getByTestId("story-faq-block")).toBeVisible();
    await expect(page.getByTestId("story-related-products-block")).toBeVisible();
  });

  test("B: preserves single h1 hierarchy across the entire page", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Commerce Hero owns the sole page h1
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Mouse Pro Mod 01");

    // Story headings use h2 and h3
    const heroH2 = page.getByTestId("hero-headline");
    await expect(heroH2).toBeVisible();
    const tagName = await heroH2.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("h2");
  });

  test("C: interactive FAQ accordion toggles open and closed natively", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const firstFaq = page.getByTestId("faq-item-0");
    await expect(firstFaq).toBeVisible();

    // Details is closed by default
    await expect(firstFaq).not.toHaveAttribute("open", "");

    // Click summary to open
    const summary = page.getByTestId("faq-summary-0");
    await summary.click();
    await expect(firstFaq).toHaveAttribute("open", "");
    await expect(page.getByTestId("faq-answer-0")).toBeVisible();

    // Click again to close
    await summary.click();
    await expect(firstFaq).not.toHaveAttribute("open", "");
  });

  test("D: content video controls are accessible and operable", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const videoBlock = page.getByTestId("story-video-block");
    await expect(videoBlock).toBeVisible();

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", /Reproducir video|Pausar video/);
  });

  test("E: operates safely under prefers-reduced-motion: reduce without autoplay", async ({
    page,
  }) => {
    // 1. Emulate reduced motion before navigation and install controlled media harness
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installStoryMediaTestHarness(page);
    await page.goto("/productos/mouse-pro-mod-01");

    const storySection = page.getByTestId("product-story-section");
    await expect(storySection).toBeVisible();

    // Hero headline and static content remain clearly visible
    await expect(page.getByTestId("hero-headline")).toBeVisible();

    // 2. Dispatch simulated intersection on hero and content video to test observer immunity
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("hero", 1.0, true);
      testHarness?.dispatchIntersection("content", 1.0, true);
    });

    // 3. Verify ZERO automatic play calls occurred under reduced motion
    const playCallsCount = await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { mediaCalls: { playCalls: unknown[] } };
        }
      ).__storyMediaTest;
      return testHarness?.mediaCalls.playCalls.length ?? 0;
    });
    expect(playCallsCount).toBe(0);

    // 4. Video player toggle button remains visible with manual play action available
    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
    await expect(playToggle).toHaveText("Reproducir");
  });

  test("E2: allows explicit manual video playback under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installStoryMediaTestHarness(page);
    await page.goto("/productos/mouse-pro-mod-01");

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
    await expect(playToggle).toHaveText("Reproducir");

    // Confirm 0 play calls before manual click
    const initialPlayCalls = await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { mediaCalls: { playCalls: Array<{ role: string }> } };
        }
      ).__storyMediaTest;
      return (
        testHarness?.mediaCalls.playCalls.filter((c: { role: string }) => c.role === "content")
          .length ?? 0
      );
    });
    expect(initialPlayCalls).toBe(0);

    // Click to start manual playback
    await playToggle.click();

    // Assert that HTMLMediaElement.play() was invoked for the content video
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const testHarness = (
            window as unknown as {
              __storyMediaTest?: { mediaCalls: { playCalls: Array<{ role: string }> } };
            }
          ).__storyMediaTest;
          return (
            testHarness?.mediaCalls.playCalls.filter((c: { role: string }) => c.role === "content")
              .length ?? 0
          );
        });
      })
      .toBe(1);

    // Toggle button MUST transition to exact "Pausar video"
    await expect(playToggle).toHaveAttribute("aria-label", "Pausar video");
    await expect(playToggle).toHaveText("Pausar");

    // Click again to manually pause
    await playToggle.click();

    // Assert pause was invoked and control returned to "Reproducir video"
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const testHarness = (
            window as unknown as {
              __storyMediaTest?: { mediaCalls: { pauseCalls: Array<{ role: string }> } };
            }
          ).__storyMediaTest;
          return (
            testHarness?.mediaCalls.pauseCalls.filter((c: { role: string }) => c.role === "content")
              .length ?? 0
          );
        });
      })
      .toBeGreaterThanOrEqual(1);

    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
    await expect(playToggle).toHaveText("Reproducir");
  });

  test("E3: proves autoplay occurs under normal motion and transitions to paused when reduced motion becomes active", async ({
    page,
  }) => {
    // 1. Start with no preference
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installStoryMediaTestHarness(page);
    await page.goto("/productos/mouse-pro-mod-01");

    const videoPlayer = page.getByTestId("story-video-player");
    await expect(videoPlayer).toBeVisible();

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();

    // Wait until component has mounted and observer is active
    await page.waitForFunction(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { hasActiveObserver: (role: string) => boolean };
        }
      ).__storyMediaTest;
      return testHarness?.hasActiveObserver("content");
    });

    // 2. Trigger meaningful intersection (ratio 0.75 >= 0.50) to start automatic playback
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("content", 0.75, true);
    });

    // 3. Verify positive evidence: play() was invoked and UI reflects playing state BEFORE transition
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const testHarness = (
            window as unknown as {
              __storyMediaTest?: { mediaCalls: { playCalls: Array<{ role: string }> } };
            }
          ).__storyMediaTest;
          return (
            testHarness?.mediaCalls.playCalls.filter((c: { role: string }) => c.role === "content")
              .length ?? 0
          );
        });
      })
      .toBe(1);

    await expect(playToggle).toHaveAttribute("aria-label", "Pausar video");
    await expect(playToggle).toHaveText("Pausar");

    // Record pause count prior to motion preference transition
    const preTransitionPauseCalls = await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { mediaCalls: { pauseCalls: Array<{ role: string }> } };
        }
      ).__storyMediaTest;
      return (
        testHarness?.mediaCalls.pauseCalls.filter((c: { role: string }) => c.role === "content")
          .length ?? 0
      );
    });

    // 4. Transition preference to reduce at runtime
    await page.emulateMedia({ reducedMotion: "reduce" });

    // 5. Verify a NEW pause() call occurred upon switching to reduced motion
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const testHarness = (
            window as unknown as {
              __storyMediaTest?: { mediaCalls: { pauseCalls: Array<{ role: string }> } };
            }
          ).__storyMediaTest;
          return (
            testHarness?.mediaCalls.pauseCalls.filter((c: { role: string }) => c.role === "content")
              .length ?? 0
          );
        });
      })
      .toBeGreaterThan(preTransitionPauseCalls);

    // 6. Content video player toggle returns to non-playing state and remains operable
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
    await expect(playToggle).toHaveText("Reproducir");
  });

  test("E4: verifies viewport threshold boundary 0.49 vs 0.50 and 0.75->0.40 regression through browser observer", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installStoryMediaTestHarness(page);
    await page.goto("/productos/mouse-pro-mod-01");

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();

    // Wait until component has mounted and observer is active
    await page.waitForFunction(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { hasActiveObserver: (role: string) => boolean };
        }
      ).__storyMediaTest;
      return testHarness?.hasActiveObserver("content");
    });

    // Step 1: ratio = 0.49 (< 0.50 boundary) -> no autoplay
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("content", 0.49, true);
    });

    const playCallsAt49 = await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: { mediaCalls: { playCalls: Array<{ role: string }> } };
        }
      ).__storyMediaTest;
      return (
        testHarness?.mediaCalls.playCalls.filter((c: { role: string }) => c.role === "content")
          .length ?? 0
      );
    });
    expect(playCallsAt49).toBe(0);
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");

    // Step 2: ratio = 0.50 (exact >= 0.50 threshold) -> autoplay permitted
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("content", 0.5, true);
    });

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const testHarness = (
            window as unknown as {
              __storyMediaTest?: { mediaCalls: { playCalls: Array<{ role: string }> } };
            }
          ).__storyMediaTest;
          return (
            testHarness?.mediaCalls.playCalls.filter((c: { role: string }) => c.role === "content")
              .length ?? 0
          );
        });
      })
      .toBe(1);

    await expect(playToggle).toHaveAttribute("aria-label", "Pausar video");

    // Step 3: ratio = 0.75 -> still active
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("content", 0.75, true);
    });
    await expect(playToggle).toHaveAttribute("aria-label", "Pausar video");

    // Step 4 (Regression): ratio drops from 0.75 to 0.40 with isIntersecting = true -> MUST PAUSE
    await page.evaluate(() => {
      const testHarness = (
        window as unknown as {
          __storyMediaTest?: {
            dispatchIntersection: (role: string, ratio: number, isIntersecting?: boolean) => void;
          };
        }
      ).__storyMediaTest;
      testHarness?.dispatchIntersection("content", 0.4, true);
    });

    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
    await expect(playToggle).toHaveText("Reproducir");
  });

  test("F: related products cards render with valid links and pricing", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const relatedBlock = page.getByTestId("story-related-products-block");
    await expect(relatedBlock).toBeVisible();

    const relatedCards = relatedBlock.getByTestId("product-card");
    const count = await relatedCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First card contains title and links to /productos/[slug]
    const firstCard = relatedCards.first();
    await expect(firstCard).toBeVisible();
    const link = firstCard.locator("a").first();
    await expect(link).toHaveAttribute("href", /^\/productos\//);
  });

  test("G: mobile viewport 360px has zero horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/productos/mouse-pro-mod-01");

    const hasHorizontalScroll = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 // 1px tolerance for subpixel rounding
      );
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test("H: passes WCAG 2.1 AA accessibility audit on complete PDP with Product Story", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("I: DB3B Commerce Hero interactions remain fully functional alongside Product Story", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Commerce Hero pricing
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 129.90");

    // Swatch selection updates SKU and price
    const whiteSwatch = page.getByTestId("swatch-option-Blanco");
    await whiteSwatch.click();
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 139.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-WHT");

    // Product Story remains unaffected beneath
    await expect(page.getByTestId("product-story-section")).toBeVisible();
  });
});
