"use client";

import ErrorBoundary from "./error";
import "./globals.css";

export default function GlobalError(props: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <head><title>Zenshin · Unable to load</title></head>
      <body><ErrorBoundary {...props} /></body>
    </html>
  );
}
