import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
});

let pass = 0;
let fail = 0;
const warn = [];

function ok(name, detail) {
  pass++;
  console.log(`  OK   ${name}${detail ? ` -> ${detail}` : ""}`);
}
function bad(name, detail) {
  fail++;
  console.log(`  FALLA ${name} -> ${detail}`);
}

try {
  console.log("1) Conexion");
  const t0 = Date.now();
  const [{ now, version }] = await sql`select now() as now, version() as version`;
  ok("handshake", `${Date.now() - t0} ms`);
  ok("servidor", version.split(" ").slice(0, 2).join(" "));
  ok("hora del servidor", new Date(now).toISOString());

  console.log("\n2) Esquema y migraciones");
  const [{ count: tableCount }] = await sql`
    select count(*)::int as count from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;
  ok("tablas en public", String(tableCount));

  const applied = await sql`
    select hash, created_at from drizzle.__drizzle_migrations order by created_at`;
  const files = fs.readdirSync(path.resolve("src/db/migrations")).filter((f) => f.endsWith(".sql"));
  if (applied.length === files.length) {
    ok("migraciones", `${applied.length} aplicadas = ${files.length} archivos`);
  } else {
    warn.push(`migraciones: ${applied.length} aplicadas vs ${files.length} archivos en el repo`);
    console.log(`  AVISO migraciones -> ${applied.length} aplicadas vs ${files.length} archivos`);
  }

  console.log("\n3) Catalogo");
  const [cat] = await sql`select count(*)::int c from categories`;
  const [br] = await sql`select count(*)::int c from brands`;
  const [vr] = await sql`select count(*)::int c from product_variants`;
  const byStatus =
    await sql`select status, count(*)::int c from products group by status order by status`;
  ok("categorias", String(cat.c));
  ok("marcas", String(br.c));
  ok("variantes", String(vr.c));
  ok("productos por estado", byStatus.map((r) => `${r.status}=${r.c}`).join(", ") || "ninguno");

  const orphans = await sql`
    select p.slug from products p
    left join brands b on b.id = p.brand_id
    left join categories c on c.id = p.category_id
    where b.id is null or c.id is null`;
  if (orphans.length === 0) ok("integridad marca/categoria", "sin huerfanos");
  else bad("integridad marca/categoria", `${orphans.length} productos huerfanos`);

  const noVariant = await sql`
    select p.slug from products p
    where not exists (select 1 from product_variants v where v.product_id = p.id)`;
  if (noVariant.length === 0) ok("cada producto tiene variante", "si");
  else bad("cada producto tiene variante", `${noVariant.length} sin variante`);

  console.log("\n4) Inventario");
  const locs = await sql`select code, is_active from inventory_locations order by code`;
  ok("almacenes", locs.map((l) => `${l.code}${l.is_active ? "" : " (inactivo)"}`).join(", "));
  for (const envKey of [
    "CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE",
    "INVENTORY_QUARANTINE_LOCATION_CODE",
  ]) {
    const code = process.env[envKey];
    if (locs.some((l) => l.code === code)) ok(`${envKey} existe en la BD`, code);
    else bad(`${envKey} existe en la BD`, `no existe el almacen ${code}`);
  }
  const [inv] = await sql`
    select count(*)::int rows,
           coalesce(sum(quantity_on_hand),0)::int on_hand,
           coalesce(sum(quantity_reserved),0)::int reserved
    from inventory_items`;
  ok(
    "filas de inventario",
    `${inv.rows} filas, ${inv.on_hand} en stock, ${inv.reserved} comprometidas`
  );

  const missingInv = await sql`
    select v.sku from product_variants v
    where not exists (select 1 from inventory_items i where i.variant_id = v.id)`;
  if (missingInv.length === 0) ok("cada variante tiene inventario", "si");
  else bad("cada variante tiene inventario", `${missingInv.length} variantes sin fila`);

  console.log("\n5) Identidad y permisos");
  const roleRows = await sql`
    select r.name as code, count(ur.auth_user_id)::int c
    from roles r left join user_roles ur on ur.role_id = r.id
    group by r.name order by r.name`;
  ok("roles definidos", roleRows.map((r) => `${r.code}=${r.c}`).join(", ") || "ninguno");
  const [{ c: permCount }] = await sql`select count(*)::int c from role_permissions`;
  ok("permisos mapeados a roles", String(permCount));
  const superAdmins = roleRows.find((r) => r.code === "SUPER_ADMIN")?.c ?? 0;
  if (superAdmins > 0) ok("SUPER_ADMIN configurado", `${superAdmins} cuenta(s)`);
  else bad("SUPER_ADMIN configurado", "ninguna cuenta puede entrar al panel");

  console.log("\n6) Datos de clientes (deben estar vacios antes de lanzar)");
  for (const table of ["orders", "payment_submissions", "carts"]) {
    try {
      const [{ c }] = await sql.unsafe(`select count(*)::int c from ${table}`);
      ok(`${table}`, `${c} registros`);
    } catch {
      console.log(`  AVISO ${table} -> la tabla no existe`);
    }
  }

  console.log("\n7) Medios del catalogo");
  const [{ c: mediaCount }] = await sql`select count(*)::int c from product_media`;
  ok("imagenes registradas", String(mediaCount));
  const noMedia = await sql`
    select p.slug from products p
    where not exists (select 1 from product_media m where m.product_id = p.id)
    order by p.slug`;
  if (noMedia.length > 0) {
    warn.push(`${noMedia.length} productos todavia sin imagen`);
    console.log(
      `  AVISO productos sin imagen -> ${noMedia.length}: ${noMedia.map((r) => r.slug).join(", ")}`
    );
  } else ok("productos sin imagen", "ninguno");
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`\nRESULTADO BASE DE DATOS: ${pass} ok, ${fail} fallas, ${warn.length} avisos`);
process.exit(fail > 0 ? 1 : 0);
