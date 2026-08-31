"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, Lock, Package, ShieldCheck, ArrowRight } from "lucide-react";
import { Button, Icon } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";
import { submitCheckoutAction } from "@/lib/checkout/actions";
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

export function CheckoutPageClient({ context }: CheckoutPageClientProps): React.JSX.Element {
  const router = useRouter();

  const cart = context.cart;
  const isAuthenticated = context.auth.status === "AUTHENTICATED";
  const savedAddresses = context.auth.status === "AUTHENTICATED" ? context.auth.addresses : [];

  // Default address resolution
  const defaultSavedAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];

  // 1. Form States
  const [email, setEmail] = useState(context.auth.email ?? "");
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
    context.shippingMethods.length > 0 ? context.shippingMethods[0]!.code : ""
  );

  const [selectedPaymentCode, setSelectedPaymentCode] = useState<string>(
    context.paymentMethods.length > 0 ? context.paymentMethods[0]!.code : ""
  );

  // 2. Submission & Error States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [reviewChangedWarning, setReviewChangedWarning] = useState<string | null>(null);

  // 3. Attempt ID Lifecycle (Cryptographically secure UUIDv4 per intent)
  const attemptIdRef = useRef<string>("");
  if (!attemptIdRef.current) {
    attemptIdRef.current = generateSecureCheckoutAttemptId();
  }

  const resetAttemptId = () => {
    attemptIdRef.current = generateSecureCheckoutAttemptId();
  };

  // 4. Reviewed Pricing States (Authoritative Server Synchronization)
  const initialSubtotal = cart?.subtotalCents ?? 0;
  const selectedShipping = context.shippingMethods.find((s) => s.code === selectedShippingCode);
  const initialShipping = selectedShipping?.basePriceCents ?? 0;

  const [reviewedSubtotalCents, setReviewedSubtotalCents] = useState<number>(initialSubtotal);
  const [reviewedShippingCents, setReviewedShippingCents] = useState<number>(initialShipping);
  const [reviewedTotalCents, setReviewedTotalCents] = useState<number>(
    initialSubtotal + initialShipping
  );

  const handleShippingChange = (code: string) => {
    setSelectedShippingCode(code);
    const method = context.shippingMethods.find((m) => m.code === code);
    const newShippingCents = method?.basePriceCents ?? 0;
    setReviewedShippingCents(newShippingCents);
    setReviewedTotalCents(reviewedSubtotalCents + newShippingCents);
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

      // Handle typed errors
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
        setSelectedShippingCode("");
        resetAttemptId();
      } else if (res.code === "PAYMENT_METHOD_UNAVAILABLE") {
        setGeneralError(
          "El método de pago seleccionado ya no está disponible. Por favor selecciona otro método de pago."
        );
        setSelectedPaymentCode("");
        resetAttemptId();
      } else if (res.code === "CHECKOUT_CONFIGURATION_UNAVAILABLE") {
        setGeneralError(
          "El servicio de compra no se encuentra disponible temporalmente. Por favor intenta más tarde."
        );
      } else if (res.code === "CART_ALREADY_CONVERTED") {
        setGeneralError("Este carrito ya fue procesado en un pedido anterior.");
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
          <span>{generalError}</span>
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
                disabled={isAuthenticated && Boolean(context.auth.email)}
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

            {context.shippingMethods.length === 0 ? (
              <div className={styles.warningAlert} role="alert">
                <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                <span>No hay métodos de envío disponibles temporalmente para tu ubicación.</span>
              </div>
            ) : (
              <div className={styles.optionsList} data-testid="checkout-shipping-methods-list">
                {context.shippingMethods.map((method) => {
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

            {context.paymentMethods.length === 0 ? (
              <div className={styles.warningAlert} role="alert">
                <Icon icon={AlertTriangle} size="sm" aria-hidden="true" />
                <span>No hay métodos de pago disponibles en este momento.</span>
              </div>
            ) : (
              <div className={styles.optionsList} data-testid="checkout-payment-methods-list">
                {context.paymentMethods.map((method) => {
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
                        onChange={() => {
                          setSelectedPaymentCode(method.code);
                          setReviewChangedWarning(null);
                          resetAttemptId();
                        }}
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
                  {selectedShipping ? formatCurrency(reviewedShippingCents) : "—"}
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
              disabled={
                isSubmitting ||
                context.shippingMethods.length === 0 ||
                context.paymentMethods.length === 0
              }
              className={styles.submitButton}
              data-testid="checkout-submit-button"
            >
              {isSubmitting ? "Procesando pedido..." : "Realizar Pedido"}
              {!isSubmitting && (
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
