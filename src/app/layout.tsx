import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PortfolioProvider } from "@/components/shell/PortfolioProvider";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Franchise HQ",
  description: "Manage every Sleeper fantasy football league from one command center.",
  appleWebApp: { capable: true, title: "Franchise HQ", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e141b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortfolioProvider>
          <AppShell>{children}</AppShell>
        </PortfolioProvider>
      </body>
    </html>
  );
}
