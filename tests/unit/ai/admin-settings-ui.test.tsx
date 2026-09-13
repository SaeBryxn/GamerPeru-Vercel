// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSettingsWorkspace } from "@/app/admin/(protected)/settings/ai/settings-workspace";
import type { AdminAiSettingsDto } from "@/lib/ai/admin/types";

const refresh = vi.fn();
const saveCredential = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/ai/admin/actions", () => ({
  configureProfileAdminAction: vi.fn(),
  configureProviderAdminAction: vi.fn(),
  revokeCredentialAdminAction: vi.fn(),
  rotateCredentialKeyAdminAction: vi.fn(),
  saveCredentialAdminAction: (...args: unknown[]) => saveCredential(...args),
  testCredentialAdminAction: vi.fn(),
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
      updatedAt: "2026-09-13T12:00:00.000Z",
      credential: null,
    },
  ],
  profiles: [],
};

describe("GP-025 / CHK4 — safe credential UI", () => {
  beforeEach(() => {
    refresh.mockReset();
    saveCredential.mockReset();
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
});
