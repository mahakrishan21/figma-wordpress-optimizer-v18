# Figma WordPress Optimizer — Session Notes
> Last updated: 2026-06-08

---

## Project Overview

A two-version Figma plugin that audits Figma designs for WordPress/web-handoff issues.

| Version | Folder | Status |
|---------|--------|--------|
| V16 | `figma-wordpress-optimizer-v15/` | Complete, frozen — do not modify |
| V17 | `figma-wordpress-optimizer-v17/` | Active development |

Both versions share the same two-file plugin structure:
- `code.js` — Figma sandbox (no DOM access, Figma API only, ES2017)
- `ui.html` — WebView iframe (HTML/CSS/JS, communicates via `postMessage`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Figma Canvas (Sandbox)  code.js                            │
│  - figma API access                                         │
│  - no DOM                                                   │
│  - ES2017 ONLY (no bare catch {}, no optional chaining ?.)  │
│  - figma.ui.postMessage(msg) → sends to UI                  │
│  - figma.ui.onmessage = fn  → receives from UI              │
└──────────────────────┬──────────────────────────────────────┘
                       │ postMessage / onmessage
┌──────────────────────▼──────────────────────────────────────┐
│  WebView (ui.html)                                          │
│  - DOM, CSS, vanilla JS                                     │
│  - parent.postMessage({pluginMessage: msg}, '*')→ to sandbox│
│  - window.onmessage = event => {...}  ← receives from sandbox│
└─────────────────────────────────────────────────────────────┘
```

### Critical Gotchas
- **No bare `catch {}`** — Figma sandbox is ES2017, not ES2019. Always `catch (e) {}`.
- **`figma.getLocalPaintStylesAsync()`** — use async version, not sync. Manifest has `documentAccess: dynamic-page`.
- **`figma.getLocalTextStylesAsync()`** — same, always async.
- **`overflow: clip` not `overflow: hidden`** — use `clip` on accordion containers so sticky headers work.

---

## V16 Changes (in v15 folder)

### 3-Panel Audit Flow

| Panel | ID | Trigger |
|-------|----|---------|
| Empty State | `#auditEmpty` | No frame selected (initial state) |
| Ready | `#auditReady` | Frame/frames selected |
| Results | `#auditResults` | After audit runs |

- "Select Frame" button **removed entirely**
- Run Audit is **disabled** in empty state, **active** in ready state
- `auditHasRun` flag prevents ready/empty flipping after results show

---

## V17 New Features

### 9 New Audit Checks

| Rule ID | Stat Key | Severity | Description |
|---------|----------|----------|-------------|
| `text-overflow` | `textOverflow` | high | Text node bounding box exceeds parent container by >5px |
| `auto-line-height` | `autoLineHeight` | medium | Text uses AUTO line-height (unpredictable in CSS) |
| `near-dupe-spacing` | `nearDupSpacing` | medium | Spacing values within 2px of each other (post-loop) |
| `section-overlap` | `sectionOverlaps` | high | Two sections overlap on canvas (post-loop) |
| `missing-font` | `missingFonts` | high | Font not loadable via `figma.loadFontAsync` (post-loop) |
| `no-mobile-frame` | `noMobileFrame` | medium | No frame ≤480px wide on page (post-loop) |
| `interactive-no-states` | `interactivePatterns` | low | Carousel/accordion/modal/tabs without state variants |
| `multiple-fonts` | `multipleFonts` | medium | More than 3 font families in a single frame (post-loop) |

> **Removed:** oversized image check — not relevant for designers.

### `ISSUE_DETAILS` Map
Every issue type has a `details` object:
```javascript
ISSUE_DETAILS['text-overflow'] = {
  why: "The text node's bounding box extends past its parent...",
  steps: ["Select the text node...", "Option 1: Resize...", ...]
}
```
Rendered as an expandable "Why & how ▾" panel per issue in the audit results.

### `CAT_MAP` additions
```javascript
'text-overflow':'accuracy', 'auto-line-height':'accuracy',
'near-dupe-spacing':'accuracy', 'section-overlap':'accuracy',
'missing-font':'accuracy', 'no-mobile-frame':'accuracy',
'interactive-no-states':'accuracy', 'multiple-fonts':'styles'
```

---

## Typography & Colors Tab (V17)

### Tab Location
Third tab after "Audit" and "Spelling & Grammar":
```html
<button class="tab" data-tab="typo">Typography &amp; Colors</button>
<div id="tab-typo" class="tab-panel">...</div>
```

### Data Flow
```
UI: "Scan File" button clicked
  → parent.postMessage({ type: 'collect-typo-colors' })
Sandbox: collectTypographyAndColors()
  → figma.getLocalPaintStylesAsync()
  → figma.getLocalTextStylesAsync()
  → walks all nodes on current page
  → builds payload (see below)
  → figma.ui.postMessage({ type: 'typo-colors-result', data })
UI: renderTypoColors(data)
```

### Payload Structure
```javascript
{
  colorStyles: [],      // from getLocalPaintStylesAsync(), with WCAG contrast
  localColors: [],      // unlinked fills, sorted by count desc
  nearDupeColorGroups: [], // groups of visually similar colors (HSL distance < 0.07)
  unusedColorStyles: [],
  textStyles: [],       // from getLocalTextStylesAsync(), with usage count
  localTextCombos: [],  // unlinked text font combos, sorted by count desc
  duplicateTextGroups: [], // styles with identical font+size+LH
  unusedTextStyles: [],
  typeSizeInfo: [],     // font size frequency {size, count}
  fontFamilies: [],     // font families with styles list and count
  textStyleGroups: [],  // smart grouping by name pattern (Headings, Body, etc.)
  recommendations: [],  // buildRecommendations() output
  opportunities: [],    // buildOpportunities() output
  summary: { ... }
}
```

### WCAG Contrast
- `relLum(hex)` — relative luminance
- `wcagContrast(hex1, hex2)` — contrast ratio
- Each color style gets `contrastWhite` and `contrastBlack`
- Displayed as `⬜ 4.5 AA` / `⬛ 12.1 AAA` badges (green=AAA, blue=AA, gray=Fail)

### Near-Duplicate Color Detection
```javascript
colorDist(hex1, hex2)  // HSL-based distance
// threshold: < 0.07 = near-duplicate
// formula: sqrt(dH² × 0.5 + dS² × 0.3 + dL² × 0.2)
```

### Merge Colors Feature
Near-duplicate groups show a **"Merge colors →"** button:
1. Click → inline name input appears (pre-filled with first color's name)
2. Edit name → "Confirm Merge"
3. Sandbox creates/updates a `PaintStyle`, walks all unlinked nodes with matching fills, sets `node.fillStyleId`
4. Returns `{ type: 'merge-color-done', name, updated, mergeId }`
5. UI shows "✓ Merged into X — N layers updated" inline

Message: `{ type: 'merge-color-group', hexes: ['#RRGGBB', ...], name: 'Style Name', mergeId: 'mg_0' }`

### Actionable Recommendations
Each recommendation card has:
- **Issue** — what was found (e.g. "5 similar colors across 2 groups")
- **Impact** — why it matters for handoff
- **Action** — specific step to take (blue text)
- **Benefit** — what improves (green text)

Severity levels: `high` (red border) / `medium` (amber) / `low` (blue)

### Design System Opportunities
Prioritized checklist:
- Priority 1 (!) — merge near-dupes, merge duplicate text styles
- Priority 2 (2) — create styles for high-use unlinked colors/text
- Priority 3 (3) — remove unused styles, consolidate fonts

### Smart Text Style Grouping (code.js only, no UI section)
`groupTextStyles()` uses regex patterns to classify styles:
```
Display & Hero  → /\b(display|hero|banner|jumbo)\b/i
Headings        → /\b(h[1-6]|heading\s*[1-6]?|headline|title)\b/i
Body Text       → /\b(body|paragraph|content|copy)\b/i
Captions        → /\b(caption|small|footnote|label|eyebrow)\b/i
Buttons & CTAs  → /\b(button|btn|cta|action)\b/i
```
Data is included in payload but Style Groups section was **removed from UI** per user request.

### Design Principles for this Tab
- **Informational only** — no pass/fail for type scales or color ratios
- **Works with legacy files** — no required design system
- **Action-oriented** — every finding comes with a suggested next step
- **Not a strict validator** — help designers organize, not enforce rules

---

## File Structure

```
figma-wordpress-optimizer-v17/
├── manifest.json          # Plugin metadata, documentAccess: dynamic-page
├── code.js                # ~1800 lines, Figma sandbox
│   ├── ISSUE_TO_STAT      # maps issue type → stat key
│   ├── ISSUE_DETAILS      # maps issue type → {why, steps[]}
│   ├── createEmptyStats() # initializes all stat counters
│   ├── addIssue()         # adds issue + updates stat + attaches details
│   ├── collectIssues()    # main audit walker (async)
│   ├── rgbToHexStr()      # color helper
│   ├── hexToHsl()         # color helper
│   ├── colorDist()        # HSL-based color distance
│   ├── relLum()           # WCAG relative luminance
│   ├── wcagContrast()     # WCAG contrast ratio
│   ├── collectTypographyAndColors()  # typo+color scanner (async)
│   ├── TEXT_GROUPS        # regex patterns for style grouping
│   ├── groupTextStyles()  # groups text styles by name pattern
│   ├── buildRecommendations()  # generates recommendation cards
│   ├── buildOpportunities()    # generates priority checklist
│   └── figma.ui.onmessage      # message dispatcher
│       ├── run-audit
│       ├── rename-layer / hide-layer / etc.  (action handlers)
│       ├── merge-color-group   ← NEW
│       ├── collect-typo-colors ← NEW
│       ├── collect-texts
│       └── close
└── ui.html                # ~2000 lines, WebView
    ├── CSS custom properties (:root)
    ├── Tab system (Audit / Spelling & Grammar / Typography & Colors)
    ├── #tab-audit
    │   ├── #auditEmpty    (no selection)
    │   ├── #auditReady    (selection made)
    │   └── #auditResults  (post-audit)
    ├── #tab-spelling
    └── #tab-typo
        ├── Scan button + progress bar
        ├── #typoSummaryGrid (6 stat cards)
        ├── #typoOpportunities
        ├── #typoRecommendations
        ├── [Colors section]
        │   ├── #typoColorStyles   (table: swatch/name/hex/WCAG/uses)
        │   ├── #typoLocalColors   (table)
        │   ├── #typoNearDupeColors (groups + merge buttons)
        │   └── #typoUnusedColors  (table, collapsed)
        └── [Typography section]
            ├── #typoTextStyles    (table: name/font/size/weight/LH/uses)
            ├── #typoLocalText     (table)
            ├── #typoDupText       (chip groups)
            ├── #typoUnusedText    (table, collapsed)
            ├── #typoScaleInfo     (bar chart, collapsed)
            └── #typoFonts         (font family rows)
```

---

## CSS Variables Reference

```css
/* Blues */
--blue-50 --blue-100 --blue-200 --blue-400 --blue-500 --blue-600 --blue-700

/* Greens */
--green-50 --green-100 --green-600 --green-700

/* Ambers */
--amber-50 --amber-100 --amber-600 --amber-700

/* Reds */
--red-50 --red-100 --red-500 --red-600

/* Violets */
--violet-50 --violet-100 --violet-600 --violet-700

/* Grays */
--gray-50 --gray-100
--text-primary --text-secondary --text-muted
--border --surface --radius-sm --radius-md
```

---

## Key Message Types

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| UI → Sandbox | `run-audit` | `{ frameId }` | Run full audit |
| UI → Sandbox | `collect-typo-colors` | — | Scan typography & colors |
| UI → Sandbox | `merge-color-group` | `{ hexes[], name, mergeId }` | Merge near-dupe colors |
| UI → Sandbox | `collect-texts` | — | Gather text for spell check |
| UI → Sandbox | `focus-node` | `{ nodeId }` | Select layer in canvas |
| Sandbox → UI | `typo-colors-result` | `{ data }` | Scan complete payload |
| Sandbox → UI | `typo-colors-error` | `{ message }` | Scan failed |
| Sandbox → UI | `merge-color-done` | `{ name, updated, mergeId }` | Merge succeeded |
| Sandbox → UI | `merge-color-error` | `{ message, mergeId }` | Merge failed |
| Sandbox → UI | `selection-changed` | `{ count, names[] }` | Canvas selection update |
| Sandbox → UI | `audit-complete` | `{ issues[], stats }` | Audit results |

---

## Decisions Log

| Decision | Reason |
|----------|--------|
| Remove oversized image rule | Tool is for designers, file size not their concern |
| `overflow: clip` on accordion groups | `overflow: hidden` blocks sticky positioning |
| `catch (e) {}` not `catch {}` | Figma sandbox is ES2017, bare catch is ES2019 |
| `getLocalPaintStylesAsync` | Manifest uses `dynamic-page`, sync methods throw |
| Informational-only type scale | User has legacy client files, no enforced system |
| Style Groups section removed | User preferred cleaner UI without the extra accordion |
| Table layout for color/text styles | Replaces div-based rows; easier to scan 25-48 items |
| WCAG AAA/AA/Fail badge labels | More informative than raw ratio alone |
| Merge button inline, not modal | Keeps context; faster interaction |
