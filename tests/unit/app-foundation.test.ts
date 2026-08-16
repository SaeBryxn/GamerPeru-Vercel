import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/config/app";
import { generateRequestId } from "@/lib/correlation";
import { AppError, toPublicError } from "@/lib/errors";

describe("Application Foundation — Configuration", () => {
  it("exports valid canonical application metadata", () => {
    expect(APP_CONFIG.name).toBe("Gamer Perú");
    expect(APP_CONFIG.defaultLocale).toBe("es-PE");
    expect(APP_CONFIG.defaultCurrency).toBe("PEN");
    expect(APP_CONFIG.canonicalHost).toBe("gamerperu.com");
    expect(APP_CONFIG.publicTitle).toContain("Gamer Perú");
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
