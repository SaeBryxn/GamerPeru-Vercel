// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutofillBar } from "@/components/admin/products/autofill-bar";

const actions = vi.hoisted(() => ({ submit: vi.fn(), getJob: vi.fn() }));
vi.mock("@/lib/ai/admin/actions", () => ({
  submitResearchJobAdminAction: actions.submit,
  getResearchJobAdminAction: actions.getJob,
}));
afterEach(cleanup);
it("explica el perfil que falta y enlaza directamente a su configuración", () => {
  render(
    <AutofillBar
      productId="product-1"
      productName="Mouse"
      isDraft
      context={{ profileId: null, latestJobId: null }}
    />
  );
  expect(screen.getByText(/Falta un perfil de investigación habilitado/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Configurar autocompletado" }).getAttribute("href")).toBe(
    "/admin/settings/ai#autofill-profile"
  );
});
it("inicia la búsqueda con el perfil configurado", async () => {
  actions.submit.mockResolvedValue({ success: true, data: { jobId: "job-1" } });
  actions.getJob.mockResolvedValue({ success: true, data: null });
  render(
    <AutofillBar
      productId="product-1"
      productName="Mouse"
      isDraft
      context={{ profileId: "cloudflare-profile", latestJobId: null }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Buscar datos" }));
  await waitFor(() =>
    expect(actions.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProfileId: "cloudflare-profile",
        items: [{ query: "Mouse", mode: "ENRICH", targetProductId: "product-1" }],
      })
    )
  );
});
