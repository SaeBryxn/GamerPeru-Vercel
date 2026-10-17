# GP-057 — Closure Report

## Base Checkpoint

`70188e1` on `feat/cloudflare-workers` (GP-028 integration and hydration fixes, pushed).

## Closure Checkpoint

The GP-057 commit that adds this report on `feat/cloudflare-workers` (not pushed).

## Summary

A `SUPER_ADMIN` manages administrative access from `/admin/equipo`: the team list (name, email,
level, last change), granting a level to a registered email, changing levels and revoking access,
each behind a confirmation that states what the person gains or loses. The levels map onto the
existing roles (no migration): Superadministrador = `SUPER_ADMIN`; Administrador =
`ADMIN_CATALOG` + `ADMIN_ORDERS` + `ADMIN_SUPPORT`; or a single operational role.

## Files Changed

- `src/lib/admin/staff/levels.ts` — levels, labels, permission summaries, `standingOf`,
  `planStaffChange` (role diff and guardrails). Browser-safe: type-only import of the RBAC module.
- `src/lib/admin/staff/service.ts` — `listStaffMembers` (roles, `auth.users` email,
  `customer_profiles` name, last `staff_member` audit timestamp) and `changeStaffAccess` (advisory
  lock, target lookup by id or email, in-transaction super-admin count, role diff, audit event).
- `src/lib/admin/staff/actions.ts` — `grantStaffAccessAction`, `changeStaffAccessAction`
  (`staff:manage`, Zod validation, actor from the verified session, error messages).
- `src/app/admin/(protected)/equipo/{page.tsx,team-workspace.tsx,team.module.css}`.
- `src/lib/admin/navigation.ts` ("Equipo", `staff:manage`), `admin-sidebar.tsx`,
  `admin-mobile-nav.tsx` (`Users` icon).
- Tests: `admin-staff-levels.test.ts`, `admin-staff-actions.test.ts`,
  `admin-team-workspace.test.tsx` (new), `admin-navigation.test.ts` (team item);
  `tests/e2e/admin-team-guard.spec.ts` (default suite), `tests/e2e/admin-team.spec.ts` (admin
  suite, local Supabase only); Playwright configs updated.
- Docs: `docs/roadmap/GP-057.md`, `docs/roadmap/ROADMAP.md`, this report.

## Decisions

- **No new role.** Administrador is the three operational roles together, as agreed. A member
  holding two of them is shown as "Varias áreas" and can be moved to any level.
- **Superadministrador replaces the operational roles**: it already holds every permission, so
  the extra rows would only make revocation and display ambiguous.
- **Any self-change is refused**, not only demotion: a super admin's own row has no actions, and
  the server rejects it too (`SELF_CHANGE`).
- **Last super admin**: counted inside the transaction after `pg_advisory_xact_lock`, so two
  super admins demoting each other concurrently cannot both succeed.
- **Grant by exact email only**, case-insensitive, against `auth.users`; no customer search or
  listing. Unknown emails get "debe crear su cuenta en la tienda primero".
- **Audit**: `staff:access:grant|change|revoke`, target type `staff_member`, metadata with the
  target email, previous/next roles and levels. "Último cambio" reads from these events; access
  provisioned before this screen shows "Asignado antes de este panel" (`user_roles` has no
  timestamps).
- **Effect timing**: RBAC is resolved from the database on every request, so a change applies on
  the target's next request; no session invalidation is needed.

## Validation

- `pnpm check`: PASS — format, typecheck, lint with zero warnings, 161 files / 1876 unit tests,
  build (`/admin/equipo` dynamic).
- `pnpm test:e2e` (fixture mode): 161/161 PASS, 0 hydration errors. The new guard spec caught a
  real defect during development: the client workspace imported a runtime value from
  `rbac.ts`, pulling the database client into the browser bundle (`Can't resolve 'tls'`); fixed
  and covered by a unit test.
- **Not run here:** `tests/e2e/admin-team.spec.ts` needs the seeded local Supabase
  (`playwright.admin.config.ts` refuses any other database); the `.env.local` connection is
  production. No visual check of the screen either, for the same reason (it requires a staff
  session).

## Acceptance Criteria

- Only `staff:manage` sees the nav item, the page and can run the actions — met (unit + guard).
- Grant, change and revoke from the screen — met (unit; admin E2E pending local run).
- Self-changes and removing the last `SUPER_ADMIN` rejected server-side — met (planner + service).
- Audit event per change with actor, target, previous and new roles — met.

## Deviations / Notes

- The existing super admin (`bryanadmin@gmail.com`, shown as `SUPER_ADMIN` in the production
  admin sidebar) needs no change; no data was written to production.

## Risks / Follow-ups

- **Administrador cannot adjust inventory**: `inventory:manage` is mapped only to `SUPER_ADMIN`
  (migration 0012). The screen says so. Granting it to operators needs an additive
  `role_permissions` migration and an ADR-003 note.
- Run `admin-team.spec.ts` against local Supabase before release.
- Verify `/admin/equipo` in production with the owner session after push.

## Repository Status

Clean after the GP-057 commit; not pushed.

## Final Status

PASS WITH NOTES (admin E2E and production check pending; operators lack `inventory:manage`).
