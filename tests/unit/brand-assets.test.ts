import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Logo } from "@/components/brand/logo";
import manifest from "@/app/manifest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));

describe("supplied Zenshin brand assets", () => {
  it.each([
    ["favicon.svg", "src/app/icon.svg"],
    ["favicon.ico", "src/app/favicon.ico"],
    ["apple-touch-icon.png", "src/app/apple-icon.png"],
    ["og-image.png", "src/app/opengraph-image.png"],
    ...["zenshin-logo-black.svg", "zenshin-logo-white.svg", "favicon-32.png",
      "icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon-tile.svg"]
      .map((name) => [name, `public/brand/${name}`]),
  ])("ships %s without regeneration", (source, destination) => {
    expect(read(destination).equals(read(`design/brand/${source}`))).toBe(true);
  });

  it("preserves the master path and uses currentColor in-app", () => {
    const source = read("design/brand/zenshin-logo.svg").toString();
    const rendered = renderToStaticMarkup(createElement(Logo));
    expect(rendered.match(/\sd="([^"]+)"/)?.[1]).toBe(source.match(/\sd="([^"]+)"/)?.[1]);
    expect(rendered).toContain('fill="currentColor"');
  });

  it("publishes the required app name, theme and existing manifest icons", () => {
    const result = manifest();
    expect(result.name).toBe("Zenshin");
    expect(result.theme_color).toBe("#18181B");
    expect(result.background_color).toBe("#18181B");
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of result.icons ?? []) {
      expect(read(`public${icon.src}`).length).toBeGreaterThan(0);
    }
  });
});
