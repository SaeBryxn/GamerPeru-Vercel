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

describe("GP-018 / CHK6-BR2 — Fail-Closed Checkout UI & Recovery Suite", () => {
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
  };

  beforeEach(() => {
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
      fireEvent.click(submitBtn);

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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      expect(mockReplace).toHaveBeenCalledWith("/checkout/confirmacion/GP-9ABCDEF1");
    });
  });

  describe("3. Blocker A & E: Controlled Fail-Closed Behavior on Unavailable Secure Crypto", () => {
    it("renders safely without uncaught exception, displays technical error, disables submit, and never calls Math.random", () => {
      const mathRandomSpy = vi.spyOn(Math, "random");

      // Simulate browser environment without crypto support
      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Component must render without throwing an uncaught render exception
      expect(() => {
        render(<CheckoutPageClient context={sampleContext} />);
      }).not.toThrow();

      // Renders safe technical explanation
      expect(screen.getByTestId("checkout-general-error")).toBeDefined();
      expect(
        screen.getByText(/no cuenta con un generador criptográfico seguro necesario/i)
      ).toBeDefined();

      // Submit button must be disabled
      const submitBtn = screen.getByTestId("checkout-submit-button");
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // Attempting to click disabled button performs zero action
      fireEvent.click(submitBtn);
      expect(mockSubmitCheckoutAction).not.toHaveBeenCalled();

      // Math.random was never called
      expect(mathRandomSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Blocker B: Authoritative Context Refresh on Unavailable Methods", () => {
    it("A. SHIPPING_METHOD_UNAVAILABLE: invalidates stale selection, refreshes authoritative methods, removes stale option, and requires explicit re-submit", async () => {
      // First submit returns SHIPPING_METHOD_UNAVAILABLE
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "SHIPPING_METHOD_UNAVAILABLE",
        error: "El método de envío seleccionado ya no está disponible.",
      });

      // Refreshed context only has PROVINCIA_REGULAR remaining
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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // General error surfaced
      expect(screen.getByTestId("checkout-general-error")).toBeDefined();

      // Stale option LIMA_EXPRESS is no longer rendered
      expect(screen.queryByTestId("shipping-method-LIMA_EXPRESS")).toBeNull();

      // Remaining option PROVINCIA_REGULAR is rendered and auto-reconciled
      expect(screen.getByTestId("shipping-method-PROVINCIA_REGULAR")).toBeDefined();

      // No automatic second submit occurred
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Second submit sends refreshed shipping method and fresh attempt ID
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9SHIPRECOV",
        totalCents: 32500,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const firstCall = mockSubmitCheckoutAction.mock.calls[0]![0] as CheckoutSubmitInput;
      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;
      expect(secondCall.shippingMethodCode).toBe("PROVINCIA_REGULAR");
      expect(secondCall.checkoutAttemptId).not.toBe(firstCall.checkoutAttemptId);
    });

    it("B. PAYMENT_METHOD_UNAVAILABLE: invalidates stale selection, refreshes authoritative methods, removes stale method, leaks zero secrets, and requires explicit re-submit", async () => {
      // First submit returns PAYMENT_METHOD_UNAVAILABLE
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "PAYMENT_METHOD_UNAVAILABLE",
        error: "El método de pago seleccionado ya no está disponible.",
      });

      // Refreshed context only has PLIN_MANUAL remaining
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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // Stale option YAPE_MANUAL is removed
      expect(screen.queryByTestId("payment-method-YAPE_MANUAL")).toBeNull();
      // Remaining option PLIN_MANUAL is present
      expect(screen.getByTestId("payment-method-PLIN_MANUAL")).toBeDefined();

      // Zero secrets leaked
      expect(document.body.textContent).not.toContain("account_identifier");
      expect(document.body.textContent).not.toContain("instruction_text");

      // No automatic resubmit occurred
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Second submit sends PLIN_MANUAL
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: true,
        orderNumber: "GP-9PAYRECOV",
        totalCents: 31500,
        currency: "PEN",
        paymentStatus: "UNPAID",
        replayed: false,
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;
      expect(secondCall.paymentMethodCode).toBe("PLIN_MANUAL");
    });
  });

  describe("5. Blocker C: CHECKOUT_CONFIGURATION_UNAVAILABLE Fail-Closed Terminal State", () => {
    it("enters controlled terminal state, disables submit, prevents repeated submits, and provides working retry recovery", async () => {
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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      // Submit is now disabled
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // Repeated clicks cannot invoke submitCheckout again
      fireEvent.click(submitBtn);
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Retry button is available
      const retryBtn = screen.getByTestId("checkout-retry-config-button");
      expect(retryBtn).toBeDefined();

      // Clicking retry reloads authoritative context
      mockLoadCheckoutContextAction.mockResolvedValueOnce(sampleContext);
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
        expect(submitBtn.hasAttribute("disabled")).toBe(false);
      });
    });
  });

  describe("6. Blocker D: CART_ALREADY_CONVERTED Terminal Behavior", () => {
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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
      });

      // Submit is disabled for this converted cart
      expect(submitBtn.hasAttribute("disabled")).toBe(true);

      // Repeated click does not trigger another submit
      fireEvent.click(submitBtn);
      expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);

      // Safe navigation options rendered
      expect(screen.getByTestId("checkout-cart-converted-actions")).toBeDefined();
    });
  });

  describe("7. Blocker F: CHECKOUT_REVIEW_CHANGED Line-Item and Total Consistency", () => {
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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(1);
        expect(mockLoadCheckoutContextAction).toHaveBeenCalledTimes(1);
      });

      // Aggregate totals updated
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

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmitCheckoutAction).toHaveBeenCalledTimes(2);
      });

      const secondCall = mockSubmitCheckoutAction.mock.calls[1]![0] as CheckoutSubmitInput;
      expect(secondCall.reviewedSubtotalCents).toBe(35000);
      expect(secondCall.reviewedShippingCents).toBe(2000);
      expect(secondCall.reviewedTotalCents).toBe(37000);
    });
  });

  describe("8. Idempotency & Address Recoveries", () => {
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
      fireEvent.click(submitBtn);

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
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("checkout-general-error")).toBeDefined();
      });

      expect(
        screen.getByText(/La dirección de entrega seleccionada ya no está disponible/)
      ).toBeDefined();
    });
  });

  describe("9. Order Confirmation View & GP-019 Privacy Boundary", () => {
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
