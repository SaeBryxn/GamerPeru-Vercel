"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCw,
  Save,
  ServerCog,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  configureProfileAdminAction,
  configureProviderAdminAction,
  revokeCredentialAdminAction,
  rotateCredentialKeyAdminAction,
  saveCredentialAdminAction,
  testCredentialAdminAction,
} from "@/lib/ai/admin/actions";
import {
  ADMIN_AI_PROFILE_KEYS,
  ADMIN_AI_PROVIDER_KEYS,
  type AdminAiActionResult,
  type AdminAiProfileDto,
  type AdminAiProviderDto,
  type AdminAiProviderKey,
  type AdminAiSettingsDto,
} from "@/lib/ai/admin/types";
import styles from "@/components/admin/ai-admin.module.css";

interface AiSettingsWorkspaceProps {
  initialSettings: AdminAiSettingsDto;
}

type Notice = { tone: "success" | "error" | "info"; text: string };

const DEFAULT_PROVIDER_NAMES: Record<AdminAiProviderKey, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function formatDate(value: string | null): string {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function ProviderCard({
  providerKey,
  provider,
  onNotice,
}: {
  providerKey: AdminAiProviderKey;
  provider?: AdminAiProviderDto;
  onNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(
    provider?.displayName ?? DEFAULT_PROVIDER_NAMES[providerKey]
  );
  const [enabled, setEnabled] = useState(provider?.isEnabled ?? false);
  const [isDefault, setIsDefault] = useState(provider?.isDefault ?? false);
  const [settingsJson, setSettingsJson] = useState(
    JSON.stringify(provider?.settings ?? {}, null, 2)
  );
  const [apiKey, setApiKey] = useState("");
  const [confirmation, setConfirmation] = useState<"replace" | "revoke" | null>(null);
  const [pending, startTransition] = useTransition();

  function finish<T>(result: AdminAiActionResult<T>, success: string) {
    if (!result.success) {
      onNotice({ tone: "error", text: result.error ?? "No se pudo completar la operación." });
      return false;
    }
    onNotice({ tone: "success", text: success });
    router.refresh();
    return true;
  }

  function saveProvider() {
    startTransition(async () => {
      finish(
        await configureProviderAdminAction({
          providerKey,
          displayName,
          isEnabled: enabled,
          isDefault,
          settingsJson,
        }),
        "Configuración no secreta guardada."
      );
    });
  }

  function saveKey() {
    if (provider?.credential) {
      setConfirmation("replace");
      return;
    }
    performSaveKey();
  }

  function performSaveKey() {
    if (!provider) return;
    startTransition(async () => {
      const result = await saveCredentialAdminAction({
        providerId: provider.id,
        plaintextApiKey: apiKey,
      });
      if (finish(result, "Credencial cifrada y guardada.")) setApiKey("");
      setConfirmation(null);
    });
  }

  function revoke() {
    if (!provider?.credential) return;
    startTransition(async () => {
      finish(
        await revokeCredentialAdminAction({ credentialId: provider.credential!.id }),
        "Credencial revocada."
      );
      setConfirmation(null);
    });
  }

  function rotate() {
    if (!provider?.credential) return;
    startTransition(async () => {
      finish(
        await rotateCredentialKeyAdminAction({ credentialId: provider.credential!.id }),
        "La credencial usa la versión activa de cifrado."
      );
    });
  }

  function testConnection() {
    if (!provider) return;
    startTransition(async () => {
      const result = await testCredentialAdminAction({ providerId: provider.id });
      finish(result, result.data?.message ?? "Prueba completada.");
    });
  }

  return (
    <article className={styles.settingsCard} data-testid={`provider-${providerKey}`}>
      <header className={styles.settingsCardHeader}>
        <div className={styles.providerIdentity}>
          <span className={styles.providerMark}>{providerKey.slice(0, 2).toUpperCase()}</span>
          <div>
            <h3>{provider?.displayName ?? DEFAULT_PROVIDER_NAMES[providerKey]}</h3>
            <code>{providerKey}</code>
          </div>
        </div>
        <span
          className={`${styles.statusBadge} ${provider?.isEnabled ? styles.statusPositive : styles.statusNeutral}`}
        >
          {provider ? (provider.isEnabled ? "Habilitado" : "Deshabilitado") : "Sin configurar"}
        </span>
      </header>

      <fieldset className={styles.settingsFieldset} disabled={pending}>
        <legend>Proveedor</legend>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nombre visible</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>Proveedor habilitado</span>
          </label>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            <span>Proveedor predeterminado</span>
          </label>
          <label className={`${styles.field} ${styles.fullField}`}>
            <span>Ajustes no secretos (JSON)</span>
            <textarea
              rows={4}
              value={settingsJson}
              onChange={(event) => setSettingsJson(event.target.value)}
              spellCheck={false}
            />
            <small>Las claves de secretos, tokens y credenciales se rechazan en el servidor.</small>
          </label>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={saveProvider}>
          <Save size={15} aria-hidden="true" /> Guardar proveedor
        </button>
      </fieldset>

      <section className={styles.credentialSection} aria-label={`Credencial de ${providerKey}`}>
        <div className={styles.credentialHeading}>
          <div>
            <KeyRound size={17} aria-hidden="true" />
            <strong>Credencial cifrada</strong>
          </div>
          {provider?.credential && (
            <span
              className={`${styles.statusBadge} ${provider.credential.lastHealthStatus === "HEALTHY" ? styles.statusPositive : provider.credential.lastHealthStatus === "UNHEALTHY" ? styles.statusDanger : styles.statusNeutral}`}
            >
              {provider.credential.lastHealthStatus ?? "UNTESTED"}
            </span>
          )}
        </div>
        {provider?.credential ? (
          <dl className={styles.credentialMeta}>
            <div>
              <dt>Clave</dt>
              <dd>
                <code>{provider.credential.maskedKey}</code>
              </dd>
            </div>
            <div>
              <dt>Versión de cifrado</dt>
              <dd>v{provider.credential.keyVersion}</dd>
            </div>
            <div>
              <dt>Última prueba</dt>
              <dd>{formatDate(provider.credential.lastTestedAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.muted}>
            No hay una credencial activa. La clave nunca podrá leerse de vuelta.
          </p>
        )}
        {provider ? (
          <div className={styles.credentialForm}>
            <label className={styles.field}>
              <span>{provider.credential ? "Nueva clave para reemplazo" : "Clave de API"}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Se cifra al guardar"
              />
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={saveKey}
              disabled={pending || apiKey.trim().length < 8}
            >
              <KeyRound size={15} aria-hidden="true" />{" "}
              {provider.credential ? "Reemplazar credencial" : "Guardar credencial"}
            </button>
          </div>
        ) : (
          <div className={styles.inlineEmpty}>
            Guarda primero la configuración del proveedor para habilitar credenciales.
          </div>
        )}
        {provider?.credential && (
          <div className={styles.compactActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={testConnection}
              disabled={pending}
            >
              <RefreshCw size={15} aria-hidden="true" /> Probar conexión
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={rotate}
              disabled={pending}
            >
              <RotateCw size={15} aria-hidden="true" /> Rotar cifrado
            </button>
            <button
              type="button"
              className={styles.dangerSecondaryButton}
              onClick={() => setConfirmation("revoke")}
              disabled={pending}
            >
              <Trash2 size={15} aria-hidden="true" /> Revocar
            </button>
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={confirmation === "replace"}
        title="¿Reemplazar la credencial activa?"
        description="La credencial actual se revocará de forma atómica cuando se guarde la nueva. La clave anterior no podrá recuperarse."
        confirmLabel="Reemplazar credencial"
        busy={pending}
        tone="warning"
        onClose={() => setConfirmation(null)}
        onConfirm={performSaveKey}
      />
      <ConfirmationDialog
        open={confirmation === "revoke"}
        title="¿Revocar la credencial?"
        description="El proveedor dejará de poder ejecutar operaciones hasta que se configure una nueva credencial activa."
        confirmLabel="Revocar credencial"
        busy={pending}
        onClose={() => setConfirmation(null)}
        onConfirm={revoke}
      />
    </article>
  );
}

function ProfileCard({
  profileKey,
  profile,
  providers,
  onNotice,
}: {
  profileKey: (typeof ADMIN_AI_PROFILE_KEYS)[number];
  profile?: AdminAiProfileDto;
  providers: AdminAiProviderDto[];
  onNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(profile?.providerId ?? providers[0]?.id ?? "");
  const [modelId, setModelId] = useState(profile?.modelId ?? "");
  const [temperature, setTemperature] = useState(profile?.temperature ?? "0.20");
  const [maxTokens, setMaxTokens] = useState(profile?.maxTokens ?? 4096);
  const [enabled, setEnabled] = useState(profile?.isEnabled ?? true);
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await configureProfileAdminAction({
        profileKey,
        providerId,
        modelId,
        temperature,
        maxTokens,
        isEnabled: enabled,
      });
      if (!result.success)
        onNotice({ tone: "error", text: result.error ?? "No se pudo guardar el perfil." });
      else {
        onNotice({ tone: "success", text: `Perfil ${profileKey} guardado.` });
        router.refresh();
      }
    });
  }
  return (
    <article className={styles.profileCard}>
      <header>
        <div>
          <h3>{profileKey.replaceAll("_", " ")}</h3>
          {profile && <small>Actualizado {formatDate(profile.updatedAt)}</small>}
        </div>
        <label className={styles.switchField}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={pending}
          />
          <span>Habilitado</span>
        </label>
      </header>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Proveedor</span>
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            disabled={pending}
          >
            <option value="">Selecciona</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} · {item.providerKey}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Modelo</span>
          <input
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder="Identificador del modelo"
            disabled={pending}
          />
        </label>
        <label className={styles.field}>
          <span>Temperatura</span>
          <input
            inputMode="decimal"
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            disabled={pending}
          />
        </label>
        <label className={styles.field}>
          <span>Máximo de tokens</span>
          <input
            type="number"
            min={1}
            max={1_000_000}
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.valueAsNumber)}
            disabled={pending}
          />
        </label>
      </div>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={save}
        disabled={pending || !providerId || !modelId.trim() || !Number.isFinite(maxTokens)}
      >
        {pending ? (
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
        ) : (
          <Save size={15} aria-hidden="true" />
        )}{" "}
        Guardar perfil
      </button>
    </article>
  );
}

export function AiSettingsWorkspace({ initialSettings }: AiSettingsWorkspaceProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const providersByKey = new Map(
    initialSettings.providers.map((provider) => [provider.providerKey, provider])
  );
  const profilesByKey = new Map(
    initialSettings.profiles.map((profile) => [profile.profileKey, profile])
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <ServerCog size={15} aria-hidden="true" /> Configuración protegida
          </div>
          <h1 className={styles.pageTitle}>Configuración IA</h1>
          <p className={styles.pageDescription}>
            Administra proveedores, credenciales cifradas y perfiles de ejecución. Ningún secreto se
            devuelve al navegador.
          </p>
        </div>
        <div className={styles.securityChip}>
          <ShieldCheck size={16} aria-hidden="true" /> Acceso <code>ai:manage_credentials</code>
        </div>
      </header>
      <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
        {notice && (
          <div className={`${styles.notice} ${styles[`notice${notice.tone}`]}`}>
            {notice.tone === "error" ? (
              <AlertTriangle size={17} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={17} aria-hidden="true" />
            )}
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <section aria-labelledby="providers-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.stepLabel}>01 · Proveedores y credenciales</span>
            <h2 id="providers-heading">Conexiones</h2>
          </div>
          <Cpu aria-hidden="true" />
        </div>
        {initialSettings.providers.length === 0 && (
          <div className={styles.emptyStrip}>
            No hay proveedores configurados. Puedes inicializar una de las identidades canónicas.
          </div>
        )}
        <div className={styles.settingsGrid}>
          {ADMIN_AI_PROVIDER_KEYS.map((key) => (
            <ProviderCard
              key={key}
              providerKey={key}
              provider={providersByKey.get(key)}
              onNotice={setNotice}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="profiles-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.stepLabel}>02 · Perfiles permitidos</span>
            <h2 id="profiles-heading">Ejecución</h2>
          </div>
          <ServerCog aria-hidden="true" />
        </div>
        {initialSettings.profiles.length === 0 && (
          <div className={styles.emptyStrip}>
            No hay perfiles configurados. Sólo se admiten las cuatro claves canónicas de GP-025.
          </div>
        )}
        <div className={styles.profileGrid}>
          {ADMIN_AI_PROFILE_KEYS.map((key) => (
            <ProfileCard
              key={key}
              profileKey={key}
              profile={profilesByKey.get(key)}
              providers={initialSettings.providers}
              onNotice={setNotice}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
