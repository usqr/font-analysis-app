# Font Analysis App - Development Context

## Project Overview

React + Express app for scanning, storing, analyzing and comparing font files. Uses opentype.js for parsing, Vite for bundling, Tailwind for styling. Server runs on port 3001, Vite proxies `/api` requests to it.

## Architecture

- **Server** (`server/`): Express API with JSON file database (`fonts-db.json`) and base64 font backups (`fonts-data/*.b64`)
- **Client** (`src/`): React SPA with routes for Library (`/`), Analyze (`/analyze/:fontId?`), Compare (`/compare?ids=...`)
- **Analysis** (`src/analysis/`): Stroke contrast, x-height, proportions, weight, spacing analysis modules
- **Font parsing**: opentype.js (supports TTF, OTF, WOFF); wawoff2 for WOFF2→TTF decompression

## Key Data Structures

```typescript
interface StoredFont {
  id: string;              // UUID
  filePath: string;        // Absolute path on disk
  fileName: string;
  familyName: string;      // From font metadata (name ID 1)
  preferredFamilyName?: string; // From name ID 16 (typographic family)
  subfamilyName: string;   // e.g. "Regular", "Bold", "Italic"
  weight: number;          // OS/2 usWeightClass or inferred
  style: 'normal' | 'italic' | 'oblique';
  format: string;          // 'otf' | 'ttf' | 'woff' | 'woff2'
  fileSize: number;
  glyphCount: number;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lastModified: string;
  addedAt: string;
  metrics?: { contrast: number; weight: number; width: number; xHeight: number };
  category?: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'script';
}
```

