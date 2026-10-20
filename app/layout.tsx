import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atelier Rénovation",
  description: "Éditeur de plans irréguliers, doublages, réseaux techniques, métrés et achats de rénovation.",
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
