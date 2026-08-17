import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnnouncementBar, NAVIGATION_CONFIG } from "@/components/navigation";

describe("GP-009 Global Navigation — Unit Contracts & Drift Protection", () => {
  it("verifies navigation seed data integrity and URL validity", () => {
    // Top-level categories
    expect(NAVIGATION_CONFIG.primaryNav.length).toBeGreaterThanOrEqual(4);
    const categoryIds = new Set<string>();

    for (const cat of NAVIGATION_CONFIG.primaryNav) {
      expect(cat.id).toBeTruthy();
      expect(categoryIds.has(cat.id)).toBe(false);
      categoryIds.add(cat.id);

      expect(cat.label).toBeTruthy();
      expect(cat.href.startsWith("/")).toBe(true);
      expect(cat.href).not.toContain("#");
      expect(cat.href).not.toContain("javascript:");

      // Sections
      for (const section of cat.sections) {
        expect(section.title).toBeTruthy();
        for (const item of section.items) {
          expect(item.label).toBeTruthy();
          expect(item.href.startsWith("/")).toBe(true);
          expect(item.href).not.toContain("#");
        }
      }

      // Brands
      if (cat.brands) {
        for (const brand of cat.brands) {
          expect(brand.label).toBeTruthy();
          expect(brand.href.startsWith("/")).toBe(true);
          expect(brand.href).not.toContain("#");
        }
      }
    }

    // Utility links
    const utilities = Object.values(NAVIGATION_CONFIG.utilityLinks);
    expect(utilities.length).toBe(4);
    for (const util of utilities) {
      expect(util.label).toBeTruthy();
      expect(util.href.startsWith("/")).toBe(true);
    }

    // Footer columns
    expect(NAVIGATION_CONFIG.footerColumns.length).toBeGreaterThanOrEqual(3);
    for (const col of NAVIGATION_CONFIG.footerColumns) {
      expect(col.title).toBeTruthy();
      for (const link of col.links) {
        expect(link.label).toBeTruthy();
        expect(link.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("verifies AnnouncementBar rendering and collapse contract", () => {
    // Render with message
    const htmlWithMessage = renderToString(
      React.createElement(AnnouncementBar, { message: "Envíos a todo el Perú" })
    );
    expect(htmlWithMessage).toContain("Envíos a todo el Perú");
    expect(htmlWithMessage).toContain("<aside");

    // Render with undefined / empty message -> collapses to empty
    const htmlEmpty = renderToString(React.createElement(AnnouncementBar, {}));
    expect(htmlEmpty).toBe("");
  });

  it("ensures zero ad-hoc literal colors in navigation CSS modules", () => {
    const navDir = path.resolve(process.cwd(), "src/components/navigation");
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

    findModuleCss(navDir);
    expect(moduleFiles.length).toBeGreaterThan(0);

    for (const file of moduleFiles) {
      const content = fs.readFileSync(file, "utf8");
      // Match hex colors (e.g., #fff, #12141c) or rgb/rgba literals
      const matches = content.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
      expect(matches).toBeNull();
    }
  });
});
