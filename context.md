# Font Analysis App - Development Context

## Project Overview

React + Express app for scanning, storing, analyzing and comparing font files. Uses opentype.js for parsing, Vite for bundling, Tailwind for styling. Server runs on port 3001, Vite proxies `/api` requests to it.

## Architecture

- **Server** (`server/`): Express API with JSON file database (`fonts-db.json`) and Google Fonts starter DB (`google-fonts-db.json`)
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
  categoryOverride?: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'script';
  tags?: string[];
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
| POST | `/api/database/compute-metrics` | Compute/recompute metrics + category + SVGs for all fonts |
| GET | `/api/fonts/:id/file` | Serve font binary from disk |
| GET | `/api/fonts/:id/data` | Get font base64 data (read from disk on-the-fly) |
| PUT | `/api/fonts/:id/path` | Update file path |
| PUT | `/api/fonts/:id/refresh` | Re-read from disk |
| DELETE | `/api/fonts/:id` | Delete font |
| PUT | `/api/fonts/:id/category` | Set category override for one font |
| PUT | `/api/fonts/bulk-category` | Set category override for multiple fonts |
| PUT | `/api/fonts/:id/tags` | Set tags for one font |
| PUT | `/api/fonts/bulk-tags` | Add tags to multiple fonts |
| GET | `/api/tags` | Get all unique tags |
| GET | `/api/overrides` | Get persistent overrides file contents |
| GET | `/api/google-fonts/list` | List all Google Fonts families (cached 1hr) |
| POST | `/api/google-fonts/download` | Download Google Fonts to folder (NDJSON streaming) |

## Repository

- **GitHub**: Private repo at `usqr/font-analysis-app` (created 2026-03-16)
- **Branch**: `master`
- **`.gitignore`**: Excludes `node_modules`, `dist`, `fonts-db.json`, `fonts-data/`, `font-overrides.json`, `font-paths.json`, `google-fonts/`, `test-results/`, `.playwright-mcp/`, `.cursor/`, `.DS_Store`

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

### Plan 10: Library View Improvements

1. **List view variant row overlap fix** -- Variant rows in FamilyCard now use `relative` positioning with the hover action buttons (`Analyze`, `Refresh`, `Path`, `Remove`) rendered `absolute` and `hidden`/`group-hover:flex` instead of `opacity-0`/`opacity-100`, so they no longer reserve horizontal space and cause the font name and weight number to overlap. Variant label `<span>` now has `block truncate` to ellipsis-truncate long names. Weight number has `tabular-nums` and `min-w-10` for consistent alignment.
2. **Name-based font category classification** -- `classifyFont()` in `server/scanner.ts` now includes a `classifyByName()` fallback layer after the contrast heuristic but before the `display` default. Checks `fontFamily`, `preferredFamily`, `fontSubfamily`, and `preferredSubfamily` name fields against keyword patterns: `script|handwrit|hand|brush|calligraph` → script, `mono|monospace|code|console|terminal` → monospace, `display|decorat|ornament|poster|stencil` → display, `sans` → sans-serif. Fixes fonts like "Zapfino Script" being classified as serif. Re-running `POST /api/database/compute-metrics` applies the new logic retroactively.
3. **Star/favourite system** -- Added `starred?: boolean` field to `StoredFont` (server), `StoredFontMeta` (client). New `PUT /api/fonts/:id/star` endpoint toggles the starred state. Client `toggleStar()` API function in `src/lib/api.ts`. Star icons appear in: FamilyCard variant rows (between checkbox and label), GridFamilyCard (top-left corner, visible on hover unless already starred), AnalyzeView header (next to source badge). Optimistic updates with rollback on error.
4. **Starred filter** -- "Starred" pill button in the Library category filter bar (before category buttons, separated by a `|` divider). When active (amber highlight), filters to families that have at least one starred variant. Included in "Reset all" logic.
5. **Compare from grid view** -- GridFamilyCard now has a "+" compare button (top-right, visible on hover). For single-variant families, clicking directly toggles the font into the compare selection. For multi-variant families, clicking opens a popover dropdown listing all variants with checkboxes. Shares the same `selected` Set with the list view.
6. **Floating compare tray** -- `CompareTray` component: a fixed bar at the bottom of LibraryView that appears when any fonts are selected for comparison. Shows selected count, chip previews of selected fonts (family + subfamily name, max 5 shown), individual remove buttons, "Clear" to deselect all, and "Compare" button (disabled when < 2 selected). Visible in both list and grid views.

