import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  signupSchema,
  loginSchema,
  recoveryRequestSchema,
  passwordChangeSchema,
  confirmOtpSchema,
} from "@/lib/auth/validation";
import { mapAuthError } from "@/lib/auth/errors";

describe("GP-015 AUTH5-A: Email/Password Local Auth Workflows & Scanner-Safe TokenHash", () => {
  describe("A & B: Validation Contracts", () => {
    it("accepts valid registration input with legitimate 1-character names", () => {
      const result = signupSchema.safeParse({
        firstName: "J",
        lastName: "O",
        email: "Gamer.Peru@example.com",
        password: "securePassword123",
        confirmPassword: "securePassword123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.firstName).toBe("J");
        expect(result.data.lastName).toBe("O");
        expect(result.data.email).toBe("gamer.peru@example.com");
      }
    });

    it("rejects empty or whitespace-only first and last names", () => {
      const result = signupSchema.safeParse({
        firstName: "   ",
        lastName: "",
        email: "test@example.com",
        password: "securePassword123",
        confirmPassword: "securePassword123",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.format();
        expect(issues.firstName?._errors.length).toBeGreaterThan(0);
        expect(issues.lastName?._errors.length).toBeGreaterThan(0);
      }
    });

    it("rejects first and last names exceeding 100 characters", () => {
      const longName = "A".repeat(101);
      const result = signupSchema.safeParse({
        firstName: longName,
        lastName: "Perez",
        email: "test@example.com",
        password: "securePassword123",
        confirmPassword: "securePassword123",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.format().firstName?._errors[0]).toContain("100 caracteres");
      }
    });

    it("enforces application minimum 8 and maximum 128 characters for passwords", () => {
      const tooShort = signupSchema.safeParse({
        firstName: "Carlos",
        lastName: "Gamer",
        email: "carlos@example.com",
        password: "short7",
        confirmPassword: "short7",
      });
      expect(tooShort.success).toBe(false);
      if (!tooShort.success) {
        expect(tooShort.error.format().password?._errors[0]).toContain("al menos 8 caracteres");
      }

      const tooLong = signupSchema.safeParse({
        firstName: "Carlos",
        lastName: "Gamer",
        email: "carlos@example.com",
        password: "A".repeat(129),
        confirmPassword: "A".repeat(129),
      });
      expect(tooLong.success).toBe(false);
      if (!tooLong.success) {
        expect(tooLong.error.format().password?._errors[0]).toContain("128 caracteres");
      }
    });

    it("rejects mismatched password confirmations", () => {
      const result = signupSchema.safeParse({
        firstName: "Carlos",
        lastName: "Gamer",
        email: "carlos@example.com",
        password: "password123",
        confirmPassword: "passwordDifferent456",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.format().confirmPassword?._errors[0]).toContain("no coinciden");
      }
    });

    it("validates login and recovery request inputs", () => {
      expect(loginSchema.safeParse({ email: "user@test.pe", password: "p" }).success).toBe(true);
      expect(loginSchema.safeParse({ email: "invalid", password: "p" }).success).toBe(false);

      expect(recoveryRequestSchema.safeParse({ email: "user@test.pe" }).success).toBe(true);
      expect(recoveryRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    });

    it("validates password change schema with 8-character minimum and confirmation", () => {
      expect(
        passwordChangeSchema.safeParse({
          password: "newSecurePassword123",
          confirmPassword: "newSecurePassword123",
        }).success
      ).toBe(true);

      expect(
        passwordChangeSchema.safeParse({
          password: "short",
          confirmPassword: "short",
        }).success
      ).toBe(false);

      expect(
        passwordChangeSchema.safeParse({
          password: "newSecurePassword123",
          confirmPassword: "mismatchedPassword",
        }).success
      ).toBe(false);
    });
  });

  describe("G & H & I: TokenHash Allowed Types & Verification Matrix", () => {
    it("strictly allows only 'email' and 'recovery' verification types", () => {
      expect(confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "email" }).success).toBe(
        true
      );
      expect(
        confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "recovery" }).success
      ).toBe(true);

      // Rejects any arbitrary or unsupported OTP type
      expect(confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "signup" }).success).toBe(
        false
      );
      expect(confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "invite" }).success).toBe(
        false
      );
      expect(
        confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "magiclink" }).success
      ).toBe(false);
      expect(
        confirmOtpSchema.safeParse({ tokenHash: "valid_hash", type: "phone_change" }).success
      ).toBe(false);
      expect(confirmOtpSchema.safeParse({ tokenHash: "", type: "email" }).success).toBe(false);
    });
  });

  describe("K & L: Controlled Error Mapping & Non-Enumeration", () => {
    it("maps errors safely without leaking internal details or SQL", () => {
      expect(mapAuthError({ message: "Invalid login credentials" })).toContain(
        "Correo o contraseña incorrectos"
      );
      expect(mapAuthError({ message: "Email rate limit exceeded", status: 429 })).toContain(
        "Demasiados intentos"
      );
      expect(mapAuthError({ message: "User already registered" })).toContain(
        "Ya existe una cuenta registrada"
      );
      expect(mapAuthError({ message: "Token has expired or is invalid" })).toContain(
        "ha expirado o ya fue utilizado"
      );
      expect(mapAuthError({ message: "Random PostgreSQL internal failure" })).toBe(
        "No fue posible procesar tu solicitud. Inténtalo de nuevo en unos minutos."
      );
      expect(mapAuthError(null)).toBe("Ocurrió un error inesperado. Inténtalo nuevamente.");
    });
  });

  describe("C, D, E, F: Architecture & Direct Browser Calling Integrity", () => {
    const rootDir = path.resolve(__dirname, "../../");

    it("ensures login, register, and recovery requests use browser Supabase client directly", () => {
      const loginFormSrc = fs.readFileSync(
        path.join(rootDir, "src/components/auth/login-form.tsx"),
        "utf-8"
      );
      expect(loginFormSrc).toContain("createBrowserSupabaseClient");
      expect(loginFormSrc).toContain("supabase.auth.signInWithPassword");

      const registerFormSrc = fs.readFileSync(
        path.join(rootDir, "src/components/auth/register-form.tsx"),
        "utf-8"
      );
      expect(registerFormSrc).toContain("createBrowserSupabaseClient");
      expect(registerFormSrc).toContain("supabase.auth.signUp");
      // Metadata must only be first_name and last_name
      expect(registerFormSrc).toContain("first_name: parsed.data.firstName");
      expect(registerFormSrc).toContain("last_name: parsed.data.lastName");
      expect(registerFormSrc).not.toContain("role:");
      expect(registerFormSrc).not.toContain("is_admin:");

      const recoveryFormSrc = fs.readFileSync(
        path.join(rootDir, "src/components/auth/recovery-request-form.tsx"),
        "utf-8"
      );
      expect(recoveryFormSrc).toContain("createBrowserSupabaseClient");
      expect(recoveryFormSrc).toContain("supabase.auth.resetPasswordForEmail");
    });

    it("proves /auth/confirm GET is completely inert", () => {
      const confirmPageSrc = fs.readFileSync(
        path.join(rootDir, "src/app/auth/confirm/page.tsx"),
        "utf-8"
      );
      expect(confirmPageSrc).not.toContain("verifyOtp");
      expect(confirmPageSrc).not.toContain("createServerSupabaseClient");
      expect(confirmPageSrc).not.toContain("createBrowserSupabaseClient");
      expect(confirmPageSrc).not.toContain("db.");
      expect(confirmPageSrc).toContain("<ConfirmForm");
    });

    it("verifies server action owns explicit TokenHash verification and handles recovery vs email redirects", () => {
      const actionsSrc = fs.readFileSync(path.join(rootDir, "src/lib/auth/actions.ts"), "utf-8");
      expect(actionsSrc).toContain("createServerSupabaseClient");
      expect(actionsSrc).toContain("supabase.auth.verifyOtp");
      expect(actionsSrc).toContain('redirect("/auth/cambiar-password")');
      expect(actionsSrc).toContain('redirect("/auth/login?confirmed=true")');
    });

    it("ensures /auth/cambiar-password independently validates identity with getVerifiedIdentity", () => {
      const changePasswordPageSrc = fs.readFileSync(
        path.join(rootDir, "src/app/auth/cambiar-password/page.tsx"),
        "utf-8"
      );
      expect(changePasswordPageSrc).toContain("getVerifiedIdentity");
      expect(changePasswordPageSrc).toContain("!verified.success");
    });

    it("ensures password update operates on the active session without accepting user ID from client", () => {
      const changePasswordFormSrc = fs.readFileSync(
        path.join(rootDir, "src/components/auth/password-change-form.tsx"),
        "utf-8"
      );
      expect(changePasswordFormSrc).toContain("createBrowserSupabaseClient");
      expect(changePasswordFormSrc).toContain("supabase.auth.updateUser");
      expect(changePasswordFormSrc).not.toContain("userId");
      expect(changePasswordFormSrc).not.toContain("auth_user_id");
    });
  });

  describe("N, O, P: Zero Data API, Zero DB Queries, Zero Secrets in Customer Auth", () => {
    const authFiles = [
      "src/app/auth/login/page.tsx",
      "src/app/auth/registro/page.tsx",
      "src/app/auth/verificar/page.tsx",
      "src/app/auth/confirm/page.tsx",
      "src/app/auth/olvide-password/page.tsx",
      "src/app/auth/cambiar-password/page.tsx",
      "src/components/auth/login-form.tsx",
      "src/components/auth/register-form.tsx",
      "src/components/auth/recovery-request-form.tsx",
      "src/components/auth/password-change-form.tsx",
      "src/components/auth/confirm-form.tsx",
      "src/components/auth/auth-card.tsx",
      "src/lib/auth/actions.ts",
      "src/lib/auth/validation.ts",
      "src/lib/auth/errors.ts",
    ];

    const rootDir = path.resolve(__dirname, "../../");

    it("ensures zero Data API domain usage across all auth files", () => {
      for (const relPath of authFiles) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain(".from(");
          expect(content).not.toContain(".rpc(");
          expect(content).not.toContain("/rest/v1");
          expect(content).not.toContain("/graphql/v1");
        }
      }
    });

    it("ensures zero CustomerProfile or RBAC queries in AUTH5", () => {
      for (const relPath of authFiles) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("customer_profiles");
          expect(content).not.toContain("user_roles");
          expect(content).not.toContain("role_permissions");
        }
      }
    });

    it("ensures zero secret keys referenced in customer auth runtime", () => {
      for (const relPath of authFiles) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("SUPABASE_SECRET_KEY");
          expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        }
      }
    });
  });

  describe("Q: Form Accessibility & Semantics", () => {
    const rootDir = path.resolve(__dirname, "../../");

    it("ensures login form contains accessible autocomplete and label semantics", () => {
      const content = fs.readFileSync(
        path.join(rootDir, "src/components/auth/login-form.tsx"),
        "utf-8"
      );
      expect(content).toContain('autoComplete="email"');
      expect(content).toContain('autoComplete="current-password"');
      expect(content).toContain('role="alert"');
    });

    it("ensures registration form contains accessible autocomplete semantics", () => {
      const content = fs.readFileSync(
        path.join(rootDir, "src/components/auth/register-form.tsx"),
        "utf-8"
      );
      expect(content).toContain('autoComplete="given-name"');
      expect(content).toContain('autoComplete="family-name"');
      expect(content).toContain('autoComplete="email"');
      expect(content).toContain('autoComplete="new-password"');
    });
  });
});
