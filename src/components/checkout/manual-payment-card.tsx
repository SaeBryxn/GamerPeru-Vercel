"use client";

import React, { useId, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Icon } from "@/components/ui";
import {
  loadPaymentInstructionsAction,
  requestProofUploadIntentAction,
  submitPaymentProofAction,
} from "@/lib/payments/actions";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./manual-payment-card.module.css";

const ACCEPTED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const SPRING = { type: "spring", stiffness: 420, damping: 28 } as const;

// Named states let the icon inherit the dropzone's hover/drag state without its own handlers.
const DROPZONE_VARIANTS: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.005 },
  drag: { scale: 1.015 },
};

const DROPZONE_ICON_VARIANTS: Variants = {
  rest: { y: 0, scale: 1 },
  hover: { y: -2, scale: 1.04 },
  drag: { y: -5, scale: 1.1 },
};

export interface ManualPaymentCardProps {
  instructions: PaymentInstructionDTO;
  /** Lets the page heading follow the payment as it moves from pending to submitted. */
  onStatusChange?: (status: PaymentInstructionDTO["paymentStatus"]) => void;
}

export function ManualPaymentCard({
  instructions,
  onStatusChange,
}: ManualPaymentCardProps): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const [currentStatus, setStatus] = useState(instructions.paymentStatus);
  const [isDragging, setIsDragging] = useState(false);

  const setCurrentStatus = (status: PaymentInstructionDTO["paymentStatus"]) => {
    setStatus(status);
    onStatusChange?.(status);
  };
  const [operationCode, setOperationCode] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExpiredError, setIsExpiredError] = useState(false);

  // Stable material submission intent state
  const [submissionAttemptId, setSubmissionAttemptId] = useState<string>(() => crypto.randomUUID());
  const [preparedProof, setPreparedProof] = useState<{
    uploadIntentId: string;
    fileKey: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const opCodeInputId = useId();
  const notesInputId = useId();
  const fileInputId = useId();
  const errorAlertId = useId();

  const isEligible =
    currentStatus === "UNPAID" ||
    (currentStatus === "REJECTED" && instructions.isEligibleForSubmission);

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(instructions.accountIdentifier);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleOpCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOperationCode(e.target.value);
    setErrorMessage(null);
    setIsExpiredError(false);
    // Material customer edit generates a new stable attempt ID
    setSubmissionAttemptId(crypto.randomUUID());
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerNotes(e.target.value);
    setErrorMessage(null);
    setIsExpiredError(false);
    // Material customer edit generates a new stable attempt ID
    setSubmissionAttemptId(crypto.randomUUID());
  };

  const acceptFile = (file: File | undefined) => {
    setErrorMessage(null);
    setIsExpiredError(false);
    if (!file) return;

    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      setErrorMessage("Solo se permiten archivos JPG, PNG o WebP.");
      return;
    }

    if (file.size > MAX_PROOF_BYTES) {
      setErrorMessage("El archivo excede el tamaño máximo permitido de 5MB.");
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    // Invalidate prepared proof and rotate attempt ID for new file intent
    setPreparedProof(null);
    setSubmissionAttemptId(crypto.randomUUID());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isSubmitting) return;
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setPreparedProof(null);
    setSubmissionAttemptId(crypto.randomUUID());
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await loadPaymentInstructionsAction(instructions.orderNumber);
      if (res.success) {
        setCurrentStatus(res.instructions.paymentStatus);
        if (res.instructions.paymentStatus !== "UNPAID") {
          setErrorMessage(null);
          setIsExpiredError(false);
        } else {
          // Legitimately still UNPAID -> reset attempt state for fresh customer intent
          setSubmissionAttemptId(crypto.randomUUID());
          setPreparedProof(null);
          setErrorMessage(null);
          setIsExpiredError(false);
        }
      }
    } catch {
      // Retain message
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsExpiredError(false);

    const trimmedOpCode = operationCode.trim();
    if (trimmedOpCode.length === 0) {
      setErrorMessage("Por favor ingrese el número o código de operación de su transferencia.");
      return;
    }

    if (trimmedOpCode.length > 50) {
      setErrorMessage("El código de operación no puede exceder 50 caracteres.");
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadIntentId: string | null = null;

      // 1. If file is attached: reuse prepared upload intent or request intent & PUT to R2
      if (selectedFile) {
        const fileKey = `${selectedFile.name}_${selectedFile.size}_${selectedFile.lastModified}`;

        if (preparedProof && preparedProof.fileKey === fileKey) {
          uploadIntentId = preparedProof.uploadIntentId;
        } else {
          const intentRes = await requestProofUploadIntentAction({
            orderNumber: instructions.orderNumber,
            declaredMimeType: selectedFile.type,
            declaredSizeBytes: selectedFile.size,
          });

          if (!intentRes.success) {
            setErrorMessage(intentRes.error || "No se pudo preparar la carga del comprobante.");
            setIsSubmitting(false);
            return;
          }

          uploadIntentId = intentRes.uploadIntentId;

          // The PUT goes straight to the storage provider, so a CORS or network rejection
          // surfaces here as a thrown TypeError rather than a non-OK response.
          const uploadRes = await fetch(intentRes.presignedPutUrl, {
            method: "PUT",
            body: selectedFile,
            headers: {
              "Content-Type": selectedFile.type,
            },
          }).catch(() => null);

          if (!uploadRes?.ok) {
            setErrorMessage(
              "Error al subir el comprobante. Por favor intente nuevamente o envíe solo el código de operación."
            );
            setIsSubmitting(false);
            return;
          }

          setPreparedProof({
            uploadIntentId: intentRes.uploadIntentId,
            fileKey,
          });
        }
      }

      // 2. Submit payment proof using stable submissionAttemptId
      const submitRes = await submitPaymentProofAction({
        orderNumber: instructions.orderNumber,
        submissionAttemptId,
        operationCode: trimmedOpCode,
        uploadIntentId,
        customerNotes: customerNotes.trim() ? customerNotes.trim() : null,
      });

      if (!submitRes.success) {
        if (submitRes.code === "IDEMPOTENCY_EXPIRED") {
          setIsExpiredError(true);
        } else if (submitRes.code === "IDEMPOTENCY_CONFLICT") {
          setSubmissionAttemptId(crypto.randomUUID());
          setPreparedProof(null);
        }
        setErrorMessage(submitRes.error || "Ocurrió un error al registrar el pago.");
        setIsSubmitting(false);
        return;
      }

      setCurrentStatus("SUBMITTED");
      setSuccessMessage(
        "¡Comprobante enviado exitosamente! Su pago se encuentra en proceso de revisión por nuestro equipo."
      );
      handleRemoveFile();
    } catch {
      // On network/transport ambiguity: preserve submissionAttemptId and preparedProof for exact retry
      setErrorMessage(
        "Error de conexión al procesar el pago. Por favor intente nuevamente para confirmar el envío."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className={styles.card}
      data-testid="manual-payment-card"
      aria-labelledby="payment-title"
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Paso final</p>
          <h2 id="payment-title" className={styles.title}>
            Paga con {instructions.paymentMethodName}
          </h2>
        </div>

        {currentStatus === "UNPAID" && (
          <span
            className={`${styles.statusBadge} ${styles.statusPending}`}
            data-testid="manual-payment-status-badge"
          >
            <Icon icon={Clock} size="sm" aria-hidden="true" />
            Pendiente de Pago
          </span>
        )}
        {currentStatus === "SUBMITTED" && (
          <span
            className={`${styles.statusBadge} ${styles.statusReview}`}
            data-testid="manual-payment-status-badge"
          >
            <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
            En Revisión
          </span>
        )}
        {currentStatus === "VERIFYING" && (
          <span
            className={`${styles.statusBadge} ${styles.statusReview}`}
            data-testid="manual-payment-status-badge"
          >
            <Icon icon={Clock} size="sm" aria-hidden="true" />
            Verificando
          </span>
        )}
        {currentStatus === "PAID" && (
          <span
            className={`${styles.statusBadge} ${styles.statusPaid}`}
            data-testid="manual-payment-status-badge"
          >
            <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
            Pago Verificado
          </span>
        )}
        {currentStatus === "REJECTED" && (
          <span
            className={`${styles.statusBadge} ${styles.statusRejected}`}
            data-testid="manual-payment-status-badge"
          >
            <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
            Pago Rechazado
          </span>
        )}
      </div>

      <div className={styles.instructions}>
        <dl className={styles.details}>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Monto exacto a pagar</dt>
            <dd className={styles.amount} data-testid="manual-payment-amount">
              {formatCurrency(instructions.amountCents)}
            </dd>
          </div>

          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Número o cuenta</dt>
            <dd className={styles.accountRow}>
              <span className={styles.detailValue} data-testid="manual-payment-account-number">
                {instructions.accountIdentifier}
              </span>
              <button
                type="button"
                onClick={handleCopyAccount}
                className={styles.copyButton}
                aria-label="Copiar número de cuenta o teléfono"
              >
                <Icon icon={copiedAccount ? CheckCircle2 : Copy} size="sm" aria-hidden="true" />
                <span>{copiedAccount ? "Copiado" : "Copiar"}</span>
              </button>
            </dd>
          </div>

          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Titular</dt>
            <dd className={styles.detailValue} data-testid="manual-payment-recipient-name">
              {instructions.recipientName}
            </dd>
          </div>
        </dl>

        {instructions.qrSignedUrl && (
          <div className={styles.qrContainer} data-testid="manual-payment-qr-container">
            <Image
              src={instructions.qrSignedUrl}
              alt={`Código QR para pago con ${instructions.paymentMethodName}`}
              width={152}
              height={152}
              className={styles.qrImage}
              unoptimized
            />
            <span className={styles.qrCaption}>Escanea para pagar</span>
          </div>
        )}
      </div>

      {instructions.instructionText && (
        <p className={styles.instructionText} data-testid="manual-payment-text-instructions">
          {instructions.instructionText}
        </p>
      )}

      {currentStatus === "SUBMITTED" && (
        <div
          className={`${styles.notice} ${styles.noticeInfo}`}
          data-testid="manual-payment-submitted-notice"
        >
          <Icon icon={CheckCircle2} size="md" aria-hidden="true" />
          <div>
            <strong>Comprobante enviado — pago en revisión.</strong>
            <p className={styles.noticeText}>
              Hemos recibido tu información. Nuestro equipo validará el comprobante en horario de
              atención.
            </p>
          </div>
        </div>
      )}

      {currentStatus === "PAID" && (
        <div className={`${styles.notice} ${styles.noticeSuccess}`}>
          <Icon icon={CheckCircle2} size="md" aria-hidden="true" />
          <div>
            <strong>¡Pago confirmado y aprobado!</strong>
            <p className={styles.noticeText}>Tu pedido comenzará a prepararse para despacho.</p>
          </div>
        </div>
      )}

      {isEligible && (
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <h3 className={styles.formTitle}>Registra tu pago</h3>

          <AnimatePresence initial={false}>
            {errorMessage && (
              <motion.div
                key="error"
                className={styles.noticeMotion}
                initial={prefersReducedMotion ? false : { opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  id={errorAlertId}
                  role="alert"
                  className={`${styles.notice} ${styles.noticeError}`}
                  data-testid="manual-payment-error-alert"
                >
                  <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
                  <div className={styles.noticeBody}>
                    <span>{errorMessage}</span>
                    {isExpiredError && (
                      <button
                        type="button"
                        onClick={handleRefreshStatus}
                        disabled={isRefreshing}
                        className={styles.ghostSmallButton}
                        data-testid="manual-payment-refresh-status-button"
                      >
                        <Icon
                          icon={isRefreshing ? Loader2 : RefreshCw}
                          size="sm"
                          className={isRefreshing ? styles.spinner : undefined}
                          aria-hidden="true"
                        />
                        <span>{isRefreshing ? "Actualizando..." : "Actualizar estado"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {successMessage && (
            <div className={`${styles.notice} ${styles.noticeSuccess}`}>
              <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label htmlFor={opCodeInputId} className={styles.label}>
              Número / Código de Operación <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id={opCodeInputId}
              type="text"
              required
              value={operationCode}
              onChange={handleOpCodeChange}
              placeholder="Ej: 12345678"
              className={styles.input}
              data-testid="manual-payment-operation-code-input"
              disabled={isSubmitting}
              maxLength={50}
              aria-describedby={errorMessage ? errorAlertId : undefined}
            />
            <span className={styles.helperText}>
              Ingresa los dígitos exactos que figuran en tu constancia de pago.
            </span>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>
              Comprobante de pago <span className={styles.optionalTag}>(Opcional)</span>
            </span>

            {!selectedFile ? (
              <motion.label
                htmlFor={fileInputId}
                className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
                data-testid="manual-payment-dropzone"
                variants={prefersReducedMotion ? undefined : DROPZONE_VARIANTS}
                initial="rest"
                animate={isDragging ? "drag" : "rest"}
                whileHover={isSubmitting ? undefined : "hover"}
                transition={SPRING}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.srOnly}
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                />
                <motion.span
                  className={styles.dropzoneIcon}
                  variants={prefersReducedMotion ? undefined : DROPZONE_ICON_VARIANTS}
                  transition={SPRING}
                  aria-hidden="true"
                >
                  <UploadCloud size={26} />
                </motion.span>
                <span className={styles.dropzoneTitle}>
                  {isDragging
                    ? "Suelta la imagen aquí"
                    : "Arrastra tu comprobante o haz clic para adjuntarlo"}
                </span>
                <span className={styles.helperText}>JPG, PNG o WebP · máximo 5 MB</span>
              </motion.label>
            ) : (
              <div className={styles.filePreview} data-testid="manual-payment-file-preview">
                <div className={styles.filePreviewInfo}>
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Vista previa del comprobante adjunto"
                      width={48}
                      height={48}
                      className={styles.previewThumbnail}
                      unoptimized
                    />
                  ) : (
                    <Icon icon={FileImage} size="md" aria-hidden="true" />
                  )}
                  <div className={styles.fileMeta}>
                    <div className={styles.fileName}>{selectedFile.name}</div>
                    <div className={styles.fileSize}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className={styles.removeFileButton}
                  aria-label="Quitar archivo adjunto"
                  disabled={isSubmitting}
                  data-testid="manual-payment-remove-file-button"
                >
                  <Icon icon={Trash2} size="sm" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor={notesInputId} className={styles.label}>
              Notas adicionales <span className={styles.optionalTag}>(Opcional)</span>
            </label>
            <input
              id={notesInputId}
              type="text"
              value={customerNotes}
              onChange={handleNotesChange}
              placeholder="Ej: Transferencia realizada desde cuenta BCP"
              className={styles.input}
              data-testid="manual-payment-customer-notes-input"
              disabled={isSubmitting}
              maxLength={200}
            />
          </div>

          <motion.button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitButton}
            data-testid="manual-payment-submit-button"
            whileHover={isSubmitting || prefersReducedMotion ? undefined : { scale: 1.015 }}
            whileTap={isSubmitting || prefersReducedMotion ? undefined : { scale: 0.985 }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
          >
            {isSubmitting ? (
              <>
                <Icon icon={Loader2} size="sm" className={styles.spinner} aria-hidden="true" />
                <span>Registrando comprobante...</span>
              </>
            ) : (
              <>
                <Icon icon={Send} size="sm" aria-hidden="true" />
                <span>Enviar Comprobante de Pago</span>
              </>
            )}
          </motion.button>
        </form>
      )}
    </section>
  );
}
