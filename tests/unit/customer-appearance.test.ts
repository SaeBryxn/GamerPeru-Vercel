import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerAppearanceSchema,
  defaultCustomerAppearance,
  readCustomerAppearance,
} from "@/lib/account/appearance";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth }) }));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
const { updateCustomerAppearanceAction } = await import("@/lib/account/appearance-actions");
const { getCurrentCustomerAppearance } = await import("@/lib/account/appearance-reader");

describe("Personalización privada de la cuenta", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.getUser.mockResolvedValue({
      data: { user: { id: "current-user", user_metadata: {} } },
      error: null,
    });
    auth.updateUser.mockResolvedValue({ data: { user: { id: "current-user" } }, error: null });
  });
  it("lee solo preferencias validadas y tolera cuentas anteriores sin personalización", () => {
    expect(readCustomerAppearance(null)).toEqual(defaultCustomerAppearance());
    expect(readCustomerAppearance({ gamerperu_profile: { displayName: "<script>" } })).toEqual(
      defaultCustomerAppearance()
    );
    expect(
      customerAppearanceSchema.safeParse({
        ...defaultCustomerAppearance(),
        displayName: "x".repeat(41),
      }).success
    ).toBe(false);
    expect(
      customerAppearanceSchema.safeParse({
        ...defaultCustomerAppearance(),
        avatarSeed: "https://external.test/avatar",
      }).success
    ).toBe(false);
  });
  it("guarda solamente apariencia para el usuario autenticado y actualiza el espacio de cuenta", async () => {
    const appearance = { displayName: "  Max  ", avatarSeed: "avatar-123", accent: "neutral" };
    const result = await updateCustomerAppearanceAction(appearance);
    expect(result).toEqual({ success: true, appearance: { ...appearance, displayName: "Max" } });
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.updateUser).toHaveBeenCalledWith({
      data: { gamerperu_profile: { ...appearance, displayName: "Max" } },
    });
    expect(revalidate).toHaveBeenCalledWith("/cuenta", "layout");
    expect(JSON.stringify(result)).not.toContain("current-user");
  });
  it("rechaza IDs ajenos y campos de permisos antes de escribir", async () => {
    expect(
      (
        await updateCustomerAppearanceAction({
          ...defaultCustomerAppearance(),
          userId: "other-user",
          role: "SUPER_ADMIN",
        })
      ).success
    ).toBe(false);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("una sesión inválida nunca modifica preferencias", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect((await updateCustomerAppearanceAction(defaultCustomerAppearance())).success).toBe(false);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("un fallo de Auth no se presenta como un guardado y no filtra errores internos", async () => {
    auth.updateUser.mockRejectedValue(new Error("private-token-and-email"));
    const result = await updateCustomerAppearanceAction(defaultCustomerAppearance());
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("carga preferencias actuales desde Auth sin usarlas como autorización", async () => {
    const appearance = { displayName: "Max", avatarSeed: "chosen", accent: "red" };
    auth.getUser.mockResolvedValue({
      data: { user: { user_metadata: { gamerperu_profile: appearance, role: "SUPER_ADMIN" } } },
      error: null,
    });
    expect(await getCurrentCustomerAppearance()).toEqual({ appearance, available: true });
    auth.getUser.mockRejectedValue(new Error("unavailable"));
    expect(await getCurrentCustomerAppearance()).toEqual({
      appearance: defaultCustomerAppearance(),
      available: false,
    });
  });
});
