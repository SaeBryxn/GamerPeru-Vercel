"use client";

import { useEffect } from "react";
import Link from "@/components/app-link";
import { Button, Card, Container, Stack } from "@/components/ui";
import { reportClientError } from "@/lib/observability/report-client-error";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "var(--space-6) 0",
      }}
    >
      <Container size="prose">
        <Card
          surface="card"
          padding="lg"
          style={{ textAlign: "center", maxWidth: "540px", margin: "0 auto" }}
        >
          <Stack direction="vertical" gap={4} align="center">
            <span
              className="type-caption"
              style={{
                color: "var(--color-status-danger-text)",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              Error
            </span>
            <h1 className="type-h2" style={{ color: "var(--color-text-primary)" }}>
              Algo salió mal
            </h1>
            <p className="type-body-default" style={{ color: "var(--color-text-secondary)" }}>
              Ocurrió un error inesperado al procesar su solicitud. Por favor, inténtelo de nuevo.
            </p>
            <Stack direction="horizontal" gap={3} justify="center" wrap="wrap">
              <Button variant="primary" onClick={() => reset()}>
                Reintentar
              </Button>
              <Link href="/" style={{ textDecoration: "none" }}>
                <Button variant="secondary">Ir al inicio</Button>
              </Link>
            </Stack>
          </Stack>
        </Card>
      </Container>
    </main>
  );
}
