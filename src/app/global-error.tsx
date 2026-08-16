"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es-PE">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#0b0e14",
          color: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            padding: "2.5rem",
            borderRadius: "12px",
            backgroundColor: "#111726",
            border: "1px solid #1e293b",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              color: "#ff4655",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Error Crítico
          </p>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f8fafc",
            }}
          >
            Error del Sistema
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "1rem",
              lineHeight: "1.6",
              marginBottom: "2rem",
            }}
          >
            Ocurrió un error crítico en la aplicación. Por favor, intente recargar la página.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "6px",
              backgroundColor: "#ff4655",
              color: "#ffffff",
              fontWeight: "600",
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
