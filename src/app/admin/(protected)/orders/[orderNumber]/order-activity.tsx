"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminNotePage, AdminTimelinePage, AdminTimelineType } from "@/lib/admin/orders/types";
import { createAdminOrderNoteAction } from "@/lib/admin/orders/actions";
import { formatLimaDateTime } from "./order-detail-format";
import { loadOlderAdminNotes, loadOlderAdminTimeline } from "./pagination-actions";
import styles from "./order-detail.module.css";

interface OrderActivityProps {
  orderNumber: string;
  initialNotes: AdminNotePage;
  initialTimeline: AdminTimelinePage;
}

const timelineLabels: Record<AdminTimelineType, string> = {
  ORDER_PLACED: "Pedido registrado",
  PAYMENT_SUBMITTED: "Comprobante enviado",
  ORDER_CONFIRMED: "Pedido confirmado",
  ORDER_CANCELLED: "Pedido cancelado",
  REFUND_ISSUED: "Reembolso registrado",
  SHIPMENT_DISPATCHED: "Envío despachado",
  ORDER_DELIVERED: "Envío entregado",
  INTERNAL_NOTE: "Nota interna",
};

function appendUniqueNotes(current: AdminNotePage["notes"], older: AdminNotePage["notes"]) {
  const ids = new Set(current.map((note) => note.id));
  return [...current, ...older.filter((note) => !ids.has(note.id))];
}

function prependUniqueEvents(
  current: AdminTimelinePage["entries"],
  older: AdminTimelinePage["entries"]
) {
  const ids = new Set(current.map((entry) => entry.id));
  return [...older.filter((entry) => !ids.has(entry.id)), ...current];
}

