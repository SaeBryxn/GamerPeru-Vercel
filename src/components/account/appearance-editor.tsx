"use client";
import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Blobatar } from "@blobatar/react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/input/text-field";
import { defaultCustomerAppearance, type CustomerAppearance } from "@/lib/account/appearance";
import { updateCustomerAppearanceAction } from "@/lib/account/appearance-actions";
import styles from "./appearance-editor.module.css";

export function AppearanceEditor({
  initialAppearance,
  firstName,
  fallbackSeed,
  available = true,
}: {
  initialAppearance: CustomerAppearance;
  firstName: string;
  fallbackSeed: string;
  available?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [saved, setSaved] = useState(initialAppearance);
  const [draft, setDraft] = useState(initialAppearance);
  const [batch, setBatch] = useState(initialAppearance.avatarSeed.slice(0, 90) || "gamerperu");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const seeds = [
    ...new Set(
      [
        saved.avatarSeed,
        ...Array.from({ length: 6 }, (_, index) => `${batch}-${index + 1}`),
      ].filter(Boolean)
    ),
  ].slice(0, 6);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (patch: Partial<CustomerAppearance>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage("");
    setError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await updateCustomerAppearanceAction(draft);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(result.appearance);
      setDraft(result.appearance);
      setMessage("Tu perfil ya tiene tu estilo.");
      router.refresh();
    } catch {
      setError("No pudimos conectar. Vuelve a guardar tus cambios.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section
      className={styles.editor}
      aria-labelledby={`${id}-title`}
      data-testid="appearance-editor"
    >
      <div className={styles.preview} data-accent={draft.accent}>
        <span className={styles.eyebrow}>Así te verás en tu cuenta</span>
        <Blobatar
          name={draft.avatarSeed || fallbackSeed}
          size={100}
          alt="Vista previa de tu avatar"
        />
        <strong>{draft.displayName || firstName}</strong>
        <span>Tu espacio en Gamer Perú</span>
      </div>
      <form className={styles.controls} onSubmit={save}>
        <div>
          <h2 id={`${id}-title`}>Hazlo tuyo</h2>
          <p>Elige cómo quieres verte. Tus datos de entrega se editan por separado.</p>
        </div>
        <fieldset disabled={pending || !available} className={styles.fields}>
          <TextField
            label="Nombre visible"
            value={draft.displayName}
            maxLength={40}
            autoComplete="nickname"
            placeholder={firstName}
            onChange={(event) => update({ displayName: event.target.value })}
            description="Un nombre o alias para tu cuenta. No cambia el nombre de tus pedidos."
          />
          <div className={styles.avatarHeading}>
            <span>Tu avatar</span>
            <button type="button" onClick={() => setBatch(crypto.randomUUID())}>
              <RefreshCw size={14} aria-hidden="true" />
              Ver otros
            </button>
          </div>
          <div className={styles.avatars} role="group" aria-label="Elige tu avatar">
            {seeds.map((seed, index) => (
              <button
                key={seed}
                type="button"
                aria-label={`Avatar ${index + 1}`}
                aria-pressed={draft.avatarSeed === seed}
                onClick={() => update({ avatarSeed: seed })}
              >
                <Blobatar name={seed} size={48} alt="" />
                {draft.avatarSeed === seed && (
                  <Check size={14} className={styles.selected} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className={styles.tones} role="group" aria-label="Estilo de portada">
            <span>Portada</span>
            <button
              type="button"
              aria-pressed={draft.accent === "red"}
              onClick={() => update({ accent: "red" })}
            >
              Rojo Gamer Perú
            </button>
            <button
              type="button"
              aria-pressed={draft.accent === "neutral"}
              onClick={() => update({ accent: "neutral" })}
            >
              Negro
            </button>
          </div>
        </fieldset>
        {!available && (
          <p role="alert">
            No pudimos cargar tu personalización. Recarga la página antes de editarla.
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <p role="status" aria-live="polite" className={styles.status}>
          {message || (changed ? "Tienes cambios sin guardar." : "")}
        </p>
        <div className={styles.actions}>
          <Button type="submit" disabled={pending || !available || !changed}>
            {pending ? "Guardando…" : "Guardar mi estilo"}
          </Button>
          <button
            type="button"
            disabled={pending || !available}
            onClick={() => update(defaultCustomerAppearance())}
          >
            Restablecer
          </button>
        </div>
      </form>
    </section>
  );
}