### Plan 11: Per-Family Stars & Saved Font Paths

1. **Star system changed to per-family** -- Removed `starred?: boolean` from `StoredFont` and `StoredFontMeta`. Added `starredFamilies?: string[]` to `FontDatabase` (server) and `FontDatabaseResponse` (client), stored as `source:familyName` keys. New `PUT /api/starred-families` endpoint toggles a family key in the set. Client `toggleStarFamily(key)` replaces old `toggleStar(id)`. `groupByFamily()` now accepts an optional `starredFamilies` Set and populates `FontFamily.starred`. `familyKey(source, familyName)` helper exported from `fontFamilies.ts`. Star button moved from per-variant rows to FamilyCard header (next to source badge) and GridFamilyCard (top-left). AnalyzeView star uses `familyStarred` / `familyStarKey` state computed from database response. Starred filter now uses `family.starred` instead of checking individual variants.
2. **Saved font folder paths** -- New `font-paths.json` file (gitignored) stores `{ paths: string[] }`. Server: `readFontPaths()` / `writeFontPaths()` in `database.ts`, endpoints `GET /api/font-paths`, `POST /api/font-paths` (add path), `DELETE /api/font-paths` (remove path). Client: `fetchFontPaths()`, `addFontPath()`, `removeFontPath()` in `api.ts`. LibraryView scan dialog shows saved paths as clickable chips below the path input, with `×` remove buttons. A "+ Save this path" link appears when current path is not yet saved. Paths are resolved to absolute on the server.

### Plan 12: Font Recategorization, Tags, Mega-Family Fixes & Persistent Overrides

