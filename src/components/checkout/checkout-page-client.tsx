"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Lock,
  Package,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button, Icon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { loadCheckoutContextAction, submitCheckoutAction } from "@/lib/checkout/actions";
import { generateSecureCheckoutAttemptId } from "@/lib/checkout/attempt-id";
import type {
  CheckoutContextDTO,
  CheckoutDeliveryAddressInput,
  CheckoutSubmitInput,
  CheckoutSubmitResult,
} from "@/lib/checkout/types";
import styles from "./checkout-page-client.module.css";

export interface CheckoutPageClientProps {
  context: CheckoutContextDTO;
}

interface InlineAddressFormState {
  recipientName: string;
  phone: string;
  streetAddress: string;
  apartmentSuite: string;
  department: string;
  province: string;
  district: string;
  postalCode: string;
  referenceNotes: string;
}

type ReconciliationPolicy =
  | { type: "PRESERVE_VALID_SELECTIONS" }
  | { type: "INVALIDATE_SHIPPING" }
  | { type: "INVALIDATE_PAYMENT" }
  | { type: "INVALIDATE_BOTH" };

export function CheckoutPageClient({
  context: initialContext,
}: CheckoutPageClientProps): React.JSX.Element {
  const router = useRouter();

  // 1. Authoritative Dynamic Context State
  const [currentContext, setCurrentContext] = useState<CheckoutContextDTO>(initialContext);
  const cart = currentContext.cart;
  const isAuthenticated = currentContext.auth.status === "AUTHENTICATED";
  const savedAddresses =
    currentContext.auth.status === "AUTHENTICATED" ? currentContext.auth.addresses : [];

  // Default address resolution
  const defaultSavedAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];

  // 2. Form States
  const [email, setEmail] = useState(currentContext.auth.email ?? "");
  const [deliveryMode, setDeliveryMode] = useState<"SAVED_ADDRESS" | "INLINE">(
    isAuthenticated && savedAddresses.length > 0 ? "SAVED_ADDRESS" : "INLINE"
  );
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    defaultSavedAddress ? defaultSavedAddress.id : ""
  );

  const [inlineAddress, setInlineAddress] = useState<InlineAddressFormState>({
    recipientName: "",
    phone: "",
    streetAddress: "",
    apartmentSuite: "",
    department: "Lima",
    province: "Lima",
    district: "",
    postalCode: "",
    referenceNotes: "",
  });

  const [selectedShippingCode, setSelectedShippingCode] = useState<string>(
    currentContext.shippingMethods.length > 0 ? currentContext.shippingMethods[0]!.code : ""
  );

  const [selectedPaymentCode, setSelectedPaymentCode] = useState<string>(
    currentContext.paymentMethods.length > 0 ? currentContext.paymentMethods[0]!.code : ""
  );

  // 3. Fail-Closed & Terminal Execution States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingContext, setIsRefreshingContext] = useState(false);
  const [isCryptoUnavailable, setIsCryptoUnavailable] = useState(false);
  const [isConfigurationUnavailable, setIsConfigurationUnavailable] = useState(false);
  const [isCartConverted, setIsCartConverted] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [reviewChangedWarning, setReviewChangedWarning] = useState<string | null>(null);

  // 4. Attempt ID Lifecycle with Safe Crypto Boundary (Zero Math.random fallback)
  const attemptIdRef = useRef<string>("");

  const safelyGenerateAttemptId = (): string | null => {
    try {
      return generateSecureCheckoutAttemptId();
    } catch (_err) {
      setIsCryptoUnavailable(true);
      setGeneralError(
        "Tu navegador no cuenta con un generador criptográfico seguro necesario para procesar compras. Por favor, actualiza tu navegador o intenta desde otro dispositivo."
      );
      return null;
    }
  };

  if (!attemptIdRef.current && !isCryptoUnavailable) {
    const id = safelyGenerateAttemptId();
    if (id) {
      attemptIdRef.current = id;
    }
  }

  const resetAttemptId = () => {
    const id = safelyGenerateAttemptId();
    if (id) {
      attemptIdRef.current = id;
    } else {
      attemptIdRef.current = "";
    }
  };

  // 5. Reviewed Pricing States (Authoritative Server Synchronization)
  const initialSubtotal = cart?.subtotalCents ?? 0;
  const initialSelectedShipping = currentContext.shippingMethods.find(
    (s) => s.code === selectedShippingCode
  );
  const initialShipping = initialSelectedShipping?.basePriceCents ?? 0;

  const [reviewedSubtotalCents, setReviewedSubtotalCents] = useState<number>(initialSubtotal);
  const [reviewedShippingCents, setReviewedShippingCents] = useState<number>(initialShipping);
  const [reviewedTotalCents, setReviewedTotalCents] = useState<number>(
    initialSubtotal + initialShipping
  );

  // 6. Authoritative Context Refresh Helper with Explicit Selection Policies
  const refreshAuthoritativeContext = async (
    policy: ReconciliationPolicy = { type: "PRESERVE_VALID_SELECTIONS" }
  ): Promise<CheckoutContextDTO | null> => {
    setIsRefreshingContext(true);
    try {
      const refreshed = await loadCheckoutContextAction();
      setCurrentContext(refreshed);

      // Reconcile shipping selection explicitly based on policy and active server options (Zero auto-selection)
      let nextShippingCode = "";
      if (policy.type !== "INVALIDATE_SHIPPING" && policy.type !== "INVALIDATE_BOTH") {
        if (refreshed.shippingMethods.some((m) => m.code === selectedShippingCode)) {
          nextShippingCode = selectedShippingCode;
        }
      }
      setSelectedShippingCode(nextShippingCode);

      // Reconcile payment selection explicitly based on policy and active server options (Zero auto-selection)
      let nextPaymentCode = "";
      if (policy.type !== "INVALIDATE_PAYMENT" && policy.type !== "INVALIDATE_BOTH") {
        if (refreshed.paymentMethods.some((m) => m.code === selectedPaymentCode)) {
          nextPaymentCode = selectedPaymentCode;
        }
      }
      setSelectedPaymentCode(nextPaymentCode);

      // Reconcile pricing accurately without stale-closure leakage
      const nextSubtotal = refreshed.cart ? refreshed.cart.subtotalCents : reviewedSubtotalCents;
      setReviewedSubtotalCents(nextSubtotal);

      const activeShipping = refreshed.shippingMethods.find((s) => s.code === nextShippingCode);
      const nextShippingCents = activeShipping ? activeShipping.basePriceCents : 0;
      setReviewedShippingCents(nextShippingCents);
      setReviewedTotalCents(nextSubtotal + nextShippingCents);

      // Fail-closed if either required method set is empty
      if (refreshed.shippingMethods.length === 0 || refreshed.paymentMethods.length === 0) {
        setIsConfigurationUnavailable(true);
      } else {
        setIsConfigurationUnavailable(false);
      }

      return refreshed;
    } catch (_err) {
      setIsConfigurationUnavailable(true);
      setGeneralError(
        "No se pudo sincronizar la configuración del proceso de compra. Por favor intenta más tarde."
      );
      return null;
    } finally {
      setIsRefreshingContext(false);
    }
  };

  const handleShippingChange = (code: string) => {
    setSelectedShippingCode(code);
    const method = currentContext.shippingMethods.find((m) => m.code === code);
    const newShippingCents = method?.basePriceCents ?? 0;
    setReviewedShippingCents(newShippingCents);
    setReviewedTotalCents(reviewedSubtotalCents + newShippingCents);
    setReviewChangedWarning(null);
    setGeneralError(null);
    resetAttemptId();
  };

  const handlePaymentChange = (code: string) => {
    setSelectedPaymentCode(code);
    setReviewChangedWarning(null);
    setGeneralError(null);
    resetAttemptId();
  };

  // Validate form client-side
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = "El correo electrónico es obligatorio.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Ingrese un correo electrónico válido.";
    }

    if (deliveryMode === "SAVED_ADDRESS") {
      if (!selectedAddressId) {
        errors.address = "Seleccione una dirección de entrega.";
      }
    } else {
      if (!inlineAddress.recipientName.trim()) {
        errors.recipientName = "El nombre del destinatario es obligatorio.";
      }
      if (!inlineAddress.phone.trim()) {
        errors.phone = "El teléfono de contacto es obligatorio.";
      }
      if (!inlineAddress.streetAddress.trim()) {
        errors.streetAddress = "La dirección de entrega es obligatoria.";
      }
      if (!inlineAddress.department.trim()) {
        errors.department = "El departamento es obligatorio.";
      }
      if (!inlineAddress.province.trim()) {
        errors.province = "La provincia es obligatoria.";
      }
      if (!inlineAddress.district.trim()) {
        errors.district = "El distrito es obligatorio.";
      }
    }

    if (!selectedShippingCode) {
      errors.shipping = "Seleccione un método de envío.";
    }

    if (!selectedPaymentCode) {
      errors.payment = "Seleccione un método de pago.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (
      isCryptoUnavailable ||
      isConfigurationUnavailable ||
      isCartConverted ||
      !attemptIdRef.current
    ) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    let deliveryAddressInput: CheckoutDeliveryAddressInput;
    if (deliveryMode === "SAVED_ADDRESS") {
      deliveryAddressInput = {
        mode: "SAVED_ADDRESS",
        addressId: selectedAddressId,
      };
    } else {
      deliveryAddressInput = {
        mode: "INLINE",
        address: {
          recipientName: inlineAddress.recipientName.trim(),
          phone: inlineAddress.phone.trim(),
          streetAddress: inlineAddress.streetAddress.trim(),
          apartmentSuite: inlineAddress.apartmentSuite.trim() || null,
          department: inlineAddress.department.trim(),
          province: inlineAddress.province.trim(),
          district: inlineAddress.district.trim(),
          postalCode: inlineAddress.postalCode.trim() || null,
          referenceNotes: inlineAddress.referenceNotes.trim() || null,
        },
      };
    }

    const payload: CheckoutSubmitInput = {
      checkoutAttemptId: attemptIdRef.current,
      customerEmail: email.trim().toLowerCase(),
      deliveryAddress: deliveryAddressInput,
      shippingMethodCode: selectedShippingCode,
      paymentMethodCode: selectedPaymentCode,
      reviewedSubtotalCents: reviewedSubtotalCents,
      reviewedShippingCents: reviewedShippingCents,
      reviewedTotalCents: reviewedTotalCents,
    };

    setIsSubmitting(true);
    try {
      const res: CheckoutSubmitResult = await submitCheckoutAction(payload);

      if (res.success) {
        router.replace(`/checkout/confirmacion/${res.orderNumber}`);
        return;
      }

      // Handle typed errors with authoritative recovery
      if (res.code === "CHECKOUT_REVIEW_CHANGED") {
        if (res.details) {
          setReviewedSubtotalCents(res.details.authoritativeSubtotalCents);
          setReviewedShippingCents(res.details.authoritativeShippingCents);
          setReviewedTotalCents(res.details.authoritativeTotalCents);
        }
        setReviewChangedWarning(
          res.error ||
            "Los precios o costos de envío han cambiado. Hemos actualizado los totales a continuación. Por favor revisa y haz clic en 'Realizar Pedido' para confirmar con los nuevos montos."
        );
        // Reconcile line items and options from authoritative context reader
        await refreshAuthoritativeContext({ type: "PRESERVE_VALID_SELECTIONS" });
        if (res.details) {
          setReviewedSubtotalCents(res.details.authoritativeSubtotalCents);
          setReviewedShippingCents(res.details.authoritativeShippingCents);
          setReviewedTotalCents(res.details.authoritativeTotalCents);
        }
        resetAttemptId();
      } else if (res.code === "PROFILE_REQUIRED") {
        router.push("/auth/completar-perfil");
      } else if (res.code === "IDEMPOTENCY_EXPIRED") {
        setGeneralError(
          "Tu intento de compra ha expirado. Por favor, confirma nuevamente para registrar tu pedido."
        );
        resetAttemptId();
      } else if (res.code === "IDEMPOTENCY_CONFLICT") {
        setGeneralError(
          "Los datos de la compra cambiaron respecto al intento previo. Por favor, revisa tus datos y confirma nuevamente."
        );
        resetAttemptId();
      } else if (res.code === "ADDRESS_UNAVAILABLE") {
        setGeneralError(
          "La dirección de entrega seleccionada ya no está disponible. Por favor selecciona o ingresa otra dirección."
        );
        setSelectedAddressId("");
        resetAttemptId();
      } else if (res.code === "SHIPPING_METHOD_UNAVAILABLE") {
        setGeneralError(
          "El método de envío seleccionado ya no está disponible. Por favor selecciona otro método de entrega."
        );
        await refreshAuthoritativeContext({ type: "INVALIDATE_SHIPPING" });
        resetAttemptId();
      } else if (res.code === "PAYMENT_METHOD_UNAVAILABLE") {
        setGeneralError(
          "El método de pago seleccionado ya no está disponible. Por favor selecciona otro método de pago."
        );
        await refreshAuthoritativeContext({ type: "INVALIDATE_PAYMENT" });
        resetAttemptId();
      } else if (res.code === "CHECKOUT_CONFIGURATION_UNAVAILABLE") {
        setIsConfigurationUnavailable(true);
        setGeneralError(
          "El servicio de compra no se encuentra disponible temporalmente. Por favor intenta más tarde o reintenta la carga."
        );
      } else if (res.code === "CART_ALREADY_CONVERTED") {
        setIsCartConverted(true);
        setGeneralError(
          "Este carrito ya fue procesado en un pedido anterior. No es posible generar pedidos duplicados para el mismo carrito."
        );
      } else if (res.code === "INSUFFICIENT_STOCK" || res.code === "PRODUCT_UNAVAILABLE") {
        setGeneralError(
          `${res.error} Te recomendamos revisar tu carrito para actualizar los productos.`
        );
      } else if (
        res.code === "CART_EMPTY" ||
        res.code === "CART_REQUIRED" ||
        res.code === "CART_EXPIRED"
      ) {
        setGeneralError(res.error || "Tu carrito ha expirado o está vacío.");
      } else if (res.code === "UNAUTHORIZED") {
        setGeneralError(
          "No se pudo autorizar la compra. Por favor verifica tu sesión e intenta nuevamente."
        );
      } else {
        setGeneralError(
          res.error || "Ocurrió un error al procesar tu compra. Por favor intenta nuevamente."
        );
      }
    } catch (_err: unknown) {
      setGeneralError("Error de conexión al procesar el pedido. Por favor intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Empty cart fallback
  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.pageWrapper} data-testid="checkout-empty-state">
        <div className={styles.emptyStateCard}>
          <Icon icon={Package} size="xl" aria-hidden="true" style={{ color: "#888" }} />
          <h1 className={styles.pageTitle}>No tienes productos para comprar</h1>
          <p className={styles.pageSubtitle}>
            Tu carrito de compras está vacío. Explora nuestro catálogo para agregar productos.
          </p>
          <Link href="/categorias/mouses" className={styles.continueShoppingButton}>
            Explorar catálogo
          </Link>
        </div>
      </div>
    );
  }

  const isSubmitDisabled =
    isSubmitting ||
    isRefreshingContext ||
    isCryptoUnavailable ||
    isConfigurationUnavailable ||
    isCartConverted ||
    currentContext.shippingMethods.length === 0 ||
    currentContext.paymentMethods.length === 0 ||
    !selectedShippingCode ||
    !selectedPaymentCode;

  return (
    <div className={styles.pageWrapper} data-testid="checkout-page">
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Finalizar Compra</h1>
        <p className={styles.pageSubtitle}>
          Completa tus datos de contacto, entrega y método de pago para registrar tu pedido.
        </p>
      </div>

      {generalError && (
        <div className={styles.errorAlert} role="alert" data-testid="checkout-general-error">
          <Icon icon={AlertCircle} size="md" aria-hidden="true" />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            <span>{generalError}</span>
            {isConfigurationUnavailable && (
              <div style={{ marginTop: "4px" }}>
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={RefreshCw}
                  disabled={isRefreshingContext}
                  onClick={async () => {
                    setGeneralError(null);
                    const refreshed = await refreshAuthoritativeContext({
                      type: "PRESERVE_VALID_SELECTIONS",
                    });
                    if (
                      !refreshed ||
                      refreshed.shippingMethods.length === 0 ||
                      refreshed.paymentMethods.length === 0
                    ) {
                      setIsConfigurationUnavailable(true);
                      setGeneralError(
                        "El servicio de compra no se encuentra disponible temporalmente. Por favor intenta más tarde o reintenta la carga."
                      );
                    }
                  }}
                  data-testid="checkout-retry-config-button"
                >
                  {isRefreshingContext ? "Actualizando..." : "Reintentar carga de configuración"}
                </Button>
              </div>
            )}
            {isCartConverted && (
              <div
                style={{ marginTop: "8px", display: "flex", gap: "12px" }}
                data-testid="checkout-cart-converted-actions"
              >
                {isAuthenticated ? (
                  <Link href="/cuenta/pedidos" className={styles.continueShoppingButton}>
                    Ver mis pedidos
                  </Link>
                ) : (
                  <Link href="/categorias/mouses" className={styles.continueShoppingButton}>
                    Explorar catálogo
                  </Link>
                )}
                <Link
                  href="/carrito"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 16px",
                    backgroundColor: "transparent",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-primary)",
                    borderRadius: "var(--radius-md)",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Ver carrito
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {reviewChangedWarning && (
        <div
          className={styles.warningAlert}
          role="alert"
          data-testid="checkout-review-changed-alert"
        >
          <Icon icon={AlertTriangle} size="md" aria-hidden="true" />
          <span>{reviewChangedWarning}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.checkoutGrid} noValidate>
        {/* Left Column: Checkout Sections */}
        <div className={styles.formColumn}>
          {/* Section 1: Contact Information */}
          <section className={styles.sectionCard} aria-labelledby="section-contact-heading">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>1</span>
              <h2 id="section-contact-heading" className={styles.sectionTitle}>
                Información de Contacto
              </h2>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="checkout-email" className={styles.label}>
                Correo electrónico <span className={styles.requiredMark}>*</span>
              </label>
              <input
                id="checkout-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setReviewChangedWarning(null);
                  resetAttemptId();
                }}
                disabled={isAuthenticated && Boolean(currentContext.auth.email)}
                className={[styles.input, formErrors.email ? styles.inputError : ""]
                  .filter(Boolean)
                  .join(" ")}
                placeholder="tu@correo.com"
                data-testid="checkout-input-email"
              />
              {formErrors.email && <span className={styles.fieldError}>{formErrors.email}</span>}
              <span className={styles.helpText}>
                Enviaremos la confirmación del pedido y el comprobante a esta dirección.
              </span>
            </div>
          </section>

          {/* Section 2: Delivery Address */}
          <section className={styles.sectionCard} aria-labelledby="section-delivery-heading">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>2</span>
              <h2 id="section-delivery-heading" className={styles.sectionTitle}>
                Dirección de Entrega
              </h2>
            </div>

            {/* Authenticated Mode Switcher */}
            {isAuthenticated && savedAddresses.length > 0 && (
              <div className={styles.addressModeToggle}>
                <label className={styles.modeRadio}>
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="SAVED_ADDRESS"
                    checked={deliveryMode === "SAVED_ADDRESS"}
                    onChange={() => {
                      setDeliveryMode("SAVED_ADDRESS");
                      setReviewChangedWarning(null);
                      resetAttemptId();
                    }}
                    className={styles.radioInput}
                    data-testid="checkout-mode-saved-address"
                  />
                  <div className={styles.optionContent}>
                    <span className={styles.optionTitle}>Usar dirección guardada</span>
                  </div>
                </label>

                <label className={styles.modeRadio}>
                  <input
                    type="radio"
                    name="deliveryMode"
                    value="INLINE"
                    checked={deliveryMode === "INLINE"}
                    onChange={() => {
                      setDeliveryMode("INLINE");
                      setReviewChangedWarning(null);
                      resetAttemptId();
                    }}
                    className={styles.radioInput}
                    data-testid="checkout-mode-new-address"
                  />
                  <div className={styles.optionContent}>
                    <span className={styles.optionTitle}>Ingresar nueva dirección</span>
                  </div>
                </label>
              </div>
            )}

            {/* Saved Addresses Radio List */}
            {isAuthenticated && deliveryMode === "SAVED_ADDRESS" && savedAddresses.length > 0 && (
              <div className={styles.optionsList} data-testid="checkout-saved-addresses-list">
                {savedAddresses.map((addr) => {
                  const isSelected = selectedAddressId === addr.id;
                  return (
                    <label
                      key={addr.id}
                      className={[styles.optionCard, isSelected ? styles.optionCardSelected : ""]
                        .filter(Boolean)
                        .join(" ")}
                      data-testid={`saved-address-${addr.id}`}
                    >
                      <input
                        type="radio"
                        name="savedAddress"
                        value={addr.id}
                        checked={isSelected}
                        onChange={() => {
                          setSelectedAddressId(addr.id);
                          setReviewChangedWarning(null);
                          resetAttemptId();
                        }}
                        className={styles.radioInput}
                      />
                      <div className={styles.optionContent}>
                        <div className={styles.optionTitleRow}>
                          <span className={styles.optionTitle}>{addr.recipientName}</span>
                          {addr.isDefault && (
                            <span className={styles.badgeDefault}>Predeterminada</span>
                          )}
                        </div>
                        <p className={styles.optionDescription}>
                          {addr.streetAddress}
                          {addr.apartmentSuite ? `, ${addr.apartmentSuite}` : ""}, {addr.district},{" "}
                          {addr.province}, {addr.department}
                        </p>
                        <p className={styles.optionDescription}>Telf: {addr.phone}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Inline Address Form (Guests or New Address Mode) */}
            {(deliveryMode === "INLINE" || !isAuthenticated || savedAddresses.length === 0) && (
              <div className={styles.formGrid} data-testid="checkout-inline-address-form">
                <div className={styles.formGridTwoCol}>
                  <div className={styles.formGroup}>
                    <label htmlFor="inline-recipientName" className={styles.label}>
                      Nombre del destinatario <span className={styles.requiredMark}>*</span>
                    </label>
                    <input
                      id="inline-recipientName"
                      type="text"
                      value={inlineAddress.recipientName}
                      onChange={(e) => {
                        setInlineAddress((prev) => ({ ...prev, recipientName: e.target.value }));
                        setReviewChangedWarning(null);
                        resetAttemptId();
                      }}
                      className={[styles.input, formErrors.recipientName ? styles.inputError : ""]
                        .filter(Boolean)
                        .join(" ")}
                      placeholder="Nombre y Apellidos"
                      data-testid="checkout-input-recipient-name"
                    />
                    {formErrors.recipientName && (
                      <span className={styles.fieldError}>{formErrors.recipientName}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="inline-phone" className={styles.label}>
                      Teléfono de contacto <span className={styles.requiredMark}>*</span>
                    </label>
                    <input
                      id="inline-phone"
                      type="tel"
                      value={inlineAddress.phone}
                      onChange={(e) => {
                        setInlineAddress((prev) => ({ ...prev, phone: e.target.value }));
                        setReviewChangedWarning(null);
                        resetAttemptId();
                      }}
                      className={[styles.input, formErrors.phone ? styles.inputError : ""]
                        .filter(Boolean)
                        .join(" ")}
                      placeholder="987654321"
                      data-testid="checkout-input-phone"
                    />
                    {formErrors.phone && (
                      <span className={styles.fieldError}>{formErrors.phone}</span>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="inline-streetAddress" className={styles.label}>
                    Dirección (Calle, Avenida, Jr.) <span className={styles.requiredMark}>*</span>
                  </label>
                  <input
                    id="inline-streetAddress"
                    type="text"
                    value={inlineAddress.streetAddress}
                    onChange={(e) => {
                      setInlineAddress((prev) => ({ ...prev, streetAddress: e.target.value }));
                      setReviewChangedWarning(null);
                      resetAttemptId();
                    }}
                    className={[styles.input, formErrors.streetAddress ? styles.inputError : ""]
                      .filter(Boolean)
                      .join(" ")}
                    placeholder="Av. Pardo y Aliaga 640"
                    data-testid="checkout-input-street-address"
                  />
                  {formErrors.streetAddress && (
                    <span className={styles.fieldError}>{formErrors.streetAddress}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="inline-apartmentSuite" className={styles.label}>
                    Dpto / Interior / Suite (Opcional)
                  </label>
                  <input
                    id="inline-apartmentSuite"
                    type="text"
                    value={inlineAddress.apartmentSuite}
                    onChange={(e) => {
                      setInlineAddress((prev) => ({ ...prev, apartmentSuite: e.target.value }));
                      setReviewChangedWarning(null);
                      resetAttemptId();
                    }}
                    className={styles.input}
                    placeholder="Ej: Dpto 402, Piso 3"
                    data-testid="checkout-input-apartment"
                  />
                </div>

                <div className={styles.formGridThreeCol}>
                  <div className={styles.formGroup}>
                    <label htmlFor="inline-department" className={styles.label}>
                      Departamento <span className={styles.requiredMark}>*</span>
                    </label>
                    <input
                      id="inline-department"
                      type="text"
                      value={inlineAddress.department}
                      onChange={(e) => {
                        setInlineAddress((prev) => ({ ...prev, department: e.target.value }));
                        setReviewChangedWarning(null);
                        resetAttemptId();
                      }}
                      className={[styles.input, formErrors.department ? styles.inputError : ""]
                        .filter(Boolean)
                        .join(" ")}
                      placeholder="Lima"
                      data-testid="checkout-input-department"
                    />
                    {formErrors.department && (
                      <span className={styles.fieldError}>{formErrors.department}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="inline-province" className={styles.label}>
                      Provincia <span className={styles.requiredMark}>*</span>
                    </label>
                    <input
                      id="inline-province"
                      type="text"
                      value={inlineAddress.province}
                      onChange={(e) => {
                        setInlineAddress((prev) => ({ ...prev, province: e.target.value }));
                        setReviewChangedWarning(null);
                        resetAttemptId();
                      }}
                      className={[styles.input, formErrors.province ? styles.inputError : ""]
                        .filter(Boolean)
                        .join(" ")}
                      placeholder="Lima"
                      data-testid="checkout-input-province"
                    />
                    {formErrors.province && (
                      <span className={styles.fieldError}>{formErrors.province}</span>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="inline-district" className={styles.label}>
                      Distrito <span className={styles.requiredMark}>*</span>
                    </label>
                    <input
                      id="inline-district"
                      type="text"
                      value={inlineAddress.district}
                      onChange={(e) => {
                        setInlineAddress((prev) => ({ ...prev, district: e.target.value }));
                        setReviewChangedWarning(null);
                        resetAttemptId();
                      }}
                      className={[styles.input, formErrors.district ? styles.inputError : ""]
                        .filter(Boolean)
                        .join(" ")}
                      placeholder="Miraflores"
                      data-testid="checkout-input-district"
                    />
                    {formErrors.district && (
                      <span className={styles.fieldError}>{formErrors.district}</span>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="inline-referenceNotes" className={styles.label}>
                    Referencia de entrega (Opcional)
                  </label>
                  <input
                    id="inline-referenceNotes"
                    type="text"
                    value={inlineAddress.referenceNotes}
                    onChange={(e) => {
                      setInlineAddress((prev) => ({ ...prev, referenceNotes: e.target.value }));
                      setReviewChangedWarning(null);
                      resetAttemptId();
                    }}
                    className={styles.input}
                    placeholder="Ej: Frente al parque, rejas negras"
                    data-testid="checkout-input-reference"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Shipping Method */}
          <section className={styles.sectionCard} aria-labelledby="section-shipping-heading">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>3</span>
              <h2 id="section-shipping-heading" className={styles.sectionTitle}>
                Método de Envío
              </h2>
            </div>

            {currentContext.shippingMethods.length === 0 ? (
              <div
                className={styles.warningAlert}
                role="alert"
                data-testid="checkout-no-shipping-alert"
              >
                <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                <span>No hay métodos de envío disponibles temporalmente para tu ubicación.</span>
              </div>
            ) : (
              <div className={styles.optionsList} data-testid="checkout-shipping-methods-list">
                {currentContext.shippingMethods.map((method) => {
                  const isSelected = selectedShippingCode === method.code;
                  return (
                    <label
                      key={method.code}
                      className={[styles.optionCard, isSelected ? styles.optionCardSelected : ""]
                        .filter(Boolean)
                        .join(" ")}
                      data-testid={`shipping-method-${method.code}`}
                    >
                      <input
                        type="radio"
                        name="shippingMethod"
                        value={method.code}
                        checked={isSelected}
                        onChange={() => handleShippingChange(method.code)}
                        className={styles.radioInput}
                      />
                      <div className={styles.optionContent}>
                        <div className={styles.optionTitleRow}>
                          <span className={styles.optionTitle}>{method.name}</span>
                          <span className={styles.optionPrice}>
                            {formatCurrency(method.basePriceCents)}
                          </span>
                        </div>
                        {method.estimatedDaysMin !== null && method.estimatedDaysMax !== null && (
                          <p className={styles.optionDescription}>
                            Tiempo estimado: {method.estimatedDaysMin} a {method.estimatedDaysMax}{" "}
                            días hábiles
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 4: Payment Method (GP-018 Strict Safe Boundary) */}
          <section className={styles.sectionCard} aria-labelledby="section-payment-heading">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>4</span>
              <h2 id="section-payment-heading" className={styles.sectionTitle}>
                Método de Pago
              </h2>
            </div>

            {currentContext.paymentMethods.length === 0 ? (
              <div
                className={styles.warningAlert}
                role="alert"
                data-testid="checkout-no-payment-alert"
              >
                <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                <span>No hay métodos de pago disponibles en este momento.</span>
              </div>
            ) : (
              <div className={styles.optionsList} data-testid="checkout-payment-methods-list">
                {currentContext.paymentMethods.map((method) => {
                  const isSelected = selectedPaymentCode === method.code;
                  return (
                    <label
                      key={method.code}
                      className={[styles.optionCard, isSelected ? styles.optionCardSelected : ""]
                        .filter(Boolean)
                        .join(" ")}
                      data-testid={`payment-method-${method.code}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.code}
                        checked={isSelected}
                        onChange={() => handlePaymentChange(method.code)}
                        className={styles.radioInput}
                      />
                      <div className={styles.optionContent}>
                        <span className={styles.optionTitle}>{method.name}</span>
                        <p className={styles.optionDescription}>
                          Pago seguro mediante billetera digital o transferencia bancaria en Soles
                          (PEN).
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Strict GP-019 Neutral Privacy Disclaimer */}
            <div className={styles.paymentNoticeBox} data-testid="checkout-payment-notice">
              <Icon
                icon={ShieldCheck}
                size="md"
                className={styles.paymentNoticeIcon}
                aria-hidden="true"
              />
              <p className={styles.paymentNoticeText}>
                Tu pedido se registrará con estado <strong>Pendiente de Pago</strong>. Al confirmar
                la compra, recibirás los detalles para coordinar tu pago de forma segura.
              </p>
            </div>
          </section>
        </div>

        {/* Right Column: Order Summary & Review */}
        <div className={styles.summaryColumn}>
          <div className={styles.stickySummary} data-testid="checkout-order-summary">
            <h2 className={styles.summaryHeading}>Resumen del Pedido</h2>

            {/* Items List */}
            <div className={styles.itemsList}>
              {cart.items.map((item) => (
                <div
                  key={item.variantId}
                  className={styles.itemRow}
                  data-testid={`checkout-item-${item.sku}`}
                >
                  <div className={styles.itemDetails}>
                    <span className={styles.itemName}>
                      {item.productName} × {item.quantity}
                    </span>
                    <span className={styles.itemMeta}>SKU: {item.sku}</span>
                  </div>
                  <span className={styles.itemPrice}>{formatCurrency(item.lineTotalCents)}</span>
                </div>
              ))}
            </div>

            {/* Pricing Totals */}
            <div className={styles.pricingRows}>
              <div className={styles.priceRow}>
                <span>
                  Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})
                </span>
                <span data-testid="checkout-subtotal-value">
                  {formatCurrency(reviewedSubtotalCents)}
                </span>
              </div>

              <div className={styles.priceRow}>
                <span>Envío</span>
                <span data-testid="checkout-shipping-value">
                  {selectedShippingCode ? formatCurrency(reviewedShippingCents) : "—"}
                </span>
              </div>

              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total</span>
                <span className={styles.totalValue} data-testid="checkout-total-value">
                  {formatCurrency(reviewedTotalCents)}
                </span>
              </div>
            </div>

            {/* Primary Submit CTA */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={isSubmitDisabled}
              className={styles.submitButton}
              data-testid="checkout-submit-button"
            >
              {isSubmitting
                ? "Procesando pedido..."
                : isRefreshingContext
                  ? "Actualizando..."
                  : "Realizar Pedido"}
              {!isSubmitting && !isRefreshingContext && (
                <Icon
                  icon={ArrowRight}
                  size="sm"
                  aria-hidden="true"
                  style={{ marginLeft: "8px" }}
                />
              )}
            </Button>

            <div className={styles.securityFooter}>
              <Icon icon={Lock} size="sm" aria-hidden="true" />
              <span>Transacción cifrada y protegida por Gamer Perú</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
