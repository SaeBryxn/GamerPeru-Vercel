"use client";

import React, { useId, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileImage,
  Loader2,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Icon } from "@/components/ui";
import { requestProofUploadIntentAction, submitPaymentProofAction } from "@/lib/payments/actions";
import type { PaymentInstructionDTO } from "@/lib/payments/reader";
import { formatCurrency } from "@/lib/utils/currency";
import styles from "./manual-payment-card.module.css";

export interface ManualPaymentCardProps {
  instructions: PaymentInstructionDTO;
}

export function ManualPaymentCard({ instructions }: ManualPaymentCardProps): React.JSX.Element {
  const [currentStatus, setCurrentStatus] = useState(instructions.paymentStatus);
  const [operationCode, setOperationCode] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Solo se permiten archivos JPG, PNG o WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("El archivo excede el tamaño máximo permitido de 5MB.");
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

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

      // 1. If file is attached, request upload intent and PUT directly to R2
      if (selectedFile) {
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

        // Perform PUT upload directly to pre-signed URL
        const uploadRes = await fetch(intentRes.presignedPutUrl, {
          method: "PUT",
          body: selectedFile,
          headers: {
            "Content-Type": selectedFile.type,
          },
        });

        if (!uploadRes.ok) {
          setErrorMessage(
            "Error al subir el comprobante. Por favor intente nuevamente o envíe solo el código de operación."
          );
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Submit payment proof
      const submissionAttemptId = crypto.randomUUID();
      const submitRes = await submitPaymentProofAction({
        orderNumber: instructions.orderNumber,
        submissionAttemptId,
        operationCode: trimmedOpCode,
        uploadIntentId,
        customerNotes: customerNotes.trim() ? customerNotes.trim() : null,
      });

      if (!submitRes.success) {
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
      setErrorMessage("Ocurrió un error inesperado al procesar su solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.card} data-testid="manual-payment-card">
      {/* Header with dynamic status badge */}
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Icon icon={Clock} size="md" aria-hidden="true" />
          Instrucciones de Pago — {instructions.paymentMethodName}
        </h2>

        {currentStatus === "UNPAID" && (
          <span className={styles.statusBadgePending} data-testid="manual-payment-status-badge">
            <Icon icon={Clock} size="sm" aria-hidden="true" />
            Pendiente de Pago
          </span>
        )}

        {currentStatus === "SUBMITTED" && (
          <span className={styles.statusBadgeSubmitted} data-testid="manual-payment-status-badge">
            <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
            En Revisión
          </span>
        )}

        {currentStatus === "VERIFYING" && (
          <span className={styles.statusBadgeSubmitted} data-testid="manual-payment-status-badge">
            <Icon icon={Clock} size="sm" aria-hidden="true" />
            Verificando
          </span>
        )}

        {currentStatus === "PAID" && (
          <span className={styles.statusBadgePaid} data-testid="manual-payment-status-badge">
            <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
            Pago Verificado
          </span>
        )}

        {currentStatus === "REJECTED" && (
          <span className={styles.statusBadgeRejected} data-testid="manual-payment-status-badge">
            <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
            Pago Rechazado
          </span>
        )}
      </div>

      {/* Instructions & Account details */}
      <div className={styles.instructionsGrid}>
        <div className={styles.accountDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Monto exacto a pagar:</span>
            <span className={styles.amountHighlight} data-testid="manual-payment-amount">
              {formatCurrency(instructions.amountCents)}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Número o Cuenta:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className={styles.detailValue} data-testid="manual-payment-account-number">
                {instructions.accountIdentifier}
              </span>
              <button
                type="button"
                onClick={handleCopyAccount}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="Copiar número"
                aria-label="Copiar número de cuenta o teléfono"
              >
                <Icon icon={copiedAccount ? CheckCircle2 : Copy} size="sm" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Titular de la cuenta:</span>
            <span className={styles.detailValue} data-testid="manual-payment-recipient-name">
              {instructions.recipientName}
            </span>
          </div>

          {instructions.instructionText && (
            <p className={styles.instructionText} data-testid="manual-payment-text-instructions">
              {instructions.instructionText}
            </p>
          )}
        </div>

        {/* QR Code view if available */}
        {instructions.qrSignedUrl && (
          <div className={styles.qrContainer} data-testid="manual-payment-qr-container">
            <Image
              src={instructions.qrSignedUrl}
              alt={`Código QR para pago con ${instructions.paymentMethodName}`}
              width={160}
              height={160}
              className={styles.qrImage}
              unoptimized
            />
            <span className={styles.qrCaption}>Escanear para pagar</span>
          </div>
        )}
      </div>

      {/* Submission feedback states */}
      {currentStatus === "SUBMITTED" && (
        <div
          className={`${styles.alertBox} ${styles.alertBoxInfo}`}
          data-testid="manual-payment-submitted-notice"
        >
          <Icon icon={CheckCircle2} size="md" aria-hidden="true" />
          <div>
            <strong>Comprobante enviado — pago en revisión.</strong>
            <div style={{ marginTop: "4px", fontSize: "12px" }}>
              Hemos recibido tu información. Nuestro equipo validará el comprobante en horario de
              atención.
            </div>
          </div>
        </div>
      )}

      {currentStatus === "PAID" && (
        <div className={`${styles.alertBox} ${styles.alertBoxSuccess}`}>
          <Icon icon={CheckCircle2} size="md" aria-hidden="true" />
          <div>
            <strong>¡Pago confirmado y aprobado!</strong>
            <div style={{ marginTop: "4px", fontSize: "12px" }}>
              Tu pedido comenzará a prepararse para despacho.
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Submission Form */}
      {isEligible && (
        <form onSubmit={handleSubmit} className={styles.formSection} noValidate>
          <h3 className={styles.formTitle}>Registrar Pago Realizado</h3>

          {errorMessage && (
            <div
              id={errorAlertId}
              role="alert"
              className={`${styles.alertBox} ${styles.alertBoxError}`}
              data-testid="manual-payment-error-alert"
            >
              <Icon icon={AlertCircle} size="sm" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className={`${styles.alertBox} ${styles.alertBoxSuccess}`}>
              <Icon icon={CheckCircle2} size="sm" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Operation Code Input */}
          <div className={styles.fieldGroup}>
            <label htmlFor={opCodeInputId} className={styles.label}>
              Número / Código de Operación <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id={opCodeInputId}
              type="text"
              required
              value={operationCode}
              onChange={(e) => setOperationCode(e.target.value)}
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

          {/* Optional Voucher File Upload */}
          <div className={styles.fieldGroup}>
            <span className={styles.label}>
              Comprobante de Pago <span className={styles.optionalTag}>(Opcional)</span>
            </span>

            {!selectedFile ? (
              <label
                htmlFor={fileInputId}
                className={styles.dropzone}
                data-testid="manual-payment-dropzone"
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
                <Icon
                  icon={Upload}
                  size="lg"
                  style={{ color: "var(--color-brand-primary, #ff003b)" }}
                  aria-hidden="true"
                />
                <span
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}
                >
                  Haz clic para adjuntar tu comprobante o captura
                </span>
                <span className={styles.helperText}>Formatos JPG, PNG o WebP (máximo 5MB)</span>
              </label>
            ) : (
              <div className={styles.filePreviewCard} data-testid="manual-payment-file-preview">
                <div className={styles.filePreviewInfo}>
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Vista previa del comprobante adjunto"
                      width={44}
                      height={44}
                      className={styles.previewThumbnail}
                      unoptimized
                    />
                  ) : (
                    <Icon icon={FileImage} size="md" aria-hidden="true" />
                  )}
                  <div>
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
                  title="Quitar archivo"
                  aria-label="Quitar archivo adjunto"
                  disabled={isSubmitting}
                  data-testid="manual-payment-remove-file-button"
                >
                  <Icon icon={Trash2} size="sm" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Customer Notes */}
          <div className={styles.fieldGroup}>
            <label htmlFor={notesInputId} className={styles.label}>
              Notas adicionales <span className={styles.optionalTag}>(Opcional)</span>
            </label>
            <input
              id={notesInputId}
              type="text"
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Ej: Transferencia realizada desde cuenta BCP"
              className={styles.input}
              data-testid="manual-payment-customer-notes-input"
              disabled={isSubmitting}
              maxLength={200}
            />
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitButton}
            data-testid="manual-payment-submit-button"
          >
            {isSubmitting ? (
              <>
                <Icon icon={Loader2} size="sm" className="animate-spin" aria-hidden="true" />
                <span>Registrando comprobante...</span>
              </>
            ) : (
              <>
                <Icon icon={Send} size="sm" aria-hidden="true" />
                <span>Enviar Comprobante de Pago</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
