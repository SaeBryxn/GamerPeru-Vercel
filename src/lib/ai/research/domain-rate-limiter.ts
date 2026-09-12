import "server-only";

import { AI_RESEARCH_LIMITS } from "./config";

export class DomainRateLimiter {
  private readonly lastRequestAt = new Map<string, number>();

  constructor(
    private readonly sleep: (milliseconds: number) => Promise<void> = async (milliseconds) => {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
    private readonly now: () => number = Date.now
  ) {}

  async wait(hostname: string, crawlDelayMs = 0): Promise<void> {
    const interval = Math.max(AI_RESEARCH_LIMITS.minimumHostIntervalMs, crawlDelayMs);
    const elapsed = this.now() - (this.lastRequestAt.get(hostname) ?? 0);
    if (elapsed < interval) await this.sleep(interval - elapsed);
    this.lastRequestAt.set(hostname, this.now());
  }
}

export const researchDomainRateLimiter = new DomainRateLimiter();
