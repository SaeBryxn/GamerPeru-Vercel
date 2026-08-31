// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManualPaymentCard } from "@/components/checkout/manual-payment-card";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import * as paymentActions from "@/lib/payments/actions";

// Mock Server Actions
vi.mock("@/lib/payments/actions", () => ({
  requestProofUploadIntentAction: vi.fn(),
  submitPaymentProofAction: vi.fn(),
  loadPaymentInstructionsAction: vi.fn(),
}));

describe("ManualPaymentCard Client Idempotency & Lifecycle Unit Tests", () => {
  const baseInstructions: PaymentInstructionDTO = {
    orderNumber: "GP-2026-0001",
    paymentMethodCode: "YAPE",
    paymentMethodName: "Yape",
    recipientName: "Gamer Perú S.A.C.",
    accountIdentifier: "987654321",
    instructionText: "Transfiere exactamente el monto indicado vía Yape.",
    qrSignedUrl: null,
    amountCents: 15000,
    currency: "PEN",
    paymentStatus: "UNPAID",
    isEligibleForSubmission: true,
    resubmissionGraceExpiresAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
      })
    );
  });

  const submitForm = () => {
    const submitButton = screen.getByTestId("manual-payment-submit-button");
    const form = submitButton.closest("form")!;
    fireEvent.submit(form);
  };

  describe("Exact Retry Lifecycle Without Proof", () => {
    it("preserves identical submissionAttemptId on double-click or transport ambiguity retry", async () => {
      const submitSpy = vi.spyOn(paymentActions, "submitPaymentProofAction");

      // First submit: simulate network error / transport ambiguity
      submitSpy.mockRejectedValueOnce(new Error("Network connection lost"));
      // Second submit: returns successful commit
      submitSpy.mockResolvedValueOnce({
        success: true,
        paymentStatus: "SUBMITTED",
        attemptNumber: 1,
        isLate: false,
        replayed: false,
      });

      render(<ManualPaymentCard instructions={baseInstructions} />);

      // Fill in operation code
      const opCodeInput = screen.getByTestId("manual-payment-operation-code-input");
      fireEvent.change(opCodeInput, { target: { value: "OP-123456" } });

      // Submit 1: fails with network error
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("manual-payment-error-alert")).toBeTruthy();
        expect(screen.getByTestId("manual-payment-error-alert").textContent).toContain(
          "Error de conexión al procesar el pago"
        );
      });

      const firstAttemptId = submitSpy.mock.calls[0]?.[0]?.submissionAttemptId;
      expect(firstAttemptId).toBeDefined();

      // Submit 2 (Retry with unchanged form): must use EXACT same submissionAttemptId
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("manual-payment-submitted-notice")).toBeTruthy();
      });

      const secondAttemptId = submitSpy.mock.calls[1]?.[0]?.submissionAttemptId;
      expect(secondAttemptId).toBe(firstAttemptId);
    });
  });

  describe("Exact Retry Lifecycle With Proof Upload", () => {
    it("reuses prepared uploadIntentId and does NOT re-upload file on exact retry", async () => {
      const requestIntentSpy = vi.spyOn(paymentActions, "requestProofUploadIntentAction");
      const submitSpy = vi.spyOn(paymentActions, "submitPaymentProofAction");

      requestIntentSpy.mockResolvedValue({
        success: true,
        uploadIntentId: "0191c900-0000-7000-8000-000000000u01",
        presignedPutUrl: "https://r2.test/staging/upload",
        expiresInSeconds: 900,
      });

      // Submit 1 fails with transport error
      submitSpy.mockRejectedValueOnce(new Error("Timeout waiting for server"));
      // Submit 2 succeeds with replayed = true
      submitSpy.mockResolvedValueOnce({
        success: true,
        paymentStatus: "SUBMITTED",
        attemptNumber: 1,
        isLate: false,
        replayed: true,
      });

      render(<ManualPaymentCard instructions={baseInstructions} />);

      // Fill in op code
      const opCodeInput = screen.getByTestId("manual-payment-operation-code-input");
      fireEvent.change(opCodeInput, { target: { value: "OP-VOUCHER-99" } });

      // Attach file
      const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "voucher.jpg", {
        type: "image/jpeg",
      });
      const fileInput = screen.getByTestId("manual-payment-dropzone").querySelector("input")!;
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("manual-payment-file-preview")).toBeTruthy();
      });

      // Submit 1: upload succeeds, submit fails
      submitForm();

      await waitFor(() => {
        expect(requestIntentSpy).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(submitSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("manual-payment-error-alert")).toBeTruthy();
      });

      const firstAttemptId = submitSpy.mock.calls[0]?.[0]?.submissionAttemptId;
      const firstUploadIntentId = submitSpy.mock.calls[0]?.[0]?.uploadIntentId;
      expect(firstUploadIntentId).toBe("0191c900-0000-7000-8000-000000000u01");

      // Submit 2: exact retry
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId("manual-payment-submitted-notice")).toBeTruthy();
      });

      // Assert requestProofUploadIntentAction was NOT called again
      expect(requestIntentSpy).toHaveBeenCalledTimes(1);
      // Assert PUT fetch was NOT called again
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Assert identical submissionAttemptId and uploadIntentId were sent
      const secondAttemptId = submitSpy.mock.calls[1]?.[0]?.submissionAttemptId;
      const secondUploadIntentId = submitSpy.mock.calls[1]?.[0]?.uploadIntentId;
      expect(secondAttemptId).toBe(firstAttemptId);
      expect(secondUploadIntentId).toBe(firstUploadIntentId);
    });
  });

  describe("Material Edits Rotate Attempt State", () => {
    it("generates a new submissionAttemptId when operation code changes", async () => {
      const submitSpy = vi.spyOn(paymentActions, "submitPaymentProofAction");
      submitSpy.mockRejectedValue(new Error("Simulated failure"));

      render(<ManualPaymentCard instructions={baseInstructions} />);

      const opCodeInput = screen.getByTestId("manual-payment-operation-code-input");

      // First intent: OP-111
      fireEvent.change(opCodeInput, { target: { value: "OP-111" } });
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
      });
      const firstAttemptId = submitSpy.mock.calls[0]?.[0]?.submissionAttemptId;

      // Material edit: change to OP-222
      fireEvent.change(opCodeInput, { target: { value: "OP-222" } });
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(2);
      });
      const secondAttemptId = submitSpy.mock.calls[1]?.[0]?.submissionAttemptId;

      expect(secondAttemptId).not.toBe(firstAttemptId);
    });

    it("resets prepared proof and attempt ID when proof file is removed or replaced", async () => {
      const requestIntentSpy = vi.spyOn(paymentActions, "requestProofUploadIntentAction");
      const submitSpy = vi.spyOn(paymentActions, "submitPaymentProofAction");

      requestIntentSpy.mockResolvedValue({
        success: true,
        uploadIntentId: "intent-1",
        presignedPutUrl: "https://r2.test/intent-1",
        expiresInSeconds: 900,
      });
      submitSpy.mockRejectedValue(new Error("Submit error"));

      render(<ManualPaymentCard instructions={baseInstructions} />);

      const opCodeInput = screen.getByTestId("manual-payment-operation-code-input");
      fireEvent.change(opCodeInput, { target: { value: "OP-FILE-TEST" } });

      // Attach file 1
      const file1 = new File(["data1"], "file1.jpg", { type: "image/jpeg" });
      const fileInput = screen.getByTestId("manual-payment-dropzone").querySelector("input")!;
      fireEvent.change(fileInput, { target: { files: [file1] } });

      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
      });
      const firstAttemptId = submitSpy.mock.calls[0]?.[0]?.submissionAttemptId;

      // Remove file
      const removeButton = screen.getByTestId("manual-payment-remove-file-button");
      fireEvent.click(removeButton);

      // Submit without file: must have a new attempt ID
      submitForm();

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(2);
      });
      const secondAttemptId = submitSpy.mock.calls[1]?.[0]?.submissionAttemptId;
      const secondUploadIntentId = submitSpy.mock.calls[1]?.[0]?.uploadIntentId;

      expect(secondAttemptId).not.toBe(firstAttemptId);
      expect(secondUploadIntentId).toBeNull();
    });
  });

  describe("IDEMPOTENCY_EXPIRED Recovery UX", () => {
    it("presents safe expiration notice and explicit 'Actualizar estado' recovery button", async () => {
      const submitSpy = vi.spyOn(paymentActions, "submitPaymentProofAction");
      const loadInstructionsSpy = vi.spyOn(paymentActions, "loadPaymentInstructionsAction");

      submitSpy.mockResolvedValue({
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error:
          "El intento anterior expiró. Actualiza el estado del pedido antes de intentarlo nuevamente.",
      });

      render(<ManualPaymentCard instructions={baseInstructions} />);

      const opCodeInput = screen.getByTestId("manual-payment-operation-code-input");
      fireEvent.change(opCodeInput, { target: { value: "OP-EXPIRED-TEST" } });

      submitForm();

      await waitFor(() => {
        expect(screen.getByTestId("manual-payment-error-alert")).toBeTruthy();
        expect(screen.getByTestId("manual-payment-error-alert").textContent).toContain(
          "El intento anterior expiró"
        );
        expect(screen.getByTestId("manual-payment-refresh-status-button")).toBeTruthy();
      });

      // Simulate status refresh returning SUBMITTED
      loadInstructionsSpy.mockResolvedValue({
        success: true,
        instructions: {
          ...baseInstructions,
          paymentStatus: "SUBMITTED",
        },
      });

      const refreshButton = screen.getByTestId("manual-payment-refresh-status-button");
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(loadInstructionsSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("manual-payment-submitted-notice")).toBeTruthy();
        // Form is hidden once payment status is SUBMITTED
        expect(screen.queryByTestId("manual-payment-operation-code-input")).toBeNull();
      });
    });
  });
});
