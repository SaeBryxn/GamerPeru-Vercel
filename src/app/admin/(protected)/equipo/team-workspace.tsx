"use client";
import { useRouter } from "next/navigation";

import React, { useId, useState, useTransition } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { ToastViewport, useToasts } from "@/components/admin/ui";
import { changeStaffAccessAction, grantStaffAccessAction } from "@/lib/admin/staff/actions";
import {
  LEVEL_SUMMARIES,
  STAFF_LEVELS,
  STANDING_LABELS,
  type StaffLevel,
  type StaffStanding,
} from "@/lib/admin/staff/levels";
import styles from "./team.module.css";

export interface TeamMemberView {
  authUserId: string;
  email: string | null;
  name: string | null;
  standing: StaffStanding;
  lastChanged: string | null;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
}

type PendingChange =
  | { kind: "grant"; email: string; level: StaffLevel }
  | { kind: "change"; member: TeamMemberView; level: StaffLevel | null };

const REVOKE = "revocar";

function memberLabel(member: TeamMemberView): string {
  return member.name ?? member.email ?? "Cuenta sin correo";
}

function describeChange(change: PendingChange): {
  title: string;
  description: string;
  confirmLabel: string;
} {
  if (change.kind === "grant") {
    return {
      title: `Dar acceso de ${STANDING_LABELS[change.level]}`,
      description: `${change.email} podrá entrar al panel con este nivel: ${LEVEL_SUMMARIES[change.level]}`,
      confirmLabel: "Confirmar acceso",
    };
  }
  const who = memberLabel(change.member);
  const from = STANDING_LABELS[change.member.standing];
  if (change.level === null) {
    return {
      title: `Revocar el acceso de ${who}`,
      description: `Dejará de ser ${from} y perderá todo acceso al panel en su próxima acción. Su cuenta de cliente sigue activa.`,
      confirmLabel: "Revocar acceso",
    };
  }
  return {
    title: `Cambiar a ${STANDING_LABELS[change.level]}`,
    description: `${who} pasará de ${from} a ${STANDING_LABELS[change.level]}. Con el nuevo nivel: ${LEVEL_SUMMARIES[change.level]}`,
    confirmLabel: "Cambiar nivel",
  };
}

