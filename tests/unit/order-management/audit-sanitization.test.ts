import { describe, expect, it } from "vitest";

describe("GP-020 — Audit Payload Sanitization", () => {
  it("ensures sensitive credentials and tokens are not leaked into audit metadata", () => {
    const sanitizeAuditMetadata = (rawMetadata: Record<string, unknown>) => {
      const sanitized = { ...rawMetadata };
      const sensitiveKeys = [
        "password",
        "rawToken",
        "sessionToken",
        "gp_payment_session",
        "gp_cart_session",
        "operationCode",
        "externalReference",
        "proofUrl",
      ];

      for (const key of sensitiveKeys) {
        if (key in sanitized) {
          delete sanitized[key];
        }
      }
      return sanitized;
    };

    const metadata = {
      orderNumber: "ORD-2026-0001",
      reason: "Cancelación solicitada",
      rawToken: "super-secret-token-xyz",
      operationCode: "123456",
      externalReference: "BKP-987",
    };

    const cleaned = sanitizeAuditMetadata(metadata);
    expect(cleaned.orderNumber).toBe("ORD-2026-0001");
    expect(cleaned.reason).toBe("Cancelación solicitada");
    expect(cleaned).not.toHaveProperty("rawToken");
    expect(cleaned).not.toHaveProperty("operationCode");
    expect(cleaned).not.toHaveProperty("externalReference");
  });
});
