// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  grantStaffAccessAction: vi.fn(),
  changeStaffAccessAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/admin/staff/actions", () => actions);

import { TeamWorkspace, type TeamMemberView } from "@/app/admin/(protected)/equipo/team-workspace";

const SELF: TeamMemberView = {
  authUserId: "0193b057-0000-7000-8000-0000000000a1",
  email: "super@example.pe",
  name: "Bryan Espejo",
  standing: "SUPER_ADMIN",
  lastChanged: null,
  isSelf: true,
  isLastSuperAdmin: false,
};

const OPERATOR: TeamMemberView = {
  authUserId: "0193b057-0000-7000-8000-0000000000b2",
  email: "operador@example.pe",
  name: null,
  standing: "ADMIN",
  lastChanged: "12 oct 2026",
  isSelf: false,
  isLastSuperAdmin: false,
};

beforeEach(() => {
  actions.grantStaffAccessAction.mockReset();
  actions.changeStaffAccessAction.mockReset();
});
afterEach(cleanup);

describe("Team workspace", () => {
  it("lists members with their level and locks the session user's own row", () => {
    render(<TeamWorkspace members={[SELF, OPERATOR]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeTruthy();
    expect(screen.getByText("2 personas con acceso")).toBeTruthy();
    expect(screen.getByText("No puedes cambiar tu propio acceso.")).toBeTruthy();
    expect(screen.queryByTestId("team-change-super@example.pe")).toBeNull();
    expect(screen.getByTestId("team-change-operador@example.pe")).toBeTruthy();
    expect(screen.getByText("Último cambio: 12 oct 2026")).toBeTruthy();
  });

  it("locks the last super admin", () => {
    render(
      <TeamWorkspace members={[{ ...OPERATOR, standing: "SUPER_ADMIN", isLastSuperAdmin: true }]} />
    );
    expect(screen.getByText(/Último superadministrador/)).toBeTruthy();
    expect(screen.queryByTestId("team-change-operador@example.pe")).toBeNull();
  });

  it("confirms a grant before calling the action", async () => {
    actions.grantStaffAccessAction.mockResolvedValue({
      success: true,
      data: { email: "nuevo@example.pe", action: "grant" },
    });
    render(<TeamWorkspace members={[SELF]} />);

    fireEvent.change(screen.getByTestId("team-grant-email"), {
      target: { value: "nuevo@example.pe" },
    });
    fireEvent.change(screen.getByTestId("team-grant-level"), { target: { value: "ADMIN_ORDERS" } });
    fireEvent.click(screen.getByTestId("team-grant-submit"));

    expect(actions.grantStaffAccessAction).not.toHaveBeenCalled();
    expect(screen.getByText(/podrá entrar al panel/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar acceso" }));
    await waitFor(() =>
      expect(actions.grantStaffAccessAction).toHaveBeenCalledWith({
        email: "nuevo@example.pe",
        level: "ADMIN_ORDERS",
      })
    );
  });

  it("rejects an invalid email without opening the confirmation", () => {
    render(<TeamWorkspace members={[SELF]} />);
    fireEvent.change(screen.getByTestId("team-grant-email"), { target: { value: "sin-arroba" } });
    fireEvent.click(screen.getByTestId("team-grant-submit"));
    expect(screen.getByTestId("team-grant-error").textContent).toMatch(/cuenta registrada/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains a revocation and shows the server's refusal", async () => {
    actions.changeStaffAccessAction.mockResolvedValue({
      success: false,
      error: "Es el último superadministrador.",
      code: "LAST_SUPER_ADMIN",
    });
    render(<TeamWorkspace members={[SELF, OPERATOR]} />);

    fireEvent.change(screen.getByTestId("team-change-operador@example.pe"), {
      target: { value: "revocar" },
    });
    expect(screen.getByText(/perderá todo acceso al panel/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revocar acceso" }));
    await waitFor(() =>
      expect(actions.changeStaffAccessAction).toHaveBeenCalledWith({
        authUserId: OPERATOR.authUserId,
        level: null,
      })
    );
    await waitFor(() => expect(screen.getByText("Es el último superadministrador.")).toBeTruthy());
  });
});
