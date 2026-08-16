export interface PublicErrorPayload {
  code: string;
  statusCode: number;
  message: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly publicMessage: string;
  readonly isOperational: boolean;

  constructor(options: {
    code: string;
    statusCode?: number;
    message: string;
    publicMessage?: string;
    cause?: unknown;
    isOperational?: boolean;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.publicMessage =
      options.publicMessage ??
      "Ocurrió un error inesperado. Por favor, inténtelo de nuevo más tarde.";
    this.isOperational = options.isOperational ?? true;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, publicMessage?: string, cause?: unknown): AppError {
    return new AppError({
      code: "BAD_REQUEST",
      statusCode: 400,
      message,
      publicMessage: publicMessage ?? message,
      cause,
    });
  }

  static unauthorized(message = "Unauthorized", publicMessage?: string): AppError {
    return new AppError({
      code: "UNAUTHORIZED",
      statusCode: 401,
      message,
      publicMessage: publicMessage ?? "Debe iniciar sesión para acceder a este recurso.",
    });
  }

  static forbidden(message = "Forbidden", publicMessage?: string): AppError {
    return new AppError({
      code: "FORBIDDEN",
      statusCode: 403,
      message,
      publicMessage: publicMessage ?? "No tiene permisos suficientes para realizar esta acción.",
    });
  }

  static notFound(message = "Resource not found", publicMessage?: string): AppError {
    return new AppError({
      code: "NOT_FOUND",
      statusCode: 404,
      message,
      publicMessage: publicMessage ?? "El recurso solicitado no fue encontrado.",
    });
  }

  static internal(message = "Internal Server Error", cause?: unknown): AppError {
    return new AppError({
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
      message,
      publicMessage: "Ocurrió un error inesperado. Por favor, inténtelo de nuevo más tarde.",
      cause,
      isOperational: false,
    });
  }
}

export function toPublicError(error: unknown): PublicErrorPayload {
  if (error instanceof AppError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.publicMessage,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    statusCode: 500,
    message: "Ocurrió un error inesperado. Por favor, inténtelo de nuevo más tarde.",
  };
}
