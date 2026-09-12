import { describe, expect, it } from "vitest";
import { validateNonSecretSettings } from "@/lib/ai/provider-service";

describe("AI Provider Non-Secret Settings Validation", () => {
  it("allows safe non-secret configuration options", () => {
    const safeSettings = {
      timeoutMs: 15000,
      maxRetries: 3,
      allowedModels: ["gemini-1.5-flash", "gemini-1.5-pro"],
      rateLimit: {
        requestsPerMinute: 60,
      },
    };

    const result = validateNonSecretSettings(safeSettings);
    expect(result).toEqual(safeSettings);
  });

  it("handles null and empty input by returning empty object", () => {
    expect(validateNonSecretSettings(null)).toEqual({});
    expect(validateNonSecretSettings(undefined)).toEqual({});
    expect(validateNonSecretSettings({})).toEqual({});
  });

  it("throws for non-object root inputs", () => {
    expect(() => validateNonSecretSettings("invalid")).toThrow();
    expect(() => validateNonSecretSettings(1234)).toThrow();
    expect(() => validateNonSecretSettings([1, 2, 3])).toThrow();
  });

  it("rejects top-level credential-like keys", () => {
    const forbiddenKeys = [
      "apiKey",
      "api_key",
      "accessToken",
      "access_token",
      "token",
      "secret",
      "password",
      "credential",
      "privateKey",
      "private_key",
    ];

    for (const key of forbiddenKeys) {
      expect(() =>
        validateNonSecretSettings({
          [key]: "some-value",
          timeoutMs: 5000,
        })
      ).toThrow("REJECTED_SECRET_SETTINGS_KEY");
    }
  });

  it("rejects forbidden keys at arbitrary object depth and inside arrays", () => {
    // Nested inside sub-object
    expect(() =>
      validateNonSecretSettings({
        options: {
          client: {
            apiKey: "hidden-key",
          },
        },
      })
    ).toThrow("REJECTED_SECRET_SETTINGS_KEY");

    // Nested inside array
    expect(() =>
      validateNonSecretSettings({
        configs: [{ timeout: 1000 }, { auth: { token: "sensitive-token" } }],
      })
    ).toThrow("REJECTED_SECRET_SETTINGS_KEY");

    // Normalized variations (e.g. private_key, PRIVATEKEY)
    expect(() =>
      validateNonSecretSettings({
        gateway: {
          PRIVATEKEY: "some-key",
        },
      })
    ).toThrow("REJECTED_SECRET_SETTINGS_KEY");
  });
});
