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

**Extended-tag accuracy (2026-11-19, done):**
- `isRegularH()` gate: the "H" must show two straight stems of constant width (`STEM_MAX_SPREAD` 0.4, `STEM_MAX_DRIFT` 0.02). If not (script, inline, shaded, slanted), the outline gives no result and the metadata stays. Wrong serif/sans labels on Google script/display faces: 162 → 53.
- A cupped or rounded serif edge no longer gives `thick=0` (Coustard, Sura, Wellfleet).
- Results on Google Fonts (1029 families with metadata serif/sans): serif/sans 97.6% (metadata alone 76.4%). Slab vs `/Slab/` tags: precision 68%, recall 65%. That list is incomplete (no Kreon, Trocchi, Holtwood One SC), so the real precision is higher. The slab thresholds (0.55 / 0.35) are the best F1 in a grid search.
- The 83 fonts without "H" have no "H" in the cmap (non-Latin, emoji). They keep the metadata. Nothing to do.
- Not done: `n`/`x`/`O` analysis (the remaining errors are flared sans faces, where `n` flares too; about 1 point to gain) and outline checks for script/mono.

**Gotcha:** static weight/slant swaps load a new font file asynchronously. Poll until the rendered `fontFamily` changes.

## Follow-up work (TODO, 2026-11-20)

- [ ] Split the components that are longer than the 40-line limit. AnalyzeView is done (`3fb2378`). Still open: `GlyphsView.tsx` (378 lines), `LibraryView.tsx` (273), `library/FamilyTile.tsx` (257), `ContrastView.tsx` (229).
- [ ] Remove the 33 old `no-explicit-any` lint errors (`server/`, `GlyphsView.tsx`, `lib/api.ts`, `lib/otfFeatures.ts`, `types/opentype.d.ts`, e2e specs).
- [ ] `e2e/contrast-debug.spec.ts` and `e2e/stroke-diagnosis.spec.ts` open `localhost:5175`, so they fail. Use the `baseURL` (5173) of the Playwright config.

## Conventions

Conventional commits (`feat:`, `fix:`, `chore:`, …).
