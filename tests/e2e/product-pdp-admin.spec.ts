import { test, expect, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import {
  assertLocalDatabaseTarget,
  assertLocalSupabaseApiTarget,
} from "../../src/lib/admin/test-target-guard";
import { ADMIN_E2E_PASSWORD, ADMIN_E2E_USERS } from "./helpers/admin-fixtures";

const sql = postgres(assertLocalDatabaseTarget(process.env.DATABASE_URL), { max: 1 });
assertLocalSupabaseApiTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);
const id = (value: number) => `018f0063-0000-7000-8000-${String(value).padStart(12, "0")}`;
const productId = id(10),
  blackId = id(11),
  whiteId = id(12),
  accessoryId = id(21);
const productPath = "/productos/mouse-pdp-e2e";

test.describe.configure({ mode: "serial" });
test.setTimeout(120000);

async function login(page: Page, target: string) {
  await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel("Correo electrónico").fill(ADMIN_E2E_USERS.superadmin.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto(target);
}

/** Opens step 5 "Página del producto"; clicking an open step would close it. */
async function openPageStep(page: Page) {
  const header = page.getByTestId("section-nav-historia");
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("form", { name: "Página del producto" });
}

/** Opens one block of step 5 (only one is open at a time). */
async function openBlock(step: Locator, title: string) {
  const button = step.getByRole("button", { name: new RegExp(`^${title}`) });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
}

test.beforeAll(async () => {
  await sql`INSERT INTO brands (id,name,slug,status) VALUES (${id(1)},'Marca PDP','marca-pdp-e2e','PUBLISHED') ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO categories (id,name,slug,status) VALUES (${id(2)},'Mouse PDP','mouse-pdp-e2e','PUBLISHED') ON CONFLICT(id) DO NOTHING`;
  const definitions = [
    { key: "material", label: "Material", dataType: "string", filterable: false, displayOrder: 0 },
    { key: "sensor", label: "Sensor", dataType: "string", filterable: false, displayOrder: 1 },
    {
      key: "polling",
      label: "Polling rate",
      dataType: "string",
      filterable: false,
      displayOrder: 2,
    },
  ];
  await sql`INSERT INTO category_specification_schemas (id,category_id,schema_version,is_active,field_definitions) VALUES (${id(3)},${id(2)},1,true,${sql.json(definitions)}) ON CONFLICT(id) DO NOTHING`;
  await sql`UPDATE categories SET current_spec_schema_id=${id(3)} WHERE id=${id(2)}`;
  for (const [asset, key] of [
    [41, "mega-menu/angulo-1.png"],
    [42, "mega-menu/angulo-2.png"],
  ] as const)
    await sql`INSERT INTO media_assets (id,object_key,security_class,media_type,mime_type,file_size_bytes,width,height,alt_text) VALUES (${id(asset)},${key},'PUBLIC_MEDIA','IMAGE','image/png',10000,600,600,'Mouse PDP E2E') ON CONFLICT(id) DO NOTHING`;
  for (const [product, name, slug] of [
    [10, "Mouse PDP E2E", "mouse-pdp-e2e"],
    [20, "Grip PDP E2E", "grip-pdp-e2e"],
    [30, "Mouse anterior E2E", "mouse-anterior-e2e"],
  ] as const)
    await sql`INSERT INTO products (id,brand_id,category_id,name,slug,status,primary_media_id,pdp_config) VALUES (${id(product)},${id(1)},${id(2)},${name},${slug},'PUBLISHED',${id(41)},'{}') ON CONFLICT(id) DO UPDATE SET pdp_config='{}',status='PUBLISHED'`;
  for (const [variant, product, title, price, sku, attributes] of [
    [11, 10, "Negro", 19500, "PDP-E2E-BLACK", { color: "Negro", size: "Max" }],
    [12, 10, "Blanco", 21500, "PDP-E2E-WHITE", { color: "Blanco", size: "Max" }],
    [21, 20, "Estándar", 1990, "PDP-E2E-GRIP", {}],
    [31, 30, "Estándar", 10000, "PDP-E2E-OLD", {}],
  ] as const)
    await sql`INSERT INTO product_variants (id,product_id,sku,title,price_cents,compare_at_price_cents,status,attributes,display_order) VALUES (${id(variant)},${id(product)},${sku},${title},${price},23000,'ACTIVE',${sql.json(attributes)},${variant}) ON CONFLICT(id) DO UPDATE SET status='ACTIVE'`;
  await sql`INSERT INTO product_media (id,product_id,media_asset_id,variant_id,display_order) VALUES (${id(51)},${productId},${id(41)},NULL,0),(${id(52)},${productId},${id(42)},${whiteId},1) ON CONFLICT(id) DO NOTHING`;
  await sql`INSERT INTO product_specifications (product_id,schema_id,schema_version,spec_values) VALUES (${productId},${id(3)},1,${sql.json({ material: "Aleación de magnesio", sensor: "PAW3950", polling: "8000 Hz" })}) ON CONFLICT(product_id) DO NOTHING`;
});

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    await route.continue();
  });
});

