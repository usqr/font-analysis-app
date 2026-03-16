# Font Analysis App

A desktop-oriented web app for scanning, storing, analyzing, and comparing font files. Built with React, Express, and opentype.js.

## Features

- **Font Library** — Scan local folders or download from Google Fonts. Fonts are grouped by family with width tabs, style toggles, and collapsible cards. List and grid views with live "Aa" previews.
- **Filtering** — Category radio buttons (Serif, Sans-Serif, Monospace, Display, Script), text search, and histogram-based range filters for contrast, weight, width, and x-height.
- **Analyze** — Per-font analysis views: stroke contrast, x-height, proportions, weight distribution, spacing, and a paginated glyph grid with OTF feature filtering. Sidebar shows OpenType features and raw metadata (name, OS/2, head, post tables).
- **Compare** — Overlay multiple fonts on a shared canvas with normalize toggle and auto-fit text sizing. Collapsible info panel with drag-resizable width.
- **Format Support** — TTF, OTF, WOFF, WOFF2 (decompressed via wawoff2).
- **Smart Naming** — Handles URW-style abbreviated names, typographic subfamily (name ID 17), super-family grouping across width variants, and fallback naming from filenames.
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
| POST | `/api/database/compute-metrics` | Compute metrics + category for all fonts |
| GET | `/api/fonts/:id/data` | Get font base64 data |
| DELETE | `/api/fonts/:id` | Delete a font |
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
