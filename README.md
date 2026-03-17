# Font Analysis App

A desktop-oriented web app for scanning, storing, analyzing, and comparing font files. Built with React, Express, and opentype.js.

## Features

- **Font Library** — Scan local folders or browse 3500+ Google Fonts from the included starter database. Fonts are served directly from disk (no base64 backups). Grid view (default) uses pre-extracted SVG glyph vectors for instant "Aa" previews. Fonts are grouped by family with width tabs, style toggles, and collapsible cards (single toggle button). Star favourite font families and add to compare from either view.
- **Filtering** — Source filter (Local/Google), category radio buttons (Serif, Sans-Serif, Monospace, Display, Script), starred-only filter, text search, and histogram-based range filters for contrast, weight, width, and x-height.
- **Manual Recategorization** — Each family card and the Analyze view header show a colored category badge; click to override the auto-detected category. Works for both local and Google Fonts. Bulk Edit mode allows selecting multiple families and applying category changes or tags in batch via a floating action bar. Overrides persist in a separate `font-overrides.json` file, surviving library clears and full rescans.
- **Analyze** — Per-font analysis views: stroke contrast (with reference lines matching x-height view), x-height, proportions, weight distribution, spacing, and a paginated glyph grid with web font rendering and OTF feature filtering. Lazy per-tab loading for fast initial render. Sidebar shows OpenType features and raw metadata (name, OS/2, head, post tables).
- **Compare** — Overlay multiple fonts on a shared canvas with normalize toggle and auto-fit text sizing. Consistent color assignment across font toggles. Collapsible info panel with drag-resizable width.
- **Format Support** — TTF, OTF, WOFF, WOFF2 (decompressed via wawoff2).
- **Smart Naming** — Handles URW-style abbreviated names (including fonts without preferredFamilyName), typographic subfamily (name ID 17), super-family grouping across width and type variants (e.g., Alfabet types, Bungee visual variants), and fallback naming from filenames. Supports space-separated Noto-style names.
- **Font Classification** — Multi-layer automatic classification (monospace detection, strong name keywords, sFamilyClass, PANOSE, glyph analysis, contrast heuristic, name-based fallback) with manual override support.
- **Deduplication** — Variant-key dedup with format priority (OTF > TTF > WOFF > WOFF2), source-aware (local vs Google fonts coexist).

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

- Node.js 18+
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
| POST | `/api/database/compute-metrics` | Compute metrics + reclassify + extract SVGs |
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