test.afterAll(async () => {
  await sql`DELETE FROM product_specifications WHERE product_id IN (SELECT id FROM products WHERE slug='pdp-created-e2e')`;
  await sql`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE slug='pdp-created-e2e')`;
  await sql`DELETE FROM products WHERE slug='pdp-created-e2e'`;

  await sql`DELETE FROM cart_items WHERE variant_id IN (${blackId},${whiteId},${accessoryId},${id(31)})`;
  await sql`DELETE FROM product_specifications WHERE product_id IN (${productId},${id(20)},${id(30)})`;
  await sql`DELETE FROM product_media WHERE product_id=${productId}`;
  await sql`DELETE FROM product_variants WHERE product_id IN (${productId},${id(20)},${id(30)})`;
  await sql`DELETE FROM products WHERE id IN (${productId},${id(20)},${id(30)})`;
  await sql`UPDATE categories SET current_spec_schema_id=NULL WHERE id=${id(2)}`;
  await sql`DELETE FROM category_specification_schemas WHERE id=${id(3)}`;
  await sql`DELETE FROM categories WHERE id=${id(2)}`;
  await sql`DELETE FROM brands WHERE id=${id(1)}`;
  await sql`DELETE FROM media_assets WHERE id IN (${id(41)},${id(42)})`;
  await sql.end();
});

test("el admin guarda los bloques, miniaturas y accesorios con filas editables", async ({
  page,
}) => {
  await login(page, `/admin/products/${productId}`);
  const root = await openPageStep(page);
  await openBlock(root, "Especificaciones de la tienda");
  await root.getByText("Calificación y reseñas", { exact: true }).click();
  await root.getByRole("switch", { name: "Mostrar calificación y reseñas" }).check();
  await root.getByLabel("Promedio (0 a 5)").fill("4.8");
  await root.getByLabel("Cantidad de reseñas").fill("24");
  await openBlock(root, "Regalo");
  await root.getByRole("switch", { name: "Mostrar en la tienda: Regalo" }).check();
  await root.getByLabel("Título del regalo").fill("Grip tape de cortesía");
  await root.getByLabel("Descripción corta").fill("Un regalo con tu pedido, hasta agotar stock.");
  await openBlock(root, "Colores y miniaturas");
  await root
    .getByRole("group", { name: "Negro · PDP-E2E-BLACK", exact: true })
    .getByLabel("Color", { exact: true })
    .fill("Grafito");
  await root
    .getByRole("group", { name: "Negro · PDP-E2E-BLACK", exact: true })
    .getByLabel("Miniatura")
    .selectOption(id(41));
  await root
    .getByRole("group", { name: "Blanco · PDP-E2E-WHITE", exact: true })
    .getByLabel("Miniatura")
    .selectOption(id(42));
  await openBlock(root, "Accesorios");
  await root.getByRole("switch", { name: "Mostrar en la tienda: Accesorios" }).check();
  await root.getByLabel("Buscar por producto o SKU").fill("Grip PDP E2E");
  await root.getByRole("button", { name: "Buscar", exact: true }).click();
  await root.getByRole("checkbox", { name: /Grip PDP E2E/ }).check();
  await openBlock(root, "Guía de tallas");
  await root.getByRole("switch", { name: "Mostrar en la tienda: Guía de tallas" }).check();
  for (const [index, name, min, max] of [
    [0, "Mini", "", "17.5"],
    [1, "Med", "17.5", "19"],
    [2, "Max", "19", ""],
  ] as const) {
    await root.getByRole("button", { name: "Añadir talla", exact: true }).click();
    const row = root.getByRole("group", { name: `Talla ${index + 1}`, exact: true });
    await row.getByLabel("Nombre", { exact: true }).fill(name);
    await row.getByLabel("Mano mínima (cm)", { exact: true }).fill(min);
    await row.getByLabel("Mano máxima (cm)", { exact: true }).fill(max);
  }
  await openBlock(root, "Dimensiones");
  for (const index of [0, 1, 2]) {
    const row = root.getByRole("group", { name: `Talla ${index + 1}`, exact: true });
    await row.getByLabel("Peso (ej. 45 ± 2 g)").fill("45 ± 2 g");
    for (const [label, number] of [
      ["Largo (mm)", "110"],
      ["Ancho (mm)", "60"],
      ["Alto (mm)", "36"],
    ] as const)
      await row.getByLabel(label, { exact: true }).fill(number);
  }
  await openBlock(root, "Especificaciones de la tienda");
  await root.getByRole("button", { name: "Añadir especificación", exact: true }).click();
  await root.getByLabel("Atributo", { exact: true }).fill("Conexión");
  await root.getByLabel("Valor", { exact: true }).fill("USB-C / 2.4 GHz");
  await root.getByLabel("Nota opcional", { exact: true }).fill("Cableado e inalámbrico");
  await openBlock(root, "Contenido de caja");
  await root.getByRole("switch", { name: "Mostrar en la tienda: Contenido de caja" }).check();
  for (const [index, name] of [
    [0, "Edición especial"],
    [1, "Edición estándar"],
  ] as const) {
    await root.getByRole("button", { name: "Añadir edición", exact: true }).click();
    const edition = root.getByRole("group", { name: `Edición ${index + 1}`, exact: true });
    await edition.getByLabel("Nombre de la edición").fill(name);
    await edition.getByLabel("Color de la etiqueta").selectOption(index === 0 ? "gold" : "neutral");
    await edition.getByRole("button", { name: "Añadir ítem", exact: true }).click();
    await edition.getByLabel("Nombre del ítem").fill("Mouse y receptor");
    await edition.getByLabel("Cantidad (ej. 1 o 20)").fill("1");
  }
  await openBlock(root, "Soporte");
  await root.getByLabel("Texto de garantía").fill("1 año de garantía oficial");
  await root.getByLabel("URL del manual").fill("https://example.com/manual.pdf");
  await root.getByLabel("URL del web-hub / driver").fill("https://example.com/driver");
  await root.getByLabel("Nota de envío").fill("Despacho al siguiente día hábil.");
  await root.getByRole("button", { name: "Guardar página del producto" }).click();
  await expect
    .poll(
      async () =>
        (await sql`SELECT pdp_config FROM products WHERE id=${productId}`)[0]?.pdp_config?.gift
          ?.title
    )
    .toBe("Grip tape de cortesía");
  await expect
    .poll(
      async () =>
        (await sql`SELECT attributes FROM product_variants WHERE id=${blackId}`)[0]?.attributes
          .color
    )
    .toBe("Grafito");
  await page.reload();
  const reloaded = await openPageStep(page);
  await openBlock(reloaded, "Especificaciones de la tienda");
  await reloaded.getByText("Calificación y reseñas", { exact: true }).click();
  await expect(reloaded.getByLabel("Promedio (0 a 5)")).toHaveValue("4.8");
});

