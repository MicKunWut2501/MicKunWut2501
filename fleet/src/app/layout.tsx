import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luanda Fleet",
  description: "Yango fleet management: weekly rent collection, maintenance, model vs actual and driver scorecard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
