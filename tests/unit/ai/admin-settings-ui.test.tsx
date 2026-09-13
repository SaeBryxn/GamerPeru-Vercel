// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSettingsWorkspace } from "@/app/admin/(protected)/settings/ai/settings-workspace";
import type { AdminAiSettingsDto } from "@/lib/ai/admin/types";

const refresh = vi.fn();
const saveCredential = vi.fn();
const configureProfile = vi.fn();
const testCredential = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/ai/admin/actions", () => ({
  configureProfileAdminAction: (...args: unknown[]) => configureProfile(...args),
  configureProviderAdminAction: vi.fn(),
  revokeCredentialAdminAction: vi.fn(),
  rotateCredentialKeyAdminAction: vi.fn(),
  saveCredentialAdminAction: (...args: unknown[]) => saveCredential(...args),
  testCredentialAdminAction: (...args: unknown[]) => testCredential(...args),
}));

const settings: AdminAiSettingsDto = {
  providers: [
    {
      id: "018f0025-4000-7000-8000-000000000001",
      providerKey: "google",
      displayName: "Google Gemini",
      isEnabled: true,
      isDefault: true,
      settings: {},
      researchExecutionSupported: true,
      healthCheckSupported: true,
      updatedAt: "2026-09-13T12:00:00.000Z",
      credential: null,
    },
  ],
  profiles: [],
  providerCapabilities: [
    {
      providerKey: "google",
      researchExecutionSupported: true,
      healthCheckSupported: true,
    },
    {
      providerKey: "openai",
      researchExecutionSupported: false,
      healthCheckSupported: false,
    },
    {
      providerKey: "anthropic",
      researchExecutionSupported: false,
      healthCheckSupported: false,
    },
  ],
};

describe("GP-025 / CHK4 — safe credential UI", () => {
  beforeEach(() => {
    refresh.mockReset();
    saveCredential.mockReset();
    configureProfile.mockReset();
    testCredential.mockReset();
    saveCredential.mockResolvedValue({
      success: true,
      data: {
        id: "018f0025-4000-7000-8000-000000000002",
        providerId: settings.providers[0]!.id,
        maskedKey: "••••••test",
        status: "ACTIVE",
        keyVersion: 2,
        lastHealthStatus: "UNTESTED",
        lastTestedAt: null,
        createdAt: "2026-09-13T12:00:00.000Z",
        updatedAt: "2026-09-13T12:00:00.000Z",
      },
    });
    configureProfile.mockResolvedValue({ success: true, data: { profileId: "profile-id" } });
    testCredential.mockResolvedValue({
      success: true,
      data: {
        ok: true,
        status: "HEALTHY",
        code: "AI_PROVIDER_HEALTH_CHECK_OK",
        message: "La conexión con el proveedor respondió correctamente.",
      },
    });
  });

  it("clears plaintext credential input immediately after a successful encrypted save", async () => {
    const user = userEvent.setup();
    render(<AiSettingsWorkspace initialSettings={settings} />);
    const input = screen.getByLabelText("Clave de API");
    await user.type(input, "private-provider-key");
    await user.click(screen.getByRole("button", { name: "Guardar credencial" }));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    expect(saveCredential).toHaveBeenCalledWith({
      providerId: settings.providers[0]!.id,
      plaintextApiKey: "private-provider-key",
    });
    expect(screen.queryByDisplayValue("private-provider-key")).toBeNull();
  });

  it("renders masked metadata without any encrypted material fields", () => {
    const withCredential: AdminAiSettingsDto = {
      ...settings,
      providers: [
        {
          ...settings.providers[0]!,
          credential: {
            id: "018f0025-4000-7000-8000-000000000002",
            providerId: settings.providers[0]!.id,
            maskedKey: "••••••last4",
            status: "ACTIVE",
            keyVersion: 3,
            lastHealthStatus: "HEALTHY",
            lastTestedAt: "2026-09-13T12:00:00.000Z",
            createdAt: "2026-09-13T11:00:00.000Z",
            updatedAt: "2026-09-13T12:00:00.000Z",
          },
        },
      ],
    };
    const { container } = render(<AiSettingsWorkspace initialSettings={withCredential} />);
    expect(screen.getByText("••••••last4")).toBeTruthy();
    expect(container.textContent).not.toMatch(/ciphertext|authTag|master key|private-provider-key/);
  });

  it("shows runtime capability honestly and never enables unsupported health checks", async () => {
    const user = userEvent.setup();
    const credential = {
      id: "018f0025-4000-7000-8000-000000000002",
      maskedKey: "••••••last4",
      status: "ACTIVE" as const,
      keyVersion: 3,
      lastHealthStatus: "UNTESTED" as const,
      lastTestedAt: null,
      createdAt: "2026-09-13T11:00:00.000Z",
      updatedAt: "2026-09-13T12:00:00.000Z",
    };
    const capabilitySettings: AdminAiSettingsDto = {
      ...settings,
      providers: [
        {
          ...settings.providers[0]!,
          credential: { ...credential, providerId: settings.providers[0]!.id },
        },
        {
          id: "018f0025-4000-7000-8000-000000000003",
          providerKey: "openai",
          displayName: "OpenAI futuro",
          isEnabled: true,
          isDefault: false,
          settings: {},
          researchExecutionSupported: false,
          healthCheckSupported: false,
          updatedAt: "2026-09-13T12:00:00.000Z",
          credential: {
            ...credential,
            id: "018f0025-4000-7000-8000-000000000004",
            providerId: "018f0025-4000-7000-8000-000000000003",
          },
        },
      ],
      profiles: [
        {
          id: "018f0025-4000-7000-8000-000000000005",
          profileKey: "PRODUCT_RESEARCH_DEEP",
          providerId: "018f0025-4000-7000-8000-000000000003",
          providerDisplayName: "OpenAI futuro",
          modelId: "future-model",
          temperature: "0.20",
          maxTokens: 4096,
          isEnabled: true,
          researchExecutionSupported: false,
          updatedAt: "2026-09-13T12:00:00.000Z",
        },
      ],
    };

    render(<AiSettingsWorkspace initialSettings={capabilitySettings} />);
    const googleCard = screen.getByTestId("provider-google");
    const openAiCard = screen.getByTestId("provider-openai");
    expect(
      within(googleCard).getByRole("button", { name: "Probar conexión" }).hasAttribute("disabled")
    ).toBe(false);
    expect(within(openAiCard).queryByRole("button", { name: "Probar conexión" })).toBeNull();
    expect(within(openAiCard).getByText(/Adaptador de ejecución aún no disponible/)).toBeTruthy();

    await user.click(within(googleCard).getByRole("button", { name: "Probar conexión" }));
    await waitFor(() =>
      expect(testCredential).toHaveBeenCalledWith({ providerId: settings.providers[0]!.id })
    );

    const profileCard = screen.getByTestId("profile-PRODUCT_RESEARCH_DEEP");
    const saveButton = within(profileCard).getByRole("button", { name: "Guardar perfil" });
    expect(saveButton.hasAttribute("disabled")).toBe(true);
    await user.click(within(profileCard).getByLabelText("Habilitado"));
    expect(saveButton.hasAttribute("disabled")).toBe(false);
    await user.click(saveButton);
    await waitFor(() =>
      expect(configureProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profileKey: "PRODUCT_RESEARCH_DEEP",
          providerId: "018f0025-4000-7000-8000-000000000003",
          isEnabled: false,
        })
      )
    );
  });
});
