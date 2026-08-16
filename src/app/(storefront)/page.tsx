import { ArrowRight, Check, Search, Shield, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Container,
  IconButton,
  SpecPill,
  Stack,
  StatusBadge,
  TextField,
} from "@/components/ui";

export default function HomePage() {
  return (
    <main style={{ padding: "var(--space-8) 0", minHeight: "100vh" }}>
      <Container size="default">
        <Stack direction="vertical" gap={8} align="center">
          {/* Header Section */}
          <Stack direction="vertical" gap={3} align="center" style={{ textAlign: "center" }}>
            <Badge variant="subtle">GP-008</Badge>
            <h1 className="type-display">Gamer Perú</h1>
            <p
              className="type-body-large"
              style={{ color: "var(--color-text-secondary)", maxWidth: "600px" }}
            >
              Design System initialized. Identidad visual canónica “Machinery Obsidian & Signal
              Crimson” y primitivas accesibles.
            </p>
            <span
              id="gp008-badge"
              className="type-code-mono"
              style={{
                padding: "var(--space-1) var(--space-3)",
                backgroundColor: "var(--color-surface-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-brand-hover)",
                fontWeight: 600,
              }}
            >
              Design System Initialized (GP-008)
            </span>
          </Stack>

          {/* Technical Spec Pills Showcase */}
          <Card surface="card" padding="md" style={{ width: "100%", maxWidth: "840px" }}>
            <Stack direction="vertical" gap={4}>
              <h2 className="type-h4" style={{ color: "var(--color-text-primary)" }}>
                Especificaciones Técnicas Canónicas
              </h2>
              <Stack direction="horizontal" gap={2} wrap="wrap">
                <SpecPill>39g Ultralight</SpecPill>
                <SpecPill>8000Hz Polling</SpecPill>
                <SpecPill>PAW3950 Optical</SpecPill>
                <SpecPill>Nordic 52840 MCU</SpecPill>
                <SpecPill>Omron Optical Switches</SpecPill>
              </Stack>
            </Stack>
          </Card>

          {/* Core Interactive Primitives Showcase */}
          <Card surface="card" padding="md" style={{ width: "100%", maxWidth: "840px" }}>
            <Stack direction="vertical" gap={6}>
              <h2 className="type-h3">Primitivas Interactivas</h2>

              {/* Buttons */}
              <Stack direction="vertical" gap={3}>
                <h3 className="type-h4" style={{ color: "var(--color-text-secondary)" }}>
                  Botones (44px Desktop / 48px Touch)
                </h3>
                <Stack direction="horizontal" gap={3} wrap="wrap" align="center">
                  <Button variant="primary" leadingIcon={<Zap size={18} strokeWidth={1.5} />}>
                    Comprar Ahora
                  </Button>
                  <Button
                    variant="secondary"
                    trailingIcon={<ArrowRight size={18} strokeWidth={1.5} />}
                  >
                    Ver Detalles
                  </Button>
                  <Button variant="ghost">Cancelar</Button>
                  <Button variant="destructive">Eliminar</Button>
                  <Button variant="primary" disabled>
                    Deshabilitado
                  </Button>
                  <IconButton aria-label="Buscar periféricos" variant="secondary">
                    <Search size={20} strokeWidth={1.5} />
                  </IconButton>
                </Stack>
              </Stack>

              {/* Status Badges */}
              <Stack direction="vertical" gap={3}>
                <h3 className="type-h4" style={{ color: "var(--color-text-secondary)" }}>
                  Estados Semánticos (Color + Texto Obligatorio)
                </h3>
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <StatusBadge variant="success">En Stock (Lima)</StatusBadge>
                  <StatusBadge variant="warning">Últimas 2 Unidades</StatusBadge>
                  <StatusBadge variant="danger">Agotado</StatusBadge>
                  <StatusBadge variant="info">Preventa Confirmada</StatusBadge>
                  <StatusBadge variant="neutral">Procesando</StatusBadge>
                </Stack>
              </Stack>

              {/* Form Input / TextField */}
              <Stack direction="vertical" gap={4}>
                <h3 className="type-h4" style={{ color: "var(--color-text-secondary)" }}>
                  Campos de Formulario Accesibles
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "var(--space-4)",
                  }}
                >
                  <TextField
                    id="demo-email"
                    label="Correo Electrónico"
                    placeholder="ejemplo@gamerperu.com"
                    description="Te notificaremos cuando el stock esté disponible."
                    required
                  />
                  <TextField
                    id="demo-error"
                    label="Código de Cupón"
                    placeholder="GAMERPERU10"
                    defaultValue="INVALID_CODE"
                    error="El código ingresado no es válido o ha expirado."
                  />
                </div>
              </Stack>
            </Stack>
          </Card>

          {/* Inverted Dark Surface Section */}
          <Card surface="dark" padding="lg" style={{ width: "100%", maxWidth: "840px" }}>
            <Stack direction="vertical" gap={4}>
              <Stack direction="horizontal" gap={2} align="center">
                <Shield
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: "var(--color-brand-primary)" }}
                />
                <h2 className="type-h3" style={{ color: "var(--color-text-dark-primary)" }}>
                  Superficie Invertida (Obsidian Dark)
                </h2>
              </Stack>
              <p
                className="type-body-default"
                style={{ color: "var(--color-text-dark-secondary)" }}
              >
                Demostración de tokens invertidos para bloques editoriales y fichas técnicas de alto
                rendimiento.
              </p>
              <Stack direction="horizontal" gap={2} wrap="wrap">
                <SpecPill inverted>Magnesium Alloy</SpecPill>
                <SpecPill inverted>0.125ms Latency</SpecPill>
                <SpecPill inverted>Web-Driver Compatible</SpecPill>
              </Stack>
              <Card surface="dark-card" padding="md" style={{ marginTop: "var(--space-2)" }}>
                <Stack direction="horizontal" gap={3} align="center" justify="between" wrap="wrap">
                  <Stack direction="vertical" gap={1}>
                    <span className="type-h4" style={{ color: "var(--color-text-dark-primary)" }}>
                      Contraste de Alto Rendimiento
                    </span>
                    <span
                      className="type-body-small"
                      style={{ color: "var(--color-text-dark-muted)" }}
                    >
                      WCAG 2.1 AA cumplido con ratios superiores a 18:1
                    </span>
                  </Stack>
                  <Button variant="primary" leadingIcon={<Check size={18} strokeWidth={1.5} />}>
                    Confirmar Selección
                  </Button>
                </Stack>
              </Card>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </main>
  );
}
