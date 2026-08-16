"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client-side error to Sentry if configured
    Sentry.captureException(error);
  }, [error]);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
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
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: "700",
            color: "#ff6b78",
            marginBottom: "0.5rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Error
        </p>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: "700",
            marginBottom: "1rem",
            color: "var(--foreground)",
          }}
        >
          Algo salió mal
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: "1.6",
            marginBottom: "2rem",
          }}
        >
          Ocurrió un error inesperado al procesar su solicitud. Por favor, inténtelo de nuevo.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "6px",
              backgroundColor: "var(--foreground)",
              color: "#0b0e14",
              fontWeight: "700",
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          <Link
            href="/"
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "6px",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontWeight: "700",
              fontSize: "0.875rem",
              textDecoration: "none",
            }}
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
