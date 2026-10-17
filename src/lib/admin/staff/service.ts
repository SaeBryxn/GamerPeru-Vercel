import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, roles, userRoles } from "@/db/schema";
import { CANONICAL_ROLES, CANONICAL_STAFF_ROLES, type RoleName } from "@/lib/auth/rbac";
import {
  planStaffChange,
  standingOf,
  type StaffChangeError,
  type StaffLevel,
  type StaffStanding,
} from "./levels";

export interface StaffMember {
  authUserId: string;
  email: string | null;
  name: string | null;
  roles: RoleName[];
  standing: StaffStanding;
  /** Last grant or change recorded by this screen; null for access provisioned before it. */
  lastChangedAt: string | null;
}

export type StaffChangeOutcome =
  | {
      ok: true;
      action: "grant" | "change" | "revoke";
      email: string | null;
      previousRoles: RoleName[];
      nextRoles: RoleName[];
    }
  | { ok: false; error: StaffChangeError | "USER_NOT_FOUND" };

export interface ChangeStaffAccessInput {
  actorAuthUserId: string;
  /** Either the member's id (change, revoke) or a registered email (grant). */
  target: { authUserId: string } | { email: string };
  nextLevel: StaffLevel | null;
  requestId?: string | null;
}

// One lock for every staff change, so two super admins demoting each other at the same time
// cannot both pass the last-super-admin count.
const STAFF_ROLES_LOCK = sql`SELECT pg_advisory_xact_lock(hashtext('gamerperu:staff-roles'))`;

const STAFF_ROLE_NAMES = sql.join(
  CANONICAL_STAFF_ROLES.map((role) => sql`${role}`),
  sql`, `
);

function toRoleNames(values: string[]): RoleName[] {
  return values.filter((value): value is RoleName => CANONICAL_ROLES.includes(value as RoleName));
}

export async function listStaffMembers(): Promise<StaffMember[]> {
  const rows = await db.execute<{
    auth_user_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    roles: string[];
    last_changed_at: Date | string | null;
  }>(sql`
    SELECT
      ur.auth_user_id,
      u.email,
      cp.first_name,
      cp.last_name,
      array_agg(r.name ORDER BY r.name) AS roles,
      (
        SELECT max(ae.timestamp)
        FROM audit_events ae
        WHERE ae.target_type = 'staff_member' AND ae.target_id = ur.auth_user_id::text
      ) AS last_changed_at
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN auth.users u ON u.id = ur.auth_user_id
    LEFT JOIN customer_profiles cp ON cp.auth_user_id = ur.auth_user_id
    GROUP BY ur.auth_user_id, u.email, cp.first_name, cp.last_name
    HAVING bool_or(r.name IN (${STAFF_ROLE_NAMES}))
    ORDER BY u.email
  `);

  return rows.flatMap((row) => {
    const memberRoles = toRoleNames(row.roles);
    const standing = standingOf(memberRoles);
    if (!standing) return [];
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return [
      {
        authUserId: row.auth_user_id,
        email: row.email,
        name: name.length > 0 ? name : null,
        roles: memberRoles,
        standing,
        lastChangedAt: row.last_changed_at ? new Date(row.last_changed_at).toISOString() : null,
      },
    ];
  });
}

/**
 * Grants, changes or revokes administrative access in one transaction. The guardrails in
 * planStaffChange run against state read under the staff lock, so they hold under concurrency.
 */
export async function changeStaffAccess(
  input: ChangeStaffAccessInput
): Promise<StaffChangeOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(STAFF_ROLES_LOCK);

    const [account] = await tx.execute<{ id: string; email: string | null }>(
      "authUserId" in input.target
        ? sql`SELECT id, email FROM auth.users WHERE id = ${input.target.authUserId}::uuid`
        : sql`SELECT id, email FROM auth.users WHERE lower(email) = lower(${input.target.email}) LIMIT 1`
    );
    if (!account) return { ok: false, error: "USER_NOT_FOUND" } as const;

    const currentRows = await tx
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.authUserId, account.id));
    const [superAdmins] = await tx.execute<{ count: number }>(sql`
      SELECT count(DISTINCT ur.auth_user_id)::int AS count
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'SUPER_ADMIN'
    `);

    const plan = planStaffChange({
      actorAuthUserId: input.actorAuthUserId,
      targetAuthUserId: account.id,
      targetRoles: toRoleNames(currentRows.map((row) => row.name)),
      nextLevel: input.nextLevel,
      superAdminCount: superAdmins?.count ?? 0,
    });
    if (!plan.ok) return plan;

    const changed = [...plan.add, ...plan.remove];
    const roleIds = new Map(
      (await tx.select().from(roles).where(inArray(roles.name, changed))).map((role) => [
        role.name,
        role.id,
      ])
    );

    if (plan.remove.length > 0) {
      await tx.delete(userRoles).where(
        and(
          eq(userRoles.authUserId, account.id),
          inArray(
            userRoles.roleId,
            plan.remove.map((role) => roleIds.get(role)!)
          )
        )
      );
    }
    if (plan.add.length > 0) {
      await tx
        .insert(userRoles)
        .values(plan.add.map((role) => ({ authUserId: account.id, roleId: roleIds.get(role)! })))
        .onConflictDoNothing();
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId: input.actorAuthUserId,
      action: `staff:access:${plan.action}`,
      targetType: "staff_member",
      targetId: account.id,
      metadata: {
        target_email: account.email,
        previous_roles: plan.previousRoles,
        next_roles: plan.nextRoles,
        previous_level: standingOf(plan.previousRoles),
        next_level: input.nextLevel,
      },
      requestId: input.requestId ?? null,
    });

    return {
      ok: true,
      action: plan.action,
      email: account.email,
      previousRoles: plan.previousRoles,
      nextRoles: plan.nextRoles,
    } as const;
  });
}
