import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "@/lib/logger";
import { sanitizeObject, sentryBeforeSend } from "@/lib/observability/sentry-sanitize";
import type { ErrorEvent } from "@sentry/nextjs";

function captureLog(
  fn: (logger: ReturnType<typeof createLogger>) => void
): Record<string, unknown> {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  const testLogger = createLogger({ level: "debug" }, stream);
  fn(testLogger);

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("Dynamic AI Secret Redaction (Logger & Sentry)", () => {
  describe("Dynamic Logger Redaction", () => {
    it("redacts dynamic AI encryption keys V1, V2, and V37 at top level", () => {
      const log = captureLog((l) => {
        l.info({
          AI_ENCRYPTION_KEY_V1: "secret_value_v1",
          AI_ENCRYPTION_KEY_V2: "secret_value_v2",
          AI_ENCRYPTION_KEY_V37: "secret_value_v37",
          safeField: "safe-content",
        });
      });

      expect(log.AI_ENCRYPTION_KEY_V1).toBe("[REDACTED]");
      expect(log.AI_ENCRYPTION_KEY_V2).toBe("[REDACTED]");
      expect(log.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(log.safeField).toBe("safe-content");
    });

    it("redacts dynamic AI encryption keys at arbitrary object depth", () => {
      const log = captureLog((l) => {
        l.info({
          config: {
            crypto: {
              activeVersion: 37,
              AI_ENCRYPTION_KEY_V37: "nested_secret_v37",
              deeper: {
                ai_encryption_key_v2: "lowercase_nested_v2",
              },
            },
          },
        });
      });

      const config = log.config as Record<string, unknown>;
      const crypto = config.crypto as Record<string, unknown>;
      const deeper = crypto.deeper as Record<string, unknown>;

      expect(crypto.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(deeper.ai_encryption_key_v2).toBe("[REDACTED]");
      expect(crypto.activeVersion).toBe(37);
    });

    it("redacts dynamic AI encryption keys in child loggers and bindings", () => {
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });

      const rootLogger = createLogger({ level: "debug" }, stream);
      const childLogger = rootLogger.child({
        submodule: "ai-worker",
        AI_ENCRYPTION_KEY_V2: "child_binding_secret_v2",
      });

      childLogger.info(
        {
          nested: {
            AI_ENCRYPTION_KEY_V37: "child_logged_nested_secret_v37",
          },
        },
        "Child execution"
      );

      const raw = Buffer.concat(chunks).toString("utf8").trim();
      const log = JSON.parse(raw) as Record<string, unknown>;

      expect(log.AI_ENCRYPTION_KEY_V2).toBe("[REDACTED]");
      const nested = log.nested as Record<string, unknown>;
      expect(nested.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(log.submodule).toBe("ai-worker");
    });
  });

  describe("Dynamic Sentry Redaction", () => {
    it("redacts dynamic AI encryption keys V1, V2, and V37 in Sentry sanitized objects", () => {
      const sensitiveData = {
        AI_ENCRYPTION_KEY_V1: "secret_sentry_v1",
        ai_encryption_key_v2: "secret_sentry_v2",
        AI_ENCRYPTION_KEY_V37: "secret_sentry_v37",
        safeMeta: "safe-info",
      };

      const sanitized = sanitizeObject(sensitiveData);

      expect(sanitized.AI_ENCRYPTION_KEY_V1).toBe("[REDACTED]");
      expect(sanitized.ai_encryption_key_v2).toBe("[REDACTED]");
      expect(sanitized.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(sanitized.safeMeta).toBe("safe-info");
    });

    it("redacts dynamic AI keys at arbitrary depth in Sentry error events", () => {
      const dummyEvent = {
        event_id: "test-event-123",
        extra: {
          runtimeConfig: {
            providerSecrets: {
              AI_ENCRYPTION_KEY_V37: "nested_sentry_v37",
            },
          },
        },
      } as unknown as ErrorEvent;

      const result = sentryBeforeSend(dummyEvent);
      expect(result).not.toBeNull();

      const extra = result?.extra as Record<string, unknown>;
      const runtimeConfig = extra.runtimeConfig as Record<string, unknown>;
      const providerSecrets = runtimeConfig.providerSecrets as Record<string, unknown>;

      expect(providerSecrets.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
    });
  });
});
