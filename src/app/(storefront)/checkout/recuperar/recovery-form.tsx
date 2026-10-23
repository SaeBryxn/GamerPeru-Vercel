"use client";
import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  redeemGuestOrderAccessAction,
  requestGuestOrderAccessAction,
} from "@/lib/orders/guest-recovery-actions";
import { Button } from "@/components/ui";
import styles from "@/components/checkout/checkout-page-client.module.css";
export function GuestOrderRecovery() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    setToken(params.get("token") ?? "");
    setOrderNumber(params.get("pedido") ?? "");
    if (location.hash) history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <section className={styles.pageWrapper}>
      <h1 className={styles.pageTitle}>Recuperar mi pedido</h1>
      <p className={styles.pageSubtitle}>
        {token
          ? "Este enlace permite abrir solo tu pedido y vence en 24 horas desde su emisión. No lo compartas."
          : "Ingresa el número de pedido y el correo que usaste al comprar como invitado."}
      </p>
      <form
        className={styles.sectionCard}
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              if (token) {
                const result = await redeemGuestOrderAccessAction({ orderNumber, token });
                if (result.success) router.replace(result.href);
                else {
                  setToken("");
                  setMessage("El enlace venció o no es válido. Solicita otro con tus datos.");
                }
              } else {
                const result = await requestGuestOrderAccessAction({ orderNumber, email });
                setMessage(result.message);
              }
            } catch {
              setMessage("No pudimos procesar la solicitud. Intenta de nuevo más tarde.");
            }
          });
        }}
      >
        {!token && (
          <>
            <label className={styles.label}>
              Número de pedido
              <input
                className={styles.input}
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                required
                maxLength={60}
              />
            </label>
            <label className={styles.label}>
              Correo de la compra
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </label>
          </>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Procesando…" : token ? "Abrir mi pedido" : "Solicitar enlace temporal"}
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
