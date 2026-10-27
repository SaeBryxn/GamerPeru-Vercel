"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2, Radio } from "lucide-react";
import styles from "./twitch-live.module.css";

interface Player {
  addEventListener: (event: string, callback: () => void) => void;
  play: () => void;
  pause: () => void;
}
interface TwitchApi {
  Player: {
    new (id: string, options: Record<string, unknown>): Player;
    ONLINE: string;
    OFFLINE: string;
    READY: string;
    ENDED: string;
  };
}
declare global {
  interface Window {
    Twitch?: TwitchApi;
  }
}
let scriptPromise: Promise<TwitchApi> | undefined;
function loadPlayer(): Promise<TwitchApi> {
  if (window.Twitch) return Promise.resolve(window.Twitch);
  scriptPromise ??= new Promise<TwitchApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://player.twitch.tv/js/embed/v1.js";
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("Twitch player timeout")), 15000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Twitch) resolve(window.Twitch);
      else reject(new Error("Twitch player unavailable"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Twitch player unavailable"));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

/** A live-only window over the normal hero video. No chat iframe is created. */
export function TwitchLive({
  channel,
  linkLabel,
  onLiveChange,
  autoplay = true,
}: {
  channel: string;
  linkLabel: string;
  onLiveChange: (live: boolean) => void;
  autoplay?: boolean;
}) {
  const id = `twitch-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const container = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const reopenButton = useRef<HTMLButtonElement>(null);
  const readyPlayer = useRef<Player | null>(null);
  const hiddenRef = useRef(false);
  const wasHidden = useRef(false);
  const wasExpanded = useRef(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [online, setOnline] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => setPortalTarget(document.body), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (expanded && !wasExpanded.current) {
      dialog.removeAttribute("open");
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!expanded) {
      if (wasExpanded.current) dialog.close?.();
      // A nonmodal open attribute avoids stealing focus when the home mounts.
      dialog.setAttribute("open", "");
      if (wasExpanded.current) (hidden ? reopenButton.current : expandButton.current)?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded, hidden, portalTarget]);
  useEffect(() => {
    hiddenRef.current = hidden;
    if (hidden !== wasHidden.current)
      (hidden ? reopenButton.current : expandButton.current)?.focus();
    wasHidden.current = hidden;
    try {
      if (hidden || !online) readyPlayer.current?.pause();
      else if (online && autoplay) readyPlayer.current?.play();
    } catch {
      /* The player can still be connecting; its READY event applies the current state. */
    }
  }, [hidden, online, autoplay]);
  useEffect(() => {
    if ((online && !hidden) || !expanded) return;
    // Keep the modal in the top layer until its exit finishes. Interrupted exits are ignored.
    const animations = dialogRef.current?.getAnimations?.() ?? [];
    let cancelled = false;
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) setExpanded(false);
    });
    return () => {
      cancelled = true;
    };
  }, [online, hidden, expanded]);
  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [expanded]);
  useEffect(() => {
    // Leave room for a browser scrollbar while keeping Twitch's 400px player minimum.
    const query = window.matchMedia("(min-width: 416px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let disposed = false;
    let player: Player | undefined;
    let ready = false;
    let live = false;
    let frame = 0;
    // Twitch requires a player at least 400px wide; narrow screens keep the normal video.
    const update = (live: boolean) => {
      if (!disposed) {
        setOnline(live);
        onLiveChange(live);
      }
    };
    if (!wide) {
      update(false);
      return;
    }
    const play = () => {
      if (ready && live && autoplay && !hiddenRef.current)
        frame = window.requestAnimationFrame(() => {
          if (!disposed && !hiddenRef.current)
            try {
              player?.play();
            } catch {
              /* The official player keeps its manual play control. */
            }
        });
    };
    void loadPlayer()
      .then((api) => {
        if (disposed) return;
        player = new api.Player(id, {
          channel,
          width: "100%",
          height: "100%",
          parent: [window.location.hostname],
          autoplay: false,
          muted: true,
        });
        player.addEventListener(api.Player.READY, () => {
          ready = true;
          readyPlayer.current = player ?? null;
          play();
        });
        player.addEventListener(api.Player.ONLINE, () => {
          live = true;
          update(true);
          play();
        });
        const offline = () => {
          live = false;
          update(false);
        };
        player.addEventListener(api.Player.OFFLINE, offline);
        player.addEventListener(api.Player.ENDED, offline);
      })
      .catch(() => update(false));
    return () => {
      disposed = true;
      readyPlayer.current = null;
      window.cancelAnimationFrame(frame);
      if (ready)
        try {
          player?.pause();
        } catch {
          /* Frame may already be removed. */
        }
      target.replaceChildren();
      onLiveChange(false);
    };
  }, [channel, id, onLiveChange, autoplay, wide, portalTarget]);
  const tucked = online && hidden;
  const visible = online && !hidden;
  if (!portalTarget) return null;
  return createPortal(
    <>
      <dialog
        id={`${id}-window`}
        ref={dialogRef}
        className={styles.dock}
        data-online={online}
        data-expanded={expanded}
        data-visible={visible}
        data-supported={wide}
        data-testid="twitch-live-dock"
        aria-label={`Directo de ${channel}`}
        aria-hidden={!visible}
        inert={!visible}
        onCancel={(event) => {
          event.preventDefault();
          setExpanded(false);
        }}
        onClick={(event) => {
          if (expanded && event.target === event.currentTarget) setExpanded(false);
        }}
      >
        <div className={styles.toolbar}>
          <a
            href={`https://www.twitch.tv/${channel}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.channel}
            data-testid="twitch-channel-link"
          >
            {online && (
              <span className={styles.live}>
                <Radio size={14} aria-hidden="true" />
                EN VIVO
              </span>
            )}
            <span>
              {linkLabel} · {channel}
            </span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          {online && (
            <>
              <button
                ref={expandButton}
                type="button"
                className={styles.expand}
                aria-label={expanded ? "Reducir directo" : "Ampliar directo"}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <Minimize2 size={18} aria-hidden="true" />
                ) : (
                  <Maximize2 size={18} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className={styles.expand}
                aria-label="Ocultar directo"
                title="Ocultar directo"
                onClick={() => {
                  setHidden(true);
                }}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <div
          className={styles.stage}
          data-online={online}
          aria-hidden={!online}
          inert={!online}
          data-testid="twitch-live-stage"
        >
          <div ref={container} id={id} className={styles.player} />
        </div>
      </dialog>
      <div className={styles.tabRail}>
        <button
          ref={reopenButton}
          type="button"
          className={styles.reopen}
          data-visible={tucked}
          aria-hidden={!tucked}
          inert={!tucked}
          aria-label="Mostrar directo"
          aria-controls={`${id}-window`}
          aria-expanded={false}
          onClick={() => setHidden(false)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <Radio size={16} aria-hidden="true" />
          <span>Ver directo</span>
        </button>
      </div>
    </>,
    portalTarget
  );
}
