import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { getServerEnv } from "@/server/env";
import "./globals.css";

export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  // The canonical origin is runtime configuration; builds need no deployment values.
  await connection();
  return {
    metadataBase: new URL(getServerEnv().APP_ORIGIN),
    title: { default: "Zenshin", template: "%s · Zenshin" },
    applicationName: "Zenshin",
    description: "A private workspace for planning and tracking development.",
    robots: { index: false, follow: false },
    // Icons come from app/favicon.ico, icon.svg and apple-icon.png; a metadata `icons` value would hide them.
  };
}

export const viewport: Viewport = { themeColor: "#18181B" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);" }} /></head>
      <body>{children}</body>
    </html>
  );
}
