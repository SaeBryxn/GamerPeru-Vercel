import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveResearchMutationIntent,
  shouldPollResearchJob,
  researchQueueDescription,
} from "@/lib/ai/admin/client-contracts";
import {
  adminCredentialSaveSchema,
  adminProfileConfigurationSchema,
  adminProposalFieldDecisionSchema,
  adminProposalReadSchema,
  adminProviderConfigurationSchema,
  adminResearchSubmissionSchema,
} from "@/lib/ai/admin/schemas";
import {
  ADMIN_AI_PROFILE_KEYS,
  ADMIN_AI_PROVIDER_KEYS,
  RESEARCH_ITEM_STATUSES,
} from "@/lib/ai/admin/types";

const uuid = "018f0025-4000-7000-8000-000000000001";
const root = process.cwd();

describe("GP-025 / CHK4 — Admin AI UI contracts", () => {
  it("keeps the same high-entropy mutation identity for an unchanged intent and rotates it after material change", () => {
    const ids = ["first-id", "second-id"];
    const first = resolveResearchMutationIntent(null, "same-request", () => ids.shift()!);
    const retry = resolveResearchMutationIntent(first, "same-request", () => ids.shift()!);
    const changed = resolveResearchMutationIntent(retry, "changed-request", () => ids.shift()!);
    expect(retry).toBe(first);
    expect(retry.mutationRequestId).toBe("first-id");
    expect(changed.mutationRequestId).toBe("second-id");
  });

  it.each(["QUEUED", "PROCESSING"] as const)("polls the active %s job state", (status) => {
    expect(shouldPollResearchJob(status)).toBe(true);
  });

  it.each(["COMPLETED", "PARTIALLY_FAILED", "FAILED"] as const)(
    "stops active polling for terminal %s jobs",
    (status) => expect(shouldPollResearchJob(status)).toBe(false)
  );

  it("represents exactly the nine physical item states and never invents REJECTED", () => {
    expect(RESEARCH_ITEM_STATUSES).toEqual([
      "PENDING",
      "RESEARCHING",
      "READY_FOR_REVIEW",
      "NEEDS_ATTENTION",
      "AMBIGUOUS",
      "SOURCE_CONFLICT",
      "FAILED",
      "APPROVED",
      "APPLIED",
    ]);
    expect(RESEARCH_ITEM_STATUSES).not.toContain("REJECTED");
  });

  it("validates SINGLE CREATE, BATCH CREATE and server-authoritative ENRICH targets", () => {
    const base = { mutationRequestId: crypto.randomUUID(), selectedProfileId: uuid };
    expect(
      adminResearchSubmissionSchema.parse({
        ...base,
        items: [{ query: "Mouse gamer", mode: "CREATE" }],
      }).items
    ).toHaveLength(1);
    expect(
      adminResearchSubmissionSchema.parse({
        ...base,
        items: [
          { query: "Mouse gamer", mode: "CREATE" },
          { query: "Teclado gamer", mode: "CREATE" },
        ],
      }).items
    ).toHaveLength(2);
    expect(
      adminResearchSubmissionSchema.parse({
        ...base,
        items: [{ query: "Mouse gamer", mode: "ENRICH", targetProductId: uuid }],
      }).items[0]
    ).not.toHaveProperty("targetProductVersionSnapshot");
    expect(() =>
      adminResearchSubmissionSchema.parse({
        ...base,
        items: [{ query: "Mouse gamer", mode: "ENRICH" }],
      })
    ).toThrow();
  });

  it("rejects authority injection and unknown keys at every new mutation boundary", () => {
    expect(() =>
      adminProposalReadSchema.parse({ proposalId: uuid, applyOperationId: uuid })
    ).toThrow();
    expect(() =>
      adminProposalFieldDecisionSchema.parse({
        proposalId: uuid,
        expectedProposalUpdatedAt: "2026-09-13T12:00:00.000Z",
        fieldPath: "copy.name",
        decision: "ACCEPTED",
        actorId: uuid,
      })
    ).toThrow();
    expect(() =>
      adminCredentialSaveSchema.parse({
        providerId: uuid,
        plaintextApiKey: "safe-test-key",
        role: "SUPER_ADMIN",
      })
    ).toThrow();
  });

  it("restricts providers and profiles to the canonical physical keys", () => {
    expect(ADMIN_AI_PROVIDER_KEYS).toEqual(["google", "groq", "cloudflare", "openai", "anthropic"]);
    expect(ADMIN_AI_PROFILE_KEYS).toEqual([
      "PRODUCT_RESEARCH_FAST",
      "PRODUCT_RESEARCH_DEEP",
      "PRODUCT_RESEARCH_FALLBACK",
      "SEO_COPY",
      "BATCH_IMPORT",
    ]);
    expect(() =>
      adminProviderConfigurationSchema.parse({
        providerKey: "arbitrary",
        displayName: "Arbitrary",
        isEnabled: true,
        isDefault: false,
        settingsJson: "{}",
      })
    ).toThrow();
    expect(() =>
      adminProfileConfigurationSchema.parse({
        profileKey: "CUSTOMER_SUPPORT",
        providerId: uuid,
        modelId: "model",
        temperature: "0.20",
        maxTokens: 1024,
        isEnabled: true,
      })
    ).toThrow();
  });

  it("enforces independent route permissions before rendering sensitive workspaces", () => {
    const importPage = readFileSync(
      `${root}/src/app/admin/(protected)/products/ai-import/page.tsx`,
      "utf8"
    );
    const settingsPage = readFileSync(
      `${root}/src/app/admin/(protected)/settings/ai/page.tsx`,
      "utf8"
    );
    expect(importPage).toContain('permissions.has("catalog:ai_research")');
    expect(settingsPage).toContain('permissions.has("ai:manage_credentials")');
    expect(importPage).toContain("AdminForbidden");
    expect(settingsPage).toContain("AdminForbidden");
  });

  it("keeps database, crypto, publish and apply authority out of Client Components", () => {
    const clientFiles = [
      `${root}/src/app/admin/(protected)/products/ai-import/workspace.tsx`,
      `${root}/src/app/admin/(protected)/products/ai-import/proposals/[proposalId]/review-workspace.tsx`,
      `${root}/src/app/admin/(protected)/settings/ai/settings-workspace.tsx`,
    ];
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\s+["']@\/db/);
      expect(source).not.toMatch(
        /drizzle-orm|credential-crypto|process\.env|transitionProductStatus/
      );
      expect(source).not.toMatch(
        /applyOperationId|applyActorAuthUserId|requestFingerprint|requestPayload/
      );
    }
  });
});

it("distingue un envío fallido de un evento enviado sin actividad", () => {
  expect(
    researchQueueDescription({
      dispatchStatus: "DISPATCH_FAILED",
      updatedAt: new Date(0).toISOString(),
    })
  ).toContain("No se pudo enviar");
  expect(
    researchQueueDescription({ dispatchStatus: "DISPATCHED", updatedAt: new Date(0).toISOString() })
  ).toContain("no hay actividad reciente");
});
