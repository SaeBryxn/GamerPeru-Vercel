"use client";
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { configureProfileAdminAction } from "@/lib/ai/admin/actions";
import { inspectAutofillRuntimeAdminAction } from "@/lib/ai/admin/runtime-status";
import type { AdminAiSettingsDto } from "@/lib/ai/admin/types";
import styles from "./ai-admin.module.css";
const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export function AiAutofillSetup({ settings }: { settings: AdminAiSettingsDto }) {
  const router = useRouter();
  const profile = settings.profiles.find((item) => item.profileKey === "PRODUCT_RESEARCH_FAST");
  const providers = settings.providers.filter(
    (provider) => provider.isEnabled && provider.researchExecutionSupported
  );
  const defaultProvider =
    providers.find((provider) => provider.id === profile?.providerId) ??
    providers.find((provider) => provider.isDefault) ??
    providers[0];
  const [providerId, setProviderId] = useState(defaultProvider?.id ?? "");
  const [modelId, setModelId] = useState(
    profile?.providerId === defaultProvider?.id
      ? (profile?.modelId ?? "")
      : defaultProvider?.providerKey === "cloudflare"
        ? CF_MODEL
        : ""
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Awaited<
    ReturnType<typeof inspectAutofillRuntimeAdminAction>
  > | null>(null);
  const selected = providers.find((provider) => provider.id === providerId);
  return (
    <section
      id="autofill-profile"
      className={styles.profileCard}
      aria-labelledby="autofill-setup-title"
    >
      <h2 id="autofill-setup-title">Preparar autocompletado de productos</h2>
      <p>
        1. Elige una conexión activa. 2. Guarda el modelo. 3. Comprueba qué falta antes de
        investigar.
      </p>
      {providers.length === 0 ? (
        <p>Primero habilita y guarda una conexión en la sección de proveedores.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              try {
                const result = await configureProfileAdminAction({
                  profileKey: "PRODUCT_RESEARCH_FAST",
                  providerId,
                  modelId,
                  temperature: profile?.temperature ?? "0.20",
                  maxTokens: profile?.maxTokens ?? 4096,
                  isEnabled: true,
                });
                setMessage(
                  result.success
                    ? "Perfil de autocompletado guardado. Puedes volver al producto o comprobar la configuración."
                    : (result.error ?? "No se pudo guardar.")
                );
                if (result.success) {
                  setChecks(null);
                  router.refresh();
                }
              } catch {
                setMessage("No se pudo conectar. Puedes reintentar sin crear otro perfil.");
              }
            });
          }}
        >
          <label className={styles.field}>
            <span>Conexión para autocompletar</span>
            <select
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                const next = providers.find((provider) => provider.id === event.target.value);
                setModelId(
                  next?.providerKey === "cloudflare"
                    ? CF_MODEL
                    : profile && profile.providerId === next?.id
                      ? profile.modelId
                      : ""
                );
                setChecks(null);
              }}
              disabled={pending}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Modelo para autocompletar</span>
            <input
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              maxLength={100}
              required
              disabled={pending}
            />
          </label>
          <p>
            Se guarda como PRODUCT RESEARCH FAST. Los perfiles avanzados de abajo siguen
            disponibles.
          </p>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={pending || !providerId || !modelId.trim()}
          >
            Guardar configuración de autocompletado
          </button>
        </form>
      )}
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setChecks(await inspectAutofillRuntimeAdminAction());
              setMessage(
                "La configuración detectada no garantiza que Inngest haya recibido un trabajo. Confírmalo con la primera investigación."
              );
            } catch {
              setMessage("No se pudo comprobar la configuración. Revisa tu sesión y permisos.");
            }
          })
        }
      >
        Comprobar disponibilidad
      </button>
      {checks && (
        <ul>
          {(
            [
              ["Perfil habilitado", checks.profileReady],
              ["Proveedor y acceso configurados", checks.providerReady],
              ["Identificación del lector web", checks.fetchReady],
              ["Búsqueda por nombre", checks.searchReady],
              ["Envío y recepción en segundo plano configurados", checks.backgroundConfigured],
              ...(selected?.providerKey === "cloudflare"
                ? [["Binding AI del Worker", checks.bindingReady]]
                : []),
            ] as Array<[string, boolean]>
          ).map(([label, ready]) => (
            <li key={label}>
              {label}: {ready ? "Configurado" : "Falta configurar"}
            </li>
          ))}
        </ul>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
