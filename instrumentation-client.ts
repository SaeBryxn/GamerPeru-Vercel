import type * as SentryModule from "@sentry/nextjs";
import { sentryBeforeSend } from "@/lib/observability/sentry-sanitize";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentry: typeof SentryModule | undefined;

// The browser SDK is ~85 KiB gzip. Imported statically it ships in every page's first load even
// when no DSN is configured, so it is fetched only with a DSN and after the page goes idle.
if (SENTRY_DSN && typeof window !== "undefined") {
  const load = () => {
    void import("@sentry/nextjs").then((module) => {
      module.init({
        dsn: SENTRY_DSN,
        sendDefaultPii: false,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        environment: process.env.NODE_ENV ?? "development",
        beforeSend: sentryBeforeSend,
      });
      sentry = module;
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 4000 });
  } else {
    setTimeout(load, 2000);
  }
}

export function onRouterTransitionStart(href: string, navigationType: string): void {
  sentry?.captureRouterTransitionStart(href, navigationType);
}
