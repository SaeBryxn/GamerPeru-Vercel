"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "@/components/app-link";
import { DomeButton } from "@/components/ui";
import { getReviewEligibilityAction, submitReviewAction } from "@/lib/reviews/actions";
import {
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  type ReviewEligibility,
} from "@/lib/reviews/types";
import styles from "./pdp-reviews.module.css";

const STATUS_MESSAGE: Record<"PENDING" | "APPROVED" | "REJECTED", string> = {
  PENDING: "Recibimos tu opinión. La publicaremos cuando la revisemos.",
  APPROVED: "Gracias, tu opinión ya está publicada.",
  REJECTED: "Tu opinión no se publicó. Escríbenos por WhatsApp si quieres saber por qué.",
};

/**
 * The review form, shown only to a customer who received the product. Eligibility is asked per
 * visitor after load: the product page itself is cached and the same for everyone.
 */
export function PdpReviewForm({ productId }: { productId: string }): React.JSX.Element | null {
  const id = useId();
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getReviewEligibilityAction(productId).then((result) => {
      if (active) setEligibility(result);
    });
    return () => {
      active = false;
    };
  }, [productId]);

  if (!eligibility || eligibility.state === "NOT_PURCHASED") return null;

  if (eligibility.state === "ANONYMOUS") {
    return (
      <p className={styles.formNote}>
        ¿Ya lo compraste? <Link href="/auth/login">Inicia sesión</Link> para dejar tu opinión.
      </p>
    );
  }

  if (eligibility.state === "ALREADY_REVIEWED") {
    return (
      <p className={styles.formNote} role="status">
        {STATUS_MESSAGE[eligibility.status]}
      </p>
    );
  }

  if (!isOpen) {
    return (
      <DomeButton tone="dark" className={styles.writeButton} onClick={() => setIsOpen(true)}>
        Escribir una opinión
      </DomeButton>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (rating === 0) {
      setError("Elige de 1 a 5 estrellas.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await submitReviewAction({ productId, rating, title, body });
    setPending(false);
    if (result.ok) {
      setEligibility({ state: "ALREADY_REVIEWED", status: "PENDING" });
      return;
    }
    if (result.reason === "ALREADY_REVIEWED") {
      setEligibility({ state: "ALREADY_REVIEWED", status: "PENDING" });
      return;
    }
    setError(result.message);
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <fieldset className={styles.starPicker}>
        <legend>Tu calificación</legend>
        <div className={styles.starOptions}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label key={star} className={styles.starOption} data-active={star <= rating}>
              <input
                type="radio"
                name={`${id}-rating`}
                value={star}
                checked={rating === star}
                onChange={() => setRating(star)}
                className={styles.srOnly}
              />
              <span aria-hidden="true">★</span>
              <span className={styles.srOnly}>
                {star} {star === 1 ? "estrella" : "estrellas"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.field}>
        <span>Título (opcional)</span>
        <input
          type="text"
          value={title}
          maxLength={REVIEW_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Tu opinión</span>
        <textarea
          value={body}
          rows={5}
          minLength={REVIEW_BODY_MIN}
          maxLength={REVIEW_BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
          required
        />
        <small>
          {body.trim().length}/{REVIEW_BODY_MAX} · mínimo {REVIEW_BODY_MIN} caracteres
        </small>
      </label>

      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <DomeButton type="submit" tone="dark" disabled={pending}>
          {pending ? "Enviando…" : "Enviar opinión"}
        </DomeButton>
        <button type="button" className={styles.cancel} onClick={() => setIsOpen(false)}>
          Cancelar
        </button>
      </div>
      <p className={styles.formNote}>Revisamos cada opinión antes de publicarla.</p>
    </form>
  );
}
