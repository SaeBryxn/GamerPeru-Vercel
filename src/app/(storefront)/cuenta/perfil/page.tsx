import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import { toProfileFormDTO } from "@/lib/account/types";
import { AccountCard } from "@/components/account/account-card";
import { ProfileEditor } from "@/components/account/profile-editor";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import styles from "@/components/account/account.module.css";
import { getCurrentCustomerAppearance } from "@/lib/account/appearance-reader";
import { AppearanceEditor } from "@/components/account/appearance-editor";

export const metadata: Metadata = {
  title: "Datos personales | Mi cuenta | Gamer Perú",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={styles.summaryRow}>
      <dt className={styles.summaryLabel}>{label}</dt>
      <dd className={value ? styles.summaryValue : styles.summaryEmpty}>
        {value ?? "No registrado"}
      </dd>
    </div>
  );
}

export default async function PerfilPage() {
  const profileState = await getCurrentCustomerProfile();

  if (profileState.status === "UNAUTHENTICATED") {
    redirect("/auth/login");
  }

  if (profileState.status === "NEEDS_PROFILE_COMPLETION") {
    redirect("/auth/completar-perfil");
  }

  if (profileState.status !== "READY") {
    return null;
  }

  const profile = profileState.profile;
  const addressesState = await getCurrentCustomerAddresses();
  const defaultAddress =
    addressesState.status === "READY"
      ? addressesState.addresses.find((address) => address.isDefault)
      : undefined;
  const addressCount = addressesState.status === "READY" ? addressesState.addresses.length : 0;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const appearanceState = await getCurrentCustomerAppearance();

  return (
    <div className={styles.sectionStack}>
      <div>
        <h1 className={styles.title}>Tu perfil</h1>
        <p className={styles.subtitle}>
          Personaliza tu espacio y mantén a mano tus datos de entrega y seguridad.
        </p>
      </div>

      <AppearanceEditor
        initialAppearance={appearanceState.appearance}
        available={appearanceState.available}
        firstName={profile.firstName}
        fallbackSeed={profile.email ?? profile.firstName}
      />
      <div className={styles.profileGrid}>
        <AccountCard
          title="Información personal"
          editLabel="Editar"
          editor={<ProfileEditor initialProfile={toProfileFormDTO(profile)} />}
        >
          <dl className={styles.summaryList}>
            <SummaryRow label="Nombre" value={fullName || null} />
            <SummaryRow label="Correo" value={profile.email} />
            <SummaryRow label="Teléfono" value={profile.phone} />
            <SummaryRow
              label="Documento"
              value={
                profile.documentType && profile.documentNumber
                  ? `${profile.documentType} ${profile.documentNumber}`
                  : null
              }
            />
          </dl>
        </AccountCard>
        <AccountCard
          title="Direcciones"
          action={{
            label: addressCount > 0 ? "Gestionar" : "Agregar",
            href: "/cuenta/direcciones",
          }}
        >
          {defaultAddress ? (
            <address className={styles.addressSummary}>
              <span className={styles.summaryValue}>{defaultAddress.recipientName}</span>
              <span>
                {defaultAddress.streetAddress}
                {defaultAddress.apartmentSuite ? `, ${defaultAddress.apartmentSuite}` : ""}
              </span>
              <span>
                {defaultAddress.district}, {defaultAddress.province}, {defaultAddress.department}
              </span>
              <span className={styles.summaryLabel}>Predeterminada</span>
            </address>
          ) : (
            <p className={`${styles.cardText} ${styles.cardTextFlush}`}>
              {addressCount > 0
                ? `Tienes ${addressCount} dirección${addressCount === 1 ? "" : "es"} guardada${addressCount === 1 ? "" : "s"}, sin una predeterminada.`
                : "Aún no guardas direcciones de entrega."}
            </p>
          )}
        </AccountCard>
      </div>
      <AccountCard
        title="Contraseña y seguridad"
        editLabel="Cambiar"
        editor={
          <>
            <p className={`${styles.cardText} ${styles.cardTextFlush} ${styles.editorNote}`}>
              Al guardar una nueva contraseña cerraremos tu sesión en este dispositivo para que
              ingreses con ella.
            </p>
            <PasswordChangeForm />
          </>
        }
      >
        <p className={`${styles.cardText} ${styles.cardTextFlush}`}>
          Usa una contraseña de al menos 8 caracteres que no utilices en otros sitios.
        </p>
      </AccountCard>
    </div>
  );
}
