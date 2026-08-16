import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gamer Perú — Periféricos Gamer Premium en Perú",
  description:
    "E-commerce de periféricos gamer de alto rendimiento en Perú. Mouses, teclados, mousepads y accesorios para esports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
