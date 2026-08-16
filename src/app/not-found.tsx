import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: "500px",
          padding: "2.5rem",
          borderRadius: "12px",
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: "700",
            color: "#ff6b78",
            marginBottom: "0.5rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Error 404
        </p>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: "700",
            marginBottom: "1rem",
            color: "var(--foreground)",
          }}
        >
          Página no encontrada
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: "1.6",
            marginBottom: "2rem",
          }}
        >
          El recurso o página que busca no existe, ha sido movido o no se encuentra disponible.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            borderRadius: "6px",
            backgroundColor: "var(--foreground)",
            color: "#0b0e14",
            fontWeight: "700",
            fontSize: "0.875rem",
            textDecoration: "none",
            transition: "opacity 0.2s ease",
          }}
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
