import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "@/lib/logger";
import { sanitizeObject, sentryBeforeSend } from "@/lib/observability/sentry-sanitize";
import type { ErrorEvent } from "@sentry/nextjs";

function captureLog(fn: (logger: ReturnType<typeof createLogger>) => void): {
  parsed: Record<string, unknown>;
  raw: string;
} {
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
  return { parsed: JSON.parse(raw) as Record<string, unknown>, raw };
}

describe("Dynamic AI Secret Redaction (Logger & Sentry)", () => {
  describe("Dynamic Logger Redaction", () => {
    it("redacts Tavily key fields, tvly-* values, and Authorization bearer values", () => {
      const { parsed: log, raw } = captureLog((l) => {
        l.info({
          TAVILY_API_KEY: "tvly-field-secret",
          nested: { tavilyApiKey: "tvly-nested-secret" },
          query: "operator supplied product text",
          diagnostic: "Authorization: Bearer tvly-inline-secret",
        });
      });
      expect(log.TAVILY_API_KEY).toBe("[REDACTED]");
      expect((log.nested as Record<string, unknown>).tavilyApiKey).toBe("[REDACTED]");
      expect(log.query).toBe("[REDACTED]");
      expect(log.diagnostic).toBe("Authorization: Bearer [REDACTED]");
      expect(raw).not.toMatch(/tvly-(?:field|nested|inline)-secret/);
    });
    it("redacts dynamic AI encryption keys V1, V2, and V37 at top level", () => {
      const { parsed: log, raw } = captureLog((l) => {
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

      expect(raw).not.toContain("secret_value_v1");
      expect(raw).not.toContain("secret_value_v2");
      expect(raw).not.toContain("secret_value_v37");
    });

    it("redacts dynamic AI encryption keys at arbitrary object depth", () => {
      const { parsed: log, raw } = captureLog((l) => {
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

      expect(raw).not.toContain("nested_secret_v37");
      expect(raw).not.toContain("lowercase_nested_v2");
    });

    it("redacts credential material: ciphertext, iv, authTag, auth_tag, accessToken, refreshToken, bearerToken", () => {
      const { parsed: log, raw } = captureLog((l) => {
        l.info({
          ciphertext: "aabbccdd11223344",
          iv: "112233445566778899001122",
          authTag: "ffeeddccbbaa99887766554433221100",
          auth_tag: "00112233445566778899aabbccddeeff",
          accessToken: "ya29.sensitive-google-token",
          refreshToken: "1//04sensitive-refresh-token",
          bearerToken: "sk-proj-sensitive-bearer-token",
          safeField: "regular-data",
        });
      });

      expect(log.ciphertext).toBe("[REDACTED]");
      expect(log.iv).toBe("[REDACTED]");
      expect(log.authTag).toBe("[REDACTED]");
      expect(log.auth_tag).toBe("[REDACTED]");
      expect(log.accessToken).toBe("[REDACTED]");
      expect(log.refreshToken).toBe("[REDACTED]");
      expect(log.bearerToken).toBe("[REDACTED]");
      expect(log.safeField).toBe("regular-data");

      expect(raw).not.toContain("aabbccdd11223344");
      expect(raw).not.toContain("112233445566778899001122");
      expect(raw).not.toContain("ffeeddccbbaa99887766554433221100");
      expect(raw).not.toContain("00112233445566778899aabbccddeeff");
      expect(raw).not.toContain("ya29.sensitive-google-token");
      expect(raw).not.toContain("1//04sensitive-refresh-token");
      expect(raw).not.toContain("sk-proj-sensitive-bearer-token");
    });

    it("redacts dynamic AI encryption keys and credential material in child loggers and bindings", () => {
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
        auth_tag: "child_binding_tag_32hex000111222",
        accessToken: "child_binding_access_token",
      });

      childLogger.info(
        {
          nested: {
            AI_ENCRYPTION_KEY_V37: "child_logged_nested_secret_v37",
            ciphertext: "child_logged_ciphertext_secret",
            refreshToken: "child_logged_refresh_token",
            bearerToken: "child_logged_bearer_token",
          },
        },
        "Child execution"
      );

      const raw = Buffer.concat(chunks).toString("utf8").trim();
      const log = JSON.parse(raw) as Record<string, unknown>;

      expect(log.AI_ENCRYPTION_KEY_V2).toBe("[REDACTED]");
      expect(log.auth_tag).toBe("[REDACTED]");
      expect(log.accessToken).toBe("[REDACTED]");

      const nested = log.nested as Record<string, unknown>;
      expect(nested.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(nested.ciphertext).toBe("[REDACTED]");
      expect(nested.refreshToken).toBe("[REDACTED]");
      expect(nested.bearerToken).toBe("[REDACTED]");
      expect(log.submodule).toBe("ai-worker");

      expect(raw).not.toContain("child_binding_secret_v2");
      expect(raw).not.toContain("child_binding_tag_32hex000111222");
      expect(raw).not.toContain("child_binding_access_token");
      expect(raw).not.toContain("child_logged_nested_secret_v37");
      expect(raw).not.toContain("child_logged_ciphertext_secret");
      expect(raw).not.toContain("child_logged_refresh_token");
      expect(raw).not.toContain("child_logged_bearer_token");
    });

    it("redacts sensitive container objects and arrays at root level in Logger, replacing container with [REDACTED]", () => {
      const { parsed: log, raw } = captureLog((l) => {
        l.info({
          credential: {
            value: "credential-object-secret",
          },
          credentials: [{ value: "credential-array-secret" }],
          authorization: {
            raw: "Bearer authorization-object-secret",
          },
          apiKey: {
            value: "api-key-object-secret",
          },
          AI_ENCRYPTION_KEY_V37: {
            raw: "master-key-object-secret",
          },
          safeField: "safe-data-field",
        });
      });

      expect(log.credential).toBe("[REDACTED]");
      expect(log.credentials).toBe("[REDACTED]");
      expect(log.authorization).toBe("[REDACTED]");
      expect(log.apiKey).toBe("[REDACTED]");
      expect(log.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(log.safeField).toBe("safe-data-field");

      expect(raw).not.toContain("credential-object-secret");
      expect(raw).not.toContain("credential-array-secret");
      expect(raw).not.toContain("authorization-object-secret");
      expect(raw).not.toContain("Bearer authorization-object-secret");
      expect(raw).not.toContain("api-key-object-secret");
      expect(raw).not.toContain("master-key-object-secret");
    });

    it("redacts sensitive container objects and arrays in child logger bindings and child payloads", () => {
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });

      const rootLogger = createLogger({ level: "debug" }, stream);
      const childLogger = rootLogger.child({
        subsystem: "ai-orchestrator",
        credential: {
          value: "child-binding-credential-secret",
        },
        credentials: [{ value: "child-binding-credentials-secret" }],
        authorization: {
          raw: "Bearer child-binding-auth-secret",
        },
        apiKey: {
          value: "child-binding-api-key-secret",
        },
        AI_ENCRYPTION_KEY_V37: {
          raw: "child-binding-master-key-secret",
        },
      });

      childLogger.info(
        {
          credential: {
            value: "child-payload-credential-secret",
          },
          credentials: [{ value: "child-payload-credentials-secret" }],
          authorization: {
            raw: "Bearer child-payload-auth-secret",
          },
          apiKey: {
            value: "child-payload-api-key-secret",
          },
          AI_ENCRYPTION_KEY_V37: {
            raw: "child-payload-master-key-secret",
          },
          safeContext: "child-safe",
        },
        "Child container log"
      );

      const raw = Buffer.concat(chunks).toString("utf8").trim();
      const log = JSON.parse(raw) as Record<string, unknown>;

      expect(log.credential).toBe("[REDACTED]");
      expect(log.credentials).toBe("[REDACTED]");
      expect(log.authorization).toBe("[REDACTED]");
      expect(log.apiKey).toBe("[REDACTED]");
      expect(log.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(log.subsystem).toBe("ai-orchestrator");
      expect(log.safeContext).toBe("child-safe");

      expect(raw).not.toContain("child-binding-credential-secret");
      expect(raw).not.toContain("child-binding-credentials-secret");
      expect(raw).not.toContain("child-binding-auth-secret");
      expect(raw).not.toContain("child-binding-api-key-secret");
      expect(raw).not.toContain("child-binding-master-key-secret");
      expect(raw).not.toContain("child-payload-credential-secret");
      expect(raw).not.toContain("child-payload-credentials-secret");
      expect(raw).not.toContain("child-payload-auth-secret");
      expect(raw).not.toContain("child-payload-api-key-secret");
      expect(raw).not.toContain("child-payload-master-key-secret");
    });
  });

  describe("Dynamic Sentry Redaction", () => {
    it("redacts Tavily and bearer values in Sentry strings and containers", () => {
      const sanitized = sanitizeObject({
        TAVILY_API_KEY: "tvly-field-secret",
        diagnostic: "Bearer tvly-inline-secret",
      });
      expect(sanitized.TAVILY_API_KEY).toBe("[REDACTED]");
      expect(sanitized.diagnostic).toBe("Bearer [REDACTED]");
      expect(JSON.stringify(sanitized)).not.toContain("tvly-");
    });
    it("redacts dynamic AI encryption keys and credential material in Sentry sanitized objects", () => {
      const sensitiveData = {
        AI_ENCRYPTION_KEY_V1: "secret_sentry_v1",
        ai_encryption_key_v2: "secret_sentry_v2",
        AI_ENCRYPTION_KEY_V37: "secret_sentry_v37",
        ciphertext: "sentry_ciphertext_value",
        iv: "sentry_iv_value",
        authTag: "sentry_authtag_value",
        auth_tag: "sentry_auth_tag_value",
        accessToken: "sentry_access_token",
        refreshToken: "sentry_refresh_token",
        safeMeta: "safe-info",
      };

      const sanitized = sanitizeObject(sensitiveData);

      expect(sanitized.AI_ENCRYPTION_KEY_V1).toBe("[REDACTED]");
      expect(sanitized.ai_encryption_key_v2).toBe("[REDACTED]");
      expect(sanitized.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(sanitized.ciphertext).toBe("[REDACTED]");
      expect(sanitized.iv).toBe("[REDACTED]");
      expect(sanitized.authTag).toBe("[REDACTED]");
      expect(sanitized.auth_tag).toBe("[REDACTED]");
      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.refreshToken).toBe("[REDACTED]");
      expect(sanitized.safeMeta).toBe("safe-info");

      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain("secret_sentry_v1");
      expect(serialized).not.toContain("secret_sentry_v2");
      expect(serialized).not.toContain("secret_sentry_v37");
      expect(serialized).not.toContain("sentry_ciphertext_value");
      expect(serialized).not.toContain("sentry_iv_value");
      expect(serialized).not.toContain("sentry_authtag_value");
      expect(serialized).not.toContain("sentry_auth_tag_value");
      expect(serialized).not.toContain("sentry_access_token");
      expect(serialized).not.toContain("sentry_refresh_token");
    });

    it("redacts sensitive container objects and arrays in Sentry sanitizeObject", () => {
      const sensitiveContainers = {
        credential: {
          value: "credential-object-secret",
        },
        credentials: [{ value: "credential-array-secret" }],
        authorization: {
          raw: "Bearer authorization-object-secret",
        },
        apiKey: {
          value: "api-key-object-secret",
        },
        AI_ENCRYPTION_KEY_V37: {
          raw: "master-key-object-secret",
        },
        safeMeta: "safe-sentry-info",
      };

      const sanitized = sanitizeObject(sensitiveContainers);

      expect(sanitized.credential).toBe("[REDACTED]");
      expect(sanitized.credentials).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");
      expect(sanitized.safeMeta).toBe("safe-sentry-info");

      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain("credential-object-secret");
      expect(serialized).not.toContain("credential-array-secret");
      expect(serialized).not.toContain("authorization-object-secret");
      expect(serialized).not.toContain("Bearer authorization-object-secret");
      expect(serialized).not.toContain("api-key-object-secret");
      expect(serialized).not.toContain("master-key-object-secret");
    });

    it("redacts dynamic AI keys and credential material at arbitrary depth in Sentry error events", () => {
      const dummyEvent = {
        event_id: "test-event-123",
        extra: {
          runtimeConfig: {
            providerSecrets: {
              AI_ENCRYPTION_KEY_V37: "nested_sentry_v37",
              ciphertext: "nested_sentry_ciphertext",
              iv: "nested_sentry_iv",
              authTag: "nested_sentry_authtag",
              auth_tag: "nested_sentry_auth_tag",
              accessToken: "nested_sentry_access_token",
              refreshToken: "nested_sentry_refresh_token",
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
      expect(providerSecrets.ciphertext).toBe("[REDACTED]");
      expect(providerSecrets.iv).toBe("[REDACTED]");
      expect(providerSecrets.authTag).toBe("[REDACTED]");
      expect(providerSecrets.auth_tag).toBe("[REDACTED]");
      expect(providerSecrets.accessToken).toBe("[REDACTED]");
      expect(providerSecrets.refreshToken).toBe("[REDACTED]");

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("nested_sentry_v37");
      expect(serialized).not.toContain("nested_sentry_ciphertext");
      expect(serialized).not.toContain("nested_sentry_iv");
      expect(serialized).not.toContain("nested_sentry_authtag");
      expect(serialized).not.toContain("nested_sentry_auth_tag");
      expect(serialized).not.toContain("nested_sentry_access_token");
      expect(serialized).not.toContain("nested_sentry_refresh_token");
    });

    it("redacts sensitive container objects and arrays across Sentry ErrorEvent extra, contexts, breadcrumbs, and request", () => {
      const dummyEvent = {
        event_id: "test-container-event-456",
        extra: {
          credential: {
            value: "extra-credential-secret",
          },
          credentials: [{ value: "extra-credentials-secret" }],
          authorization: {
            raw: "Bearer extra-auth-secret",
          },
          apiKey: {
            value: "extra-apikey-secret",
          },
          AI_ENCRYPTION_KEY_V37: {
            raw: "extra-v37-secret",
          },
        },
        contexts: {
          secretsContainer: {
            credential: {
              value: "context-credential-secret",
            },
            credentials: [{ value: "context-credentials-secret" }],
            authorization: {
              raw: "Bearer context-auth-secret",
            },
            apiKey: {
              value: "context-apikey-secret",
            },
            AI_ENCRYPTION_KEY_V37: {
              raw: "context-v37-secret",
            },
          },
        },
        breadcrumbs: [
          {
            message: "Processing AI provider credential",
            data: {
              credential: {
                value: "breadcrumb-credential-secret",
              },
              credentials: [{ value: "breadcrumb-credentials-secret" }],
              authorization: {
                raw: "Bearer breadcrumb-auth-secret",
              },
              apiKey: {
                value: "breadcrumb-apikey-secret",
              },
              AI_ENCRYPTION_KEY_V37: {
                raw: "breadcrumb-v37-secret",
              },
            },
          },
        ],
        request: {
          headers: {
            authorization: {
              raw: "Bearer request-header-auth-secret",
            },
            apiKey: {
              value: "request-header-apikey-secret",
            },
            "content-type": "application/json",
          },
          data: {
            credential: {
              value: "request-body-credential-secret",
            },
            credentials: [{ value: "request-body-credentials-secret" }],
            AI_ENCRYPTION_KEY_V37: {
              raw: "request-body-v37-secret",
            },
          },
        },
      } as unknown as ErrorEvent;

      const result = sentryBeforeSend(dummyEvent);
      expect(result).not.toBeNull();

      const extra = result?.extra as Record<string, unknown>;
      expect(extra.credential).toBe("[REDACTED]");
      expect(extra.credentials).toBe("[REDACTED]");
      expect(extra.authorization).toBe("[REDACTED]");
      expect(extra.apiKey).toBe("[REDACTED]");
      expect(extra.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");

      const contexts = result?.contexts as Record<string, Record<string, unknown>>;
      const secretsContainer = contexts.secretsContainer!;
      expect(secretsContainer.credential).toBe("[REDACTED]");
      expect(secretsContainer.credentials).toBe("[REDACTED]");
      expect(secretsContainer.authorization).toBe("[REDACTED]");
      expect(secretsContainer.apiKey).toBe("[REDACTED]");
      expect(secretsContainer.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");

      const breadcrumbData = result?.breadcrumbs?.[0]?.data as Record<string, unknown>;
      expect(breadcrumbData.credential).toBe("[REDACTED]");
      expect(breadcrumbData.credentials).toBe("[REDACTED]");
      expect(breadcrumbData.authorization).toBe("[REDACTED]");
      expect(breadcrumbData.apiKey).toBe("[REDACTED]");
      expect(breadcrumbData.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");

      const headers = result?.request?.headers as Record<string, unknown>;
      expect(headers.authorization).toBe("[REDACTED]");
      expect(headers.apiKey).toBe("[REDACTED]");
      expect(headers["content-type"]).toBe("application/json");

      const reqData = result?.request?.data as Record<string, unknown>;
      expect(reqData.credential).toBe("[REDACTED]");
      expect(reqData.credentials).toBe("[REDACTED]");
      expect(reqData.AI_ENCRYPTION_KEY_V37).toBe("[REDACTED]");

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("extra-credential-secret");
      expect(serialized).not.toContain("extra-credentials-secret");
      expect(serialized).not.toContain("extra-auth-secret");
      expect(serialized).not.toContain("extra-apikey-secret");
      expect(serialized).not.toContain("extra-v37-secret");
      expect(serialized).not.toContain("context-credential-secret");
      expect(serialized).not.toContain("context-credentials-secret");
      expect(serialized).not.toContain("context-auth-secret");
      expect(serialized).not.toContain("context-apikey-secret");
      expect(serialized).not.toContain("context-v37-secret");
      expect(serialized).not.toContain("breadcrumb-credential-secret");
      expect(serialized).not.toContain("breadcrumb-credentials-secret");
      expect(serialized).not.toContain("breadcrumb-auth-secret");
      expect(serialized).not.toContain("breadcrumb-apikey-secret");
      expect(serialized).not.toContain("breadcrumb-v37-secret");
      expect(serialized).not.toContain("request-header-auth-secret");
      expect(serialized).not.toContain("request-header-apikey-secret");
      expect(serialized).not.toContain("request-body-credential-secret");
      expect(serialized).not.toContain("request-body-credentials-secret");
      expect(serialized).not.toContain("request-body-v37-secret");
    });
  });
});