Database: `{ version: 1, fonts: StoredFont[] }` in `fonts-db.json`, atomic writes via `.tmp` rename.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pick-folder` | Native OS folder picker |
| GET | `/api/scan-stream` | Streaming scan (NDJSON), accepts `source` query param |
| POST | `/api/scan` | Non-streaming scan, accepts `source` body param |
| GET | `/api/database` | Get DB metadata |
| POST | `/api/database` | Overwrite DB |
| DELETE | `/api/database` | Wipe DB + all .b64 files |
| POST | `/api/database/dedup` | Retroactive deduplication |
| POST | `/api/database/compute-metrics` | Compute/recompute metrics + category for all fonts |
| POST | `/api/convert-woff2` | Convert woff2 base64 → ttf base64 |
| GET | `/api/fonts/:id/data` | Get font base64 data |
| PUT | `/api/fonts/:id/path` | Update file path |
| PUT | `/api/fonts/:id/refresh` | Re-read from disk |
| DELETE | `/api/fonts/:id` | Delete font |
| GET | `/api/google-fonts/list` | List all Google Fonts families (cached 1hr) |
| POST | `/api/google-fonts/download` | Download Google Fonts to folder (NDJSON streaming) |

## Repository

- **GitHub**: Private repo at `usqr/font-analysis-app` (created 2026-03-16)
- **Branch**: `master`
- **`.gitignore`**: Excludes `node_modules`, `dist`, `fonts-db.json`, `fonts-data/`, `test-results/`, `.playwright-mcp/`, `.cursor/`, `.DS_Store`

## Development History

### Plan 1: Extend Font Analysis App

1. **Database cleanup** -- `clearAllFontData()` in `server/database.ts`, `DELETE /api/database` endpoint, "Clear Library" button with confirmation in LibraryView
2. **Dedup prevention** -- `mergeFonts()` deduplicates by variant key with format priority (otf>ttf>woff>woff2), returns `MergeResult` with `discardedIds`
3. **woff2 support** -- installed `wawoff2`, scanner converts woff2→ttf on scan, `POST /api/convert-woff2` for client uploads, FontUploader accepts .woff2
4. **Family grouping** -- extracts `preferredFamilyName` (name ID 16) in scanner, `groupByFamily()` uses it as grouping key

### Plan 2: Fix Font App Issues

1. **Dedup key fix** -- changed `variantKey()` from `familyName+weight+style` to `familyName+subfamilyName` (OTF/TTF can report different OS/2 weight values for the same font); added `POST /api/database/dedup` retroactive cleanup endpoint + "Deduplicate" button
2. **No-name font fix** -- `familyNameFromFile()` fallback in scanner when metadata familyName is <2 chars (fixes "." named TextaAlt woff2 fonts)
3. **URW display fix** -- `/api/fonts/:id/data` returns `preferredFamilyName ?? familyName`; `variantLabel()` includes width qualifier from familyName vs preferredFamilyName difference
4. **Canvas responsiveness** -- `useCanvasResize` hook (ResizeObserver) applied to all 6 canvas views (Contrast, XHeight, Proportions, Weight, Spacing, Compare)
5. **Compare flip fix** -- changed `ctx.scale(scale, -scale)` to `ctx.scale(scale, scale)` in CompareView (opentype.js getPath() already flips Y to screen coords)

### Plan 3: Font App Fixes & Feature Expansion

1. **American Auto double naming fix** -- Scanner post-processes abbreviated weight/style tokens (Bld→Bold, It→Italic, etc.) from `familyName` diff when `subfamilyName` is generic ("Regular") and `preferredFamilyName` exists. Fixes `subfamilyName` and `style` fields. `widthQualifier()` now filters out weight/style tokens (both abbreviated and full forms) from the diff.
2. **Dot-name font fix** -- `isUsableName()` now requires at least 2 consecutive letters (`/[a-zA-Z]{2,}/`), rejecting names like `".\x7f"` and triggering the `familyNameFromFile()` fallback.
3. **Width tabs in FamilyCard** -- New `groupByWidth()` helper groups a family's fonts by width qualifier (Condensed, Narrow, Wide, Expanded, etc.). FamilyCard shows width tabs when multiple widths exist. `widthQualifier()` is now exported.
4. **Style switch** -- Within each width tab, a Regular/Italic toggle appears when the family has both normal and italic variants.
5. **Minimizable family cards** -- Three-state card: collapsed (name+count only), normal (variant list), expanded (variant list with file paths). Collapse All / Expand All toolbar buttons.
6. **Grid view** -- Google Fonts-style grid toggle with "Aa" preview rendered using the font's actual typeface via CSS `@font-face` with base64 data URLs. IntersectionObserver for lazy loading. Uses `useFontFace` hook.
7. **Playwright E2E tests** -- `playwright.config.ts` with webServer auto-start, `e2e/library-features.spec.ts` with 7 tests covering all features.

### Plan 4: URW Naming, Width Dropdowns & Analyze Navigation

1. **URW font naming fix** -- Added URW-style abbreviations to scanner (`Bol`, `Lig`, `Hea`, `Boo`, `Dem`, `Bla`, `Sem`, `Thi`, `Nor`) and width abbreviations (`Nar`, `Con`, `Wid`, `Exp`, `Com`, `Cnd`). New `computeFamilyDiff()` helper with space-normalized matching + `splitCamelTokens()` for lowercase→uppercase boundary splitting. Handles URW concatenated names like "BodoniURWExtBol" vs preferredFamilyName "Bodoni URW".
2. **Dedup variantKey fix** -- Changed `variantKey()` in `database.ts` to use `preferredFamilyName ?? familyName` instead of just `familyName`, so URW font variants with different abbreviated names correctly dedup when they share a preferredFamilyName.
3. **Width qualifier validation** -- `widthQualifier()` now validates that all diff tokens are recognized (`WEIGHT_TOKENS`, `STYLE_TOKENS`, or new `WIDTH_TOKENS` set). Returns `''` when unrecognizable tokens indicate a failed diff (e.g., URW fonts where preferredFamilyName already contains expanded width like "Bodoni URW Narrow").
4. **Width dropdown for many widths** -- When a family has >3 width groups, LibraryView renders a `<select>` dropdown instead of inline tab buttons to prevent overflow.
5. **Width-free variant labels** -- `variantLabel()` accepts `excludeWidth` parameter. LibraryView passes `true` when inside width tabs/dropdown, avoiding redundant labels like "Narrow Thin" (shows just "Thin").
6. **Analyze family navigation** -- When viewing a font from the library, AnalyzeView fetches the full database to find family members. Shows weight dropdown, width dropdown (when multi-width), and Upright/Italic toggle (when both styles exist). Changing any dropdown navigates to the new family member.
7. **Dedup visual confirmation** -- Deduplicate button now shows inline result message ("Removed X duplicates" or "No duplicates found") with auto-dismiss after 3 seconds.
8. **Playwright visual tests** -- Updated existing tests for width dropdown/tabs hybrid. Added 4 new tests: URW grouping validation, width-free variant labels, dedup confirmation message, analyze family navigation dropdowns. All tests capture screenshots to `e2e/test-results/`.

### Plan 5: Font App Extensions

1. **Super-family grouping** -- Added `extractTrailingWidth()` and `superFamilyName()` to `fontFamilies.ts`. `groupByFamily()` now groups by super-family base name (stripping trailing width tokens like "Condensed", "Narrow", "Wide" from `preferredFamilyName`). `widthQualifier()` now also checks if `preferredFamilyName` itself ends with a width token. This fixes URW fonts like "Bodoni URW" + "Bodoni URW Narrow" being grouped together with width tabs.
2. **AnalyzeView width dropdown fix** -- Family member search in AnalyzeView uses `superFamilyName()` instead of raw `preferredFamilyName`, so width variants across different preferredFamilyName values are now found. Width dropdown appears for multi-width families.
3. **OTF features panel** -- New `src/lib/otfFeatures.ts` with `extractOTFFeatures()` reading GSUB/GPOS feature tags and `OTF_FEATURE_NAMES` mapping ~130 tags to human-readable names. AnalyzeView sidebar shows "OpenType Features" panel with badge-style tags + tooltips.
4. **CompareView fixes** -- (a) Normalize toggle replaced checkbox with a custom toggle switch for clear visual state. (b) Canvas container restructured: inner `canvasWrapRef` div handles sizing (prevents flex overflow → sidebar shrinking). (c) Layout made responsive: `flex-col lg:flex-row`, sidebar stacks below on mobile. (d) Text auto-fit: computes text bounding box across all fonts, scales down if wider than canvas, centers horizontally.
5. **Server-side font metrics** -- Added `FontMetrics` type (`contrast`, `weight`, `width`, `xHeight`) and `FontCategory` type to `StoredFont`. Scanner computes metrics during scan using pure-math (no DOM/Canvas): contrast via bezier flattening + nearest-point distance on 'o' glyph contours, weight via contour area fill ratio, width via glyph bbox ratio, x-height via bbox/em ratio. Category classification from `os2.sFamilyClass` + `post.isFixedPitch`.
6. **Retroactive metrics endpoint** -- `POST /api/database/compute-metrics` re-parses stored .b64 font data and fills in missing metrics/category fields.
7. **HistogramFilter component** -- New `src/components/HistogramFilter.tsx`: SVG area chart with 50 bins, draggable min/max range handles, range dragging, per-filter reset button.
8. **Library histogram filters** -- LibraryView adds: category pill buttons (Serif, Sans-Serif, Monospace, Display, Script), "Reset all" button, "Advanced Filters" toggle revealing 4 histogram filters (Contrast, Weight, Width, X-Height). Uses regular/400 weight variant metrics per family. Auto-triggers metrics computation on first toggle if fonts lack metrics.

### Plan 6: Library Filter Improvements

1. **Histogram click-to-select** -- `HistogramFilter` now supports clicking directly on the chart area to select a bin's value range. Shift-click extends the current selection to include the clicked bin. Clicking the same single-bin range again resets the filter. Uses `didDragRef` to distinguish clicks from drags on the handle rects.
2. **Histograms reflect filtered fonts** -- Histogram values are now split into two layers: `histogramValues` (all families, used for background chart shape and data range) and `filteredHistogramValues` (families after search + category filter, before histogram range filters). `HistogramFilter` accepts a new `filteredValues` prop and renders the all-data bins as a dimmed background (`#2a2a2a`) with the filtered subset overlaid in a brighter fill (`#525252`). Filtering pipeline: families → search → category → `searchAndCatFiltered` → histogram ranges → `filteredFamilies`.
3. **Category buttons as radio** -- Changed `selectedCategories: Set<FontCategory>` to `selectedCategory: FontCategory | null`. Clicking a category selects it exclusively; clicking the already-selected one deselects it. Only one category can be active at a time.
4. **Display as catch-all category** -- `classifyFont()` in `server/scanner.ts` now returns `'display'` for all `sFamilyClass` values that are not clearly serif (1-5, 7), sans-serif (8), or script (10). This includes class 0 (No Classification), 6, 9, 11, 12, 14, and any unknown. Previously these defaulted to `'sans-serif'`. The `compute-metrics` endpoint now always re-classifies category (not just when missing) to retroactively apply the new logic.
5. **Raw Metadata panel in AnalyzeView** -- New collapsible "Raw Metadata" panel in the sidebar below the OTF Features panel. Extracts and displays raw table data from the parsed opentype.Font: name table (fontFamily, fontSubfamily, preferredFamily, designer, manufacturer, version, license), OS/2 (usWeightClass, usWidthClass with decoded name, sFamilyClass with class/subclass decoded, fsType with permission flags, panose, sTypoAscender/Descender/LineGap, sxHeight, sCapHeight), head (unitsPerEm, created/modified dates, macStyle flags, lowestRecPPEM), and post (italicAngle, isFixedPitch, underlinePosition/Thickness). Panel is collapsed by default with a toggle arrow. Metrics trigger also fires when a category filter is selected (not just on advanced filters toggle).

