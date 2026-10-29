# Zenshin brand assets

The logo is a brush-stroke ensō. `zenshin-logo.svg` is the master file: a single path filled with `currentColor`. Every other file here is generated from it by `build.mjs`.

Colours come from the zinc tokens in [ui.css](../ui-mockups/ui.css). There is no brand accent colour. resvg can't read oklch, so the build uses these hex equivalents:

- `#18181B` (primary): app-icon tiles and the dark mark
- `#FAFAFA` (primary-foreground): the light mark
- `#09090B` (dark background): the social preview image

## Files and where they go in Phase 1

| File | Use | Next.js location |
|---|---|---|
| `zenshin-logo.svg` | In-app logo: sidebar, sign-in, empty states. Inherits the text colour. | inline as a React component (`components/brand/logo.tsx`) |
| `zenshin-logo-black.svg` / `-white.svg` | Fixed-colour logo for docs and outside use | `public/brand/` |
| `favicon.svg` | Browser tab icon: dark mark on a light `#FAFAFA` rounded tile, readable on light and dark browser chrome | `app/icon.svg` |
| `favicon.ico` | Fallback favicon with 16/32/48 px images of the same light tile | `app/favicon.ico` |
| `favicon-32.png` | PNG favicon fallback | `public/brand/` |
| `apple-touch-icon.png` | iOS home-screen icon, 180 px | `app/apple-icon.png` |
| `icon-192.png`, `icon-512.png` | Web app manifest icons | `public/brand/`, listed in `app/manifest.ts` |
| `icon-maskable-512.png` | Manifest icon with `purpose: "maskable"` | `public/brand/` |
| `icon-tile.svg` | Rounded app-icon tile for slides and READMEs | `public/brand/` |
| `logo-black-1024.png` / `logo-white-1024.png` | Large transparent PNGs, for GitHub App and OAuth app avatars | not shipped |
| `og-image.png` | 1200×630 social preview image | `app/opengraph-image.png` |

Manifest `theme_color` / `background_color`: `#18181B`.

## Regenerating

Edit `zenshin-logo.svg`, then run this from a scratch folder that has `@resvg/resvg-js@2.6.2` installed:

```bash
node design/brand/build.mjs design/brand
```

The script checks its own PNG and ICO output. The 16 px favicon is thin because the brush stroke is fine. If it looks weak in a browser tab, draw a heavier 16 px version by hand.
