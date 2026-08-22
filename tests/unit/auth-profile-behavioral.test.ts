import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockAuthIdentity {
  authUserId: string;
  email: string;
  role: string;
  aal: string;
  amr: string[];
  sessionExpiresAt: number;
  issuedAt: number;
}

type MockVerifiedResult =
  | { success: true; identity: MockAuthIdentity }
  | { success: false; error?: { code: string; message: string } };

interface MockUserIdentity {
  provider: string;
  identity_data?: Record<string, unknown>;
}

interface MockAuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  identities: MockUserIdentity[];
}

// Hoisted mock state
const mockState = {
  verifiedIdentity: {
    success: true,
    identity: {
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "gamer@gamerperu.com",
      role: "authenticated",
      aal: "aal1",
      amr: ["password"],
      sessionExpiresAt: 9999999999,
      issuedAt: 1000000000,
    },
  } as MockVerifiedResult,
  authUser: {
    id: "018f0000-0000-7000-8000-000000000001",
    email: "gamer@gamerperu.com",
    user_metadata: {},
    identities: [],
  } as MockAuthUser,
  getUserError: null as { message: string } | null,
  selectResultsQueue: [] as Array<Array<Record<string, unknown>>>,
  insertedValues: [] as Array<Record<string, unknown>>,
  redirectUrl: null as string | null,
};

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(async () => mockState.verifiedIdentity),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockState.authUser },
        error: mockState.getUserError,
      })),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    mockState.redirectUrl = url;
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (mockState.selectResultsQueue.length > 0) {
                return mockState.selectResultsQueue.shift() ?? [];
              }
              return [];
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((val: Record<string, unknown>) => {
          mockState.insertedValues.push(val);
          return {
            onConflictDoNothing: vi.fn(async () => ({})),
          };
        }),
      })),
    },
  };
});

