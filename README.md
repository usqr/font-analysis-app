# Font Analysis App

A desktop-oriented web app for scanning, storing, analyzing, and comparing font files. Built with React, Express, and opentype.js.

## Features

- **Font Library** — Scan local folders or browse 3500+ Google Fonts from the included starter database. Fonts are served directly from disk (no base64 backups). Grid view (default) renders live "Aa" previews via `@font-face` with interactive variable font controls: vertical weight/width sliders, italic toggles, and axis-specific controls. Fonts are grouped by family with width tabs, style toggles, and collapsible cards (single toggle button). Star favourite font families and add to compare from either view.
- **Filtering** — Source filter (Local/Google), category radio buttons (Serif, Sans-Serif, Monospace, Display, Script), starred-only filter, text search, histogram-based range filters for contrast, weight, width, and x-height, style count range filter (min/max), "Exclude basic-Latin-only" toggle, and script requirement pills (Cyrillic, Greek, Arabic, CJK, etc.). Toolbar shows filtered count when filters are active.
- **Manual Recategorization** — Each family card and the Analyze view header show a colored category badge; click to override the auto-detected category. Works for both local and Google Fonts. Bulk Edit mode allows selecting multiple families and applying category changes or tags in batch via a floating action bar. Overrides persist in a separate `font-overrides.json` file, surviving library clears and full rescans.
- **Variable Font Support** — Automatic detection of variable fonts (fvar table). 741 variable fonts in the Google Fonts database with full axis metadata. Library grid tiles feature interactive vertical weight/width sliders, italic/slant toggles, and live CSS `font-variation-settings` preview. Axis info popups (`i` buttons) explain what each axis does (20+ standard axes documented). "Variable only" filter in advanced filters. Analyze view shows interactive axis sliders with live preview and axis info in the sidebar.
- **Analyze** — Per-font analysis views: stroke contrast (with reference lines matching x-height view), x-height, proportions, weight distribution, spacing, and a paginated glyph grid with web font rendering and OTF feature filtering. Analysis is pre-computed server-side at scan time and stored in the database for instant loading. Sidebar shows OpenType features, variable axes info, and raw metadata (name, OS/2, head, post tables).
- **Compare** — Overlay multiple fonts on a shared canvas with normalize toggle and auto-fit text sizing. Consistent color assignment across font toggles. Collapsible info panel with drag-resizable width.
- **Format Support** — TTF, OTF, WOFF, WOFF2 (decompressed via wawoff2).
- **Smart Naming** — Handles URW-style abbreviated names (including fonts without preferredFamilyName), typographic subfamily (name ID 17), super-family grouping across width and type variants (e.g., Alfabet types, Bungee visual variants), and fallback naming from filenames. Supports space-separated Noto-style names.
- **Font Classification** — Multi-layer automatic classification (monospace detection, strong name keywords, sFamilyClass, PANOSE, glyph analysis, contrast heuristic, name-based fallback) with manual override support. Non-Latin fonts correctly get null metrics (`.notdef` glyph detection).
- **Script/Language Support** — Unicode coverage detection across 17 script ranges (Basic Latin, Latin Extended, Cyrillic, Greek, Arabic, Hebrew, CJK, Hangul, Japanese Kana, Devanagari, Bengali, Tamil, Telugu, Thai, Georgian, Armenian, Vietnamese). Filterable in the library.
- **Deduplication** — Variant-key dedup with format priority (OTF > TTF > WOFF > WOFF2), source-aware dedup (local vs Google variants are distinct). Same-named families from local and Google databases are merged into one card with combined styles and a mixed-source badge (L+G).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | React 19, React Router, Tailwind CSS 4 |
| Server | Express 5, Node.js |
| Font Parsing | opentype.js, wawoff2 |
| Build | Vite, TypeScript |
| Testing | Playwright |

## Getting Started

### Prerequisites

- Node.js 26 (current LTS, see `.nvmrc`)
- npm

### Install & Run

```bash
npm install
npm run dev
```

This starts both the Vite dev server and the Express API server (port 3001). The Vite proxy forwards `/api` requests to the backend.

