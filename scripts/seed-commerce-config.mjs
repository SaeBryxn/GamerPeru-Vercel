import postgres from "postgres";
import crypto from "node:crypto";

/**
 * Seeds the configuration checkout needs before a customer can complete an order:
 * shipping options, and the manual payment methods with their payment instructions.
 *
 * Shipping prices are business decisions, so they are flags with conservative defaults rather
 * than values buried in the script.
 *
 * Payment instructions are never invented. A Yape or Plin instruction tells a customer where to
 * send money; a placeholder recipient or number would send real payments into the void. The
 * method rows are created either way, but checkout only offers a method once its instructions
 * exist, so the flags below are required to finish enabling payments.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-commerce-config.mjs
 *   node --env-file=.env.local scripts/seed-commerce-config.mjs --apply
 *   node --env-file=.env.local scripts/seed-commerce-config.mjs --apply \
 *     --lima-price 1500 --provincia-price 2500 \
 *     --yape-name "Gamer Peru SAC" --yape-number 987654321 \
 *     --plin-name "Gamer Peru SAC" --plin-number 987654321
 */

const args = process.argv.slice(2);
const apply = args.includes("--apply");

function flag(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function priceFlag(name, fallbackCents) {
  const raw = flag(name);
  if (raw === null) return fallbackCents;
  const cents = Number.parseInt(raw, 10);
  if (!Number.isInteger(cents) || cents < 0) {
    console.error(`--${name} debe ser un entero en céntimos (ej. 1500 = S/ 15.00)`);
    process.exit(1);
  }
  return cents;
}

const SHIPPING = [
  {
    code: "LIMA_REGULAR",
    name: "Envío Regular Lima",
    basePriceCents: priceFlag("lima-price", 1500),
    estimatedDaysMin: 1,
    estimatedDaysMax: 3,
  },
  {
    code: "PROVINCIA_REGULAR",
    name: "Envío Provincia",
    basePriceCents: priceFlag("provincia-price", 2500),
    estimatedDaysMin: 3,
    estimatedDaysMax: 7,
  },
];

const PAYMENT_METHODS = [
  {
    code: "YAPE_MANUAL",
    name: "Yape",
    displayOrder: 0,
    recipientName: flag("yape-name"),
    accountIdentifier: flag("yape-number"),
  },
  {
    code: "PLIN_MANUAL",
    name: "Plin",
    displayOrder: 1,
    recipientName: flag("plin-name"),
    accountIdentifier: flag("plin-number"),
  },
];

function buildInstructionText(method) {
  return [
    `Abre ${method.name} y envía el monto exacto del pedido a ${method.accountIdentifier} (${method.recipientName}).`,
    "Usa el número de pedido como mensaje o concepto.",
    "Luego sube la captura del comprobante para que confirmemos tu pago.",
    "Tu pedido queda reservado mientras verificamos el pago manualmente.",
  ].join(" ");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
const pending = [];

try {
  console.log("1) Métodos de envío");
  for (const method of SHIPPING) {
    const [existing] = await sql`
      select id, base_price_cents, is_active from shipping_methods where code = ${method.code}`;

    const soles = (method.basePriceCents / 100).toFixed(2);

    if (existing) {
      console.log(
        `  OK        ${method.code} — ya existe (S/ ${(existing.base_price_cents / 100).toFixed(2)})`
      );
      continue;
    }

    console.log(
      `  ${apply ? "CREADO   " : "PENDIENTE"} ${method.code} — ${method.name}, S/ ${soles}, ${method.estimatedDaysMin}-${method.estimatedDaysMax} días`
    );

    if (!apply) continue;

    await sql`
      insert into shipping_methods (id, name, code, base_price_cents, estimated_days_min, estimated_days_max, is_active)
      values (${crypto.randomUUID()}, ${method.name}, ${method.code}, ${method.basePriceCents},
              ${method.estimatedDaysMin}, ${method.estimatedDaysMax}, true)`;
  }

  console.log("\n2) Métodos de pago");
  for (const method of PAYMENT_METHODS) {
    const [existing] = await sql`
      select id, current_instruction_version_id from payment_method_configurations where code = ${method.code}`;

    if (!existing) {
      console.log(`  ${apply ? "CREADO   " : "PENDIENTE"} ${method.code} — ${method.name}`);
      if (apply) {
        await sql`
          insert into payment_method_configurations (id, code, name, method_type, is_active, display_order)
          values (${crypto.randomUUID()}, ${method.code}, ${method.name}, 'MANUAL', true, ${method.displayOrder})`;
      }
    } else {
      console.log(`  OK        ${method.code} — el método ya existe`);
    }
  }

  console.log("\n3) Instrucciones de pago");

  for (const method of PAYMENT_METHODS) {
    const [config] = await sql`
      select current_instruction_version_id from payment_method_configurations where code = ${method.code}`;

    if (config?.current_instruction_version_id) {
      console.log(`  OK        ${method.code} — ya tiene instrucciones activas`);
      continue;
    }

    if (!method.recipientName || !method.accountIdentifier) {
      pending.push(method);
      console.log(
        `  FALTA     ${method.code} — se necesitan --${method.code.split("_")[0].toLowerCase()}-name y --${method.code.split("_")[0].toLowerCase()}-number`
      );
      continue;
    }

    console.log(
      `  ${apply ? "CREADAS  " : "PENDIENTE"} ${method.code} — ${method.recipientName} / ${method.accountIdentifier}`
    );

    if (!apply) continue;

    const [{ next }] = await sql`
      select coalesce(max(version_number), 0) + 1 as next
      from payment_instruction_versions where payment_method_code = ${method.code}`;

    const versionId = crypto.randomUUID();
    await sql`
      insert into payment_instruction_versions
        (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
      values (${versionId}, ${method.code}, ${next}, ${method.recipientName},
              ${method.accountIdentifier}, ${buildInstructionText(method)}, true)`;

    await sql`
      update payment_method_configurations
      set current_instruction_version_id = ${versionId}, updated_at = now()
      where code = ${method.code}`;
  }

  console.log("\n4) Estado del checkout");
  const [{ shipping }] = await sql`
    select count(*)::int shipping from shipping_methods where is_active = true`;
  const [{ payable }] = await sql`
    select count(*)::int payable from payment_method_configurations
    where is_active = true and method_type = 'MANUAL' and current_instruction_version_id is not null`;

  console.log(`  envíos disponibles: ${shipping}`);
  console.log(`  pagos ofrecidos en el checkout: ${payable}`);
  console.log(
    shipping > 0 && payable > 0
      ? "  El checkout puede completarse."
      : "  El checkout todavía NO puede completarse."
  );
} finally {
  await sql.end({ timeout: 5 });
}

if (!apply) {
  console.log("\nSimulación. Ejecuta con --apply para escribir.");
}

if (pending.length > 0) {
  console.log(
    `\nFalta configurar: ${pending.map((m) => m.name).join(" y ")}. Son datos reales de cobro y no se inventan.`
  );
}
