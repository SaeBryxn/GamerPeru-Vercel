import type { Metadata } from "next";
import { ADMIN_THEME_BOOTSTRAP_SCRIPT } from "@/components/admin/use-admin-theme";
import "@/styles/admin-theme.css";

export const metadata: Metadata = {
  title: "Administración | Gamer Perú",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        Applies the stored (or system) theme before the first paint, so the
        admin never flashes light while loading in dark.
      */}
      <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_BOOTSTRAP_SCRIPT }} />
      {children}
    </>
  );
}