export function OrderActivity({ orderNumber, initialNotes, initialTimeline }: OrderActivityProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes.notes);
  const [noteCursor, setNoteCursor] = useState(initialNotes.olderCursor);
  const [timeline, setTimeline] = useState(initialTimeline.entries);
  const [timelineCursor, setTimelineCursor] = useState(initialTimeline.olderCursor);
  const [body, setBody] = useState("");
  const [noteFeedback, setNoteFeedback] = useState("");
  const [notesFeedback, setNotesFeedback] = useState("");
  const [timelineFeedback, setTimelineFeedback] = useState("");
  const [pendingNotice, setPendingNotice] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [notesBusy, setNotesBusy] = useState(false);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const noteBusyRef = useRef(false);
  const noteIntentRef = useRef<{ id: string; body: string } | null>(null);

  useEffect(() => {
    setNotes(initialNotes.notes);
    setNoteCursor(initialNotes.olderCursor);
  }, [initialNotes]);

  useEffect(() => {
    setTimeline(initialTimeline.entries);
    setTimelineCursor(initialTimeline.olderCursor);
  }, [initialTimeline]);

  async function loadOlderNotes() {
    if (!noteCursor || notesBusy) return;
    setNotesBusy(true);
    setNotesFeedback("");
    try {
      const result = await loadOlderAdminNotes(orderNumber, noteCursor);
      if (result.status === "READY") {
        setNotes((current) => appendUniqueNotes(current, result.page.notes));
        setNoteCursor(result.page.olderCursor);
      } else {
        setNotesFeedback(
          result.status === "INVALID_INPUT"
            ? "La página de notas ya no es válida. Actualiza el pedido."
            : "No pudimos cargar notas anteriores. Intenta otra vez."
        );
      }
    } catch {
      setNotesFeedback("No pudimos cargar notas anteriores. Intenta otra vez.");
    } finally {
      setNotesBusy(false);
    }
  }

  async function loadOlderTimeline() {
    if (!timelineCursor || timelineBusy) return;
    setTimelineBusy(true);
    setTimelineFeedback("");
    try {
      const result = await loadOlderAdminTimeline(orderNumber, timelineCursor);
      if (result.status === "READY") {
        setTimeline((current) => prependUniqueEvents(current, result.page.entries));
        setTimelineCursor(result.page.olderCursor);
      } else {
        setTimelineFeedback(
          result.status === "INVALID_INPUT"
            ? "La página de actividad ya no es válida. Actualiza el pedido."
            : "No pudimos cargar actividad anterior. Intenta otra vez."
        );
      }
    } catch {
      setTimelineFeedback("No pudimos cargar actividad anterior. Intenta otra vez.");
    } finally {
      setTimelineBusy(false);
    }
  }

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteBusyRef.current) return;
    const normalized = body.replace(/\r\n?/g, "\n").trim();
    if (
      !normalized ||
      Array.from(normalized).length > 2000 ||
      /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(normalized.replace(/\n/g, ""))
    ) {
      setNoteFeedback("Escribe una nota de 1 a 2,000 caracteres válidos.");
      return;
    }
    if (noteIntentRef.current && noteIntentRef.current.body !== normalized) {
      setNoteFeedback("Restaura exactamente el texto original antes de reintentar esta nota.");
      return;
    }
    const intent = noteIntentRef.current ?? { id: crypto.randomUUID(), body: normalized };
    noteIntentRef.current = intent;

    noteBusyRef.current = true;
    setNoteBusy(true);
    setPendingNotice(true);
    setNoteFeedback("");
    try {
      const result = await createAdminOrderNoteAction({
        orderNumber,
        body: normalized,
        mutationRequestId: intent.id,
      });
      if (result.success) {
        noteIntentRef.current = null;
        setPendingNotice(false);
        setBody("");
        setNotes((current) =>
          current.some((note) => note.id === result.note.id)
            ? current
            : [{ ...result.note, authorAuthUserId: null }, ...current]
        );
        setNoteFeedback(
          result.replayed
            ? "La nota ya estaba guardada. No se creó una segunda nota."
            : "Nota interna guardada."
        );
        router.refresh();
      } else {
        setNoteFeedback(
          result.code === "IDEMPOTENCY_CONFLICT"
            ? "Este intento no coincide con la nota original. Revisa el pedido antes de crear otra intención."
            : result.code === "INVALID_INPUT"
              ? "La nota no es válida. Revisa el texto e intenta con el mismo identificador."
              : "No pudimos confirmar la nota. Reintenta con el mismo texto; no crees otra intención."
        );
        if (result.code === "SYSTEM_ERROR") router.refresh();
      }
    } catch {
      setNoteFeedback(
        "El resultado es incierto. Reintenta con el mismo texto; se conservará el identificador."
      );
      router.refresh();
    } finally {
      noteBusyRef.current = false;
      setNoteBusy(false);
    }
  }

  return (
    <div className={styles.activityGrid}>
      <section className={styles.section} aria-labelledby="order-timeline-title">
        <h2 id="order-timeline-title">Actividad del pedido</h2>
        {timeline.length === 0 ? (
          <p className={styles.muted}>Todavía no hay eventos registrados.</p>
        ) : (
          <ol className={styles.timelineList}>
            {timeline.map((entry) => (
              <li
                key={entry.id}
                className={
                  entry.type === "INTERNAL_NOTE" ? styles.timelineInternal : styles.timelineEntry
                }
              >
                <div className={styles.timelineHeading}>
                  <strong>{timelineLabels[entry.type]}</strong>
                  <time dateTime={entry.timestamp}>{formatLimaDateTime(entry.timestamp)}</time>
                </div>
                {entry.type === "INTERNAL_NOTE" && entry.noteBody && (
                  <p className={styles.multiline}>{entry.noteBody}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {timelineCursor && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={loadOlderTimeline}
            disabled={timelineBusy}
          >
            {timelineBusy ? "Cargando actividad…" : "Cargar actividad anterior"}
          </button>
        )}
        {timelineFeedback && (
          <p role="alert" className={styles.feedbackError}>
            {timelineFeedback}
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="order-notes-title">
        <h2 id="order-notes-title">Notas internas</h2>
        <p className={styles.muted}>Solo el personal autorizado puede ver estas notas.</p>
        <form className={styles.noteForm} onSubmit={submitNote}>
          <label htmlFor="order-note-body">Nueva nota</label>
          <textarea
            id="order-note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Registra contexto operativo sin datos de pago privados"
          />
          <div className={styles.noteActions}>
            <span>{Array.from(body).length}/2,000 caracteres</span>
            <button type="submit" className={styles.primaryButton} disabled={noteBusy}>
              {noteBusy ? "Guardando…" : "Guardar nota"}
            </button>
          </div>
          {pendingNotice && (
            <p className={styles.pendingNotice}>
              Hay un intento pendiente. Reintenta con el mismo texto para confirmar el resultado; se
              conservará su identificador mientras esta página siga abierta.
            </p>
          )}
          {noteFeedback && (
            <p
              role={noteFeedback.includes("guardada") ? "status" : "alert"}
              className={styles.feedback}
            >
              {noteFeedback}
            </p>
          )}
        </form>
        {notes.length === 0 ? (
          <p className={styles.muted}>No hay notas internas.</p>
        ) : (
          <div className={styles.noteList}>
            {notes.map((note) => (
              <article className={styles.noteCard} key={note.id}>
                <time dateTime={note.createdAt}>{formatLimaDateTime(note.createdAt)}</time>
                <p className={styles.multiline}>{note.body}</p>
              </article>
            ))}
          </div>
        )}
        {noteCursor && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={loadOlderNotes}
            disabled={notesBusy}
          >
            {notesBusy ? "Cargando notas…" : "Cargar notas anteriores"}
          </button>
        )}
        {notesFeedback && (
          <p role="alert" className={styles.feedbackError}>
            {notesFeedback}
          </p>
        )}
      </section>
    </div>
  );
}
