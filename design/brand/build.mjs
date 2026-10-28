// Builds Zenshin logo assets from design/brand/zenshin-logo.svg. Usage: node build.mjs <brandDir>
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const out = process.argv[2];
const src = fs.readFileSync(path.join(out, "zenshin-logo.svg"), "utf8");
const vb = src.match(/viewBox="([^"]+)"/)[1];
const d = src.match(/ d="([^"]+)"/)[1];
const [, , vw, vh] = vb.split(/\s+/).map(Number);

// Hex equivalents of the zinc tokens in design/ui-mockups/ui.css (resvg has no oklch)
const C = { ink: "#18181B", paper: "#FAFAFA", bg: "#09090B" };

// Mark centred in a size×size canvas at `scale` of the side, optional square background.
function compose(size, { fill, bg, scale = 0.6, radius = 0 }) {
  const w = size * scale, h = (w * vh) / vw;
  const x = (size - w) / 2, y = (size - h) / 2;
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${back}<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}"><path fill="${fill}" d="${d}"/></svg></svg>`;
}
const png = (svg) => new Resvg(svg).render().asPng();
const write = (name, data) => fs.writeFileSync(path.join(out, name), data);

// SVGs
write("zenshin-logo-black.svg", src.replace('fill="currentColor"', `fill="${C.ink}"`));
write("zenshin-logo-white.svg", src.replace('fill="currentColor"', `fill="${C.paper}"`));
write("favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><style>path{fill:${C.ink}}@media (prefers-color-scheme:dark){path{fill:${C.paper}}}</style><path d="${d}"/></svg>`);
write("icon-tile.svg", compose(512, { fill: C.paper, bg: C.ink, scale: 0.62, radius: 112 }));

// PNGs
const fav = {};
for (const s of [16, 32, 48]) fav[s] = png(compose(s, { fill: C.ink, scale: 0.92 }));
write("favicon-32.png", fav[32]);
write("apple-touch-icon.png", png(compose(180, { fill: C.paper, bg: C.ink, scale: 0.62 })));
write("icon-192.png", png(compose(192, { fill: C.paper, bg: C.ink, scale: 0.62 })));
write("icon-512.png", png(compose(512, { fill: C.paper, bg: C.ink, scale: 0.62 })));
write("icon-maskable-512.png", png(compose(512, { fill: C.paper, bg: C.ink, scale: 0.5 }))); // inside 80% safe zone
write("logo-black-1024.png", png(compose(1024, { fill: C.ink, scale: 0.9 })));
write("logo-white-1024.png", png(compose(1024, { fill: C.paper, scale: 0.9 })));
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${C.bg}"/><svg x="450" y="165" width="300" height="${(300 * vh) / vw}" viewBox="${vb}"><path fill="${C.paper}" d="${d}"/></svg></svg>`;
write("og-image.png", png(og));

// ICO with embedded PNGs (16/32/48)
const imgs = [16, 32, 48].map((s) => [s, fav[s]]);
const head = Buffer.alloc(6 + 16 * imgs.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach(([s, b], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length;
});
const ico = Buffer.concat([head, ...imgs.map(([, b]) => b)]);
write("favicon.ico", ico);

// self-check: PNG signatures and ICO entry count
for (const f of fs.readdirSync(out).filter((f) => f.endsWith(".png")))
  assert.equal(fs.readFileSync(path.join(out, f)).subarray(1, 4).toString(), "PNG", f);
assert.equal(ico.readUInt16LE(4), 3);
console.log("ok", fs.readdirSync(out).join(" "));