### Plan 7: Font App Extensions

1. **Fix subfamily parsing (Lato, URW, Bona, Alfabet Szkolny)** -- Scanner now reads typographic subfamily (name ID 17) via `font.names.preferredSubfamily?.en ?? font.names.typographicSubfamily?.en` and uses it as `subfamilyName` when the font's name ID 2 is generic ("Regular"/"Normal"). Added full-form weight words to `WEIGHT_ABBREVS` (Bold, Light, Thin, Black, Medium, Heavy, etc.), full-form style words to `STYLE_ABBREVS` (Italic, Oblique), and full-form width words to `WIDTH_ABBREVS` (Narrow, Condensed, Wide, etc.). This fixes Lato variants all collapsing to "Regular", Bona font variants not grouping, and Alfabet Szkolny visibility.
2. **Enhanced category classification** -- `classifyFont()` now uses multi-layer classification: (1) `post.isFixedPitch` or advance width uniformity across 'i','m','w','M','l','W' → monospace, (2) `sFamilyClass` for explicit serif (1-5,7), sans-serif (8), script (10), (3) PANOSE classification from `os2.panose` bytes (family kind 2 + serif style, family kind 3 → script, family kind 4/5 → display, proportion 9 → monospace), (4) serif detection via capital 'I' glyph path analysis (compares horizontal span at top/bottom vs stem width), (5) contrast heuristic (< 0.4 → serif, > 0.85 → sans-serif), (6) `display` as ultimate fallback. Accepts optional `metrics` parameter for contrast-based heuristic.
3. **Glyphs tab** -- New `GlyphsView` component (`src/components/GlyphsView.tsx`): renders all font glyphs in a paginated grid (200 per page) with per-glyph canvas rendering, Unicode codepoint labels, glyph names, search/filter by name/char/U+hex, and cell size slider. OTF feature glyphs: parses GSUB feature substitution lookups (types 1 single substitution, 3 alternate substitution, 4 ligature substitution) to build per-feature glyph ID maps. Feature tag buttons filter the grid to show only affected glyphs. Added 'glyphs' tab to AnalyzeView (full-width, sidebar hidden). Added 'glyphs' to `AnalysisTab` type.
4. **Google Fonts download** -- New `server/googleFonts.ts` module: `listGoogleFonts()` fetches and caches (1hr) font metadata from `https://fonts.google.com/metadata/fonts` (strips XSSI guard prefix). `downloadGoogleFonts()` downloads family ZIP files from `https://fonts.google.com/download?family=...`, extracts TTF/OTF files via `adm-zip` into family subfolders. New server endpoints: `GET /api/google-fonts/list` and `POST /api/google-fonts/download` (NDJSON streaming progress). Client: `listGoogleFonts()`, `downloadGoogleFonts()` API functions with stream reader. LibraryView: "Google Fonts" button + download panel with folder picker, "Download All" button, progress bar, and completion message prompting to scan the folder.
5. **Source signifier (local vs Google)** -- Added `source?: 'local' | 'google'` field to `StoredFont` (server), `StoredFontMeta` (client), and `FontFamily`. `variantKey()` in `database.ts` now includes source, so same-named local and Google fonts coexist without dedup conflicts. `groupByFamily()` groups by `source + superFamilyName`. `scanFont()` and `scanFolder()` accept `source` parameter. Streaming scan endpoint reads `source` query param. `SourceBadge` component shows "G" (blue) for Google Fonts or "L" (neutral) for local fonts. Badge appears in FamilyCard header, GridFamilyCard corner, and AnalyzeView header next to family name. Family member search in AnalyzeView is source-aware.

