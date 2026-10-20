import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Configurateur cuisine d'Emmanuel",
  description: "Éditeur de cuisine et rénovation avec plan ajustable, réseaux manuels, métré et budget matériaux.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
