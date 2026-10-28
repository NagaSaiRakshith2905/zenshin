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
    icons: { icon: [{ url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }] },
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