### Plan 7 Testing: Playwright E2E Validation

1. **9 new E2E tests added** -- `e2e/library-features.spec.ts` expanded from 11 to 20 tests. New tests cover: source badges visible on family cards (list + grid views), Google Fonts button toggles download panel, category filter buttons filter the library, glyphs tab shows glyph grid, glyphs search filters by name, analyze view source badge in header, fonts have category assignments (API), fonts have source field set (API).
2. **data-testid attributes** -- Added `data-testid="analysis-tabs"` to AnalyzeView `<nav>`, `data-testid="tab-{id}"` to each analysis tab button, `data-testid="glyphs-view"` to GlyphsView root container.
3. **GlyphsView defensive checks** -- Added `try/catch` wrappers and null guards around `allGlyphs` useMemo (`font?.glyphs` check, `font.glyphs.length ?? 0`) and `featureSubs` useMemo to prevent rendering crashes.
4. **Test results: 17 passed, 1 skipped, 2 failed** -- All Plan 7 features except Glyphs tab verified working via Playwright. Passing tests: source badges (list + grid), Google Fonts panel toggle, category filters, analyze source badge, font category assignments, font source fields, plus all 11 pre-existing tests. Skipped: style switch (no italic variants for test font). Failed: 2 glyphs tab tests (see known bug below).

### Plan 8: Italic Fix, Compare Panel, GlyphsView Crash Fix

