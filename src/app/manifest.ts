import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zenshin",
    short_name: "Zenshin",
    description: "A private workspace for planning and tracking development.",
    start_url: "/",
    display: "standalone",
    theme_color: "#18181B",
    background_color: "#18181B",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
