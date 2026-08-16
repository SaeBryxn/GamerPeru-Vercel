import "server-only";

export function generateRequestId(): string {
  return crypto.randomUUID();
}
