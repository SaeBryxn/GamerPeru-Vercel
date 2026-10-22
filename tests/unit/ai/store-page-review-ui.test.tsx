// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProposalReviewWorkspace } from "@/app/admin/(protected)/products/ai-import/proposals/[proposalId]/review-workspace";
import type { AdminProposalReviewDto } from "@/lib/ai/admin/types";

const actions = vi.hoisted(() => ({ review: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/ai/admin/actions", () => ({
  reviewProposalFieldAdminAction: actions.review,
  getProposalReviewAdminAction: actions.load,
  applyProposalAdminAction: vi.fn(),
  approveProposalAdminAction: vi.fn(),
  getProposalApplyStatusAdminAction: vi.fn(),
  initializeProposalReviewAdminAction: vi.fn(),
  rejectProposalAdminAction: vi.fn(),
  setHumanVariantPlanAdminAction: vi.fn(),
}));
vi.mock("@/components/admin/confirmation-dialog", () => ({ ConfirmationDialog: () => null }));
afterEach(cleanup);

const timestamp = "2026-10-22T12:00:00.000Z";
const detail: AdminProposalReviewDto = {
  proposal: {
    id: "proposal-1",
    status: "DRAFT",
    proposedName: "Mouse",
    proposedSlug: "mouse",
    proposedSubtitle: null,
    proposedDescription: null,
    proposedSpecifications: {},
    unmappedSpecifications: {},
    proposedVariants: [],
    proposedSeoDraft: {},
    mediaCandidates: [],
    appliedProductId: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  item: {
    id: "item-1",
    query: "Mouse",
    mode: "ENRICH",
    status: "READY_FOR_REVIEW",
    identityStatus: "EXACT_MATCH",
    targetProductId: "product-1",
  },
  catalogSelections: { brand: null, category: null },
  sources: [],
  fields: [
    {
      path: "pdp.sizes",
      value: [{ name: "Mini", lengthMm: 110, widthMm: 60, heightMm: 36, weight: "45 g" }],
    },
    {
      path: "pdp.packageContents",
      value: [{ edition: "Mini", items: [{ name: "Cable USB", quantity: "1", note: "Incluido" }] }],
    },
    {
      path: "pdp.highlights",
      value: [{ label: "Sensor", value: "Sensor oficial", note: "Óptico" }],
    },
    { path: "pdp.support.warranty", value: "2 años según fabricante" },
  ].map(({ path, value }, index) => ({
    id: `field-${index}`,
    fieldPath: path,
    proposedValue: value,
    selectedValue: null,
    decision: "PENDING",
    verificationState: "AI_INFERRED",
    preferredSourceId: null,
    conflictDetails: null,
    reviewedAt: null,
    updatedAt: timestamp,
    sources: [],
  })),
};

it("presenta los bloques en listas legibles y permite aceptar una sugerencia", async () => {
  actions.review.mockResolvedValue({ success: true, data: { proposalUpdatedAt: timestamp } });
  actions.load.mockResolvedValue({ success: true, data: detail });
  render(
    <ProposalReviewWorkspace
      initialProposal={detail}
      brands={[]}
      categories={[]}
      canApply={false}
    />
  );
  expect(screen.getByText("Mini · 110 × 60 × 36 mm · 45 g")).toBeTruthy();
  expect(screen.getByText("Cable USB · Cantidad: 1 · Incluido")).toBeTruthy();
  expect(screen.getByText("Sensor · Sensor oficial · Óptico")).toBeTruthy();
  expect(screen.getByText("2 años según fabricante")).toBeTruthy();
  expect(document.querySelector("pre")?.textContent).not.toContain('"lengthMm"');
  const card = within(screen.getByTestId("review-field-pdp.sizes"));
  fireEvent.change(card.getByRole("combobox", { name: "Decisión" }), {
    target: { value: "ACCEPTED" },
  });
  fireEvent.click(card.getByRole("button", { name: "Guardar decisión" }));
  await waitFor(() =>
    expect(actions.review).toHaveBeenCalledWith(
      expect.objectContaining({ fieldPath: "pdp.sizes", decision: "ACCEPTED" })
    )
  );
});

it("edita dimensiones con campos normales, sin pedir JSON", async () => {
  actions.review.mockClear();
  actions.review.mockResolvedValue({ success: true, data: { proposalUpdatedAt: timestamp } });
  actions.load.mockResolvedValue({ success: true, data: detail });
  render(
    <ProposalReviewWorkspace
      initialProposal={detail}
      brands={[]}
      categories={[]}
      canApply={false}
    />
  );
  const card = within(screen.getByTestId("review-field-pdp.sizes"));
  fireEvent.change(card.getByRole("combobox", { name: "Decisión" }), {
    target: { value: "MANUALLY_EDITED" },
  });
  expect(
    card.queryByRole("textbox", { name: "Valor manual para Tallas, dimensiones y peso" })
  ).toBeNull();
  fireEvent.change(card.getByLabelText("Largo (mm) 1"), { target: { value: "112" } });
  fireEvent.click(card.getByRole("button", { name: "Guardar decisión" }));
  await waitFor(() =>
    expect(actions.review).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldPath: "pdp.sizes",
        decision: "MANUALLY_EDITED",
        selectedValue: [expect.objectContaining({ name: "Mini", lengthMm: 112 })],
      })
    )
  );
});
