import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Christmas Market Fulfillment",
  description: "Tracking items printed and packed for the three Christmas markets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="top">
            <h1>🎄 Christmas Market Fulfillment</h1>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/items">Items</Link>
              <Link href="/filaments">Filament</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