1. **Noto mega-family fix** -- `inferPreferredFamily()` in `server/scanner.ts` no longer returns `null` for space-separated names. Previously, the guard `if (expanded === familyName) return null` prevented processing names like "Noto Sans HK Thin". Now it only returns `null` when CamelCase splitting had no effect AND no trailing tokens were stripped. This merges 21 orphan Noto variants into their proper families (HK, JP, KR, SC, TC).
2. **DIN mega-family fix** -- Added abbreviated width tokens ("Cond", "SemiCond", "Semi Cond", "Comp") to `TRAILING_WIDTH_NAMES` and `WIDTH_TOKENS` in `fontNameTokens.ts`. This allows `extractTrailingWidth()` and `widthQualifier()` to recognize abbreviated widths. URW DIN, URW DIN Cond, and URW DIN SemiCond now group under "URW DIN" with width tabs.
3. **Alfabet variant tabs fix** -- Added missing type names ("Kratki", "Linie", "Litery", "Strzalki") to `TRAILING_TYPE_NAMES`. Created `TYPE_TOKENS` set exported from `fontNameTokens.ts`. Updated `widthQualifier()` in `fontFamilies.ts` to include `TYPE_TOKENS` in the `allRecognized` validation, so diff tokens like "Kratki" are recognized and used as tab labels.
4. **Bungee variant grouping** -- Added visual variant names ("Layers Rotated", "Layers", "Inline", "Outline", "Shade", "Color", "Shadow") to `TRAILING_TYPE_NAMES`. "Layers Rotated" placed before "Layers" for correct longest-match extraction. All Bungee sub-families now group under "Bungee" with variant tabs.
5. **Amfibia width display fix** -- Fixed compound weight token recognition in `widthQualifier()`. The diff path now pre-matches compound tokens (e.g., "Demi Bold", "Extra Bold") before individual tokens. Weights like "Demi Bold Condensed" are correctly parsed as compound weight "Demi Bold" + width "Condensed" instead of failing at unrecognized "Demi". All 47 Amfibia fonts now correctly group into 5 width groups (Default, Condensed, Narrow, Wide, Expanded).
6. **Improved font classification** -- Added `classifyByStrongName()` early check in `classifyFont()` chain (after monospace, before sFamilyClass) for strong/unambiguous keywords: `serif`/`slab`/`bodoni`/`garamond`/etc. → serif, `script`/`handwrit`/`brush`/`calligraph` → script, `display`/`stencil`/`shadow`/`inline`/`outline`/`awesome`/`icon`/`bitmap`/`pixel`/`color` → display. Skips names containing "sans" to avoid false positives. Also added `(?<!\w)serif\b` pattern to `NAME_CATEGORY_PATTERNS` (late check). `compute-metrics` endpoint now always reclassifies all fonts (removed `if (font.metrics && font.category) continue` skip). Net result: sans-serif reduced from 751 to 654, serif increased to 71, display to 26, script to 35.
7. **Manual recategorization API** -- Added `categoryOverride?: FontCategory` and `tags?: string[]` fields to `StoredFont` (server) and `StoredFontMeta` (client). `categoryOverride` takes precedence over auto-detected `category`. New endpoints: `PUT /api/fonts/:id/category`, `PUT /api/fonts/bulk-category`, `PUT /api/fonts/:id/tags`, `PUT /api/fonts/bulk-tags`, `GET /api/tags`. Client API functions: `setFontCategory()`, `bulkSetCategory()`, `setFontTags()`, `bulkSetTags()`, `fetchAllTags()`.
8. **Recategorization UI** -- FamilyCard header now shows a colored category badge (clickable) that opens a category popover with all 5 categories. Selecting a category applies `categoryOverride` to all fonts in the family via `bulkSetCategory`. `familyMetrics` uses `categoryOverride ?? category` for effective category in filtering. Category badge colors: rose (serif), sky (sans-serif), emerald (monospace), purple (display), amber (script).
9. **Bulk edit mode** -- "Bulk Edit" toggle button in the toolbar. When active, FamilyCards show checkboxes for multi-family selection (orange highlight when selected). `BulkEditBar` floating component appears at the bottom with: selected count, category dropdown (applies `bulkSetCategory` to all fonts in selected families), tags input with comma-separated entry + auto-suggest from existing tags, "Add" button for tags, "Clear Selection" button.
10. **Persistent overrides file** -- `font-overrides.json` stores user-assigned `categoryOverride` and `tags` keyed by `familyName + "\0" + subfamilyName` (stable font metadata, not file path or UUID). Survives library clears, rescans, and database wipes. Functions: `readOverrides()`, `writeOverrides()`, `overrideKey()`, `saveOverride()`, `saveOverrides()`, `applyOverrides()` in `database.ts`. Overrides are automatically applied after streaming scan, non-streaming scan, and compute-metrics. All category/tag API endpoints (`PUT /api/fonts/:id/category`, `PUT /api/fonts/bulk-category`, `PUT /api/fonts/:id/tags`, `PUT /api/fonts/bulk-tags`) write changes to both `fonts-db.json` and `font-overrides.json`. `mergeFonts()` also carries forward `categoryOverride` and `tags` from existing entries to newly scanned fonts. `GET /api/overrides` endpoint exposes the overrides file contents. File is gitignored (user-specific data).

### Plan 13: Remove Base64 Backups & Google Fonts Integration

