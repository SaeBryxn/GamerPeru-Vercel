import Link from "@/components/app-link";
import { Button, Card, Container, Stack } from "@/components/ui";

export default function NotFound() {
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
                color: "var(--color-brand-primary)",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              Error 404
            </span>
            <h1 className="type-h2" style={{ color: "var(--color-text-primary)" }}>
              Página no encontrada
            </h1>
            <p className="type-body-default" style={{ color: "var(--color-text-secondary)" }}>
              El recurso o página que busca no existe, ha sido movido o no se encuentra disponible.
            </p>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Button variant="primary">Volver al inicio</Button>
            </Link>
          </Stack>
        </Card>
      </Container>
    </main>
  );
}
