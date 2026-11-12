import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/postcss";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Tailwind flattens the font CSS imports before Vite can rebase their URLs.
const fonts = Object.fromEntries(["ibm-plex-sans-latin-400-normal", "ibm-plex-sans-latin-500-normal", "ibm-plex-sans-latin-600-normal", "ibm-plex-mono-latin-400-normal"].flatMap((name) => ["woff", "woff2"].map((extension) => [`./files/${name}.${extension}`, here(`../../node_modules/@fontsource/${name.startsWith("ibm-plex-mono") ? "ibm-plex-mono" : "ibm-plex-sans"}/files/${name}.${extension}`)])));
export default defineConfig({ root: here("./"), cacheDir: here("../../test-results/vite"), resolve: { alias: { ...fonts, "@": here("../../src"), "next/navigation": here("./navigation.tsx"), "next/link": here("./link.tsx") } }, esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [tailwindcss()] } }, server: { host: "127.0.0.1", port: 5173, strictPort: true, fs: { allow: [here("../../")] } } });
