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
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#09090B",
          color: "#F4F4F5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            padding: "32px",
            borderRadius: "8px",
            backgroundColor: "#121215",
            border: "1px solid #27272A",
            boxShadow: "0 20px 25px -5px rgba(9, 9, 11, 0.14)",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "#E11D48",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Error Crítico
          </p>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "700",
              marginBottom: "16px",
              color: "#F4F4F5",
            }}
          >
            Error del Sistema
          </h1>
          <p
            style={{
              color: "#A1A1AA",
              fontSize: "15px",
              lineHeight: "1.5",
              marginBottom: "24px",
            }}
          >
            Ocurrió un error crítico en la aplicación. Por favor, intente recargar la página.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0 24px",
              height: "44px",
              borderRadius: "4px",
              backgroundColor: "#E11D48",
              color: "#FFFFFF",
              fontWeight: "600",
              fontSize: "14px",
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
