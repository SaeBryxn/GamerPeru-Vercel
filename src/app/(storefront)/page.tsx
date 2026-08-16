export default function HomePage() {
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
          maxWidth: "600px",
          padding: "2.5rem",
          borderRadius: "12px",
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: "700",
            marginBottom: "1rem",
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Gamer Perú
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: "1.6",
            marginBottom: "1.5rem",
          }}
        >
          Plataforma de e-commerce de periféricos gamer de alto rendimiento para el mercado peruano.
        </p>
        <div
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            backgroundColor: "rgba(255, 70, 85, 0.1)",
            border: "1px solid rgba(255, 70, 85, 0.3)",
            color: "var(--accent)",
            fontSize: "0.875rem",
            fontWeight: "600",
            fontFamily: "var(--font-mono)",
          }}
        >
          Application Foundation Initialized (GP-007)
        </div>
      </div>
    </main>
  );
}
