import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frota Luanda",
  description: "Gestão de frota Yango: cobrança semanal, manutenção, modelo vs realidade e scorecard de motoristas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
