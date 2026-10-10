import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import { SiteFooter } from "@/components/layout/site-footer";

import { archivo, atkinson } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CoogCrave", template: "%s · CoogCrave" },
  description:
    "Campus food delivered to your building by fellow UH students. An independent student project.",
  applicationName: "CoogCrave",
};

export const viewport: Viewport = {
  themeColor: "#c41e3a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request so it can carry this request's CSP nonce (src/proxy.ts).
  await connection();

  return (
    <html lang="en" className={`${archivo.variable} ${atkinson.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-canvas focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
