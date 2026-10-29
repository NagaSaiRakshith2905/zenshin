import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/postcss";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({ root: here("./"), resolve: { alias: { "@": here("../../src"), "next/navigation": here("./navigation.tsx"), "next/link": here("./link.tsx") } }, esbuild: { jsx: "automatic" }, css: { postcss: { plugins: [tailwindcss()] } }, server: { host: "127.0.0.1", port: 5173, strictPort: true, fs: { allow: [here("../../")] } } });
