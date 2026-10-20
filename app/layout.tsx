import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Configurateur cuisine d'Emmanuel",
  description: "Éditeur interactif de cuisine avec drag-and-drop, plans nommés et simulation des réseaux.",
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