1. **Removed base64 font backups** -- Eliminated `fonts-data/*.b64` backup system entirely. Removed `dataDir()`, `writeFontData()`, `readFontData()`, `deleteFontData()` from `database.ts`. `clearAllFontData()` no longer manages .b64 files. All `writeFontData`/`readFontData`/`deleteFontData` calls removed from `index.ts`. Scanner no longer produces `base64Data` in `ScanFontResult`.
2. **Font file serving from disk** -- New `GET /api/fonts/:id/file` endpoint streams the font binary directly from `font.filePath` with correct Content-Type headers (`font/otf`, `font/ttf`, `font/woff`, `font/woff2`) and immutable cache headers. `GET /api/fonts/:id/data` now reads from `filePath` on disk (with woff2 decompression) instead of .b64 files. `POST /api/database/compute-metrics` reads from file paths with woff2 support. Removed `POST /api/convert-woff2` endpoint.
3. **URL-based @font-face** -- `useFontFace` hook now uses `url('/api/fonts/${id}/file')` in @font-face rules instead of base64 data: URLs. Uses `document.fonts.load()` for reliable font loading detection. `useGlyphFontFace()` in GlyphsView updated similarly. No more `fetchFontData` calls in font-face hooks.
4. **SVG glyph vector extraction** -- New `GlyphSvg` type (`{ d: string; advWidth: number }`) and `glyphSvgs?: Record<string, GlyphSvg>` field on `StoredFont`/`StoredFontMeta`. `extractGlyphSvgs()` function in scanner extracts SVG path data for 7 key glyphs: A, a, o, O, H, x, n. Called during scanning and in `compute-metrics`. Library grid view uses `SvgPreview` component to render "Aa" as inline SVG from pre-extracted paths, falling back to @font-face when SVGs aren't available.
5. **Google Fonts repo integration** -- Cloned `https://github.com/google/fonts.git` (shallow, `--depth=1`) into `google-fonts/` (gitignored). Contains ~3857 font files across `ofl/`, `apache/`, `ufl/` directories.
6. **Google Fonts starter DB** -- New `server/buildGoogleFontsDb.ts` build script scans all fonts from the cloned repo, computes metrics, extracts SVG vectors, deduplicates, and writes `google-fonts-db.json` (committed, ~21 MB, 3580 fonts) with relative file paths. npm script: `build:google-db`.
7. **Server-side Google Fonts DB loading** -- `readGoogleFontsDb()` in `database.ts` reads and caches `google-fonts-db.json` (60s TTL), resolving relative paths against the `google-fonts/` repo location. `findFontById()` searches both local and Google DBs. `GET /api/database` returns merged local + Google fonts. Font file/data endpoints use `findFontById()` to serve from either source. Tags endpoint includes Google fonts.
8. **Source filter** -- New `selectedSource` state in LibraryView with Local/Google pill buttons (green when active) between Starred and Category filters. Filters `searchAndCatFiltered` by `family.source`. Included in "Reset all" logic.
9. **FontUploader woff2 client-side decompression** -- FontUploader now uses `wawoff2` directly in the browser (WASM) for woff2→ttf decompression instead of the removed server endpoint.

## Key Modified Files

