import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Search } from "lucide-react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CANONICAL_ICON_GEOMETRY, Icon, type IconProps } from "@/components/ui";

describe("GP-008 Design System — Token Contract & Drift Protection", () => {
  const tokensCssPath = path.resolve(process.cwd(), "src/styles/tokens.css");
  const typographyCssPath = path.resolve(process.cwd(), "src/styles/typography.css");
  const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");

  const tokensCss = fs.readFileSync(tokensCssPath, "utf8");
  const typographyCss = fs.readFileSync(typographyCssPath, "utf8");
  const globalsCss = fs.readFileSync(globalsCssPath, "utf8");

  it("defines exact canonical brand accent colors", () => {
    expect(tokensCss).toContain("--color-brand-primary: #e11d48;");
    expect(tokensCss).toContain("--color-brand-hover: #be123c;");
    expect(tokensCss).toContain("--color-brand-active: #9f1239;");
    expect(tokensCss).toContain("--color-brand-subtle-light: #fff1f2;");
    expect(tokensCss).toContain("--color-brand-subtle-dark: #4c0519;");
    expect(tokensCss).toContain("--color-brand-text-on-accent: #ffffff;");
  });

  it("defines exact canonical light and dark surface tokens", () => {
    // Light
    expect(tokensCss).toContain("--color-surface-canvas: #fafafa;");
    expect(tokensCss).toContain("--color-surface-card: #ffffff;");
    expect(tokensCss).toContain("--color-surface-secondary: #f4f4f5;");
    expect(tokensCss).toContain("--color-surface-tertiary: #e4e4e7;");
    expect(tokensCss).toContain("--color-surface-header: rgba(255, 255, 255, 0.95);");

    // Dark
    expect(tokensCss).toContain("--color-surface-dark-canvas: #09090b;");
    expect(tokensCss).toContain("--color-surface-dark-card: #121215;");
    expect(tokensCss).toContain("--color-surface-dark-secondary: #18181b;");
    expect(tokensCss).toContain("--color-surface-dark-tertiary: #27272a;");
  });

  it("defines exact canonical text and border contrast tokens", () => {
    // Text
    expect(tokensCss).toContain("--color-text-primary: #09090b;");
    expect(tokensCss).toContain("--color-text-secondary: #52525b;");
    expect(tokensCss).toContain("--color-text-muted: #71717a;");
    expect(tokensCss).toContain("--color-text-disabled: #a1a1aa;");
    expect(tokensCss).toContain("--color-text-dark-primary: #f4f4f5;");
    expect(tokensCss).toContain("--color-text-dark-muted: #9ca3af;");

    // Border
    expect(tokensCss).toContain("--color-border-control: #71717a;");
    expect(tokensCss).toContain("--color-border-dark-control: #8e8e93;");
    expect(tokensCss).toContain("--color-border-focus: #09090b;");
    expect(tokensCss).toContain("--color-border-dark-focus: #f4f4f5;");
  });

  it("defines exact canonical semantic status tokens", () => {
    // Success
    expect(tokensCss).toContain("--color-status-success-text: #15803d;");
    expect(tokensCss).toContain("--color-status-success-background: #f0fdf4;");
    expect(tokensCss).toContain("--color-status-success-border: #bbf7d0;");
    expect(tokensCss).toContain("--color-status-success-dark-text: #4ade80;");

    // Warning
    expect(tokensCss).toContain("--color-status-warning-text: #b45309;");
    expect(tokensCss).toContain("--color-status-warning-background: #fffbeb;");
    expect(tokensCss).toContain("--color-status-warning-border: #fde68a;");
    expect(tokensCss).toContain("--color-status-warning-dark-text: #fbbf24;");

    // Danger
    expect(tokensCss).toContain("--color-status-danger-text: #be123c;");
    expect(tokensCss).toContain("--color-status-danger-background: #fff1f2;");
    expect(tokensCss).toContain("--color-status-danger-border: #fecdd3;");
    expect(tokensCss).toContain("--color-status-danger-dark-text: #fb7185;");

    // Info
    expect(tokensCss).toContain("--color-status-info-text: #0369a1;");
    expect(tokensCss).toContain("--color-status-info-background: #f0f9ff;");
    expect(tokensCss).toContain("--color-status-info-border: #bae6fd;");
    expect(tokensCss).toContain("--color-status-info-dark-text: #38bdf8;");
  });

  it("defines canonical spacing, radius, container, and motion scales", () => {
    // Spacing
    expect(tokensCss).toContain("--space-1: 4px;");
    expect(tokensCss).toContain("--space-2: 8px;");
    expect(tokensCss).toContain("--space-3: 12px;");
    expect(tokensCss).toContain("--space-4: 16px;");
    expect(tokensCss).toContain("--space-6: 24px;");
    expect(tokensCss).toContain("--space-8: 32px;");
    expect(tokensCss).toContain("--space-12: 48px;");
    expect(tokensCss).toContain("--space-32: 128px;");

    // Containers
    expect(tokensCss).toContain("--container-default: 1440px;");
    expect(tokensCss).toContain("--container-prose: 840px;");
    expect(tokensCss).toContain("--container-full: 1920px;");
    expect(tokensCss).toContain("--container-admin: 1600px;");

    // Radius
    expect(tokensCss).toContain("--radius-xs: 2px;");
    expect(tokensCss).toContain("--radius-sm: 4px;");
    expect(tokensCss).toContain("--radius-md: 8px;");
    expect(tokensCss).toContain("--radius-lg: 12px;");
    expect(tokensCss).toContain("--radius-full: 9999px;");

    // Motion
    expect(tokensCss).toContain("--motion-duration-fast: 150ms;");
    expect(tokensCss).toContain("--motion-duration-normal: 250ms;");
    expect(tokensCss).toContain("--motion-duration-moderate: 350ms;");
    expect(tokensCss).toContain("--motion-easing-snappy: cubic-bezier(0.16, 1, 0.3, 1);");
  });

  it("completely eliminates legacy bootstrap visual placeholders", () => {
    // Ensure temporary bootstrap hex values are nowhere in tokens or globals
    expect(tokensCss).not.toContain("#ff4655");
    expect(tokensCss).not.toContain("#090a0f");
    expect(tokensCss).not.toContain("#12141c");
    expect(tokensCss).not.toContain("#1f2330");

    expect(globalsCss).not.toContain("#ff4655");
    expect(globalsCss).not.toContain("#090a0f");
    expect(globalsCss).not.toContain("#12141c");
    expect(globalsCss).not.toContain("#1f2330");
  });

  it("defines complete fluid typography classes", () => {
    expect(typographyCss).toContain(".type-display");
    expect(typographyCss).toContain(".type-h1");
    expect(typographyCss).toContain(".type-h2");
    expect(typographyCss).toContain(".type-h3");
    expect(typographyCss).toContain(".type-h4");
    expect(typographyCss).toContain(".type-body-large");
    expect(typographyCss).toContain(".type-body-default");
    expect(typographyCss).toContain(".type-body-small");
    expect(typographyCss).toContain(".type-caption");
    expect(typographyCss).toContain(".type-button");
    expect(typographyCss).toContain(".type-stat-giant");
    expect(typographyCss).toContain(".type-code-mono");
  });

  it("enforces canonical icon geometry for sm, md, lg, xl sizes", () => {
    expect(CANONICAL_ICON_GEOMETRY.sm).toEqual({ size: 16, strokeWidth: 1.25 });
    expect(CANONICAL_ICON_GEOMETRY.md).toEqual({ size: 20, strokeWidth: 1.5 });
    expect(CANONICAL_ICON_GEOMETRY.lg).toEqual({ size: 24, strokeWidth: 1.5 });
    expect(CANONICAL_ICON_GEOMETRY.xl).toEqual({ size: 32, strokeWidth: 1.5 });
  });

  it("renders non-overridable canonical geometry in Icon component even with attempted escapes", () => {
    // Standard rendering for each size
    const smHtml = renderToString(React.createElement(Icon, { icon: Search, size: "sm" }));
    expect(smHtml).toContain('width="16"');
    expect(smHtml).toContain('height="16"');
    expect(smHtml).toContain('stroke-width="1.25"');

    const mdHtml = renderToString(React.createElement(Icon, { icon: Search, size: "md" }));
    expect(mdHtml).toContain('width="20"');
    expect(mdHtml).toContain('height="20"');
    expect(mdHtml).toContain('stroke-width="1.5"');

    const lgHtml = renderToString(React.createElement(Icon, { icon: Search, size: "lg" }));
    expect(lgHtml).toContain('width="24"');
    expect(lgHtml).toContain('height="24"');
    expect(lgHtml).toContain('stroke-width="1.5"');

    const xlHtml = renderToString(React.createElement(Icon, { icon: Search, size: "xl" }));
    expect(xlHtml).toContain('width="32"');
    expect(xlHtml).toContain('height="32"');
    expect(xlHtml).toContain('stroke-width="1.5"');

    // Attempted runtime escape via cast
    const escapeProps = {
      icon: Search,
      size: "sm",
      width: 999,
      height: 999,
      strokeWidth: 9,
      "stroke-width": 9,
    } as unknown as IconProps;

    const escapeHtml = renderToString(React.createElement(Icon, escapeProps));
    // Canonical sm geometry must strictly win
    expect(escapeHtml).toContain('width="16"');
    expect(escapeHtml).toContain('height="16"');
    expect(escapeHtml).toContain('stroke-width="1.25"');
    expect(escapeHtml).not.toContain('width="999"');
    expect(escapeHtml).not.toContain('stroke-width="9"');
  });

  it("ensures zero ad-hoc literal colors in component CSS modules", () => {
    const uiDir = path.resolve(process.cwd(), "src/components/ui");
    const moduleFiles: string[] = [];

    function findModuleCss(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findModuleCss(fullPath);
        } else if (entry.name.endsWith(".module.css")) {
          moduleFiles.push(fullPath);
        }
      }
    }

    findModuleCss(uiDir);
    expect(moduleFiles.length).toBeGreaterThan(0);

    for (const file of moduleFiles) {
      const content = fs.readFileSync(file, "utf8");
      // Match hex colors (e.g., #fff, #12141c) or rgb/rgba literals
      const matches = content.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
      expect(matches).toBeNull();
    }
  });
});
