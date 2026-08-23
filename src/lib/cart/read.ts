import "server-only";
import { getCurrentCart as getCurrentCartService } from "./service";
import type { CartReadResult } from "./types";

/**
 * Server-side read function for retrieving current authoritative CartSnapshot.
 */
export async function getCurrentCart(): Promise<CartReadResult> {
  return getCurrentCartService();
}
