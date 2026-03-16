# Font Analysis App

A desktop-oriented web app for scanning, storing, analyzing, and comparing font files. Built with React, Express, and opentype.js.

## Features

- **Font Library** — Scan local folders or download from Google Fonts. Save frequently-used font folder paths for quick access. Fonts are grouped by family with width tabs, style toggles, and collapsible cards. List and grid views with live "Aa" previews. Star favourite font families and add to compare from either view.
- **Filtering** — Category radio buttons (Serif, Sans-Serif, Monospace, Display, Script), starred-only filter, text search, and histogram-based range filters for contrast, weight, width, and x-height.
- **Manual Recategorization** — Each family card shows a colored category badge; click to override the auto-detected category. Bulk Edit mode allows selecting multiple families and applying category changes or tags in batch via a floating action bar.
- **Analyze** — Per-font analysis views: stroke contrast (with reference lines matching x-height view), x-height, proportions, weight distribution, spacing, and a paginated glyph grid with web font rendering and OTF feature filtering. Sidebar shows OpenType features and raw metadata (name, OS/2, head, post tables).
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

### Other Commands

```bash
npm run build       # TypeScript check + Vite production build
npm run lint        # ESLint
npm run preview     # Preview production build
```

## Project Structure

```
server/
  index.ts            # Express API routes
  database.ts         # JSON file database (fonts-db.json) + types
  scanner.ts          # Font file scanning, metrics computation, classification
  googleFonts.ts      # Google Fonts metadata fetching + ZIP download
src/
  components/         # React views (Library, Analyze, Compare, Glyphs, etc.)
  analysis/           # Client-side analysis modules (contrast, weight, spacing, ...)
  lib/                # Utilities (API client, font families, OTF features, hooks)
  types/              # TypeScript type definitions
e2e/                  # Playwright E2E tests
public/fonts/         # Sample fonts for testing
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pick-folder` | Native OS folder picker |
| GET | `/api/scan-stream` | Streaming font scan (NDJSON) |
| GET | `/api/database` | Get database |
| POST | `/api/database` | Overwrite database |
| DELETE | `/api/database` | Wipe database + font data |
| POST | `/api/database/dedup` | Deduplicate fonts |
| POST | `/api/database/compute-metrics` | Compute metrics + reclassify all fonts |
| GET | `/api/fonts/:id/data` | Get font base64 data |
| PUT | `/api/fonts/:id/category` | Set category override |
| PUT | `/api/fonts/bulk-category` | Bulk set category override |
| PUT | `/api/fonts/:id/tags` | Set tags |
| PUT | `/api/fonts/bulk-tags` | Bulk add tags |
| GET | `/api/tags` | Get all unique tags |
| PUT | `/api/starred-families` | Toggle family starred status |
| DELETE | `/api/fonts/:id` | Delete a font |
| GET | `/api/font-paths` | Get saved font folder paths |
| POST | `/api/font-paths` | Add a font folder path |
| DELETE | `/api/font-paths` | Remove a font folder path |
| GET | `/api/google-fonts/list` | List Google Fonts families |
| POST | `/api/google-fonts/download` | Download Google Fonts (streaming) |

## Testing

```bash
npx playwright install chromium
npx playwright test
```

The Playwright config auto-starts the dev server before running tests.

## Known Issues

None currently tracked.