The app ships with a pre-built Google Fonts database (`google-fonts-db.json`, ~3500 fonts). To access the actual font files for preview and analysis, clone the Google Fonts repo:

```bash
git clone --depth=1 https://github.com/google/fonts.git google-fonts/
```

### Rebuilding the Google Fonts Database

If you want to rebuild the Google Fonts starter database (e.g., after updating the repo):

```bash
cd google-fonts && git pull && cd ..
npm run build:google-db
```

This scans all fonts in the cloned repo, computes metrics, extracts SVG vectors, and writes `google-fonts-db.json`.

### GitHub Pages (static build)

`npm run build:pages` makes a static build of the Google Fonts set in `dist/`. It has no Express server:

- The font list is `dist/google-fonts.json` (`google-fonts-db.json` without glyph SVGs, ~7 MB).
- Font files come from jsDelivr (or `raw.githubusercontent.com` for files over 20 MB) at the `google/fonts` commit of `google-fonts/`. Moved files are remapped. Missing files are dropped.
- Folder scans, font uploads, deletes, and the Local/Google filter are hidden. Stars, categories, and tags are kept in `localStorage`.
- Routes use the URL hash (`#/analyze/<id>`), because Pages has no SPA fallback.

`.github/workflows/pages.yml` deploys on each push to `master`. It fetches only the file list of `google/fonts` at `GOOGLE_FONTS_REF`. Update that SHA when you rebuild `google-fonts-db.json`.

```bash
npm run test:unit     # Unit tests (node:test)
npm run test:static   # Builds the static site and runs e2e-static/ against vite preview
```

### Other Commands

```bash
npm run build       # TypeScript check + Vite production build
npm run lint        # ESLint
npm run preview     # Preview production build
```

## Project Structure

```
server/
  index.ts              # Express API routes
  database.ts           # JSON file database (fonts-db.json) + Google Fonts DB loading
  scanner.ts            # Font file scanning, metrics computation, classification, SVG extraction
  buildGoogleFontsDb.ts # Build script for google-fonts-db.json
src/
  components/           # React views (Library, Analyze, Compare, Glyphs, etc.)
  analysis/             # Client-side analysis modules (contrast, weight, spacing, ...)
  lib/                  # Utilities (API client, font families, OTF features, hooks)
  types/                # TypeScript type definitions
e2e/                    # Playwright E2E tests
public/fonts/           # Sample fonts for testing
google-fonts/           # Cloned google/fonts repo (gitignored, optional)
google-fonts-db.json    # Pre-built Google Fonts database (committed)
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pick-folder` | Native OS folder picker |
| GET | `/api/scan-stream` | Streaming font scan (NDJSON) |
| GET | `/api/database` | Get merged database (local + Google fonts) |
| POST | `/api/database` | Overwrite database |
| DELETE | `/api/database` | Wipe database |
| POST | `/api/database/dedup` | Deduplicate fonts |
| POST | `/api/database/compute-metrics` | Compute metrics + analysis + reclassify + extract SVGs |
| GET | `/api/fonts/:id/file` | Serve font binary from disk |
| GET | `/api/fonts/:id/data` | Get font base64 data (read from disk) |
| PUT | `/api/fonts/:id/category` | Set category override |
| PUT | `/api/fonts/bulk-category` | Bulk set category override |
| PUT | `/api/fonts/:id/tags` | Set tags |
| PUT | `/api/fonts/bulk-tags` | Bulk add tags |
| GET | `/api/tags` | Get all unique tags |
| GET | `/api/overrides` | Get persistent overrides |
| PUT | `/api/starred-families` | Toggle family starred status |
| DELETE | `/api/fonts/:id` | Delete a font |
| GET | `/api/font-paths` | Get saved font folder paths |
| POST | `/api/font-paths` | Add a font folder path |
| DELETE | `/api/font-paths` | Remove a font folder path |

## Testing

```bash
npx playwright install chromium
npx playwright test
```

The Playwright config auto-starts the dev server before running tests.

## Known Issues

None currently tracked.
