// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth/google-oauth", () => ({ initiateGoogleOAuth: vi.fn() }));

import { RegisterForm } from "@/components/auth/register-form";

describe("Register form", () => {
  afterEach(cleanup);

  it("keeps every field labelled and links the legal terms", () => {
    render(<RegisterForm />);
    for (const label of ["Nombre", "Apellido", "Correo electrónico", "Contraseña"]) {
      expect(screen.getByText(label, { selector: "label, label *" })).toBeDefined();
    }
    expect(screen.getByRole("link", { name: "Términos de servicio" }).getAttribute("href")).toBe(
      "/legal/terminos"
    );
    expect(screen.getByRole("link", { name: "Política de privacidad" }).getAttribute("href")).toBe(
      "/legal/privacidad"
    );
  });

  it("shows the password on demand and ticks the rules as they are met", () => {
    render(<RegisterForm />);
    const password = screen.getByLabelText("Contraseña");
    expect(password.getAttribute("type")).toBe("password");

    const toggle = screen.getAllByRole("button", { name: "Mostrar" })[0]!;
    fireEvent.click(toggle);
    expect(password.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(password, { target: { value: "segura123" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "segura123" },
    });
    expect(screen.getByText(/\(cumplido\)/)).toBeDefined();
    expect(screen.getByText("Las dos contraseñas coinciden").className).toContain("requirementMet");
  });
});