| File | What changed |
|------|-------------|
| `server/database.ts` | `StoredFont.preferredFamilyName`, `clearAllFontData()` (simplified: no .b64 cleanup), `deduplicateFonts()`, `mergeFonts()` returns `MergeResult` + carries forward `categoryOverride`/`tags` from existing to incoming, `variantKey` uses `source + preferredFamilyName ?? familyName` + subfamilyName, `FontMetrics` type, `FontCategory` type, `FontSource` type, `GlyphSvg` type, `metrics?` + `category?` + `categoryOverride?` + `tags?` + `source?` + `glyphSvgs?` fields on `StoredFont`, `starredFamilies?: string[]` on `FontDatabase`, `readFontPaths()` / `writeFontPaths()` for saved paths, **`font-overrides.json` persistence**: `overrideKey()`, `readOverrides()`, `writeOverrides()`, `saveOverride()`, `saveOverrides()`, `applyOverrides()`, **`GoogleFontsDatabase` type**, **`readGoogleFontsDb()`** (cached, resolves relative paths), **`findFontById()`** (searches both local + Google DBs). Removed: `dataDir()`, `writeFontData()`, `readFontData()`, `deleteFontData()` |
| `server/scanner.ts` | woff2 decompress, `preferredFamilyName` extraction, typographic subfamily (name ID 17) reading, `familyNameFromFile()` fallback, async scanFont/scanFolder with `source` parameter, `isUsableName` requires 2+ letters, `parseAbbreviatedSubfamily()`, `inferPreferredFamily()`, `inferWeightFromName()`, `computeFontMetrics()`, `classifyFont()`, `inferStyle()` abbreviated token detection. **`extractGlyphSvgs()`** extracts SVG path data for A/a/o/O/H/x/n. `ScanFontResult` no longer includes `base64Data`. Imports shared tokens from `src/lib/fontNameTokens.ts` |
| `server/index.ts` | `DELETE /api/database`, `POST /api/database/dedup`, ~~`POST /api/convert-woff2`~~ (removed), `POST /api/database/compute-metrics` (reads from filePath + woff2 decompression + SVG extraction), **`GET /api/fonts/:id/file`** (streams font binary from disk), `GET /api/fonts/:id/data` (reads from filePath, base64 on-the-fly), **`GET /api/database` merges local + Google DBs**, font endpoints use `findFontById()`, tags endpoint includes Google fonts. Removed all `writeFontData`/`readFontData`/`deleteFontData` calls |
| `server/googleFonts.ts` | `listGoogleFonts()` fetches/caches Google Fonts metadata, `downloadGoogleFonts()` downloads family ZIPs + extracts TTF/OTF, `GoogleFontMeta` / `DownloadProgress` interfaces |
| `server/buildGoogleFontsDb.ts` | Build script: scans all fonts from cloned `google-fonts/` repo, computes metrics, extracts SVGs, deduplicates, writes `google-fonts-db.json` with relative paths |
| `src/types/index.ts` | `preferredFamilyName?` on `StoredFontMeta`, `FontMetrics` interface, `FontCategory` type, `FontSource` type, **`GlyphSvg` interface**, `metrics?` + `category?` + `categoryOverride?` + `tags?` + `source?` + **`glyphSvgs?`** fields, `'glyphs'` in `AnalysisTab`, `source?` + `starred?` on `FontFamily`, `starredFamilies?` on `FontDatabaseResponse` |
| `src/types/wawoff2.d.ts` | Type declarations for wawoff2 (decompress/compress) |
| `src/lib/fontNameTokens.ts` | Shared font name abbreviation maps, token sets, trailing name lists, helper functions |
| `src/lib/fontFamilies.ts` | `groupByFamily` uses `source + superFamilyName()` as key, accepts optional `starredFamilies` Set, populates `FontFamily.source` + `FontFamily.starred`, `familyKey()` helper, `variantLabel` with `excludeWidth` param, `displayFamilyName()`, `groupByWidth()`, `widthQualifier()`, `superFamilyName()` |
| `src/lib/api.ts` | `clearDatabase()`, `deduplicateDatabase()`, `computeMetrics()`, `toggleStarFamily()`, `fetchFontPaths()`, `addFontPath()`, `removeFontPath()`, `listGoogleFonts()`, `downloadGoogleFonts()` with stream reader, `scanFolderStream` accepts `source` param, `GoogleFontMeta` / `GoogleDownloadEvent` types, `setFontCategory()`, `bulkSetCategory()`, `setFontTags()`, `bulkSetTags()`, `fetchAllTags()`. Removed: `convertWoff2()` |
| `src/lib/otfFeatures.ts` | `extractOTFFeatures()` reads GSUB/GPOS feature tags, `OTF_FEATURE_NAMES` maps ~130 tags to names |
| `src/lib/useCanvasResize.ts` | ResizeObserver hook for canvas redraw on resize |
| `src/lib/useFontFace.ts` | Hook for lazy-loading fonts as CSS `@font-face` with IntersectionObserver and caching. **Now uses URL-based `@font-face` via `/api/fonts/:id/file`** instead of base64 data: URLs |
| `src/components/LibraryView.tsx` | "Clear Library" + "Deduplicate" with confirmation message, view toggle (list/grid), Collapse All / Expand All, FamilyCard, GridFamilyCard with **SVG preview** (`SvgPreview` component for "Aa" rendering from `glyphSvgs`, fallback to @font-face), category radio buttons, Advanced Filters + 4 histogram filters, Google Fonts download panel, `SourceBadge`, `CompareTray` floating bar, saved paths chips, Bulk Edit mode. **Source filter pills** (Local/Google, green highlight) between Starred and Category filters |
| `src/components/AnalyzeView.tsx` | Family navigation, OTF features panel, Raw Metadata panel, Glyphs tab, source badge, star toggle, source-aware family member search |
| `src/components/GlyphsView.tsx` | Paginated glyph grid, **URL-based web font rendering** via `@font-face` with `/api/fonts/:id/file` (replaced base64 data: URLs), `useGlyphFontFace()` hook uses `document.fonts.load()`, `GlyphsErrorBoundary` error boundary |
| `src/components/CompareView.tsx` | Y-scale fix, ResizeObserver, responsive layout, collapsible sidebar, drag-resizable sidebar width, color fix |
| `src/components/HistogramFilter.tsx` | SVG histogram with 50 bins, draggable range handles, click-to-select, dual-layer rendering |
| `src/components/ContrastView.tsx` | ResizeObserver, unified scale, dashed reference lines |
| `src/components/XHeightView.tsx` | ResizeObserver |
| `src/components/ProportionsView.tsx` | ResizeObserver |
| `src/components/WeightView.tsx` | ResizeObserver |
| `src/components/SpacingView.tsx` | ResizeObserver |
| `src/components/FontUploader.tsx` | Accepts .woff2, **client-side woff2 decompression** via `wawoff2` WASM (replaced server-side `convertWoff2`) |
| `playwright.config.ts` | Playwright config with webServer auto-start, chromium project |
| `e2e/library-features.spec.ts` | 20 E2E tests |
| `package.json` | Added `wawoff2`, `adm-zip` dependencies, **`build:google-db` npm script** |
| `tsconfig.server.json` | Added `src/types/wawoff2.d.ts` and `src/lib/fontNameTokens.ts` to include |
| `.gitignore` | Added `google-fonts/` |
| `google-fonts-db.json` | **Committed** starter DB with 3580 Google Fonts (metadata, metrics, SVG vectors, relative paths) |

