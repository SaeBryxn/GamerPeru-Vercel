import "server-only";

import { fetchDestination } from "./destination-fetcher";
import { assignSourceTrust } from "./source-service";
import type { ExternalProductEvidence } from "./types";
import type { DestinationFetchResult } from "./destination-fetcher";

export async function acquireDirectUrlEvidence(options: {
  url: string;
  userAgent: string;
  canonicalBrandHostname?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetchDestination;
}): Promise<ExternalProductEvidence> {
  const result: DestinationFetchResult = await (options.fetcher ?? fetchDestination)({
    url: options.url,
    userAgent: options.userAgent,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return {
    ...result,
    retrievalMethod: "DIRECT_URL",
    ...assignSourceTrust(result.resolvedUrl, options.canonicalBrandHostname),
  };
}
