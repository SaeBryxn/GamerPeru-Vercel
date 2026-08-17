import { ArrowRight, Search, Zap } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
  VisuallyHidden,
} from "@/components/ui";

describe("GP-008 Design System — Component Structural & Accessibility Contracts", () => {
  describe("Button Primitive", () => {
    it("renders primary, secondary, ghost, and destructive variants", () => {
      const primary = renderToStaticMarkup(<Button variant="primary">Primary</Button>);
      expect(primary).toContain("Primary");
      expect(primary).toContain("primary");

      const secondary = renderToStaticMarkup(<Button variant="secondary">Secondary</Button>);
      expect(secondary).toContain("Secondary");
      expect(secondary).toContain("secondary");

      const ghost = renderToStaticMarkup(<Button variant="ghost">Ghost</Button>);
      expect(ghost).toContain("Ghost");
      expect(ghost).toContain("ghost");

      const destructive = renderToStaticMarkup(<Button variant="destructive">Delete</Button>);
      expect(destructive).toContain("Delete");
      expect(destructive).toContain("destructive");
    });

    it("renders disabled state with aria-disabled attribute", () => {
      const disabledHtml = renderToStaticMarkup(
        <Button variant="primary" disabled>
          Disabled Action
        </Button>
      );
      expect(disabledHtml).toContain("disabled");
      expect(disabledHtml).toContain('aria-disabled="true"');
    });

    it("renders leading and trailing icon slots with canonical geometry", () => {
      const leadingHtml = renderToStaticMarkup(
        <Button variant="primary" leadingIcon={Zap}>
          With Leading
        </Button>
      );
      expect(leadingHtml).toContain('width="20"');
      expect(leadingHtml).toContain('height="20"');
      expect(leadingHtml).toContain('stroke-width="1.5"');
      expect(leadingHtml).toContain('aria-hidden="true"');

      const trailingHtml = renderToStaticMarkup(
        <Button variant="secondary" trailingIcon={ArrowRight}>
          With Trailing
        </Button>
      );
      expect(trailingHtml).toContain('width="20"');
      expect(trailingHtml).toContain('height="20"');
      expect(trailingHtml).toContain('stroke-width="1.5"');
      expect(trailingHtml).toContain('aria-hidden="true"');
    });
  });

  describe("IconButton Primitive", () => {
    it("renders accessible name, aria-label, and canonical icon attributes", () => {
      const iconBtnHtml = renderToStaticMarkup(
        <IconButton aria-label="Buscar productos" icon={Search} iconSize="md" variant="secondary" />
      );
      expect(iconBtnHtml).toContain('aria-label="Buscar productos"');
      expect(iconBtnHtml).toContain('width="20"');
      expect(iconBtnHtml).toContain('height="20"');
      expect(iconBtnHtml).toContain('stroke-width="1.5"');
      expect(iconBtnHtml).toContain('aria-hidden="true"');
    });
  });

  describe("TextField Primitive", () => {
    it("associates label with input using htmlFor and id", () => {
      const fieldHtml = renderToStaticMarkup(
        <TextField
          id="email-field"
          label="Correo electrónico"
          description="Nunca compartiremos tu correo."
          required
        />
      );
      expect(fieldHtml).toContain('for="email-field"');
      expect(fieldHtml).toContain('id="email-field"');
      expect(fieldHtml).toContain("Correo electrónico");
      expect(fieldHtml).toContain('aria-describedby="email-field-description"');
      expect(fieldHtml).toContain("Nunca compartiremos tu correo.");
      expect(fieldHtml).toContain("required");
    });

    it("renders error message with role='alert', aria-invalid='true', and describedby linkage", () => {
      const errorHtml = renderToStaticMarkup(
        <TextField
          id="password-field"
          label="Contraseña"
          error="La contraseña debe tener al menos 8 caracteres."
        />
      );
      expect(errorHtml).toContain('aria-invalid="true"');
      expect(errorHtml).toContain('aria-describedby="password-field-error"');
      expect(errorHtml).toContain('id="password-field-error"');
      expect(errorHtml).toContain('role="alert"');
      expect(errorHtml).toContain("La contraseña debe tener al menos 8 caracteres.");
    });
  });

  describe("StatusBadge Primitive", () => {
    it("renders visible text labels across all 5 semantic status variants", () => {
      const statuses = ["success", "warning", "danger", "info", "neutral"] as const;
      const labels = {
        success: "En stock",
        warning: "Pocas unidades",
        danger: "Agotado",
        info: "Próximamente",
        neutral: "Edición estándar",
      };

      for (const status of statuses) {
        const badgeHtml = renderToStaticMarkup(
          <StatusBadge variant={status}>{labels[status]}</StatusBadge>
        );
        expect(badgeHtml).toContain(labels[status]);
        expect(badgeHtml.toLowerCase()).toContain(status);
      }
    });
  });

  describe("Layout & Surface Primitives", () => {
    it("renders Container, Card, Stack, SpecPill, Badge, and VisuallyHidden", () => {
      const containerHtml = renderToStaticMarkup(
        <Container size="default">
          <Card surface="card" padding="md">
            <Stack direction="vertical" gap={4}>
              <Badge variant="brand">Badge</Badge>
              <SpecPill>39g</SpecPill>
              <VisuallyHidden>Texto oculto accesible</VisuallyHidden>
            </Stack>
          </Card>
        </Container>
      );

      expect(containerHtml).toContain("Badge");
      expect(containerHtml).toContain("39g");
      expect(containerHtml).toContain("Texto oculto accesible");
    });
  });
});
