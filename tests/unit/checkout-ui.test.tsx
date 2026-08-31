// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutPageClient, CheckoutConfirmationView } from "@/components/checkout";
import type {
  CheckoutConfirmationDTO,
  CheckoutContextDTO,
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
vi.mock("@/lib/checkout/actions", () => ({
  submitCheckoutAction: (input: unknown) => mockSubmitCheckoutAction(input),
  loadCheckoutContextAction: vi.fn(),
  loadCheckoutConfirmationAction: vi.fn(),
}));

describe("GP-018 / CHK6 — Checkout UI & Component Suite", () => {
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
  });

  describe("1. Checkout Form Rendering & States", () => {
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

      // Check default subtotal and total
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

      // Fill in required address fields
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

    it("handles CHECKOUT_REVIEW_CHANGED by surfacing warning and allowing retry", async () => {
      mockSubmitCheckoutAction.mockResolvedValueOnce({
        success: false,
        code: "CHECKOUT_REVIEW_CHANGED",
        error: "Los precios han cambiado. Por favor revisa los nuevos totales.",
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
        expect(screen.getByTestId("checkout-review-changed-alert")).toBeDefined();
      });

      expect(screen.getByText(/Los precios han cambiado/)).toBeDefined();
    });
  });

  describe("3. Order Confirmation View & GP-019 Privacy Boundary", () => {
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

      // Must never render instruction text, QR images, recipient accounts, or operation-code forms
      expect(text).not.toContain("999"); // No phone account
      expect(text).not.toContain("CCI");
      expect(text).not.toContain("Código de operación");
      expect(text).not.toContain("Voucher");
      expect(container.querySelector('input[type="file"]')).toBeNull();
    });
  });
});