export function TeamWorkspace({ members }: { members: TeamMemberView[] }) {
  const { toasts, notify } = useToasts();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<StaffLevel>("ADMIN");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const emailId = useId();
  const levelId = useId();
  const levelHintId = useId();
  const formErrorId = useId();

  const requestGrant = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFormError("Ingresa el correo de una cuenta registrada en la tienda.");
      return;
    }
    setFormError(null);
    setPending({ kind: "grant", email: trimmed, level });
  };

  const confirm = () => {
    if (!pending) return;
    const change = pending;
    startTransition(async () => {
      const result =
        change.kind === "grant"
          ? await grantStaffAccessAction({ email: change.email, level: change.level })
          : await changeStaffAccessAction({
              authUserId: change.member.authUserId,
              level: change.level,
            });
      setPending(null);
      if (!result.success) {
        if (change.kind === "grant") setFormError(result.error ?? "No se pudo dar el acceso.");
        else notify("error", result.error ?? "No se pudo cambiar el acceso.");
        return;
      }
      router.refresh();
      if (change.kind === "grant") setEmail("");
      notify(
        "success",
        result.data?.action === "revoke"
          ? "Acceso revocado."
          : result.data?.action === "grant"
            ? "Acceso otorgado."
            : "Nivel actualizado."
      );
    });
  };

  const dialog = pending ? describeChange(pending) : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Equipo</h1>
        <p className={styles.subtitle}>
          Quién puede entrar al panel y con qué nivel. Los cambios se aplican en la siguiente acción
          de esa persona y quedan registrados en la auditoría.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="dar-acceso">
        <h2 id="dar-acceso" className={styles.cardTitle}>
          <UserPlus size={16} aria-hidden="true" /> Dar acceso
        </h2>
        <form className={styles.form} onSubmit={requestGrant} noValidate>
          <div className={styles.field}>
            <label htmlFor={emailId} className={styles.label}>
              Correo de la cuenta
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="off"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@correo.com"
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? formErrorId : undefined}
              data-testid="team-grant-email"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={levelId} className={styles.label}>
              Nivel
            </label>
            <select
              id={levelId}
              className={styles.input}
              value={level}
              onChange={(event) => setLevel(event.target.value as StaffLevel)}
              aria-describedby={levelHintId}
              data-testid="team-grant-level"
            >
              {STAFF_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {STANDING_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isPending}
            data-testid="team-grant-submit"
          >
            Dar acceso
          </button>
        </form>
        <p id={levelHintId} className={styles.hint}>
          {LEVEL_SUMMARIES[level]}
        </p>
        {formError && (
          <p id={formErrorId} className={styles.error} role="alert" data-testid="team-grant-error">
            {formError}
          </p>
        )}
        <p className={styles.hint}>
          La persona debe tener una cuenta creada en la tienda con ese correo.
        </p>
      </section>

      <section aria-labelledby="miembros">
        <h2 id="miembros" className={styles.sectionTitle}>
          {members.length} {members.length === 1 ? "persona" : "personas"} con acceso
        </h2>
        <ul className={styles.list}>
          {members.map((member) => {
            const locked = member.isSelf || member.isLastSuperAdmin;
            return (
              <li
                key={member.authUserId}
                className={styles.member}
                data-testid={`team-member-${member.email ?? member.authUserId}`}
              >
                <div className={styles.memberMain}>
                  <span className={styles.memberName}>
                    {memberLabel(member)}
                    {member.isSelf && <span className={styles.selfBadge}>Tú</span>}
                  </span>
                  {member.name && member.email && (
                    <span className={styles.memberEmail}>{member.email}</span>
                  )}
                  <span className={styles.memberMeta}>
                    <span
                      className={
                        member.standing === "SUPER_ADMIN" ? styles.levelSuper : styles.level
                      }
                    >
                      {member.standing === "SUPER_ADMIN" && (
                        <ShieldCheck size={12} aria-hidden="true" />
                      )}
                      {STANDING_LABELS[member.standing]}
                    </span>
                    <span>
                      {member.lastChanged
                        ? `Último cambio: ${member.lastChanged}`
                        : "Asignado antes de este panel"}
                    </span>
                  </span>
                </div>
                <div className={styles.memberActions}>
                  {locked ? (
                    <p className={styles.lockedNote}>
                      {member.isSelf
                        ? "No puedes cambiar tu propio acceso."
                        : "Último superadministrador: asigna otro antes de cambiarlo."}
                    </p>
                  ) : (
                    <>
                      <label className={styles.srOnly} htmlFor={`nivel-${member.authUserId}`}>
                        Cambiar el nivel de {memberLabel(member)}
                      </label>
                      <select
                        id={`nivel-${member.authUserId}`}
                        className={styles.input}
                        value=""
                        disabled={isPending}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!value) return;
                          setPending({
                            kind: "change",
                            member,
                            level: value === REVOKE ? null : (value as StaffLevel),
                          });
                        }}
                        data-testid={`team-change-${member.email ?? member.authUserId}`}
                      >
                        <option value="">Cambiar nivel…</option>
                        {STAFF_LEVELS.filter((option) => option !== member.standing).map(
                          (option) => (
                            <option key={option} value={option}>
                              {STANDING_LABELS[option]}
                            </option>
                          )
                        )}
                        <option value={REVOKE}>Revocar acceso</option>
                      </select>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {dialog && (
        <ConfirmationDialog
          open
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          tone={pending?.kind === "change" && pending.level === null ? "danger" : "warning"}
          busy={isPending}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}

      <ToastViewport toasts={toasts} />
    </div>
  );
}
