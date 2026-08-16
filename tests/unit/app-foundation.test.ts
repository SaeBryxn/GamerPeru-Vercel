import { Writable } from "node:stream";
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/config/app";
import { generateRequestId } from "@/lib/correlation";
import { AppError, toPublicError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import {
  sanitizeObject,
  sanitizeString,
  sentryBeforeSend,
} from "@/lib/observability/sentry-sanitize";

describe("Application Foundation — Configuration", () => {
  it("exports valid canonical application metadata without unapproved legal entity", () => {
    expect(APP_CONFIG.name).toBe("Gamer Perú");
    expect(APP_CONFIG.defaultLocale).toBe("es-PE");
    expect(APP_CONFIG.defaultCurrency).toBe("PEN");
    expect(APP_CONFIG.canonicalHost).toBe("gamerperu.com");
    expect(APP_CONFIG.publicTitle).toContain("Gamer Perú");
    // Ensure no unapproved legal name was invented in runtime metadata
    expect((APP_CONFIG as Record<string, unknown>).legalName).toBeUndefined();
  });
});

describe("Application Foundation — Error Taxonomy & Sanitization", () => {
  it("instantiates AppError with correct defaults and properties", () => {
    const error = new AppError({
      code: "TEST_ERROR",
      statusCode: 418,
      message: "Internal reason",
      publicMessage: "Mensaje público seguro",
    });

    expect(error.name).toBe("AppError");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.statusCode).toBe(418);
    expect(error.message).toBe("Internal reason");
    expect(error.publicMessage).toBe("Mensaje público seguro");
    expect(error.isOperational).toBe(true);
  });

  it("provides functional factory methods for standard error classes", () => {
    const badRequest = AppError.badRequest("Invalid parameter", "Parámetro inválido");
    expect(badRequest.statusCode).toBe(400);
    expect(badRequest.code).toBe("BAD_REQUEST");
    expect(badRequest.publicMessage).toBe("Parámetro inválido");

    const unauthorized = AppError.unauthorized();
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.code).toBe("UNAUTHORIZED");

    const forbidden = AppError.forbidden();
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.code).toBe("FORBIDDEN");

    const notFound = AppError.notFound();
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe("NOT_FOUND");

    const internal = AppError.internal("DB Connection Timeout");
    expect(internal.statusCode).toBe(500);
    expect(internal.code).toBe("INTERNAL_SERVER_ERROR");
    expect(internal.isOperational).toBe(false);
  });

  it("sanitizes AppError into safe public error payload", () => {
    const error = AppError.badRequest("Internal query parameter failed", "Solicitud inválida");
    const publicPayload = toPublicError(error);

    expect(publicPayload).toEqual({
      code: "BAD_REQUEST",
      statusCode: 400,
      message: "Solicitud inválida",
    });
    expect((publicPayload as unknown as { stack?: string }).stack).toBeUndefined();
  });

  it("sanitizes unknown generic errors without exposing internal messages or stack traces", () => {
    const rawError = new Error(
      "FATAL: connection to server at 10.0.0.1 failed (password=secret123)"
    );
    const publicPayload = toPublicError(rawError);

    expect(publicPayload).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
      message: "Ocurrió un error inesperado. Por favor, inténtelo de nuevo más tarde.",
    });
    expect(publicPayload.message).not.toContain("password");
    expect(publicPayload.message).not.toContain("10.0.0.1");
  });

  it("sanitizes non-error throwables safely", () => {
    const publicPayload = toPublicError("string error");

    expect(publicPayload).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
      message: "Ocurrió un error inesperado. Por favor, inténtelo de nuevo más tarde.",
    });
  });
});

describe("Application Foundation — Request Correlation", () => {
  it("generates standard UUIDv4 request identifiers", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(id1).toMatch(uuidRegex);
    expect(id2).toMatch(uuidRegex);
    expect(id1).not.toBe(id2);
  });
});

