/**
 * Reports an error caught by a client error boundary. The SDK is imported on demand because a
 * static import also pulls the Sentry server SDK into the boundary's server render, and that SDK
 * compiles WebAssembly at load time, which Cloudflare Workers forbid. Call only from effects.
 */
export function reportClientError(error: Error): void {
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}
