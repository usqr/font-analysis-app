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

## Current work: gallery (grid) tile redesign

**Design spec:** Figma frame — https://www.figma.com/design/0PiSuUU00u7eJH9J3tWLGZ/CKeditor--Copy-?node-id=1681-269 (frame "bg" `1681:269`). File key `0PiSuUU00u7eJH9J3tWLGZ`. Code Connect maps weight_prop/width_prop → `VerticalAxisSlider` (now removed).

**Status: implemented, verified (Playwright), not committed.** Plan: `~/.claude/plans/woolly-foraging-hearth.md`.

Rewrote `GridFamilyCard` in `src/components/LibraryView.tsx`:
- New leaf components (colocated): `TopSegment`, `SourceTag`, `WeightRuler` (stepped=static file-swap / fluid=variable axis step 50), `SlantPicker`, `EdgeAxisControl` (right-edge axis dropdown + dynamic line, covers wdth + opsz/GRAD/etc).
- `CAT_TOKENS` = neon fg on fg×0.5-black bg (sans `#00ff6a`/`#008035`, serif/mono/display/script analogs).
- Container-query scaling: card has `@container`; sizes use `clamp(min, Ncqw, max)`. Grid is fluid: `repeat(auto-fill, minmax(min(100%,230px), 1fr))` (LibraryView `data-testid="grid-view"`) — tiles stretch to fill the row and reflow cleanly (≈1 col @430px … 5 cols @1280px).
- Edge-to-edge top row: star (white when starred) · category chip · count ("N styles" static / "N axes" variable) · `vf` · source (`g`/`l`/`l+g`). Card bottom-corners-only rounded `#080808`, `rounded-b-[12px]` (matches Figma `tile_bg` `rounded-bl/br-[40px]` ≈ 5% of card width). **Do not use `cqw` on the card root** — it declares `@container`, so its own `cqw` resolves against the viewport, not itself (was `5cqw` → 64px). Inner elements (notches/ruler) use `cqw` correctly since they're inside the container. Top-row notches overlap their left neighbour via `ml-[-5cqw]` + raised `z`, so each rounded corner reveals the neighbour's colour (not a dark cutout); star segment is `#515151` with `rounded-br` revealing the category beneath (per Figma raster `fav`).
- `+` = add-to-compare; centered by default, shifts to `left-[18cqw]` when a non-default variant is previewed (`variantModified`); selected count shows white **semibold**. Whole tile click → analyze `currentFont.id`.
- Page canvas behind the grid is `#242424` (Figma frame bg) on LibraryView's scroll container, so `#080808` tiles read as darker insets.
- `WeightRuler` ticks inset `PAD=14%` from top/bottom (clears the top bar); a single available weight renders one centered tick instead of being pinned to the top.

Supporting edits:
- `src/lib/useFontFace.ts` — `loadedForRef` keyed on `fontId`, **plus** an explicit `useEffect` that calls `startLoad()` on post-mount `fontId` change. (Ref re-attachment alone did **not** reliably re-trigger the load — static weight/italic swaps silently kept the old file even though `currentFont.id` updated.) Initial lazy IntersectionObserver kept.
- `src/lib/fontFamilies.ts` — added `uniqueSortedWeights()`, `fontForWeightStyleWidth()`.
- `src/index.css` — bundled Lato Light/Medium/Black (`public/fonts/`), `--font-ui` theme font (`font-ui` utility).
- `e2e/library-features.spec.ts` — count regex `/(styles?|ax[ie]s)/`; grid source-badge selector `[title=…]` (now a div, not span).

**Verified (browser + e2e):** variable weight→`font-variation-settings` (300→550), static weight→file swap (id changes & loads), italic toggle→file swap, `+` moves left + count semibold on selection; notch overlaps / star `#515151` / canvas `#242424` confirmed against Figma; responsive 430↔1280px; e2e 14 pass / 5 skip (conditional list-view); build OK.

**Key gotcha:** static weight/slant swaps load a *new* font file (async `document.fonts.load`) — when testing the rendered `fontFamily`, poll until it changes; 1–2 rAFs is too short.

## Conventions

Conventional commits. CK repo — check githooks for JIRA `TDX-XXXX` format if committing.