## Known Patterns / Gotchas

- **URW fonts / super-family grouping**: Family names like "BodoniURWExtBol" are abbreviated; `preferredFamilyName` has the clean version ("Bodoni URW"). For fonts WITHOUT preferredFamilyName, `inferPreferredFamily()` in the scanner splits the CamelCase familyName and strips known abbreviation tokens from the end to infer one. `parseAbbreviatedSubfamily` handles compound tokens (Ext+Nar → "Extra Narrow", Ext+Bol → "Extra Bold"). URW families with width in the preferredFamilyName (e.g., "Bodoni URW Narrow") are merged into a super-family via `stripTrailingQualifiers()`. `groupByFamily()` uses `superFamilyName()` as the grouping key.
- **URW abbreviation tokens**: All token maps are now in the shared `src/lib/fontNameTokens.ts`. Scanner and client both import from it. `splitCamelTokens()` handles acronym boundaries: `([A-Z]+)([A-Z][a-z])` splits "URWExt" → "URW Ext".
- **Alfabet/Bungee font type grouping**: `TRAILING_TYPE_NAMES` includes Alfabet types (Liniowy, Kontury, Cieniowany, Kropki, Pisany, Kratki, Linie, Litery, Strzalki) and Bungee visual variants (Layers Rotated, Layers, Inline, Outline, Shade, Color, Shadow). Stripped by `stripTrailingQualifiers()` for super-family grouping. `widthQualifier()` returns the type name so it appears as a version tab in the Library. `TYPE_TOKENS` set exported for diff token validation.
- **Typographic subfamily (name ID 17)**: Scanner reads `font.names.preferredSubfamily?.en ?? font.names.typographicSubfamily?.en` and uses it as subfamilyName when the font's name ID 2 is generic "Regular"/"Normal". This is critical for fonts like Lato where all variants have name ID 2 = "Regular" but name ID 17 = "Thin", "Light", "Bold", etc.
- **woff2 fonts with placeholder names**: Some web fonts have familyName "." -- handled by filename fallback + `isUsableName` requiring 2+ letters
- **American Auto-style fonts**: When `subfamilyName` is "Regular" but `familyName` contains abbreviated weight/style (e.g., "Bld It"), scanner post-processes to set proper `subfamilyName` ("Bold Italic") and `style` ("italic"). Requires re-scan of existing data. Additionally, `inferStyle()` now detects abbreviated tokens directly via `/\bIt\b/` and `/\bObl\b/` regex, catching subfamilyNames like "Bold It" or "Thin Obl" even without the `parseAbbreviatedSubfamily` path.
- **OTF vs TTF weight differences**: Same font can report weight 405 (OTF) vs 400 (TTF) -- dedup uses subfamilyName instead of weight
- **opentype.js Y coordinates**: `getPath()` returns screen coords (Y-down), no manual Y-flip needed
- **Scanner is async**: `scanFont()` and `scanFolder()` return Promises due to wawoff2 async decompress
- **Width qualifier filtering**: `widthQualifier()` computes diff via `computeFamilyDiff()`, splits on CamelCase boundaries, pre-matches compound tokens (e.g., "Demi Bold", "Extra Bold" against `WEIGHT_TOKENS`, `WIDTH_TOKENS`, `TYPE_TOKENS`), validates all tokens against known sets, then filters weight/style tokens to isolate width/type names. Returns `''` if any token is unrecognized.
- **Category classification multi-layer**: `classifyFont()` uses a priority chain: (1) `isFixedPitch`/width uniformity → monospace, (2) **`classifyByStrongName()`** — strong keyword check (serif/slab/bodoni/garamond → serif, script/handwrit/brush → script, display/stencil/shadow/inline/outline/awesome/icon/color → display; skips names containing "sans"), (3) `sFamilyClass` for explicit classes, (4) PANOSE bytes for serif/sans-serif/monospace/script/display, (5) serif detection via capital 'I' glyph path analysis, (6) contrast heuristic (< 0.4 → serif, > 0.85 → sans-serif), (7) **`classifyByName()`** late check (script/mono/display/serif/sans keywords), (8) `display` as ultimate fallback.
- **Category override**: `categoryOverride` field on `StoredFont` takes precedence over auto-detected `category`. UI shows colored category badge on FamilyCard header; clicking opens popover to change. Bulk edit mode allows applying category to multiple families at once. `familyMetrics` in LibraryView uses `categoryOverride ?? category` for effective category in filtering. Overrides persist in `font-overrides.json` (separate from `fonts-db.json`) keyed by `familyName + "\0" + subfamilyName`, surviving library clears and rescans. `mergeFonts()` also carries forward overrides from existing entries. `applyOverrides()` is called after scans and compute-metrics to restore user overrides.
- **Font tags**: `tags?: string[]` field on `StoredFont`. Managed via `PUT /api/fonts/:id/tags` (set) and `PUT /api/fonts/bulk-tags` (add). `GET /api/tags` returns all unique tags for auto-suggest. Bulk edit bar allows adding tags to multiple families. Tags also persist in `font-overrides.json` alongside category overrides.
- **Star/favourite system**: Per-family starring via `starredFamilies` array in `FontDatabase`. Keys are `source:familyName` (e.g., `local:Roboto`). Toggled via `PUT /api/starred-families` with `{ key }` body. `groupByFamily()` populates `FontFamily.starred` from the set. Star button in FamilyCard header and GridFamilyCard corner. Optimistic UI updates with rollback via `starredRef`.
- **Saved font paths**: `font-paths.json` (gitignored) stores an array of folder paths. `GET/POST/DELETE /api/font-paths` endpoints. Shown as clickable chips in the scan dialog. Current path can be saved with a "+ Save this path" button.
- **Source-aware dedup and grouping**: `variantKey()` includes `source` field (`local` or `google`). `groupByFamily()` groups by `source + superFamilyName`, allowing same-named local and Google fonts to coexist as separate families. Family member search in AnalyzeView is also source-aware.
- **Google Fonts download**: Uses `https://fonts.google.com/metadata/fonts` endpoint (strips `)]}'` XSSI guard prefix). Downloads family ZIPs from `https://fonts.google.com/download?family=...` and extracts TTF/OTF files into per-family subfolders via `adm-zip`. Font list is cached for 1 hour.
- **Histogram filtering pipeline**: Histograms avoid circular dependency by splitting filtering into stages: search + category → `searchAndCatFiltered` (used for histogram overlay values) → histogram range filters → `filteredFamilies`. The background chart shape comes from all families; the bright overlay shows only the search/category-filtered subset.
- **Raw metadata extraction**: `extractRawMetadata()` in AnalyzeView reads raw font tables via `font.tables` and `font.names` (cast to `any` to access non-typed fields). Decodes OS/2 `usWidthClass` (1-9 → name), `sFamilyClass` (upper byte class + lower byte subclass), `fsType` (bitmask → permission strings), `macStyle` (bitmask → Bold/Italic/etc. flags). Dates from `head.created`/`modified` are Unix epoch seconds × 1000.
- **GlyphsView web font rendering**: Uses URL-based CSS `@font-face` via `/api/fonts/:id/file` endpoint. `useGlyphFontFace()` hook injects @font-face pointing to the font file URL, uses `document.fonts.load()` for reliable detection, caches by font ID. `GlyphCell` renders characters as `<span>` styled with the web font. Falls back to "?" for glyphs without Unicode codepoints. `GlyphsErrorBoundary` wraps the view for crash recovery.
- **Font serving from disk**: No more base64 backup files. `GET /api/fonts/:id/file` streams font binary directly from `font.filePath` with proper Content-Type and immutable cache headers. `GET /api/fonts/:id/data` reads from filePath on the fly (with woff2 decompression via wawoff2). `compute-metrics` also reads from filePath. If the file doesn't exist on disk, 404 is returned.
- **SVG glyph preview**: During scanning, `extractGlyphSvgs()` pre-extracts SVG path data for A, a, o, O, H, x, n glyphs. Stored in `StoredFont.glyphSvgs` as `{ d: string; advWidth: number }` per character. Library grid view uses `SvgPreview` component to render "Aa" as inline SVG from these pre-extracted paths, avoiding the need to load the full font file for grid previews. Falls back to @font-face loading if glyphSvgs are missing.
- **Google Fonts repo**: Cloned `google/fonts` repo (shallow, `--depth=1`) into `google-fonts/` (gitignored, ~8 GB). Contains ~3857 font files across `ofl/`, `apache/`, `ufl/` directories.
- **Google Fonts starter DB**: `google-fonts-db.json` (committed, ~21 MB) contains pre-scanned metadata for 3580 Google Fonts with metrics, categories, and SVG vectors. Built by `server/buildGoogleFontsDb.ts` (`npm run build:google-db`). Uses relative file paths (e.g., `ofl/roboto/Roboto-Regular.ttf`). Read-only at runtime.
- **Google Fonts DB loading**: `readGoogleFontsDb()` reads and caches `google-fonts-db.json` (60s TTL), resolving relative paths against `google-fonts/` repo location. `findFontById()` searches both local and Google DBs. `GET /api/database` returns merged local + Google fonts. If the repo folder doesn't exist, paths remain relative (font files inaccessible but metadata is browseable).
- **Source filter**: Library filter bar has Local/Google pill buttons (green highlight) between Starred and Category filters. `selectedSource` state filters by `family.source`. Included in "Reset all" logic. Filtering pipeline: source → starred → search → category → histogram ranges.
- **CompareView color consistency**: Canvas rendering iterates the full `fonts` array (skipping non-visible entries) to preserve the original index for `COLORS[i % COLORS.length]`. Previously used `visibleFonts.forEach` which shifted colors when fonts were toggled off.
- **Playwright env variable**: The Cursor sandbox sets `PLAYWRIGHT_BROWSERS_PATH` to a sandbox-specific temp dir. Tests must run with `unset PLAYWRIGHT_BROWSERS_PATH` or outside the sandbox (`required_permissions: ["all"]`) to find the installed browsers at `~/Library/Caches/ms-playwright/`.
