// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CheckoutPageClient, CheckoutConfirmationView } from "@/components/checkout";
import type {
  CheckoutConfirmationDTO,
  CheckoutContextDTO,
  CheckoutSubmitInput,
  CheckoutSubmitResult,
} from "@/lib/checkout/types";

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
}));

// Mock Server Actions
const mockSubmitCheckoutAction = vi.fn<(input: unknown) => Promise<CheckoutSubmitResult>>();
const mockLoadCheckoutContextAction = vi.fn<() => Promise<CheckoutContextDTO>>();
vi.mock("@/lib/checkout/actions", () => ({
  submitCheckoutAction: (input: unknown) => mockSubmitCheckoutAction(input),
  loadCheckoutContextAction: () => mockLoadCheckoutContextAction(),
  loadCheckoutConfirmationAction: vi.fn(),
}));

function submitReviewed(button: HTMLElement) {
  if (button.textContent?.includes("Revisar pedido")) fireEvent.click(button);
  fireEvent.click(button);
}

describe("GP-018 / CHK6-BR3 — Explicit Selection & Fail-Closed Checkout Suite", () => {
  const originalCrypto = globalThis.crypto;

  const baseCartItem = {
    variantId: "018f0000-0000-7000-8000-000000000001",
    productId: "018f0000-0000-7000-8000-000000000002",
    productSlug: "mouse-pro-wireless",
    productName: "Mouse Gamer Pro Wireless",
    sku: "MOU-PRO-BLK",
    priceCents: 15000,
    quantity: 2,
    lineTotalCents: 30000,
    attributes: { color: "Negro" },
    primaryMedia: null,
  };

  const sampleContext: CheckoutContextDTO = {
    cart: {
      items: [baseCartItem],
      subtotalCents: 30000,
      itemCount: 2,
      currency: "PEN",
    },
    auth: {
      status: "GUEST",
      email: "guest.buyer@test.pe",
      addresses: [],
    },
    shippingMethods: [
      {
        code: "LIMA_EXPRESS",
        name: "Envío Express Lima",
        basePriceCents: 1500,
        estimatedDaysMin: 1,
        estimatedDaysMax: 2,
      },
      {
        code: "PROVINCIA_REGULAR",
        name: "Envío Regular Provincia",
        basePriceCents: 2500,
        estimatedDaysMin: 3,
        estimatedDaysMax: 5,
      },
    ],
    paymentMethods: [
      {
        code: "YAPE_MANUAL",
        name: "Yape",
      },
      {
        code: "PLIN_MANUAL",
        name: "Plin",
      },
    ],
  };

  const sampleConfirmation: CheckoutConfirmationDTO = {
    orderNumber: "GP-9ABCDEF1",
    status: "PENDING",
    paymentStatus: "UNPAID",
    currency: "PEN",
    subtotalCents: 30000,
    shippingCents: 1500,
    discountCents: 0,
    totalCents: 31500,
    customerEmail: "cliente@test.pe",
    customerPhone: "987654321",
    shippingMethodName: "Envío Express Lima",
    paymentMethodName: "Yape",
    deliveryAddress: {
      recipientName: "Juan Pérez",
      phone: "987654321",
      streetAddress: "Av. Las Palmeras 123",
      apartmentSuite: "Dpto 301",
      department: "Lima",
      province: "Lima",
      district: "Miraflores",
      postalCode: "15074",
      referenceNotes: "Frente al parque",
    },
    items: [
      {
        variantId: "018f0000-0000-7000-8000-000000000001",
        productName: "Mouse Gamer Pro Wireless",
        sku: "MOU-PRO-BLK",
        variantTitle: "Negro",
        unitPriceCents: 15000,
        quantity: 2,
        lineTotalCents: 30000,
      },
    ],
    createdAt: "2026-08-30T21:00:00.000Z",
    progress: {
      createdAt: "2026-08-30T21:00:00.000Z",
      proofSubmittedAt: null,
      paymentConfirmedAt: null,
      shipmentStatus: "UNFULFILLED",
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      courierName: null,
      trackingNumber: null,
      trackingUrl: null,
    },
  };

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mockLoadCheckoutContextAction.mockResolvedValue(sampleContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  describe("1. Checkout Form Rendering & Basic Behavior", () => {
    it("muestra una revisión real antes de crear el pedido y vuelve a revisarla si cambian los datos", async () => {
      render(<CheckoutPageClient context={sampleContext} />);
      const fill = (id: string, value: string) =>
        fireEvent.change(screen.getByTestId(id), { target: { value } });
      fill("checkout-input-email", "comprador@example.test");
      fill("checkout-input-recipient-name", "Ana Pérez");
      fill("checkout-input-phone", "999888777");
      fill("checkout-input-street-address", "Av. Principal 123");
      fill("checkout-input-district", "Miraflores");
      fireEvent.click(screen.getByTestId("checkout-submit-button"));
      expect(mockSubmitCheckoutAction).not.toHaveBeenCalled();
      const review = screen.getByTestId("checkout-final-review");
      expect(review.textContent).toContain("Ana Pérez");
      expect(review.textContent).toContain("Av. Principal 123");
      expect(review.textContent).toContain("Yape");
      expect(screen.getByTestId("checkout-input-email").closest("[hidden]")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Editar contacto" }));
      fill("checkout-input-email", "otro@example.test");
      expect(screen.queryByTestId("checkout-final-review")).toBeNull();
      expect(screen.getByTestId("checkout-submit-button").textContent).toContain("Revisar pedido");
      fireEvent.click(screen.getByTestId("checkout-submit-button"));
      expect(screen.getByTestId("checkout-final-review").textContent).toContain(
        "otro@example.test"
      );
      expect(mockSubmitCheckoutAction).not.toHaveBeenCalled();
    });
    it("renders empty cart state when cart is null or empty", () => {
      render(<CheckoutPageClient context={{ ...sampleContext, cart: null }} />);
      expect(screen.getByTestId("checkout-empty-state")).toBeDefined();
      expect(screen.getByText("No tienes productos para comprar")).toBeDefined();
    });

    it("renders guest checkout with email and inline Peru address form", () => {
      render(<CheckoutPageClient context={sampleContext} />);

      expect(screen.getByTestId("checkout-page")).toBeDefined();
      expect(screen.getByTestId("checkout-input-email")).toBeDefined();
      expect(screen.getByTestId("checkout-inline-address-form")).toBeDefined();
      expect(screen.getByTestId("checkout-shipping-methods-list")).toBeDefined();
      expect(screen.getByTestId("checkout-payment-methods-list")).toBeDefined();
      expect(screen.getByTestId("checkout-order-summary")).toBeDefined();

      // Check default subtotal, shipping, and total
      expect(screen.getByTestId("checkout-subtotal-value").textContent).toContain("300.00");
      expect(screen.getByTestId("checkout-shipping-value").textContent).toContain("15.00");
      expect(screen.getByTestId("checkout-total-value").textContent).toContain("315.00");
    });

    it("renders authenticated checkout with saved addresses option", () => {
      const authContext: CheckoutContextDTO = {
        ...sampleContext,
        auth: {
          status: "AUTHENTICATED",
          email: "auth.user@test.pe",
          addresses: [
            {
              id: "018f0000-0000-7000-8000-00000000a001",
              recipientName: "Carlos Lopez",
              phone: "999888777",
              streetAddress: "Calle Los Cedros 456",
              apartmentSuite: "Piso 2",
              department: "Lima",
              province: "Lima",
              district: "San Isidro",
              postalCode: "15046",
              referenceNotes: "Rejas blancas",
              isDefault: true,
            },
          ],
        },
      };

      render(<CheckoutPageClient context={authContext} />);

      expect(screen.getByTestId("checkout-mode-saved-address")).toBeDefined();
      expect(
        screen.getByTestId("saved-address-018f0000-0000-7000-8000-00000000a001")
      ).toBeDefined();
      expect(screen.getByText("Predeterminada")).toBeDefined();
    });

    it("updates total dynamically when a different shipping method is selected", () => {
      render(<CheckoutPageClient context={sampleContext} />);

      const provinciaRadio = screen.getByTestId("shipping-method-PROVINCIA_REGULAR");
      fireEvent.click(provinciaRadio);

      // Subtotal (300.00) + Provincia (25.00) = 325.00
      expect(screen.getByTestId("checkout-shipping-value").textContent).toContain("25.00");
      expect(screen.getByTestId("checkout-total-value").textContent).toContain("325.00");
    });
  });

  describe("2. Validation & Submission Lifecycle", () => {
    it("validates required fields client-side before invoking server action", async () => {
      render(
        <CheckoutPageClient
          context={{
            ...sampleContext,
            auth: { status: "GUEST", email: "", addresses: [] },
          }}
        />
      );

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      expect(mockSubmitCheckoutAction).not.toHaveBeenCalled();
      expect(await screen.findByText("El correo electrónico es obligatorio.")).toBeDefined();
      expect(await screen.findByText("El nombre del destinatario es obligatorio.")).toBeDefined();
      expect(await screen.findByText("El teléfono de contacto es obligatorio.")).toBeDefined();
      expect(await screen.findByText("La dirección de entrega es obligatoria.")).toBeDefined();
    });

    it("submits valid form and redirects to confirmation on success", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9ABCDEF1",
        totalCents: 31500,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(mockReplace).toHaveBeenCalledWith("/checkout/confirmacion/GP-9ABCDEF1");
    });
  });

  describe("3. Safe Crypto Boundary (Blocker A / Section 13)", () => {
    it("renders safely without uncaught exception, displays technical error, disables submit, and never calls Math.random", () => {
      const mathRandomSpy = vi.spyOn(Math, "random");

      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(() => {
        render(<CheckoutPageClient context={sampleContext} />);
      }).not.toThrow();

      expect(screen.getByTestId("checkout-general-error")).toBeDefined();
      expect(
        screen.getByText(/no cuenta con un generador criptográfico seguro necesario/i)
      ).toBeDefined();

      const submitBtn = screen.getByTestId("checkout-submit-button");
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      submitReviewed(submitBtn);
      expect(mockSubmitCheckoutAction).not.toHaveBeenCalled();
      expect(mathRandomSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Root Defect A & Required Shipping Test (Sections 3 & 9)", () => {
    it("A. SHIPPING_METHOD_UNAVAILABLE: removes stale method, leaves replacement unselected, disables submit, requires explicit click, applies authoritative price, and submits with fresh attempt ID", async () => {
      // Step 1: Initial submit with LIMA_EXPRESS (1500 cents) returns SHIPPING_METHOD_UNAVAILABLE
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "SHIPPING_METHOD_UNAVAILABLE",
        error: "El método de envío seleccionado ya no está disponible.",
      });

      // Authoritative refreshed context only contains PROVINCIA_REGULAR (2500 cents)
      const refreshedContext: CheckoutContextDTO = {
        ...sampleContext,
        shippingMethods: [
          {
            code: "PROVINCIA_REGULAR",
            name: "Envío Regular Provincia",
            basePriceCents: 2500,
            estimatedDaysMin: 3,
            estimatedDaysMax: 5,
          },
        ],
      };
      mockLoadCheckoutContextAction.mockResolvedValueOnce(refreshedContext);

      render(<CheckoutPageClient context={sampleContext} />);

      // Fill in valid address
      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // 1. General error surfaced
      expect(screen.getByTestId("checkout-general-error")).toBeDefined();

      // 2. Stale LIMA_EXPRESS is absent from DOM
      expect(screen.queryByTestId("shipping-method-LIMA_EXPRESS")).toBeNull();

      // 3. Replacement PROVINCIA_REGULAR is rendered
      const provCard = screen.getByTestId("shipping-method-PROVINCIA_REGULAR");
      expect(provCard).toBeDefined();

      // 4. PROVINCIA_REGULAR radio is NOT automatically checked (Zero auto-selection)
      const provRadio = provCard.querySelector('input[type="radio"]') as HTMLInputElement;
      expect(provRadio.checked).toBe(false);

      // 5. Shipping display indicates unselected / pending ("—")
      expect(screen.getByTestId("checkout-shipping-value").textContent).toContain("—");

      // 6. Submit button remains disabled while no shipping method is selected
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // 7. Clicking disabled submit button triggers zero calls to submitCheckoutAction
      submitReviewed(submitBtn);
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Step 2: Customer explicitly selects PROVINCIA_REGULAR
      fireEvent.click(provRadio);
      expect(provRadio.checked).toBe(true);

      // 8. Shipping value updates to exact authoritative price (S/ 25.00)
      expect(screen.getByTestId("checkout-shipping-value").textContent).toContain("25.00");
      // Total equals refreshed subtotal (300.00) + 25.00 = 325.00
      expect(screen.getByTestId("checkout-total-value").textContent).toContain("325.00");

      // 9. Submit button becomes enabled
      expect(submitBtn.hasAttribute("disabled")).toBe(false);

      // Step 3: Explicit second submit
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9SHIPRECOV",
        totalCents: 32500,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const firstCall = mockSubmitCheckoutAction.mock.calls[0]![0] as CheckoutSubmitInput;
      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;

      // 10. Second submit payload contains exact refreshed amounts and fresh attempt ID
      expect(secondCall.shippingMethodCode).toBe("PROVINCIA_REGULAR");
      expect(secondCall.reviewedSubtotalCents).toBe(30000);
      expect(secondCall.reviewedShippingCents).toBe(2500);
      expect(secondCall.reviewedTotalCents).toBe(32500);
      expect(secondCall.checkoutAttemptId).not.toBe(firstCall.checkoutAttemptId);
    });
  });

  describe("5. Root Defect B & Required Payment Test (Sections 4 & 10)", () => {
    it("B. PAYMENT_METHOD_UNAVAILABLE: removes stale method, leaves replacement unselected, disables submit, requires explicit selection, and submits with fresh attempt ID", async () => {
      // Step 1: Initial submit with YAPE_MANUAL returns PAYMENT_METHOD_UNAVAILABLE
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "PAYMENT_METHOD_UNAVAILABLE",
        error: "El método de pago seleccionado ya no está disponible.",
      });

      // Refreshed context only contains PLIN_MANUAL
      const refreshedContext: CheckoutContextDTO = {
        ...sampleContext,
        paymentMethods: [
          {
            code: "PLIN_MANUAL",
            name: "Plin",
          },
        ],
      };
      mockLoadCheckoutContextAction.mockResolvedValueOnce(refreshedContext);

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // 1. Stale YAPE_MANUAL is absent from DOM
      expect(screen.queryByTestId("payment-method-YAPE_MANUAL")).toBeNull();

      // 2. Replacement PLIN_MANUAL is rendered
      const plinCard = screen.getByTestId("payment-method-PLIN_MANUAL");
      expect(plinCard).toBeDefined();

      // 3. PLIN_MANUAL radio is NOT automatically checked (Zero auto-selection)
      const plinRadio = plinCard.querySelector('input[type="radio"]') as HTMLInputElement;
      expect(plinRadio.checked).toBe(false);

      // 4. Submit button remains disabled
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // 5. Zero secrets leaked
      expect(document.body.textContent).not.toContain("account_identifier");
      expect(document.body.textContent).not.toContain("instruction_text");

      // 6. No auto-submit occurred
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Step 2: Customer explicitly selects PLIN_MANUAL
      fireEvent.click(plinRadio);
      expect(plinRadio.checked).toBe(true);
      expect(submitBtn.hasAttribute("disabled")).toBe(false);

      // Step 3: Explicit submit
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9PAYRECOV",
        totalCents: 31500,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const firstCall = mockSubmitCheckoutAction.mock.calls[0]![0] as CheckoutSubmitInput;
      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;
      expect(secondCall.paymentMethodCode).toBe("PLIN_MANUAL");
      expect(secondCall.checkoutAttemptId).not.toBe(firstCall.checkoutAttemptId);
    });
  });

  describe("6. Zero-Option Recovery Tests (Section 11)", () => {
    it("A. SHIPPING_METHOD_UNAVAILABLE with zero refreshed shipping methods enters fail-closed state with retry control", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "SHIPPING_METHOD_UNAVAILABLE",
        error: "Método de envío no disponible.",
      });

      mockLoadCheckoutContextAction.mockResolvedValueOnce({
        ...sampleContext,
        shippingMethods: [],
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // Submit is disabled
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // Warning alert for no shipping methods
      expect(screen.getByTestId("checkout-no-shipping-alert")).toBeDefined();

      // Retry control is available
      expect(screen.getByTestId("checkout-retry-config-button")).toBeDefined();
    });

    it("B. PAYMENT_METHOD_UNAVAILABLE with zero refreshed payment methods enters fail-closed state with retry control", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "PAYMENT_METHOD_UNAVAILABLE",
        error: "Método de pago no disponible.",
      });

      mockLoadCheckoutContextAction.mockResolvedValueOnce({
        ...sampleContext,
        paymentMethods: [],
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      expect(submitBtn.hasAttribute("disabled")).toBe(true);
      expect(screen.getByTestId("checkout-no-payment-alert")).toBeDefined();
      expect(screen.getByTestId("checkout-retry-config-button")).toBeDefined();
    });

    it("C. CHECKOUT_CONFIGURATION_UNAVAILABLE retry returning zero shipping methods remains fail-closed", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CHECKOUT_CONFIGURATION_UNAVAILABLE",
        error: "Servicio no disponible.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(submitBtn.hasAttribute("disabled")).toBe(true);
      const retryBtn = screen.getByTestId("checkout-retry-config-button");

      // Retry returns 0 shipping methods
      mockLoadCheckoutContextAction.mockResolvedValueOnce({
        ...sampleContext,
        shippingMethods: [],
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
        expect(submitBtn.hasAttribute("disabled")).toBe(true);
      });
    });

    it("D. CHECKOUT_CONFIGURATION_UNAVAILABLE retry returning zero payment methods remains fail-closed", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CHECKOUT_CONFIGURATION_UNAVAILABLE",
        error: "Servicio no disponible.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(submitBtn.hasAttribute("disabled")).toBe(true);
      const retryBtn = screen.getByTestId("checkout-retry-config-button");

      // Retry returns 0 payment methods
      mockLoadCheckoutContextAction.mockResolvedValueOnce({
        ...sampleContext,
        paymentMethods: [],
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
        expect(submitBtn.hasAttribute("disabled")).toBe(true);
      });
    });

    it("E. CHECKOUT_CONFIGURATION_UNAVAILABLE retry reader throwing remains fail-closed with retry control available", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CHECKOUT_CONFIGURATION_UNAVAILABLE",
        error: "Servicio no disponible.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(submitBtn.hasAttribute("disabled")).toBe(true);
      const retryBtn = screen.getByTestId("checkout-retry-config-button");

      // Reader throws network error on retry
      mockLoadCheckoutContextAction.mockRejectedValueOnce(new Error("Network Error"));

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
        expect(submitBtn.hasAttribute("disabled")).toBe(true);
        expect(screen.getByTestId("checkout-retry-config-button")).toBeDefined();
      });
    });
  });

  describe("7. CART_ALREADY_CONVERTED Terminal Behavior (Blocker D)", () => {
    it("enters terminal state for current cart, disables submit, prevents repeated submissions, and offers safe navigation", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CART_ALREADY_CONVERTED",
        error: "Este carrito ya fue procesado en un pedido anterior.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      submitReviewed(submitBtn);
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      expect(screen.getByTestId("checkout-cart-converted-actions")).toBeDefined();
    });
  });

  describe("8. CHECKOUT_REVIEW_CHANGED Line-Item and Total Consistency (Section 7)", () => {
    it("reconciles visible line items and aggregate totals consistently with authoritative server reader", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CHECKOUT_REVIEW_CHANGED",
        error: "Los precios han cambiado.",
        details: {
          authoritativeSubtotalCents: 35000,
          authoritativeShippingCents: 2000,
          authoritativeTotalCents: 37000,
        },
      });

      // Refreshed context returns updated line-item price
      const refreshedContext: CheckoutContextDTO = {
        ...sampleContext,
        cart: {
          items: [
            {
              ...baseCartItem,
              priceCents: 17500,
              lineTotalCents: 35000,
            },
          ],
          subtotalCents: 35000,
          itemCount: 2,
          currency: "PEN",
        },
        shippingMethods: [
          {
            code: "LIMA_EXPRESS",
            name: "Envío Express Lima",
            basePriceCents: 2000,
            estimatedDaysMin: 1,
            estimatedDaysMax: 2,
          },
        ],
      };
      mockLoadCheckoutContextAction.mockResolvedValueOnce(refreshedContext);

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // Aggregate totals updated to authoritative response amounts
      expect(screen.getByTestId("checkout-subtotal-value").textContent).toContain("350.00");
      expect(screen.getByTestId("checkout-shipping-value").textContent).toContain("20.00");
      expect(screen.getByTestId("checkout-total-value").textContent).toContain("370.00");

      // Line item price updated and consistent with aggregate subtotal (S/ 350.00)
      const itemRow = screen.getByTestId("checkout-item-MOU-PRO-BLK");
      expect(itemRow.textContent).toContain("350.00");

      // Second click submits updated authoritative amounts
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9REVRECOV",
        totalCents: 37000,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;
      expect(secondCall.reviewedSubtotalCents).toBe(35000);
      expect(secondCall.reviewedShippingCents).toBe(2000);
      expect(secondCall.reviewedTotalCents).toBe(37000);
    });
  });

  describe("9. Idempotency & Address Recoveries", () => {
    it("recovers safely from IDEMPOTENCY_EXPIRED by resetting attempt ID without auto-submitting", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "IDEMPOTENCY_EXPIRED",
        error: "El intento de compra expiró.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("checkout-general-error")).toBeDefined();
      });

      expect(screen.getByText(/Tu intento de compra ha expirado/)).toBeDefined();
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
    });

    it("recovers safely from ADDRESS_UNAVAILABLE by clearing selected address", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "ADDRESS_UNAVAILABLE",
        error: "Dirección no disponible.",
      });

      render(<CheckoutPageClient context={sampleContext} />);

      fireEvent.change(screen.getByTestId("checkout-input-recipient-name"), {
        target: { value: "Maria Quispe" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-phone"), {
        target: { value: "998877665" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-street-address"), {
        target: { value: "Jr. Union 100" },
      });
      fireEvent.change(screen.getByTestId("checkout-input-district"), {
        target: { value: "Cercado de Lima" },
      });

      const submitBtn = screen.getByTestId("checkout-submit-button");
      submitReviewed(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("checkout-general-error")).toBeDefined();
      });

      expect(
        screen.getByText(/La dirección de entrega seleccionada ya no está disponible/)
      ).toBeDefined();
    });
  });

  describe("10. Order Confirmation View & GP-019 Privacy Boundary", () => {
    it("keeps the payment step current until a receipt is approved", () => {
      render(<CheckoutConfirmationView confirmation={sampleConfirmation} />);
      const progress = screen.getByRole("list", { name: "Progreso de entrega" });
      expect(progress.querySelector('[aria-current="step"]')?.textContent).toContain(
        "Pago pendiente"
      );
    });

    it("does not expose unsafe tracking destinations", () => {
      render(
        <CheckoutConfirmationView
          confirmation={{
            ...sampleConfirmation,
            progress: {
              ...sampleConfirmation.progress,
              shipmentStatus: "SHIPPED",
              trackingUrl: "javascript:alert(1)",
              trackingNumber: "GUIA-001",
              courierName: "Courier",
            },
          }}
        />
      );
      expect(screen.queryByRole("link", { name: /Rastrear envío/ })).toBeNull();
      expect(screen.getByText("Guía: GUIA-001")).toBeDefined();
    });

    it.each(["SHIPPED", "DELIVERED"] as const)(
      "prioritizes %s tracking and never asks the customer to pay again",
      (shipmentStatus) => {
        render(
          <CheckoutConfirmationView
            confirmation={{
              ...sampleConfirmation,
              status: "CONFIRMED",
              paymentStatus: "PAID",
              progress: {
                ...sampleConfirmation.progress,
                shipmentStatus,
                shippedAt: "2026-08-31T12:00:00.000Z",
                deliveredAt: shipmentStatus === "DELIVERED" ? "2026-09-01T12:00:00.000Z" : null,
              },
            }}
            paymentInstructions={{
              orderNumber: sampleConfirmation.orderNumber,
              paymentMethodCode: "YAPE",
              paymentMethodName: "Yape",
              paymentStatus: "PAID",
              amountCents: sampleConfirmation.totalCents,
              currency: "PEN",
              recipientName: "Tienda",
              accountIdentifier: "999888777",
              instructionText: "Envía el monto exacto y sube tu comprobante.",
              qrSignedUrl: null,
              resubmissionGraceExpiresAt: null,
              isEligibleForSubmission: false,
            }}
          />
        );
        expect(screen.queryByTestId("manual-payment-card")).toBeNull();
        expect(screen.queryByText(/Envía el monto exacto/)).toBeNull();
        expect(screen.getByTestId("confirmation-payment-status").textContent).toContain(
          "Pago confirmado"
        );
        expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
          shipmentStatus === "DELIVERED" ? "entregado" : "camino"
        );
      }
    );

    it("distinguishes receipt review from a confirmed payment without showing transfer instructions", () => {
      render(
        <CheckoutConfirmationView
          confirmation={{ ...sampleConfirmation, paymentStatus: "PENDING_VERIFICATION" }}
        />
      );
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("comprobante");
      expect(screen.getByTestId("confirmation-payment-status").textContent).toContain(
        "En revisión"
      );
      expect(screen.queryByText("Total pagado")).toBeNull();
    });

    it.each([
      ["EXPIRED", "vencido"],
      ["REFUNDED", "reembolsado"],
    ] as const)(
      "shows the actual terminal state %s instead of calling everything cancelled",
      (status, label) => {
        render(<CheckoutConfirmationView confirmation={{ ...sampleConfirmation, status }} />);
        expect(screen.getByRole("heading", { level: 1 }).textContent?.toLowerCase()).toContain(
          label
        );
        expect(screen.queryByTestId("manual-payment-card")).toBeNull();
        expect(screen.queryByTestId("confirmation-cancel-order-button")).toBeNull();
      }
    );

    it("renders full confirmation details with pending payment state", () => {
      render(<CheckoutConfirmationView confirmation={sampleConfirmation} />);

      expect(screen.getByTestId("checkout-confirmation-view")).toBeDefined();
      expect(screen.getByTestId("confirmation-order-number").textContent).toContain("GP-9ABCDEF1");
      expect(screen.getByTestId("confirmation-payment-status").textContent).toContain(
        "Pendiente de Pago"
      );
      expect(screen.getByTestId("confirmation-shipping-method").textContent).toContain(
        "Envío Express Lima"
      );
      expect(screen.getByTestId("confirmation-item-MOU-PRO-BLK")).toBeDefined();
      expect(screen.getByTestId("confirmation-total-value").textContent).toContain("315.00");
    });

    it("GP-019 Boundary: does NOT render sensitive payment instruction fields or QR codes", () => {
      const { container } = render(<CheckoutConfirmationView confirmation={sampleConfirmation} />);
      const text = container.textContent ?? "";

      expect(text).not.toContain("999");
      expect(text).not.toContain("CCI");
      expect(text).not.toContain("Código de operación");
      expect(text).not.toContain("Voucher");
      expect(container.querySelector('input[type="file"]')).toBeNull();
    });
  });
});
