import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_E2E_PASSWORD, ADMIN_E2E_USERS } from "./helpers/admin-fixtures";

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/auth/login?redirect=%2Fadmin");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 15000 });
}

const customerEmail = ADMIN_E2E_USERS.customer.email;

test.describe("GP-057 Admin team and roles", () => {
  test("a super admin manages the team without being able to lock themselves out", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_E2E_USERS.superadmin.email);
    await page.goto("/admin");
    await page.getByRole("link", { name: "Equipo" }).first().click();
    await expect(page).toHaveURL(/\/admin\/equipo$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Equipo");

    const self = page.getByTestId(`team-member-${ADMIN_E2E_USERS.superadmin.email}`);
    await expect(self).toContainText("No puedes cambiar tu propio acceso.");
    await expect(self.locator("select")).toHaveCount(0);

    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations).toEqual([]);

    await page.getByTestId("team-grant-email").fill(customerEmail);
    await page.getByTestId("team-grant-level").selectOption("ADMIN");
    await page.getByTestId("team-grant-submit").click();
    await page.getByRole("button", { name: "Confirmar acceso" }).click();

    const member = page.getByTestId(`team-member-${customerEmail}`);
    await expect(member).toContainText("Administrador");

    await page.getByTestId(`team-change-${customerEmail}`).selectOption("revocar");
    await page.getByRole("button", { name: "Revocar acceso" }).click();
    await expect(member).toHaveCount(0);
  });

  test("an unregistered email is refused with guidance", async ({ page }) => {
    await loginAs(page, ADMIN_E2E_USERS.superadmin.email);
    await page.goto("/admin/equipo");
    await page.getByTestId("team-grant-email").fill("nadie.gp057@example.pe");
    await page.getByTestId("team-grant-submit").click();
    await page.getByRole("button", { name: "Confirmar acceso" }).click();
    await expect(page.getByTestId("team-grant-error")).toContainText(
      "debe crear su cuenta en la tienda"
    );
  });

  test("operators without staff:manage neither see nor open the team screen", async ({ page }) => {
    await loginAs(page, ADMIN_E2E_USERS.catalog.email);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "Equipo" })).toHaveCount(0);

    await page.goto("/admin/equipo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");
  });
});
