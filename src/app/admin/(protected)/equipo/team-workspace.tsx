"use client";
import { useRouter } from "next/navigation";

import React, { useId, useState, useTransition } from "react";
import { ShieldCheck, UserPlus, UserRound, ArrowRight, Check } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
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
  const [opened, setOpened] = useState<TeamMemberView | "new" | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<StaffLevel | typeof REVOKE>("ADMIN");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const id = useId();
  const member = opened && opened !== "new" ? opened : null;
  const locked = !!member && (member.isSelf || member.isLastSuperAdmin);
  const open = (target: TeamMemberView | "new") => {
    setOpened(target);
    setPending(null);
    setFormError(null);
    setEmail("");
    setLevel(target === "new" || target.standing === "CUSTOM" ? "ADMIN" : target.standing);
  };
  const close = () => {
    if (!isPending) {
      setOpened(null);
      setPending(null);
    }
  };
  const requestChange = (event: React.FormEvent) => {
    event.preventDefault();
    if (locked) return;
    if (opened === "new") {
      const trimmed = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setFormError("Ingresa el correo de una cuenta registrada en la tienda.");
        return;
      }
      if (level === REVOKE) return;
      setPending({ kind: "grant", email: trimmed, level });
    } else if (member)
      setPending({ kind: "change", member, level: level === REVOKE ? null : level });
    setFormError(null);
  };
  const confirm = () => {
    if (!pending || isPending) return;
    const change = pending;
    startTransition(async () => {
      try {
        const result =
          change.kind === "grant"
            ? await grantStaffAccessAction({ email: change.email, level: change.level })
            : await changeStaffAccessAction({
                authUserId: change.member.authUserId,
                level: change.level,
              });
        if (!result.success) {
          setFormError(result.error ?? "No se pudo cambiar el acceso.");
          return;
        }
        close();
        setOpened(null);
        setPending(null);
        router.refresh();
        notify(
          "success",
          result.data?.action === "revoke"
            ? "Acceso revocado."
            : result.data?.action === "grant"
              ? "Acceso otorgado."
              : "Nivel actualizado."
        );
      } catch {
        setFormError("No se pudo confirmar el cambio. Vuelve a intentar.");
      }
    });
  };
  const dialog = pending ? describeChange(pending) : null;
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Equipo</h1>
          <p className={styles.subtitle}>
            Personas con acceso al administrador. Abre una cuenta para revisar su nivel y los
            cambios antes de aplicarlos.
          </p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => open("new")}>
          <UserPlus size={16} aria-hidden="true" /> Dar acceso
        </button>
      </header>
      <section aria-labelledby="miembros">
        <h2 id="miembros" className={styles.sectionTitle}>
          {members.length} {members.length === 1 ? "persona" : "personas"} con acceso
        </h2>
        <ul className={styles.list}>
          {members.map((person) => (
            <li
              key={person.authUserId}
              className={styles.member}
              data-testid={`team-member-${person.email ?? person.authUserId}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {(person.name ?? person.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className={styles.memberMain}>
                <span className={styles.memberName}>
                  {memberLabel(person)}
                  {person.isSelf && <span className={styles.selfBadge}>Tú</span>}
                </span>
                {person.name && person.email && (
                  <span className={styles.memberEmail}>{person.email}</span>
                )}
                <span className={styles.memberMeta}>
                  <span
                    className={person.standing === "SUPER_ADMIN" ? styles.levelSuper : styles.level}
                  >
                    {person.standing === "SUPER_ADMIN" && (
                      <ShieldCheck size={12} aria-hidden="true" />
                    )}
                    {STANDING_LABELS[person.standing]}
                  </span>
                  <span>
                    {person.lastChanged
                      ? `Último cambio: ${person.lastChanged}`
                      : "Asignado antes de este panel"}
                  </span>
                </span>
                {(person.isSelf || person.isLastSuperAdmin) && (
                  <p className={styles.lockedNote}>
                    {person.isSelf
                      ? "No puedes cambiar tu propio acceso."
                      : "Último superadministrador: asigna otro antes de cambiarlo."}
                  </p>
                )}
              </div>
              <button
                type="button"
                className={styles.outlineButton}
                onClick={() => open(person)}
                data-testid={
                  person.isSelf || person.isLastSuperAdmin
                    ? undefined
                    : `team-change-${person.email ?? person.authUserId}`
                }
                aria-label={`Ver acceso de ${memberLabel(person)}`}
              >
                Ver acceso <ArrowRight size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <AnimatePresence>
        {opened && (
          <SideDrawer
            labelledBy={`${id}-title`}
            onClose={close}
            busy={isPending}
            size="wide"
            testId="team-drawer"
          >
            <DrawerHeader
              titleId={`${id}-title`}
              title={opened === "new" ? "Dar acceso al administrador" : memberLabel(member!)}
              eyebrow="Equipo · acceso y permisos"
              onClose={close}
              busy={isPending}
            />
            <div className={styles.drawerLayout}>
              <aside className={styles.accessPreview}>
                <div className={styles.identity}>
                  <UserRound size={30} aria-hidden="true" />
                  <strong>{member ? memberLabel(member) : email || "Nueva persona"}</strong>
                  {member?.email && member.name && <span>{member.email}</span>}
                </div>
                {member && (
                  <p className={styles.currentLevel}>
                    Acceso actual: <strong>{STANDING_LABELS[member.standing]}</strong>
                  </p>
                )}
                <div className={styles.levelPreview}>
                  <small>{level === REVOKE ? "Después de confirmar" : "Acceso seleccionado"}</small>
                  <h3>{level === REVOKE ? "Sin acceso al panel" : STANDING_LABELS[level]}</h3>
                  <p>
                    {level === REVOKE
                      ? "La cuenta de cliente sigue activa; pierde el acceso administrativo."
                      : LEVEL_SUMMARIES[level]}
                  </p>
                </div>
                <p className={styles.hint}>
                  Los cambios se aplican en la siguiente acción de esa persona y quedan registrados
                  en la auditoría.
                </p>
              </aside>
              <div className={styles.drawerFields}>
                {locked ? (
                  <p className={styles.lockedNote}>
                    {member?.isSelf
                      ? "No puedes cambiar tu propio acceso."
                      : "Último superadministrador: asigna otro antes de cambiarlo."}
                  </p>
                ) : dialog ? (
                  <section className={styles.confirmation} aria-label="Confirmar cambio de acceso">
                    <h3>{dialog.title}</h3>
                    <p>{dialog.description}</p>
                    {formError && (
                      <p className={styles.error} role="alert">
                        {formError}
                      </p>
                    )}
                    <div className={styles.drawerActions}>
                      <button
                        type="button"
                        className={styles.outlineButton}
                        disabled={isPending}
                        onClick={() => {
                          setPending(null);
                          setFormError(null);
                        }}
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={isPending}
                        onClick={confirm}
                      >
                        {isPending ? "Guardando…" : dialog.confirmLabel}
                      </button>
                    </div>
                  </section>
                ) : (
                  <form className={styles.drawerForm} onSubmit={requestChange} noValidate>
                    {opened === "new" && (
                      <label className={styles.field}>
                        <span className={styles.label}>Correo de la cuenta</span>
                        <input
                          type="email"
                          className={styles.input}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="persona@correo.com"
                          aria-invalid={!!formError}
                          data-testid="team-grant-email"
                        />
                        <small className={styles.hint}>
                          Debe tener una cuenta creada en la tienda con ese correo.
                        </small>
                      </label>
                    )}
                    <fieldset className={styles.roleOptions}>
                      <legend>Elige su nivel de acceso</legend>
                      {STAFF_LEVELS.map((option) => (
                        <label
                          key={option}
                          className={styles.roleOption}
                          data-selected={level === option}
                        >
                          <input
                            type="radio"
                            name={`${id}-level`}
                            value={option}
                            checked={level === option}
                            onChange={() => setLevel(option)}
                          />
                          <span>
                            <strong>{STANDING_LABELS[option]}</strong>
                            <small>{LEVEL_SUMMARIES[option]}</small>
                          </span>
                          {level === option && <Check size={16} aria-hidden="true" />}
                        </label>
                      ))}
                      {member && (
                        <label className={styles.roleOption} data-selected={level === REVOKE}>
                          <input
                            type="radio"
                            name={`${id}-level`}
                            checked={level === REVOKE}
                            onChange={() => setLevel(REVOKE)}
                          />
                          <span>
                            <strong>Revocar acceso</strong>
                            <small>Conserva su cuenta de cliente.</small>
                          </span>
                        </label>
                      )}
                    </fieldset>
                    {formError && (
                      <p className={styles.error} role="alert" data-testid="team-grant-error">
                        {formError}
                      </p>
                    )}
                    <div className={styles.drawerActions}>
                      <button type="button" className={styles.outlineButton} onClick={close}>
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={isPending || (!!member && level === member.standing)}
                        data-testid="team-grant-submit"
                      >
                        Revisar cambio
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </SideDrawer>
        )}
      </AnimatePresence>
      <ToastViewport toasts={toasts} />
    </div>
  );
}
