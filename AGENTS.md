# AGENTS.md — Font Analysis App

Desktop-oriented web app to scan, analyze, and compare font files.
React 19 + Tailwind 4 + Vite (client) / Express 5 + opentype.js (server). JSON-file DB.

## Run

```bash
npm install
npm run dev          # Vite :5173 + Express API :3001 (concurrently)
```

- Font previews/analysis need the Google Fonts repo cloned locally (gitignored, ~4 GB):
  `git clone --depth=1 https://github.com/google/fonts.git google-fonts/` — **already cloned in this workspace.**
- Other: `npm run build` (tsc + vite), `npm run lint`, `npx playwright test e2e/library-features.spec.ts`.
- Pre-existing lint: 11 `@typescript-eslint/no-explicit-any` errors in `LibraryView.tsx` (not ours). Pre-existing console error: `favicon.ico` 404.

## Layout

- `server/` — `index.ts` (API routes), `database.ts`, `scanner.ts` (metrics/classification/SVG, computed at scan time), `buildGoogleFontsDb.ts`.
- `src/components/` — views: `LibraryView.tsx` (list + grid), `AnalyzeView.tsx`, `CompareView.tsx`, etc.
- `src/lib/` — `fontFamilies.ts` (grouping helpers), `useFontFace.ts` (lazy @font-face), `api.ts`, `axisDescriptions.ts`.
- `src/types/index.ts` — `FontFamily`, `StoredFontMeta`, `VariableAxis`.
- `google-fonts-db.json` — committed pre-built ~3580-font DB (27 MB).

## Current work: library tags, filters & tile fixes (2026-11-19)

**Status: implemented, verified (unit + Playwright + browser), not committed.**

- `src/lib/extendedTags.ts`: **extended tags**, from the "H" outline in `glyphSvgs` (nonzero-winding scanlines). They correct serif/sans and add `slab`. Display/script/mono stay from the metadata. `resolveCategory()`: user override > extended > metadata. Tested against Google `METADATA.pb` (~97% on serif/sans) and `tags/all/families.csv` `/Slab/` (that list is incomplete).
- The static build strips `glyphSvgs`, so `stripForWeb` (server/staticDb.ts) precomputes `extendedTags` on each font. Server tsconfig includes `extendedTags.ts`.
- LibraryView: "Tags: file meta / extended" radios (default extended, localStorage `fa:tagMode`), "Slab" chip, All/Variable/Static switch (replaces the "Variable only" checkbox). The filter row wraps.
- `src/components/Tip.tsx`: CSS-only tooltip with `aria-describedby`. It is used on the source, vf and count tags, the weight ruler, the right axis control and the `+`. The tile root is `overflow-hidden`, so tooltips must stay inside the tile.
- Fixes: `vf` hidden under the source notch (`TopSegment overlappedEnd`), italic no longer moves `+`, fluid weight ruler hides end labels near the value, Analyze remembers its last font (`fa:lastAnalyzedFont`, cleared when the load fails).
- e2e source-badge selector now uses `aria-label`.

**Open (user to choose scope):** better extended tags. Options: (1) serif/slab accuracy with more glyphs (`n`, `x`, `O`), fewer slab tags on display faces; (2) outline checks for script/mono; (3) the 83 fonts without "H"; (4) all.

**Gotcha:** static weight/slant swaps load a new font file asynchronously. Poll until the rendered `fontFamily` changes.

## Conventions

Conventional commits (`feat:`, `fix:`, `chore:`, …).