1. **Abbreviated italic/oblique detection** -- `inferStyle()` in `server/scanner.ts` now also checks for abbreviated style tokens via word-boundary regex: `/\bIt\b/` → italic, `/\bObl\b/` → oblique. Previously only `includes('italic')` / `includes('oblique')` on the lowered string. This fixes fonts like American Auto where subfamilyName is `"Bld It"` (the full word "italic" never appears). Validated: 113 families now show both normal + italic variants; 0 missed italics in a 940-font library.
2. **CompareView collapsible sidebar** -- Sidebar is now collapsible via a chevron toggle button. When collapsed, shrinks to a narrow 40px strip with just the toggle. Sidebar width is drag-resizable via a vertical handle on the left edge using pointer events (min 200px, max 500px, default 288px). Canvas auto-redraws on resize via existing `useCanvasResize` hook.
3. **GlyphsView crash fix** -- (a) `GlyphCell` useEffect now wrapped in try/catch; on error renders a "?" placeholder and highlights the cell with a red border. (b) Added null guard for `path?.commands` before iterating. (c) `String.fromCodePoint()` wrapped in try/catch for invalid codepoints. (d) Added `GlyphsErrorBoundary` React class component wrapping `GlyphsView` — catches render-time errors and shows a "Failed to render glyphs" fallback with a Retry button, preventing blank-page crashes. The `GlyphsView` export now wraps the inner component in this boundary.

### Plan 9: Font App Fixes & Improvements

1. **Shared font name tokens** -- Extracted all abbreviation maps (`WEIGHT_ABBREVS`, `WIDTH_ABBREVS`, `STYLE_ABBREVS`), token sets (`WEIGHT_TOKENS`, `STYLE_TOKENS`, `WIDTH_TOKENS`), trailing name lists (`TRAILING_WIDTH_NAMES`, `TRAILING_TYPE_NAMES`), and helper functions (`splitCamelTokens`, `computeFamilyDiff`, `extractTrailingWidth`, `extractTrailingType`, `stripTrailingQualifiers`) from `server/scanner.ts` and `src/lib/fontFamilies.ts` into a new shared file `src/lib/fontNameTokens.ts`. Both consumer files now import from the shared module. `splitCamelTokens` improved to handle acronyms: `([A-Z]+)([A-Z][a-z])` splits "URWExt" → "URW Ext".
2. **URW Bodoni grouping and naming fix** -- Added `inferPreferredFamily()` to scanner: for fonts without `preferredFamilyName`, splits the CamelCase `familyName` and strips known weight/style/width abbreviation tokens from the end to infer a `preferredFamilyName` and correct subfamily. Fixes 50 TTF Bodoni URW variants (e.g., `BodoniURWExtBol` → preferredFamily "Bodoni URW", subfamilyName "Extra Bold", weight 800). Added `parseAbbreviatedSubfamily` lookahead for compound tokens: "Ext" + width token → compound width like "Extra Narrow"; "Ext" + weight token → compound weight like "Extra Bold". Added `inferWeightFromName()` fallback for fonts where OS/2 weight class is 400 but the inferred subfamilyName says otherwise. Added "Extra Narrow", "Extra Wide" to `TRAILING_WIDTH_NAMES`. Dedup removed 40 duplicates where TTF and OTF versions now share the same preferredFamilyName.
3. **Alfabet font type grouping** -- Added `TRAILING_TYPE_NAMES` list (Liniowy, Kontury, Cieniowany, Kropki, Pisany) and `extractTrailingType()` function. `superFamilyName()` now uses `stripTrailingQualifiers()` which strips both trailing width AND trailing type tokens for family grouping. `widthQualifier()` now also checks for trailing type names, surfacing them as version tabs in the Library FamilyCard (same UX as width tabs).
4. **Narrower Library detailed view** -- Changed list-view grid from `sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3` to `sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4` with gap reduced from 4 to 3. FamilyCard header padding tightened from `px-4 py-3` to `px-3 py-2`, family name from `text-sm` to `text-xs`. Variant rows from `px-4 py-2 gap-2` to `px-3 py-1.5 gap-1.5`, variant label from `text-sm` to `text-xs`.
5. **ContrastView unified scale with reference lines** -- Refactored ContrastView to use `font.ascender - font.descender` based scale (same as XHeightView) instead of per-glyph fitting. Both `o` and `O` glyphs are now drawn on a shared baseline at the same scale. Added dashed reference lines with left-margin labels: Ascender (purple), Cap height (green), x-height (blue), Baseline (red), Descender (yellow). Uses `analyzeXHeight()` for cap/x-height values. Kept contrast measurement overlays (thickest/thinnest stroke lines, dots, labels).
6. **GlyphsView web font rendering** -- Replaced per-glyph canvas rendering (200 canvas elements per page) with CSS `@font-face` web font rendering. Added `useGlyphFontFace()` hook that loads font as a CSS font face from the API base64 data (with caching). `GlyphCell` now renders characters as `<span>` styled with the web font instead of drawing path commands on canvas. Falls back to "?" for glyphs without Unicode codepoints. Dramatically improves performance on large fonts.
7. **CompareView color fix** -- Fixed glyph color assignment when toggling fonts off with 3+ fonts. Bug: canvas rendering used `visibleFonts.forEach((lf, i) =>` where `i` is the filtered-array index, causing color shifts. Fix: now iterates over full `fonts` array with `if (!lf.visible) return`, preserving the original index for `COLORS[i % COLORS.length]`. Legend already used the correct index.
8. **AnalyzeView type fix** -- Fixed pre-existing TS errors: `summaryStats` useMemo now has explicit return type `{ label: string; value: string }[]` and a `default: return []` case in the switch.

