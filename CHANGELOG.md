# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

- Nothing yet.

## [1.0.0] — 2026-06-15

First public-ready release (V17).

### Added
- New **Accuracy & performance** issue category (red) with 8 new audit checks:
  - `text-overflow` — text overflowing its container
  - `auto-line-height` — text using AUTO line-height instead of an explicit value
  - `missing-font` — text referencing a font that fails to load
  - `section-overlap` — overlapping top-level sections
  - `near-dupe-spacing` — near-duplicate Auto Layout spacing values
  - `no-mobile-frame` — page has a desktop frame but no mobile (≤480px) frame
  - `multiple-fonts` — more than 2 font families in use
  - `interactive-no-states` — carousels/accordions/tabs/modals without state variants
- New **Typography & Colors** tab:
  - Color style audit with WCAG contrast ratios against white/black
  - Unlinked color and unlinked text detection (3+ uses)
  - Near-duplicate color grouping with a **Merge colors** flow that creates/updates a Color Style and re-points matching layers
  - Unused Color/Text style detection
  - Font family and font size usage breakdown, including one-off size detection
  - Prioritized recommendations (high/medium/low) with Impact / Action / Benefit details
- Per-category **Ignore all** button in each accordion header
- Per-issue **"Why & how to fix"** expandable detail panel
- Summary badges: total issues, actionable issues, shown issues, ignored count
- Project branding: plugin icon (`assets/icon-512.png`, `icon-256.png`, `icon-128.png`)
- `LICENSE` (MIT), `CONTRIBUTING.md`, `CHANGELOG.md`

### Changed
- 6 issue categories now share a consistent color system (accuracy = red, structure = blue, styles = violet, buttons = amber, assets = green, cleanup = gray), applied consistently to accordion dots, stat numbers, and count badges
- Stats grid is now 6 columns, left-aligned
- Modernized spacing, borders, and radius across the UI (Linear/Vercel-style)
- "No mobile frame" stat label moved to vertically align with the "Automated Fixes" label

### Fixed
- **Ignore** button now ignores only the specific issue clicked, instead of clearing the entire issue list (previously triggered a full re-audit that reset all filtering)

### Removed
- Header close button (`#headerClose`) — use the footer **Close** button instead
- "No mobile frame" stat card from the stats grid (the underlying check still runs and appears in the issue list)
- Left-colored borders on stat cards and accordion items (replaced by category-colored dots and stat numbers)

---

## V16

### Added
- **Spelling & Grammar** tab: offline spelling dictionary (~320 entries), 9 grammar pattern rules, Flesch Reading Ease readability scoring, and long-sentence detection
- Redesigned UI with a full light/dark CSS custom-property theme, blue accent color, tab navigation, collapsible issue groups with sticky category headers, and an improved stats grid

### Changed
- Accordion containers use `overflow: clip` so sticky category headers work while scrolling
- Scroll container height increased from 330px to 400px
- Issue count badge changed from gray to blue; total issues badge turns red when issues exist

---

## V1–V15

Initial structural audit engine: 15 checks across 5 categories (structure, styles, buttons, assets, cleanup), 8 automated fix actions, smart button/section/auto-layout detection, and the blocked-vs-actionable issue model.
