import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("GP-023 / CHK2-BR3 — Admin Dashboard CSS Module Contract Regression Suite", () => {
  const dashboardDir = path.resolve(process.cwd(), "src/components/admin/dashboard");

  // Helper to extract class names defined in a CSS Module file
  function extractCssClasses(cssContent: string): Set<string> {
    const classNames = new Set<string>();
    // Matches .className, .className:hover, .className > .subClass, .className.otherClass
    const classRegex = /\.([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_-]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = classRegex.exec(cssContent)) !== null) {
      if (match[1]) {
        classNames.add(match[1]);
      }
    }
    return classNames;
  }

  // Helper to extract static property accesses on styles object (styles.foo, styles["foo"], styles['foo'])
  function extractStaticStyleReferences(tsxContent: string): Set<string> {
    const references = new Set<string>();

    // Pattern 1: styles.foo
    const dotRegex = /styles\.([a-zA-Z0-9_]+)/g;
    let match: RegExpExecArray | null;
    while ((match = dotRegex.exec(tsxContent)) !== null) {
      if (match[1]) {
        references.add(match[1]);
      }
    }

    // Pattern 2: styles["foo"] or styles['foo']
    const bracketRegex = /styles\[["']([a-zA-Z0-9_]+)["']\]/g;
    while ((match = bracketRegex.exec(tsxContent)) !== null) {
      if (match[1]) {
        references.add(match[1]);
      }
    }

    return references;
  }

  it("1. asserts all dashboard TSX files with CSS Modules have 100% valid static style references", () => {
    const files = fs.readdirSync(dashboardDir);
    const tsxFiles = files.filter((f) => f.endsWith(".tsx"));

    expect(tsxFiles.length).toBeGreaterThanOrEqual(7);

    for (const tsxFile of tsxFiles) {
      const tsxPath = path.join(dashboardDir, tsxFile);
      const tsxContent = fs.readFileSync(tsxPath, "utf-8");

      // Check if it imports a .module.css
      const importMatch = tsxContent.match(
        /import\s+styles\s+from\s+["'](\.\/[^"']+\.module\.css)["']/
      );
      if (!importMatch || !importMatch[1]) continue;

      const cssFilename = path.basename(importMatch[1]);
      const cssPath = path.join(dashboardDir, cssFilename);
      expect(
        fs.existsSync(cssPath),
        `CSS Module ${cssFilename} imported by ${tsxFile} must exist on disk`
      ).toBe(true);

      const cssContent = fs.readFileSync(cssPath, "utf-8");
      const definedClasses = extractCssClasses(cssContent);
      const staticRefs = extractStaticStyleReferences(tsxContent);

      for (const ref of staticRefs) {
        expect(
          definedClasses.has(ref),
          `Component ${tsxFile} references styles.${ref}, but .${ref} is missing from ${cssFilename}`
        ).toBe(true);
      }
    }
  });

  it("2. asserts dynamic order status classes all exist in order-pipeline-section.module.css", () => {
    const cssPath = path.join(dashboardDir, "order-pipeline-section.module.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    const definedClasses = extractCssClasses(cssContent);

    const expectedOrderStatuses = [
      "statusPending",
      "statusConfirmed",
      "statusProcessing",
      "statusFulfilled",
      "statusCancelled",
      "statusExpired",
      "statusRefunded",
    ];

    for (const statusClass of expectedOrderStatuses) {
      expect(
        definedClasses.has(statusClass),
        `order-pipeline-section.module.css must define dynamic status class .${statusClass}`
      ).toBe(true);
    }
  });

  it("3. asserts dynamic direction classes all exist in trend-badge.module.css", () => {
    const cssPath = path.join(dashboardDir, "trend-badge.module.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    const definedClasses = extractCssClasses(cssContent);

    const expectedDirections = ["positive", "negative", "neutral"];

    for (const dirClass of expectedDirections) {
      expect(
        definedClasses.has(dirClass),
        `trend-badge.module.css must define dynamic trend direction class .${dirClass}`
      ).toBe(true);
    }
  });

  it("4. asserts obsolete / dead selectors do not remain in repaired Inventory and Payment stylesheets", () => {
    const inventoryCss = fs.readFileSync(
      path.join(dashboardDir, "inventory-overview-section.module.css"),
      "utf-8"
    );
    const inventoryClasses = extractCssClasses(inventoryCss);

    const paymentCss = fs.readFileSync(
      path.join(dashboardDir, "payment-verification-section.module.css"),
      "utf-8"
    );
    const paymentClasses = extractCssClasses(paymentCss);

    // Old obsolete inventory selectors
    expect(inventoryClasses.has("cardTitleGroup")).toBe(false);
    expect(inventoryClasses.has("cardIconBalances")).toBe(false);
    expect(inventoryClasses.has("balanceGrid")).toBe(false);
    expect(inventoryClasses.has("balanceItem")).toBe(false);
    expect(inventoryClasses.has("balanceLabel")).toBe(false);
    expect(inventoryClasses.has("balanceValue")).toBe(false);
    expect(inventoryClasses.has("cardIconAlerts")).toBe(false);
    expect(inventoryClasses.has("alertsGrid")).toBe(false);

    // Old obsolete payment selectors
    expect(paymentClasses.has("cardTitleGroup")).toBe(false);
    expect(paymentClasses.has("cardIconSnapshot")).toBe(false);
    expect(paymentClasses.has("cardIconActivity")).toBe(false);
  });
});
