"use client";

import { useId, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ImageIcon, LoaderCircle } from "lucide-react";
import { DrawerHeader, SideDrawer } from "@/components/admin/ui";
import { getProofViewUrlAction } from "@/lib/payments/verification-actions";
import styles from "./orders.module.css";

type ProofState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

/**
 * Opens the receipt image of a submission without leaving the list. The URL is signed only on
 * click: signing is audited and the link expires in five minutes.
 */
export function ProofPreview({
  submissionId,
  orderNumber,
}: {
  submissionId: string;
  orderNumber: string;
}) {
  const titleId = useId();
  const [state, setState] = useState<ProofState>({ kind: "closed" });

  const open = async () => {
    setState({ kind: "loading" });
    try {
      const result = await getProofViewUrlAction(submissionId);
      setState(
        result.success
          ? { kind: "ready", url: result.url }
          : { kind: "error", message: result.error }
      );
    } catch {
      setState({ kind: "error", message: "No se pudo cargar el comprobante." });
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.proofButton}
        onClick={() => void open()}
        aria-label={`Ver comprobante del pedido ${orderNumber}`}
      >
        {state.kind === "loading" ? (
          <LoaderCircle size={14} className={styles.spin} aria-hidden="true" />
        ) : (
          <ImageIcon size={14} aria-hidden="true" />
        )}
        Comprobante
      </button>
      <AnimatePresence>
        {state.kind === "ready" || state.kind === "error" ? (
          <SideDrawer labelledBy={titleId} onClose={() => setState({ kind: "closed" })}>
            <DrawerHeader
              titleId={titleId}
              eyebrow={`Pedido ${orderNumber}`}
              title="Comprobante de pago"
              onClose={() => setState({ kind: "closed" })}
            />
            <div className={styles.proofBody}>
              {state.kind === "ready" ? (
                // A private, short-lived signed URL: next/image would cache and proxy it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.url}
                  alt={`Comprobante del pedido ${orderNumber}`}
                  className={styles.proofImage}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <p role="alert">{state.message}</p>
              )}
            </div>
          </SideDrawer>
        ) : null}
      </AnimatePresence>
    </>
  );
}