test("crear producto conserva la configuración y los importes exactos", async ({ page }) => {
  await login(page, "/admin/products/new");
  await page.getByTestId("input-name").fill("PDP created E2E");
  await page.getByTestId("input-slug").fill("pdp-created-e2e");
  await page.getByTestId("select-brand").selectOption(id(1));
  await page.getByTestId("select-category").selectOption(id(2));
  await page.getByTestId("input-variant-sku").fill("PDP-created-e2e");
  await page.getByTestId("input-variant-price").fill("249.90");
  await page.getByTestId("input-variant-compare-at").fill("299.90");
  await page.getByLabel("Color inicial", { exact: true }).fill("Negro");
  await page.getByLabel("Talla inicial (opcional)").fill("Mini");
  const config = page.getByRole("region", { name: "Configuración de la ficha de tienda" });
  await config.getByText("Regalo con tu compra", { exact: true }).click();
  await config.getByRole("switch", { name: "Activar banner de regalo por compra" }).check();
  await config.getByLabel("Título del regalo").fill("Regalo al crear");
  expect(
    await page
      .getByTestId("form-create-product")
      .evaluate((form: HTMLFormElement) => form.checkValidity())
  ).toBe(true);
  await page.getByTestId("btn-submit-product").click();
  await expect
    .poll(async () => {
      const error = page.getByTestId("form-error");
      if (await error.count()) throw new Error(await error.innerText());
      return (await sql`SELECT pdp_config FROM products WHERE slug='pdp-created-e2e'`)[0]
        ?.pdp_config?.gift?.title;
    })
    .toBe("Regalo al crear");
  await expect(page).toHaveURL(/\/admin\/products\/[a-f0-9-]+/);
  const [variant] =
    await sql`SELECT price_cents,compare_at_price_cents,attributes FROM product_variants WHERE sku='PDP-created-e2e'`;
  expect(variant?.price_cents).toBe(24990);
  expect(variant?.compare_at_price_cents).toBe(29990);
  expect(variant?.attributes).toEqual({ color: "Negro", size: "Mini" });
});

