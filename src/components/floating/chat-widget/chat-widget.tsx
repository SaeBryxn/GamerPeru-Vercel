"use client";

import React, { useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Maximize2, Minimize2, Minus, Paperclip, Send, Smile } from "lucide-react";
import { Icon } from "@/components/ui";
import { STOREFRONT_INVENTORY, productHref } from "@/lib/catalog/storefront-inventory";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./chat-widget.module.css";

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

// Grows out of the launcher corner and collapses back into it.
const WINDOW_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.86, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO, staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const BLOCK_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_EXPO } },
};

const LAUNCHER_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT_EXPO } },
};

const QUICK_REPLIES = [
  "¿Cómo pago con Yape o Plin?",
  "¿Hacen envíos a todo el Perú?",
  "Quiero un mouse ultraligero",
];

// Answering is not wired to anything yet, so every reply says exactly that.
const PENDING_REPLY =
  "Nuestro asistente todavía no está conectado. Escríbenos por WhatsApp y te responde una persona del equipo.";

interface ChatMessage {
  id: number;
  author: "visitor" | "store";
  text: string;
}

const FEATURED = STOREFRONT_INVENTORY[0];

export function ChatWidget() {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [imageFailed, setImageFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const close = () => {
    setIsOpen(false);
    setIsExpanded(false);
  };

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, author: "visitor", text: clean },
      { id: nextId.current++, author: "store", text: PENDING_REPLY },
    ]);
    setDraft("");
  };

  return (
    <div className={styles.root}>
      <AnimatePresence mode="wait" initial={false}>
        {!isOpen ? (
          <motion.button
            key="launcher"
            type="button"
            className={styles.launcher}
            onClick={() => setIsOpen(true)}
            variants={LAUNCHER_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            data-testid="chat-launcher"
          >
            <Icon icon={Smile} size="md" aria-hidden="true" />
            Chat
          </motion.button>
        ) : (
          <motion.section
            key="window"
            className={`${styles.window} ${isExpanded ? styles.windowExpanded : ""}`}
            aria-labelledby={titleId}
            variants={WINDOW_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            data-testid="chat-window"
          >
            <h2 id={titleId} className={styles.srOnly}>
              Chat con Gamer Perú
            </h2>

            <header className={styles.header}>
              <Link href="/auth/login" className={styles.signIn}>
                Iniciar sesión
              </Link>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsExpanded((prev) => !prev)}
                  aria-pressed={isExpanded}
                  aria-label={isExpanded ? "Reducir el chat" : "Ampliar el chat"}
                  data-testid="chat-expand"
                >
                  <Icon icon={isExpanded ? Minimize2 : Maximize2} size="sm" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={close}
                  aria-label="Minimizar el chat"
                  data-testid="chat-minimize"
                >
                  <Icon icon={Minus} size="sm" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className={styles.body}>
              <motion.p className={styles.welcome} variants={BLOCK_VARIANTS}>
                ¡Hola! Bienvenido a Gamer Perú. ¿Qué estás buscando?
              </motion.p>

              {FEATURED && (
                <motion.div variants={BLOCK_VARIANTS} className={styles.productCardRow}>
                  <Link
                    href={productHref(FEATURED)}
                    className={styles.productCard}
                    onClick={close}
                    data-testid="chat-product-card"
                  >
                    <span className={styles.productThumb}>
                      {!imageFailed && (
                        <Image
                          src={FEATURED.imagePlaceholder}
                          alt=""
                          fill
                          sizes="56px"
                          className={styles.productImage}
                          onError={() => setImageFailed(true)}
                        />
                      )}
                    </span>
                    <span className={styles.productInfo}>
                      <span className={styles.productName}>{FEATURED.name}</span>
                      <span className={styles.productPrice}>
                        {formatCurrency(FEATURED.priceCents)}
                      </span>
                    </span>
                  </Link>
                </motion.div>
              )}

              <motion.p className={styles.privacy} variants={BLOCK_VARIANTS}>
                Tus mensajes son visibles para el equipo de Gamer Perú. No compartas contraseñas ni
                datos de tu tarjeta por este canal.
              </motion.p>

              {messages.map((message) => (
                <p
                  key={message.id}
                  className={
                    message.author === "visitor" ? styles.visitorBubble : styles.storeBubble
                  }
                >
                  {message.text}
                </p>
              ))}

              <motion.ul className={styles.quickReplies} variants={BLOCK_VARIANTS}>
                {QUICK_REPLIES.map((reply) => (
                  <li key={reply}>
                    <motion.button
                      type="button"
                      className={styles.chip}
                      onClick={() => {
                        setDraft(reply);
                        inputRef.current?.focus();
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {reply}
                    </motion.button>
                  </li>
                ))}
              </motion.ul>
            </div>

            <motion.form
              className={styles.composer}
              variants={BLOCK_VARIANTS}
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              {/* Attachments are part of the layout only; nothing is uploaded yet. */}
              <span className={styles.attach} aria-hidden="true">
                <Icon icon={Paperclip} size="sm" />
              </span>
              <input
                ref={inputRef}
                type="text"
                className={styles.input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Pregunta lo que quieras..."
                aria-label="Escribe tu mensaje"
                maxLength={500}
                data-testid="chat-input"
              />
              <motion.button
                type="submit"
                className={styles.send}
                disabled={draft.trim().length === 0}
                aria-label="Enviar mensaje"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <Icon icon={Send} size="sm" aria-hidden="true" />
              </motion.button>
            </motion.form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
