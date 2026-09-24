// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Homepage CSS architecture", () => {
  it("verifies zero direct color literals in all Homepage CSS Modules", () => {
    const homeComponentsDir = path.resolve(__dirname, "../../src/components/home");

    function findCssFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findCssFiles(fullPath));
        } else if (entry.name.endsWith(".module.css")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const cssFiles = findCssFiles(homeComponentsDir);
    expect(cssFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of cssFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";

        // Skip comments
        if (line.trim().startsWith("/*") || line.trim().startsWith("*")) continue;

        // Reject raw hex colors (e.g. #09090B, #FFF)
        const hexMatch = line.match(/#[0-9a-fA-F]{3,8}\b/);
        expect(
          hexMatch,
          `Direct hex color '${hexMatch?.[0]}' found in ${path.basename(file)}: line ${i + 1}: ${line}`
        ).toBeNull();

        // Reject raw rgb() / rgba()
        const rgbMatch = line.match(/\brgba?\s*\(/);
        expect(
          rgbMatch,
          `Direct rgb/rgba color found in ${path.basename(file)}: line ${i + 1}: ${line}`
        ).toBeNull();

        // Reject raw hsl() / hsla()
        const hslMatch = line.match(/\bhsla?\s*\(/);
        expect(
          hslMatch,
          `Direct hsl/hsla color found in ${path.basename(file)}: line ${i + 1}: ${line}`
        ).toBeNull();
      }
    }
  });

  it("verifies all referenced CSS custom properties exist in canonical tokens", () => {
    const tokensFile = path.resolve(__dirname, "../../src/styles/tokens.css");
    const tokensContent = fs.readFileSync(tokensFile, "utf8");

    // Extract all defined tokens
    const definedTokens = new Set<string>();
    const tokenMatches = tokensContent.matchAll(/--[a-zA-Z0-9_-]+/g);
    for (const m of tokenMatches) {
      definedTokens.add(m[0]);
    }

    // Layout font variables and local contextual overrides
    definedTokens.add("--font-heading");
    definedTokens.add("--font-body");
    definedTokens.add("--font-mono");
    definedTokens.add("--focus-ring-color");

    const homeComponentsDir = path.resolve(__dirname, "../../src/components/home");

    function findCssFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findCssFiles(fullPath));
        } else if (entry.name.endsWith(".module.css")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const cssFiles = findCssFiles(homeComponentsDir);
    for (const file of cssFiles) {
      const content = fs.readFileSync(file, "utf8");
      const usedVars = content.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g);

      for (const uv of usedVars) {
        const varName = uv[1];
        if (!varName) continue;
        expect(
          definedTokens.has(varName),
          `Undefined CSS token '${varName}' referenced in ${path.basename(file)}`
        ).toBe(true);
      }
    }
  });
});
