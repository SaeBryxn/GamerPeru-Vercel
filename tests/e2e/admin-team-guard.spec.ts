import { expect, test } from "@playwright/test";

test.describe("GP-057 Admin team guard", () => {
  test("anonymous visitors to /admin/equipo are sent to sign in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/equipo");
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fadmin/);
  });
});
