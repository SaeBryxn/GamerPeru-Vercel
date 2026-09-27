const LIMA_DATE_TIME = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

const RELATIVE = new Intl.RelativeTimeFormat("es-PE", { numeric: "auto" });

export function formatLimaDateTime(isoDate: string): string {
  return LIMA_DATE_TIME.format(new Date(isoDate));
}

/** Relative to a fixed reference instant so server and client render the same text. */
export function formatRelative(isoDate: string, referenceIso: string): string {
  const diffMinutes = Math.round(
    (new Date(isoDate).getTime() - new Date(referenceIso).getTime()) / 60_000
  );
  if (Math.abs(diffMinutes) < 60) return RELATIVE.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) return RELATIVE.format(diffHours, "hour");
  return RELATIVE.format(Math.round(diffHours / 24), "day");
}

export function formatAttempt(attemptNumber: number): string {
  return attemptNumber === 1 ? "1.er envío" : `${attemptNumber}.º envío`;
}
