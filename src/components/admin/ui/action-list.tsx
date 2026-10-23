import React, { type ComponentProps, type ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { StatusDot } from "./admin-ui";
import styles from "./action-list.module.css";

export type ActionTone = "critical" | "attention";

export interface ActionItem {
  id: string;
  count: number;
  label: string;
  /** Second line: the amount at stake, what the queue holds. */
  detail?: React.ReactNode;
  /** How long the oldest item has waited, already formatted. */
  waiting?: { text: string; dateTime: string; title: string } | null;
  href: string | null;
  tone: ActionTone;
}

interface ActionListProps {
  items: ActionItem[];
  /** Said when nothing is pending; the queues with zero are listed after it. */
  allClearLabel: string;
  /** Lets a screen swap the row link (e.g. a hover effect) without changing the list. */
  LinkComponent?: ComponentType<ComponentProps<typeof Link>>;
  testIdPrefix?: string;
}

/**
 * Work waiting on a person, one row per queue: the count, what it is, how long it
 * has waited and where to resolve it. Critical rows go first, the oldest leading;
 * the first row with a destination is marked as the next task. Queues at zero
 * collapse into one quiet line so the list only grows with real work.
 */
export function ActionList({
  items,
  allClearLabel,
  LinkComponent = Link,
  testIdPrefix = "action",
}: ActionListProps) {
  const pending = items
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        (a.tone === "critical" ? 0 : 1) - (b.tone === "critical" ? 0 : 1) ||
        (a.waiting ? Date.parse(a.waiting.dateTime) : Infinity) -
          (b.waiting ? Date.parse(b.waiting.dateTime) : Infinity)
    );
  const clear = items.filter((item) => item.count === 0);
  const next = pending.find((item) => item.href);

  return (
    <div className={styles.list}>
      {pending.length === 0 ? (
        <p className={styles.allClear} data-testid={`${testIdPrefix}-all-clear`}>
          <CheckCircle2 size={18} aria-hidden="true" />
          {allClearLabel}
        </p>
      ) : (
        <ul className={styles.rows}>
          {pending.map((item) => {
            const isNext = item === next;
            const body = (
              <>
                <span className={styles.count}>{item.count.toLocaleString("en-US")}</span>
                <span className={styles.copy}>
                  <span className={styles.label}>
                    <StatusDot tone={item.tone} />
                    {item.label}
                    {isNext && <span className={styles.nextTag}>Siguiente</span>}
                  </span>
                  {(item.detail ?? item.waiting) && (
                    <span className={styles.meta}>
                      {item.detail}
                      {item.detail && item.waiting && <span aria-hidden="true"> · </span>}
                      {item.waiting && (
                        <time dateTime={item.waiting.dateTime} title={item.waiting.title}>
                          {item.waiting.text}
                        </time>
                      )}
                    </span>
                  )}
                </span>
                {item.href && <ArrowRight className={styles.arrow} size={18} aria-hidden="true" />}
              </>
            );
            return (
              <li key={item.id} data-testid={`${testIdPrefix}-${item.id}`}>
                {item.href ? (
                  <LinkComponent
                    href={item.href}
                    className={styles.row}
                    data-priority={isNext ? "next" : undefined}
                  >
                    {body}
                  </LinkComponent>
                ) : (
                  <div className={styles.row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pending.length > 0 && clear.length > 0 && (
        <p className={styles.clearLine} data-testid={`${testIdPrefix}-clear-queues`}>
          <CheckCircle2 size={14} aria-hidden="true" />
          Al día: {clear.map((item) => item.label).join(" · ")}
        </p>
      )}
    </div>
  );
}
