import type { Metadata } from "next";
import { APP_CONFIG } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.publicTitle,
  description: APP_CONFIG.publicDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={APP_CONFIG.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