describe("GP-015 AUTH7-AR1: CustomerProfile Behavioral Runtime Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.verifiedIdentity = {
      success: true,
      identity: {
        authUserId: "018f0000-0000-7000-8000-000000000001",
        email: "gamer@gamerperu.com",
        role: "authenticated",
        aal: "aal1",
        amr: ["password"],
        sessionExpiresAt: 9999999999,
        issuedAt: 1000000000,
      },
    };
    mockState.authUser = {
      id: "018f0000-0000-7000-8000-000000000001",
      email: "gamer@gamerperu.com",
      user_metadata: {},
      identities: [],
    };
    mockState.getUserError = null;
    mockState.selectResultsQueue = [];
    mockState.insertedValues = [];
    mockState.redirectUrl = null;
  });

  describe("ensureCustomerProfile() Runtime Behavior", () => {
    it("A: returns UNAUTHENTICATED when getVerifiedIdentity fails and performs zero DB inserts", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.verifiedIdentity = {
        success: false,
        error: { code: "UNAUTHENTICATED", message: "No session" },
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("UNAUTHENTICATED");
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("B: returns existing canonical profile immediately without overwrite and without unnecessary user metadata mutation", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      const existingProfile = {
        id: "018f0000-0000-7000-8000-000000000099",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "OriginalFirst",
        lastName: "OriginalLast",
        phone: null,
        documentType: null,
        documentNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockState.selectResultsQueue.push([existingProfile]);
      mockState.authUser.user_metadata = {
        first_name: "MutatedFirst",
        last_name: "MutatedLast",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(result.profile.firstName).toBe("OriginalFirst");
        expect(result.profile.lastName).toBe("OriginalLast");
      }
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("C: fails closed with identity_mismatch error when claims.sub !== getUser().id", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]); // No existing profile
      mockState.authUser.id = "018f0000-0000-7000-8000-999999999999"; // Different user ID

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("ERROR");
      if (result.status === "ERROR") {
        expect(result.error).toBe("identity_mismatch");
      }
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("D: provisions new profile from valid signup metadata pair and verifies phone/document are not fabricated", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]); // Initial lookup
      const newCanonical = {
        id: "018f0000-0000-7000-8000-000000000100",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "Diego",
        lastName: "Navarro",
        phone: null,
        documentType: null,
        documentNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockState.selectResultsQueue.push([newCanonical]); // Post-insert canonical lookup

      mockState.authUser.user_metadata = {
        first_name: "  Diego  ",
        last_name: "  Navarro  ",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(result.profile.firstName).toBe("Diego");
        expect(result.profile.lastName).toBe("Navarro");
      }

      expect(mockState.insertedValues.length).toBe(1);
      const insertPayload = mockState.insertedValues[0];
      expect(insertPayload?.authUserId).toBe("018f0000-0000-7000-8000-000000000001");
      expect(insertPayload?.firstName).toBe("Diego");
      expect(insertPayload?.lastName).toBe("Navarro");
      expect(insertPayload?.phone).toBeUndefined();
      expect(insertPayload?.documentType).toBeUndefined();
      expect(insertPayload?.documentNumber).toBeUndefined();
    });

    it("E: provisions new profile from valid Google identity metadata when signup metadata is absent", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]); // Initial lookup
      const googleCanonical = {
        id: "018f0000-0000-7000-8000-000000000101",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "Alejandro",
        lastName: "Vargas",
        phone: null,
        documentType: null,
        documentNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockState.selectResultsQueue.push([googleCanonical]);

      mockState.authUser.identities = [
        {
          provider: "google",
          identity_data: {
            given_name: " Alejandro ",
            family_name: " Vargas ",
          },
        },
      ];

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(result.profile.firstName).toBe("Alejandro");
        expect(result.profile.lastName).toBe("Vargas");
      }

      expect(mockState.insertedValues.length).toBe(1);
      expect(mockState.insertedValues[0]?.firstName).toBe("Alejandro");
      expect(mockState.insertedValues[0]?.lastName).toBe("Vargas");
    });

    it("F: strictly enforces source precedence: signup metadata wins when both signup and Google pairs exist", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]);
      mockState.selectResultsQueue.push([
        {
          id: "018f0000-0000-7000-8000-000000000102",
          authUserId: "018f0000-0000-7000-8000-000000000001",
          firstName: "SignupFirst",
          lastName: "SignupLast",
        },
      ]);

      mockState.authUser.user_metadata = {
        first_name: "SignupFirst",
        last_name: "SignupLast",
      };
      mockState.authUser.identities = [
        {
          provider: "google",
          identity_data: {
            given_name: "GoogleFirst",
            family_name: "GoogleLast",
          },
        },
      ];

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      expect(mockState.insertedValues.length).toBe(1);
      expect(mockState.insertedValues[0]?.firstName).toBe("SignupFirst");
      expect(mockState.insertedValues[0]?.lastName).toBe("SignupLast");
    });

    it("G: rejects cross-source field mixing (signup first_name + google family_name) and returns NEEDS_PROFILE_COMPLETION", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]);

      // Incomplete signup (only first_name)
      mockState.authUser.user_metadata = {
        first_name: "SignupFirst",
      };
      // Incomplete Google (only family_name)
      mockState.authUser.identities = [
        {
          provider: "google",
          identity_data: {
            family_name: "GoogleLast",
          },
        },
      ];

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("NEEDS_PROFILE_COMPLETION");
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("H: refuses to heuristically split full_name or name and returns NEEDS_PROFILE_COMPLETION", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]);

      mockState.authUser.user_metadata = {
        full_name: "Juan Carlos De la Cruz",
        name: "Juan Carlos De la Cruz",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("NEEDS_PROFILE_COMPLETION");
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("I: rejects invalid names (whitespace-only or >100 characters) and falls back to NEEDS_PROFILE_COMPLETION", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      // 1. Whitespace
      mockState.selectResultsQueue.push([]);
      mockState.authUser.user_metadata = {
        first_name: "    ",
        last_name: "Valido",
      };
      let result = await ensureCustomerProfile();
      expect(result.status).toBe("NEEDS_PROFILE_COMPLETION");

      // 2. >100 chars
      mockState.selectResultsQueue.push([]);
      mockState.authUser.user_metadata = {
        first_name: "Valido",
        last_name: "X".repeat(101),
      };
      result = await ensureCustomerProfile();
      expect(result.status).toBe("NEEDS_PROFILE_COMPLETION");
      expect(mockState.insertedValues.length).toBe(0);
    });

    it("J: accepts valid single-character legitimate names", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]);
      mockState.selectResultsQueue.push([
        {
          id: "018f0000-0000-7000-8000-000000000103",
          authUserId: "018f0000-0000-7000-8000-000000000001",
          firstName: "J",
          lastName: "O",
        },
      ]);

      mockState.authUser.user_metadata = {
        first_name: "J",
        last_name: "O",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      expect(mockState.insertedValues.length).toBe(1);
      expect(mockState.insertedValues[0]?.firstName).toBe("J");
      expect(mockState.insertedValues[0]?.lastName).toBe("O");
    });

    it("K: handles concurrent race condition via ON CONFLICT DO NOTHING and returns concurrent canonical row", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      // Initial query -> empty (both workers see no profile)
      mockState.selectResultsQueue.push([]);

      // Post-conflict query -> returns the profile that the other worker inserted
      const concurrentProfile = {
        id: "018f0000-0000-7000-8000-000000000200",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "ConcurrentWinnerFirst",
        lastName: "ConcurrentWinnerLast",
      };
      mockState.selectResultsQueue.push([concurrentProfile]);

      mockState.authUser.user_metadata = {
        first_name: "LosingWorkerFirst",
        last_name: "LosingWorkerLast",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(result.profile.id).toBe("018f0000-0000-7000-8000-000000000200");
        expect(result.profile.firstName).toBe("ConcurrentWinnerFirst");
      }
    });

    it("L: returns ERROR profile_creation_failed if post-conflict canonical SELECT unexpectedly returns empty", async () => {
      const { ensureCustomerProfile } = await import("@/lib/auth/profile");

      mockState.selectResultsQueue.push([]); // Initial query
      mockState.selectResultsQueue.push([]); // Post-insert query unexpectedly empty

      mockState.authUser.user_metadata = {
        first_name: "Valido",
        last_name: "Valido",
      };

      const result = await ensureCustomerProfile();
      expect(result.status).toBe("ERROR");
      if (result.status === "ERROR") {
        expect(result.error).toBe("profile_creation_failed");
      }
    });
  });

  describe("completeCustomerProfileAction() Runtime Behavior", () => {
    it("A: returns safe error and zero inserts when user is unauthenticated", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      mockState.verifiedIdentity = { success: false };

      const formData = new FormData();
      formData.append("firstName", "Carlos");
      formData.append("lastName", "Santana");

      const result = await completeCustomerProfileAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Debes iniciar sesión para completar tu perfil.");
      expect(mockState.insertedValues.length).toBe(0);
      expect(mockState.redirectUrl).toBeNull();
    });

    it("B: returns validation error and zero inserts when submitted names are invalid", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      const formData = new FormData();
      formData.append("firstName", "");
      formData.append("lastName", "Santana");

      const result = await completeCustomerProfileAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("El nombre es obligatorio");
      expect(mockState.insertedValues.length).toBe(0);
      expect(mockState.redirectUrl).toBeNull();
    });

    it("C: successfully inserts profile, verifies canonical row exists, and redirects to /", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      const canonicalRow = {
        id: "018f0000-0000-7000-8000-000000000300",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "Valeria",
        lastName: "Paredes",
      };
      mockState.selectResultsQueue.push([canonicalRow]);

      const formData = new FormData();
      formData.append("firstName", "Valeria");
      formData.append("lastName", "Paredes");

      await expect(completeCustomerProfileAction(null, formData)).rejects.toThrow(
        "NEXT_REDIRECT:/"
      );

      expect(mockState.redirectUrl).toBe("/");
      expect(mockState.insertedValues.length).toBe(1);
      const inserted = mockState.insertedValues[0];
      expect(inserted?.authUserId).toBe("018f0000-0000-7000-8000-000000000001");
      expect(inserted?.firstName).toBe("Valeria");
      expect(inserted?.lastName).toBe("Paredes");
      expect(inserted?.phone).toBeUndefined();
      expect(inserted?.documentType).toBeUndefined();
    });

    it("D: handles concurrent double-submit safely by verifying canonical row and redirecting without error", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      const canonicalRow = {
        id: "018f0000-0000-7000-8000-000000000301",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "FirstSubmit",
        lastName: "FirstSubmit",
      };
      mockState.selectResultsQueue.push([canonicalRow]);

      const formData = new FormData();
      formData.append("firstName", "SecondSubmit");
      formData.append("lastName", "SecondSubmit");

      await expect(completeCustomerProfileAction(null, formData)).rejects.toThrow(
        "NEXT_REDIRECT:/"
      );
      expect(mockState.redirectUrl).toBe("/");
    });

    it("E: returns generic error and does NOT redirect if canonical row is unexpectedly missing", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      mockState.selectResultsQueue.push([]); // Post-insert canonical query empty

      const formData = new FormData();
      formData.append("firstName", "Test");
      formData.append("lastName", "User");

      const result = await completeCustomerProfileAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Ocurrió un error al guardar tu perfil. Inténtalo nuevamente.");
      expect(mockState.redirectUrl).toBeNull();
    });

    it("F: proves client FormData cannot supply or influence auth_user_id", async () => {
      const { completeCustomerProfileAction } = await import("@/lib/auth/actions");

      const canonicalRow = {
        id: "018f0000-0000-7000-8000-000000000302",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "Test",
        lastName: "User",
      };
      mockState.selectResultsQueue.push([canonicalRow]);

      const formData = new FormData();
      formData.append("firstName", "Test");
      formData.append("lastName", "User");
      formData.append("authUserId", "018f0000-0000-7000-8000-evil99999999");
      formData.append("auth_user_id", "018f0000-0000-7000-8000-evil99999999");
      formData.append("userId", "018f0000-0000-7000-8000-evil99999999");

      await expect(completeCustomerProfileAction(null, formData)).rejects.toThrow(
        "NEXT_REDIRECT:/"
      );

      expect(mockState.insertedValues.length).toBe(1);
      expect(mockState.insertedValues[0]?.authUserId).toBe("018f0000-0000-7000-8000-000000000001");
      expect(mockState.insertedValues[0]?.authUserId).not.toContain("evil");
    });
  });

  describe("CompletarPerfilPage Server Component Behavior", () => {
    it("redirects unauthenticated users to /auth/login", async () => {
      const CompletarPerfilPage = (await import("@/app/auth/completar-perfil/page")).default;

      mockState.verifiedIdentity = { success: false };

      await expect(CompletarPerfilPage()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
      expect(mockState.redirectUrl).toBe("/auth/login");
    });

    it("redirects users with ready profiles to /", async () => {
      const CompletarPerfilPage = (await import("@/app/auth/completar-perfil/page")).default;

      mockState.selectResultsQueue.push([
        {
          id: "018f0000-0000-7000-8000-000000000303",
          authUserId: "018f0000-0000-7000-8000-000000000001",
          firstName: "ReadyFirst",
          lastName: "ReadyLast",
        },
      ]);

      await expect(CompletarPerfilPage()).rejects.toThrow("NEXT_REDIRECT:/");
      expect(mockState.redirectUrl).toBe("/");
    });

    it("redirects users encountering error to /auth/login?oauth_error=true", async () => {
      const CompletarPerfilPage = (await import("@/app/auth/completar-perfil/page")).default;

      mockState.selectResultsQueue.push([]);
      mockState.authUser.id = "different-user-id"; // trigger identity_mismatch error

      await expect(CompletarPerfilPage()).rejects.toThrow(
        "NEXT_REDIRECT:/auth/login?oauth_error=true"
      );
      expect(mockState.redirectUrl).toBe("/auth/login?oauth_error=true");
    });

    it("renders page JSX when NEEDS_PROFILE_COMPLETION", async () => {
      const CompletarPerfilPage = (await import("@/app/auth/completar-perfil/page")).default;

      mockState.selectResultsQueue.push([]); // No profile
      mockState.authUser.user_metadata = {}; // No usable names

      const jsx = await CompletarPerfilPage();
      expect(jsx).toBeDefined();
      expect(jsx.type).toBe("main");
    });
  });
});
