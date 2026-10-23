"use client";
import React, { useEffect, useState } from "react";
export function reservationRemaining(expiresAt: string, now: number) {
  const remaining = Date.parse(expiresAt) - now;
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / 1000)) : null;
}
export function ReservationNotice({
  expiresAt,
  serverNow,
}: {
  expiresAt: string | null | undefined;
  serverNow?: string;
}) {
  const [now, setNow] = useState(serverNow ? Date.parse(serverNow) : null);
  useEffect(() => {
    const start = performance.now();
    const serverStart = serverNow ? Date.parse(serverNow) : Date.now();
    const tick = () => setNow(serverStart + performance.now() - start);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, serverNow]);
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) return null;
  const remaining = now === null ? null : reservationRemaining(expiresAt, now);
  return (
    <p>
      {remaining === 0 ? (
        "La reserva venció. El stock ya no está garantizado; el servidor comprobará la disponibilidad."
      ) : (
        <>
          Reserva hasta{" "}
          {new Intl.DateTimeFormat("es-PE", {
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
            timeZone: "America/Lima",
          }).format(new Date(expiresAt))}{" "}
          (hora de Lima).
          {remaining !== null && (
            <span>
              {" "}
              Quedan {Math.floor(remaining / 60)} min {remaining % 60} s.
            </span>
          )}
        </>
      )}
    </p>
  );
}
