import { ArrowRight, Check, Search, Shield, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Container,
  Icon,
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
              Design System canónico “Machinery Obsidian & Signal Crimson” y catálogo de primitivas
              accesibles.
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
                  <Button variant="primary" leadingIcon={<Icon icon={Zap} size="sm" />}>
                    Acción primaria
                  </Button>
                  <Button variant="secondary" trailingIcon={<Icon icon={ArrowRight} size="sm" />}>
                    Acción secundaria
                  </Button>
                  <Button variant="ghost">Acción terciaria</Button>
                  <Button variant="destructive">Acción destructiva</Button>
                  <Button variant="primary" disabled>
                    Deshabilitado
                  </Button>
                  <IconButton
                    aria-label="Buscar elementos"
                    icon={Search}
                    iconSize="md"
                    variant="secondary"
                  />
                </Stack>
              </Stack>

              {/* Status Badges */}
              <Stack direction="vertical" gap={3}>
                <h3 className="type-h4" style={{ color: "var(--color-text-secondary)" }}>
                  Estados Semánticos (Color + Texto Obligatorio)
                </h3>
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <StatusBadge variant="success">Estado correcto</StatusBadge>
                  <StatusBadge variant="warning">Advertencia</StatusBadge>
                  <StatusBadge variant="danger">Error</StatusBadge>
                  <StatusBadge variant="info">Información</StatusBadge>
                  <StatusBadge variant="neutral">Neutral</StatusBadge>
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
                    id="demo-field"
                    label="Campo de ejemplo"
                    placeholder="Texto de ejemplo"
                    description="Texto auxiliar descriptivo para el usuario."
                    required
                  />
                  <TextField
                    id="demo-error"
                    label="Campo con error"
                    placeholder="Valor inválido"
                    defaultValue="VALOR_INCORRECTO"
                    error="Mensaje de error descriptivo asociado al campo."
                  />
                </div>
              </Stack>
            </Stack>
          </Card>

          {/* Inverted Dark Surface Section */}
          <Card surface="dark" padding="lg" style={{ width: "100%", maxWidth: "840px" }}>
            <Stack direction="vertical" gap={4}>
              <Stack direction="horizontal" gap={2} align="center">
                <Icon
                  icon={Shield}
                  size="md"
                  style={{ color: "var(--color-brand-primary)" }}
                  aria-hidden="true"
                />
                <h2 className="type-h3" style={{ color: "var(--color-text-dark-primary)" }}>
                  Superficie Invertida (Obsidian Dark)
                </h2>
              </Stack>
              <p
                className="type-body-default"
                style={{ color: "var(--color-text-dark-secondary)" }}
              >
                Demostración de tokens contextuales e inversión cromática de alto contraste.
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
                  <Button
                    id="dark-surface-btn"
                    variant="primary"
                    leadingIcon={<Icon icon={Check} size="sm" />}
                  >
                    Acción en superficie oscura
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