## Key Modified Files

| File | What changed |
|------|-------------|
| `server/database.ts` | `StoredFont.preferredFamilyName`, `clearAllFontData()`, `deduplicateFonts()`, `mergeFonts()` returns `MergeResult`, `variantKey` uses `source + preferredFamilyName ?? familyName` + subfamilyName, `FontMetrics` type, `FontCategory` type, `FontSource` type, `metrics?` + `category?` + `source?` fields on `StoredFont` |
| `server/scanner.ts` | woff2 decompress, `preferredFamilyName` extraction, typographic subfamily (name ID 17) reading via `preferredSubfamily/typographicSubfamily`, `familyNameFromFile()` fallback, async scanFont/scanFolder with `source` parameter, `isUsableName` requires 2+ letters, `parseAbbreviatedSubfamily()` with compound token lookahead (Ext+width → compound width, Ext+weight → compound weight), `inferPreferredFamily()` for fonts without preferredFamilyName (strips CamelCase-split abbreviation tokens from familyName), `inferWeightFromName()` fallback weight inference, `computeFontMetrics()` pure-math metrics, `classifyFont()` with PANOSE classification + `isMonoByWidths()` + `detectSerifFromGlyph()` + contrast heuristic, `inferStyle()` abbreviated token detection (`/\bIt\b/`, `/\bObl\b/`). Imports shared tokens from `src/lib/fontNameTokens.ts` |
| `server/index.ts` | `DELETE /api/database`, `POST /api/database/dedup`, `POST /api/convert-woff2`, `POST /api/database/compute-metrics` (passes metrics to classifyFont), async scan handlers with `source` query param, preferredFamilyName in font data response, `GET /api/google-fonts/list`, `POST /api/google-fonts/download` |
| `server/googleFonts.ts` | `listGoogleFonts()` fetches/caches Google Fonts metadata, `downloadGoogleFonts()` downloads family ZIPs + extracts TTF/OTF, `GoogleFontMeta` / `DownloadProgress` interfaces |
| `src/types/index.ts` | `preferredFamilyName?` on `StoredFontMeta`, `FontMetrics` interface, `FontCategory` type, `FontSource` type, `metrics?` + `category?` + `source?` fields, `'glyphs'` in `AnalysisTab`, `source?` on `FontFamily` |
| `src/types/wawoff2.d.ts` | Type declarations for wawoff2 (decompress/compress) |
| `src/lib/fontNameTokens.ts` | **New**: Shared font name abbreviation maps (`WEIGHT_ABBREVS`, `WIDTH_ABBREVS`, `STYLE_ABBREVS`), token sets (`WEIGHT_TOKENS`, `STYLE_TOKENS`, `WIDTH_TOKENS`), trailing name lists (`TRAILING_WIDTH_NAMES` with Extra Narrow/Wide, `TRAILING_TYPE_NAMES` for Alfabet types), helper functions (`splitCamelTokens` with acronym support, `computeFamilyDiff`, `extractTrailingWidth`, `extractTrailingType`, `stripTrailingQualifiers`) |
| `src/lib/fontFamilies.ts` | `groupByFamily` uses `source + superFamilyName()` as key, populates `FontFamily.source`, `variantLabel` with `excludeWidth` param, `displayFamilyName()`, `groupByWidth()`, `widthQualifier()` with token validation + trailing width/type check, `superFamilyName()` uses `stripTrailingQualifiers()` for both width and type tokens. Imports shared tokens from `fontNameTokens.ts` |
| `src/lib/api.ts` | `clearDatabase()`, `deduplicateDatabase()`, `convertWoff2()`, `computeMetrics()`, `listGoogleFonts()`, `downloadGoogleFonts()` with stream reader, `scanFolderStream` accepts `source` param, `GoogleFontMeta` / `GoogleDownloadEvent` types |
| `src/lib/otfFeatures.ts` | `extractOTFFeatures()` reads GSUB/GPOS feature tags, `OTF_FEATURE_NAMES` maps ~130 tags to names |
| `src/lib/useCanvasResize.ts` | ResizeObserver hook for canvas redraw on resize |
| `src/lib/useFontFace.ts` | Hook for lazy-loading fonts as CSS `@font-face` with IntersectionObserver and caching |
| `src/components/LibraryView.tsx` | "Clear Library" + "Deduplicate" with confirmation message, view toggle (list/grid), Collapse All / Expand All, FamilyCard with width/type tabs/dropdown, style switch, width-stripped variant labels, three-state expand, GridFamilyCard, category radio buttons, Advanced Filters + 4 histogram filters, Google Fonts download panel, `SourceBadge`. **Narrower list view**: `sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`, tighter card padding and text sizes |
| `src/components/AnalyzeView.tsx` | Family navigation: weight/width dropdowns, Upright/Italic toggle, OTF features panel, Raw Metadata panel, Glyphs tab (full-width, sidebar hidden), source badge in header, source-aware family member search, `data-testid="analysis-tabs"` on tab nav, `data-testid="tab-{id}"` on each tab button |
| `src/components/GlyphsView.tsx` | Paginated glyph grid (200/page), **web font rendering** via CSS `@font-face` (replaced per-glyph canvas rendering), `useGlyphFontFace()` hook with caching, Unicode codepoint labels, glyph names, search filter (name/char/U+hex), cell size slider, OTF feature substitution buttons (GSUB lookup type 1/3/4 parsing), feature-filtered glyph display, `data-testid="glyphs-view"` on root, `GlyphsErrorBoundary` error boundary. Accepts `fontId` prop for font loading |
| `src/components/CompareView.tsx` | Y-scale fix, ResizeObserver, responsive layout (flex-col lg:flex-row), custom toggle switch for normalize, canvas wrap fix for sidebar sizing, text auto-fit + centering, collapsible sidebar with chevron toggle, drag-resizable sidebar width (pointer events, 200–500px range), **color fix**: canvas rendering uses original font index for color assignment (iterates full array, skips hidden) |
| `src/components/HistogramFilter.tsx` | SVG histogram with 50 bins, draggable range handles, click-to-select bins (shift-click extends), per-filter reset, `filteredValues` prop for dimmed background + bright overlay dual-layer rendering |
| `src/components/ContrastView.tsx` | ResizeObserver, **unified scale** using `ascender - descender` (same as XHeightView), dashed reference lines (Ascender, Cap height, x-height, Baseline, Descender) with left-margin labels, baseline-aligned glyph placement, uses `analyzeXHeight()` for metric values |
| `src/components/XHeightView.tsx` | ResizeObserver |
| `src/components/ProportionsView.tsx` | ResizeObserver |
| `src/components/WeightView.tsx` | ResizeObserver |
| `src/components/SpacingView.tsx` | ResizeObserver |
| `src/components/FontUploader.tsx` | Accepts .woff2, server-side conversion |
| `playwright.config.ts` | Playwright config with webServer auto-start, chromium project |
| `e2e/library-features.spec.ts` | 20 E2E tests: invalid names, American Auto labels, width tabs/dropdown, style switch, collapse/expand, Collapse All, grid view, URW grouping, width-free labels, dedup confirmation, analyze family nav, source badges (list+grid), Google Fonts panel toggle, category filters, glyphs tab, glyphs search, analyze source badge, font categories (API), font source field (API) |
| `package.json` | Added `wawoff2`, `adm-zip` dependencies |
| `tsconfig.server.json` | Added `src/types/wawoff2.d.ts` and `src/lib/fontNameTokens.ts` to include |

