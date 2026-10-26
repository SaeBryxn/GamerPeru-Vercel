"use client";

import React, { useId, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Link2, Plus, Trash2 } from "lucide-react";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui/side-drawer";
import {
  MenuContentSchema,
  type EditableMenuContent,
  type EditableMenuLink,
} from "@/lib/navigation/menu-content-schema";
import { updateMenuContentAction } from "@/lib/admin/menu/actions";
import styles from "./menu.module.css";

export function MenuContentEditor({
  value,
  onSaved,
  tileLayout = false,
}: {
  value: EditableMenuContent;
  onSaved: (next: EditableMenuContent) => void;
  tileLayout?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const current = draft.links.find((link) => link.id === selected);
  const close = () => {
    if (!pending) {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };
  const update = (linkId: string, patch: Partial<EditableMenuLink>) =>
    setDraft((state) => ({
      ...state,
      links: state.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)),
    }));
  const move = (index: number, delta: number) => {
    const links = [...draft.links];
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    [links[index], links[target]] = [links[target]!, links[index]!];
    setDraft({ ...draft, links });
  };
  const save = async () => {
    const parsed = MenuContentSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los enlaces.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await updateMenuContentAction(parsed.data);
      if (!result.success) {
        setError(result.error ?? "No se pudo guardar.");
        return;
      }
      onSaved(parsed.data);
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    } catch {
      setError("No se pudo conectar. Puedes volver a guardar.");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={styles.secondaryButton}
        onClick={() => {
          setDraft(structuredClone(value));
          setSelected(value.links[0]?.id ?? null);
          setError("");
          setOpen(true);
        }}
      >
        <Link2 size={15} /> Editar nombre y enlaces
      </button>
      <AnimatePresence>
        {open && (
          <SideDrawer
            labelledBy={`${id}-title`}
            onClose={close}
            busy={pending}
            size="wide"
            testId="menu-content-drawer"
          >
            <DrawerHeader
              titleId={`${id}-title`}
              title={draft.label}
              eyebrow="Menú de la tienda · Nombre y enlaces"
              onClose={close}
              busy={pending}
            />
            <div className={styles.entryFields}>
              <label>
                Nombre en la barra
                <input
                  value={draft.label}
                  maxLength={100}
                  disabled={pending}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </label>
              <label>
                Destino de la sección
                <input
                  value={draft.href}
                  maxLength={500}
                  disabled={pending}
                  onChange={(event) => setDraft({ ...draft, href: event.target.value })}
                />
              </label>
            </div>
            <div className={styles.linkWorkspace}>
              <section className={styles.linkCanvas} aria-label="Orden de los enlaces del menú">
                <div className={styles.canvasHeading}>
                  <h3>Contenido del desplegable</h3>
                  <span>{draft.links.filter((link) => link.isVisible).length} visibles</span>
                </div>
                <p className={styles.hint}>
                  Selecciona un enlace para editarlo. Las flechas cambian dónde aparece.
                </p>
                <ol className={styles.linkRows}>
                  {draft.links.map((link, index) => (
                    <li
                      key={link.id}
                      data-selected={selected === link.id}
                      data-hidden={!link.isVisible}
                    >
                      <button
                        type="button"
                        className={styles.selectLink}
                        disabled={pending}
                        onClick={() => setSelected(link.id)}
                      >
                        <span className={styles.ordinal}>{index + 1}</span>
                        <span>
                          <strong>{link.label || "Sin título"}</strong>
                          <small>{link.href || "Sin destino"}</small>
                        </span>
                        {!link.isVisible && <EyeOff size={15} />}
                      </button>
                      <div className={styles.linkActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Subir enlace ${link.label}`}
                          disabled={pending || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Bajar enlace ${link.label}`}
                          disabled={pending || index === draft.links.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`${link.isVisible ? "Ocultar" : "Mostrar"} enlace ${link.label}`}
                          disabled={pending}
                          onClick={() => update(link.id, { isVisible: !link.isVisible })}
                        >
                          {link.isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                {!draft.links.length && (
                  <p className={styles.blank}>
                    Este desplegable está vacío. Agrega su primer enlace.
                  </p>
                )}
                <button
                  type="button"
                  className={styles.addLink}
                  disabled={pending || draft.links.length >= 32}
                  onClick={() => {
                    const link: EditableMenuLink = {
                      id: crypto.randomUUID(),
                      label: "Nuevo enlace",
                      href: "/",
                      sectionTitle: draft.label || "Enlaces",
                      placement: tileLayout ? "tile" : "section",
                      icon: tileLayout ? "mouse" : null,
                      isVisible: true,
                    };
                    setDraft({ ...draft, links: [...draft.links, link] });
                    setSelected(link.id);
                  }}
                >
                  <Plus size={16} /> Agregar enlace
                </button>
              </section>
              <aside className={styles.linkInspector} aria-label="Editar enlace seleccionado">
                {current ? (
                  <fieldset disabled={pending}>
                    <legend>Editar este enlace</legend>
                    <label>
                      Texto que verá el cliente
                      <input
                        value={current.label}
                        maxLength={100}
                        onChange={(event) => update(current.id, { label: event.target.value })}
                      />
                    </label>
                    <label>
                      Destino
                      <input
                        value={current.href}
                        maxLength={500}
                        placeholder="/soporte/contacto"
                        onChange={(event) => update(current.id, { href: event.target.value })}
                      />
                    </label>
                    <p className={styles.hint}>Una dirección de la tienda o un enlace HTTPS.</p>
                    {current.placement === "section" && (
                      <label>
                        Grupo del enlace
                        <input
                          value={current.sectionTitle}
                          maxLength={100}
                          onChange={(event) =>
                            update(current.id, { sectionTitle: event.target.value })
                          }
                        />
                      </label>
                    )}
                    {current.placement === "tile" && (
                      <label>
                        Ícono
                        <select
                          value={current.icon ?? "mouse"}
                          onChange={(event) =>
                            update(current.id, {
                              icon: event.target.value as EditableMenuLink["icon"],
                            })
                          }
                        >
                          <option value="mouse">Mouse</option>
                          <option value="keyboard">Teclado</option>
                          <option value="usb">Receptor</option>
                          <option value="cpu">Firmware</option>
                        </select>
                      </label>
                    )}
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={current.isVisible}
                        onChange={(event) =>
                          update(current.id, { isVisible: event.target.checked })
                        }
                      />
                      <Check size={14} /> Visible en la tienda
                    </label>
                    <button
                      type="button"
                      className={styles.deleteLink}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          links: draft.links.filter((link) => link.id !== current.id),
                        });
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={15} /> Quitar enlace
                    </button>
                  </fieldset>
                ) : (
                  <p className={styles.blank}>
                    Elige un enlace del desplegable para cambiar su texto o destino.
                  </p>
                )}
              </aside>
            </div>
            <footer className={styles.drawerFooter}>
              <div>
                {error ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : (
                  <p>La barra y el desplegable se actualizan juntos al guardar.</p>
                )}
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={pending}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={pending}
                onClick={() => void save()}
              >
                {pending ? "Guardando…" : "Guardar menú"}
              </button>
            </footer>
          </SideDrawer>
        )}
      </AnimatePresence>
    </>
  );
}
