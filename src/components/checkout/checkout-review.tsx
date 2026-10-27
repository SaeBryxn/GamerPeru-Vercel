"use client";
import React from "react";
import { CheckCircle2, Mail, MapPin, Truck, Wallet } from "lucide-react";
import type { CustomerAddressDTO } from "@/lib/account/types";
import type {
  CheckoutShippingMethodOption,
  CheckoutPaymentMethodOption,
} from "@/lib/checkout/types";
import styles from "./checkout-page-client.module.css";

type ReviewAddress = Pick<
  CustomerAddressDTO,
  | "recipientName"
  | "phone"
  | "streetAddress"
  | "apartmentSuite"
  | "district"
  | "province"
  | "department"
  | "referenceNotes"
>;
export function CheckoutReview({
  email,
  address,
  shipping,
  payment,
  onEdit,
  busy = false,
}: {
  email: string;
  address: ReviewAddress | undefined;
  shipping?: CheckoutShippingMethodOption;
  payment?: CheckoutPaymentMethodOption;
  onEdit: (section?: "contact" | "delivery" | "shipping" | "payment") => void;
  busy?: boolean;
}) {
  return (
    <section
      className={styles.reviewCard}
      aria-labelledby="checkout-review-title"
      data-testid="checkout-final-review"
    >
      <div className={styles.reviewIntro}>
        <CheckCircle2 size={26} aria-hidden="true" />
        <div>
          <h2 id="checkout-review-title" tabIndex={-1}>
            Comprueba tu pedido
          </h2>
          <p>Todo listo. Revisa estos datos antes de confirmarlo.</p>
        </div>
      </div>
      <dl className={styles.reviewDetails}>
        <div>
          <dt>
            <Mail size={17} aria-hidden="true" />
            Contacto
            <button type="button" disabled={busy} onClick={() => onEdit("contact")}>
              Editar contacto
            </button>
          </dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>
            <MapPin size={17} aria-hidden="true" />
            Entrega
            <button type="button" disabled={busy} onClick={() => onEdit("delivery")}>
              Editar entrega
            </button>
          </dt>
          <dd>
            {address && (
              <>
                <strong>{address.recipientName}</strong>
                <span>
                  {address.streetAddress}
                  {address.apartmentSuite ? `, ${address.apartmentSuite}` : ""}
                </span>
                <span>
                  {address.district}, {address.province}, {address.department}
                </span>
                <span>{address.phone}</span>
                {address.referenceNotes && <small>Referencia: {address.referenceNotes}</small>}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Truck size={17} aria-hidden="true" />
            Envío
            <button type="button" disabled={busy} onClick={() => onEdit("shipping")}>
              Cambiar envío
            </button>
          </dt>
          <dd>
            {shipping?.name}
            {shipping?.estimatedDaysMin != null && shipping?.estimatedDaysMax != null && (
              <span>
                {shipping.estimatedDaysMin}–{shipping.estimatedDaysMax} días hábiles estimados
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Wallet size={17} aria-hidden="true" />
            Pago
            <button type="button" disabled={busy} onClick={() => onEdit("payment")}>
              Cambiar pago
            </button>
          </dt>
          <dd>
            {payment?.name}
            <span>
              Después de confirmar verás las instrucciones y podrás enviar tu comprobante.
            </span>
          </dd>
        </div>
      </dl>
      <p className={styles.reviewFootnote}>
        Confirmar registra tu pedido pendiente de pago. Todavía no se realiza ningún cobro.
      </p>
    </section>
  );
}