## Known Patterns / Gotchas

- **URW fonts / super-family grouping**: Family names like "BodoniURWExtBol" are abbreviated; `preferredFamilyName` has the clean version ("Bodoni URW"). For fonts WITHOUT preferredFamilyName, `inferPreferredFamily()` in the scanner splits the CamelCase familyName and strips known abbreviation tokens from the end to infer one. `parseAbbreviatedSubfamily` handles compound tokens (Ext+Nar → "Extra Narrow", Ext+Bol → "Extra Bold"). URW families with width in the preferredFamilyName (e.g., "Bodoni URW Narrow") are merged into a super-family via `stripTrailingQualifiers()`. `groupByFamily()` uses `superFamilyName()` as the grouping key.
- **URW abbreviation tokens**: All token maps are now in the shared `src/lib/fontNameTokens.ts`. Scanner and client both import from it. `splitCamelTokens()` handles acronym boundaries: `([A-Z]+)([A-Z][a-z])` splits "URWExt" → "URW Ext".
- **Alfabet font type grouping**: `TRAILING_TYPE_NAMES` (Liniowy, Kontury, Cieniowany, Kropki, Pisany) are stripped by `stripTrailingQualifiers()` for super-family grouping. `widthQualifier()` returns the type name so it appears as a version tab in the Library.
- **Typographic subfamily (name ID 17)**: Scanner reads `font.names.preferredSubfamily?.en ?? font.names.typographicSubfamily?.en` and uses it as subfamilyName when the font's name ID 2 is generic "Regular"/"Normal". This is critical for fonts like Lato where all variants have name ID 2 = "Regular" but name ID 17 = "Thin", "Light", "Bold", etc.
- **woff2 fonts with placeholder names**: Some web fonts have familyName "." -- handled by filename fallback + `isUsableName` requiring 2+ letters
- **American Auto-style fonts**: When `subfamilyName` is "Regular" but `familyName` contains abbreviated weight/style (e.g., "Bld It"), scanner post-processes to set proper `subfamilyName` ("Bold Italic") and `style` ("italic"). Requires re-scan of existing data. Additionally, `inferStyle()` now detects abbreviated tokens directly via `/\bIt\b/` and `/\bObl\b/` regex, catching subfamilyNames like "Bold It" or "Thin Obl" even without the `parseAbbreviatedSubfamily` path.
- **OTF vs TTF weight differences**: Same font can report weight 405 (OTF) vs 400 (TTF) -- dedup uses subfamilyName instead of weight
- **opentype.js Y coordinates**: `getPath()` returns screen coords (Y-down), no manual Y-flip needed
- **Scanner is async**: `scanFont()` and `scanFolder()` return Promises due to wawoff2 async decompress
- **Width qualifier filtering**: `widthQualifier()` computes diff via `computeFamilyDiff()`, splits on CamelCase boundaries, validates all tokens against known sets, then filters weight/style tokens to isolate width names. Returns `''` if any token is unrecognized.
- **Category classification multi-layer**: `classifyFont()` uses a priority chain: (1) `isFixedPitch`/width uniformity → monospace, (2) `sFamilyClass` for explicit classes, (3) PANOSE bytes for serif/sans-serif/monospace/script/display, (4) serif detection via capital 'I' glyph path analysis, (5) contrast heuristic (< 0.4 → serif, > 0.85 → sans-serif), (6) `display` as ultimate fallback. Accepts optional `metrics` parameter for the contrast-based heuristic.
- **Source-aware dedup and grouping**: `variantKey()` includes `source` field (`local` or `google`). `groupByFamily()` groups by `source + superFamilyName`, allowing same-named local and Google fonts to coexist as separate families. Family member search in AnalyzeView is also source-aware.
- **Google Fonts download**: Uses `https://fonts.google.com/metadata/fonts` endpoint (strips `)]}'` XSSI guard prefix). Downloads family ZIPs from `https://fonts.google.com/download?family=...` and extracts TTF/OTF files into per-family subfolders via `adm-zip`. Font list is cached for 1 hour.
- **Histogram filtering pipeline**: Histograms avoid circular dependency by splitting filtering into stages: search + category → `searchAndCatFiltered` (used for histogram overlay values) → histogram range filters → `filteredFamilies`. The background chart shape comes from all families; the bright overlay shows only the search/category-filtered subset.
- **Raw metadata extraction**: `extractRawMetadata()` in AnalyzeView reads raw font tables via `font.tables` and `font.names` (cast to `any` to access non-typed fields). Decodes OS/2 `usWidthClass` (1-9 → name), `sFamilyClass` (upper byte class + lower byte subclass), `fsType` (bitmask → permission strings), `macStyle` (bitmask → Bold/Italic/etc. flags). Dates from `head.created`/`modified` are Unix epoch seconds × 1000.
- **GlyphsView web font rendering**: Replaced per-glyph canvas rendering with CSS `@font-face` web font approach. `useGlyphFontFace()` hook loads font as CSS font face from API base64 data with caching. `GlyphCell` renders characters as `<span>` styled with the web font. Falls back to "?" for glyphs without Unicode codepoints. `GlyphsErrorBoundary` wraps the view for crash recovery.
- **CompareView color consistency**: Canvas rendering iterates the full `fonts` array (skipping non-visible entries) to preserve the original index for `COLORS[i % COLORS.length]`. Previously used `visibleFonts.forEach` which shifted colors when fonts were toggled off.
- **Playwright env variable**: The Cursor sandbox sets `PLAYWRIGHT_BROWSERS_PATH` to a sandbox-specific temp dir. Tests must run with `unset PLAYWRIGHT_BROWSERS_PATH` or outside the sandbox (`required_permissions: ["all"]`) to find the installed browsers at `~/Library/Caches/ms-playwright/`.