describe("Application Foundation — Pino Server Logger Redaction", () => {
  function captureLog(
    fn: (testLogger: ReturnType<typeof createLogger>) => void
  ): Record<string, unknown> {
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const testLogger = createLogger({ level: "debug" }, stream);
    fn(testLogger);

    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it("redacts top-level and nested authentication credentials and secrets", () => {
    const log = captureLog((l) => {
      l.info(
        {
          password: "synthetic-plaintext-password",
          authorization: "Bearer synthetic-jwt-token",
          cookie: "sb-auth-token=synthetic-secret",
          token: "synthetic-access-token",
          access_token: "synthetic-oauth-token",
          refresh_token: "synthetic-refresh-token",
          secret: "synthetic-raw-secret",
          apiKey: "re_synthetic_resend_key",
          api_key: "synthetic_key",
          headers: {
            authorization: "Bearer synthetic-bearer-token",
            cookie: "synthetic-session=123",
          },
        },
        "User authentication attempt"
      );
    });

    expect(log.password).toBe("[REDACTED]");
    expect(log.authorization).toBe("[REDACTED]");
    expect(log.cookie).toBe("[REDACTED]");
    expect(log.token).toBe("[REDACTED]");
    expect(log.access_token).toBe("[REDACTED]");
    expect(log.refresh_token).toBe("[REDACTED]");
    expect(log.secret).toBe("[REDACTED]");
    expect(log.apiKey).toBe("[REDACTED]");
    expect(log.api_key).toBe("[REDACTED]");

    const headers = log.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
  });

  it("redacts canonical Gamer Perú environment secrets and payment references", () => {
    const log = captureLog((l) => {
      l.info(
        {
          DATABASE_URL: "postgres://synthetic_user:synthetic_pass@127.0.0.1:54322/db",
          SUPABASE_SECRET_KEY: "sb_secret_synthetic_key_12345",
          RESEND_API_KEY: "re_synthetic_resend_api_key",
          R2_ACCESS_KEY_ID: "synthetic_r2_access_key",
          R2_SECRET_ACCESS_KEY: "synthetic_r2_secret_key",
          INNGEST_EVENT_KEY: "synthetic_inngest_event_key",
          INNGEST_SIGNING_KEY: "synthetic_inngest_signing_key",
          AI_ENCRYPTION_KEY_V1: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          SENTRY_AUTH_TOKEN: "sntrys_synthetic_auth_token",
          operation_code: "12345678",
          proof_url: "https://r2.gamerperu.com/proofs/synthetic.jpg",
          voucher_url: "https://r2.gamerperu.com/vouchers/synthetic.pdf",
        },
        "Infrastructure initialized"
      );
    });

    expect(log.DATABASE_URL).toBe("[REDACTED]");
    expect(log.SUPABASE_SECRET_KEY).toBe("[REDACTED]");
    expect(log.RESEND_API_KEY).toBe("[REDACTED]");
    expect(log.R2_ACCESS_KEY_ID).toBe("[REDACTED]");
    expect(log.R2_SECRET_ACCESS_KEY).toBe("[REDACTED]");
    expect(log.INNGEST_EVENT_KEY).toBe("[REDACTED]");
    expect(log.INNGEST_SIGNING_KEY).toBe("[REDACTED]");
    expect(log.AI_ENCRYPTION_KEY_V1).toBe("[REDACTED]");
    expect(log.SENTRY_AUTH_TOKEN).toBe("[REDACTED]");
    expect(log.operation_code).toBe("[REDACTED]");
    expect(log.proof_url).toBe("[REDACTED]");
    expect(log.voucher_url).toBe("[REDACTED]");
  });

  it("preserves safe diagnostic fields and internal identifiers", () => {
    const log = captureLog((l) => {
      l.info(
        {
          module: "catalog",
          operation: "fetchProduct",
          requestId: "8f14e45f-7f8e-4a6c-9418-4e8979e3ec01",
          productId: "11111111-2222-3333-4444-555555555555",
          itemCount: 3,
        },
        "Product catalog queried"
      );
    });

    expect(log.module).toBe("catalog");
    expect(log.operation).toBe("fetchProduct");
    expect(log.requestId).toBe("8f14e45f-7f8e-4a6c-9418-4e8979e3ec01");
    expect(log.productId).toBe("11111111-2222-3333-4444-555555555555");
    expect(log.itemCount).toBe(3);
    expect(log.msg).toBe("Product catalog queried");
  });
});

describe("Application Foundation — Sentry Event Sanitization Boundary", () => {
  it("sanitizes connection string credentials and tokens from raw error messages", () => {
    const rawMsg =
      "Connection failed to postgresql://dbuser:supersecretpass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
    const sanitized = sanitizeString(rawMsg);

    expect(sanitized).toBe(
      "Connection failed to postgres://[REDACTED_CREDENTIALS]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
    );
    expect(sanitized).not.toContain("supersecretpass");
    expect(sanitized).not.toContain("dbuser");
  });

  it("sanitizes signed URLs with access signatures", () => {
    const rawUrl =
      "Error fetching proof: https://r2.gamerperu.com/proofs/123.jpg?X-Amz-Signature=abcdef123456&key=val";
    const sanitized = sanitizeString(rawUrl);

    expect(sanitized).toBe("Error fetching proof: [REDACTED_SIGNED_URL]");
  });

  it("sanitizes JWTs and 64-character hex master keys in strings", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature";
    const hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(sanitizeString(`Token: ${jwt}`)).toBe("Token: [REDACTED_JWT]");
    expect(sanitizeString(`Key: ${hexKey}`)).toBe("Key: [REDACTED_KEY]");
  });

  it("sanitizes nested objects containing credentials without mutating source", () => {
    const source = {
      user: "customer_1",
      credentials: {
        password: "raw_password",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      },
      headers: {
        authorization: "Bearer secret-token",
        "user-agent": "Mozilla/5.0",
      },
    };

    const sanitized = sanitizeObject(source);

    expect(sanitized.credentials.password).toBe("[REDACTED]");
    expect(sanitized.credentials.DATABASE_URL).toBe("[REDACTED]");
    expect(sanitized.headers.authorization).toBe("[REDACTED]");
    expect(sanitized.headers["user-agent"]).toBe("Mozilla/5.0");
    expect(sanitized.user).toBe("customer_1");

    // Source object remained unmutated
    expect(source.credentials.password).toBe("raw_password");
  });

  it("processes Sentry ErrorEvent through sentryBeforeSend cleanly", () => {
    const mockEvent: ErrorEvent = {
      type: undefined,
      event_id: "test-event-123",
      level: "error",
      message: "DB connection error postgres://admin:secret123@localhost/postgres",
      exception: {
        values: [
          {
            type: "DatabaseError",
            value:
              "Failed query with token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig",
          },
        ],
      },
      request: {
        url: "https://gamerperu.com/api/test",
        headers: {
          authorization: "Bearer sensitive-token",
          cookie: "session=sensitive-session",
          "content-type": "application/json",
        },
        cookies: {
          session: "sensitive-session",
        },
        data: {
          operation_code: "98765432",
          voucher_url: "https://r2.gamerperu.com/vouchers/123.pdf?token=abc",
        },
      },
      breadcrumbs: [
        {
          message: "User sent password=mypassword",
          data: {
            secret: "topsecret",
          },
        },
      ],
      extra: {
        AI_ENCRYPTION_KEY_V1: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        safeExtra: "non-sensitive",
      },
    };

    const result = sentryBeforeSend(mockEvent);
    expect(result).not.toBeNull();

    // Message sanitization
    expect(result?.message).toContain("[REDACTED_CREDENTIALS]");
    expect(result?.message).not.toContain("secret123");

    // Exception sanitization
    expect(result?.exception?.values?.[0]?.type).toBe("DatabaseError");
    expect(result?.exception?.values?.[0]?.value).toContain("[REDACTED_JWT]");

    // Request headers and cookies
    expect(result?.request?.headers?.authorization).toBe("[REDACTED]");
    expect(result?.request?.headers?.cookie).toBe("[REDACTED]");
    expect(result?.request?.headers?.["content-type"]).toBe("application/json");
    expect(result?.request?.cookies).toEqual({ session: "[REDACTED]" });

    // Request data
    const reqData = result?.request?.data as Record<string, unknown>;
    expect(reqData.operation_code).toBe("[REDACTED]");
    expect(reqData.voucher_url).toBe("[REDACTED]");

    // Breadcrumbs
    expect(result?.breadcrumbs?.[0]?.data?.secret).toBe("[REDACTED]");

    // Extra context
    expect(result?.extra?.AI_ENCRYPTION_KEY_V1).toBe("[REDACTED]");
    expect(result?.extra?.safeExtra).toBe("non-sensitive");
  });
});
