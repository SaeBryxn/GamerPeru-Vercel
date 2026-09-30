import type { Metadata } from "next";
import localFont from "next/font/local";
import { APP_CONFIG } from "@/config/app";
import "./globals.css";

// Self-hosted (SIL OFL, latin subset of the variable fonts from Google Fonts) so builds do not
// depend on downloading them: an intermittent Google Fonts failure breaks `next/font/google`.
const plusJakartaSans = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "500 800",
  variable: "--font-heading",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 600",
  variable: "--font-body",
  display: "swap",
});

const jetBrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "400 500",
  variable: "--font-mono",
  display: "swap",
});

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
    <html
      lang={APP_CONFIG.defaultLocale}
      className={`${plusJakartaSans.variable} ${inter.variable} ${jetBrainsMono.variable}`}
      // The admin theme script sets data-admin-theme here before hydration, on purpose.
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
