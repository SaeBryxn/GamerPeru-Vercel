import "server-only";

import { createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function noteActorDigest(authUserId: string): string {
  return sha256(`order_note_actor:${authUserId}`);
}

export function noteIntentFingerprint(orderId: string, actorDigest: string, body: string): string {
  const parts = [orderId, actorDigest, body].map(
    (part) => `${Buffer.byteLength(part, "utf8")}:${part}`
  );
  return sha256(`order_note_intent:${parts.join("")}`);
}

export function noteAuditRequestId(mutationRequestId: string): string {
  return sha256(`order_note_request:${mutationRequestId}`);
}