for (const width of [360, 768, 1440])
  test(`PDP y admin adaptables a ${width}px, guía y variantes interactivas`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(productPath);
    await expect(page.getByRole("heading", { name: "Mouse PDP E2E", exact: true })).toBeVisible();
    await expect(page.getByText("Grip tape de cortesía", { exact: true })).toBeVisible();
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 195.00");
    await page.getByTestId("swatch-option-Blanco").click();
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 215.00");
    await expect(page.getByTestId("variant-sku")).toContainText("PDP-E2E-WHITE");
    await expect(page.getByTestId("gallery-main-stage").locator("img").last()).toHaveAttribute(
      "src",
      /angulo-2/
    );
    await page.getByTestId("pdp-accordion-guia-tallas").click();
    const slider = page.getByRole("slider", { name: "Longitud de tu mano" });
    await expect(slider).toBeVisible();
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await expect(page.locator('[data-suggested="true"]')).toContainText("Max");
    await slider.press("Home");
    for (let step = 0; step < 25; step++) await slider.press("ArrowRight");
    await expect(page.locator('[data-suggested="true"]')).toContainText("Med");
    for (const section of ["dimensiones", "especificaciones", "contenido"])
      await page.getByTestId(`pdp-accordion-${section}`).click();
    await expect(page.getByText("4.33 × 2.36 × 1.42 in").first()).toBeVisible();
    await expect(page.getByText("Cableado e inalámbrico", { exact: true })).toBeVisible();
    await expect(page.getByText("Edición especial", { exact: true })).toBeVisible();
    await assertNoOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.getByTestId("gallery-main-stage")).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`pdp-viewport-${width}.png`),
      animations: "disabled",
    });
    await page.screenshot({
      path: testInfo.outputPath(`pdp-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await login(page, `/admin/products/${productId}`);
    const step = await openPageStep(page);
    await openBlock(step, "Regalo");
    await expect(step.getByLabel("Título del regalo")).toBeVisible();
    await expect(step.getByRole("button", { name: "Guardar página del producto" })).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`admin-pdp-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });

test("carrito añade principal y accesorio juntos y revierte si este deja de estar activo", async ({
  page,
}) => {
  await page.goto(productPath);
  await expect(page.getByTestId("product-commerce-panel")).toHaveAttribute(
    "data-cart-status",
    "READY"
  );
  await page.getByRole("checkbox", { name: /Grip PDP E2E/ }).check();
  await page.getByTestId("pdp-add-to-cart-button").click();
  const drawer = page.getByTestId("cart-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Grip PDP E2E");
  await expect(drawer).toContainText("Mouse PDP E2E");
  const [before] =
    await sql`SELECT coalesce(sum(quantity),0)::int AS quantity FROM cart_items WHERE variant_id IN (${blackId},${accessoryId})`;
  await sql`UPDATE product_variants SET status='INACTIVE' WHERE id=${accessoryId}`;
  await page.keyboard.press("Escape");
  await page.getByTestId("pdp-add-to-cart-button").click();
  await expect(page.getByTestId("pdp-add-to-cart-error")).toContainText(
    "no se añadió ningún producto"
  );
  const [after] =
    await sql`SELECT coalesce(sum(quantity),0)::int AS quantity FROM cart_items WHERE variant_id IN (${blackId},${accessoryId})`;
  expect(after?.quantity).toBe(before?.quantity);
  await sql`UPDATE product_variants SET status='ACTIVE' WHERE id=${accessoryId}`;
});

test("productos antiguos y bloques desactivados conservan compra y ocultan contenido opcional", async ({
  page,
}) => {
  await page.goto("/productos/mouse-anterior-e2e");
  await expect(page.getByTestId("selling-price")).toBeVisible();
  await expect(page.getByTestId("pdp-add-to-cart-button")).toBeVisible();
  await expect(page.getByText("Más Accesorios", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("pdp-accordion-guia-tallas")).toHaveCount(0);
  await sql`UPDATE products SET pdp_config=pdp_config || ${sql.json({ gift: { enabled: false }, sizeGuide: { enabled: false }, rating: { enabled: false }, packageContents: { enabled: false }, accessories: { enabled: false }, dimensionsEnabled: false, specificationsEnabled: false, support: {} })}::jsonb WHERE id=${productId}`;
  await page.goto(productPath);
  await expect(page.getByTestId("selling-price")).toBeVisible();
  await expect(page.getByText("Grip tape de cortesía", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Manual de usuario", { exact: true })).toHaveCount(0);
  for (const section of ["guia-tallas", "dimensiones", "especificaciones", "contenido"])
    await expect(page.getByTestId(`pdp-accordion-${section}`)).toHaveCount(0);
});
