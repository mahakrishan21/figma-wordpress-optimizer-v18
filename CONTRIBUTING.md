# Contributing

Thanks for your interest in improving Figma WordPress Optimizer.

## Reporting issues

When filing a bug report, please include:

- Figma platform (Desktop app — required for local/dev plugins) and OS
- Steps to reproduce, including whether the audit ran on the whole page or a selection
- The issue type(s) involved (e.g. `text-overflow`, `missing-color-style`) if applicable
- Screenshots of the plugin panel and/or the affected layers, if possible
- Any messages shown in the plugin's message bar or Figma's developer console

## Suggesting features

Open an issue describing:

- The problem you're trying to solve (not just the feature)
- How it fits into the existing audit categories (Accuracy & performance, Structure & hierarchy, Styles & variables, Buttons & sections, Assets & vectors, Cleanup & separators) — or whether it needs a new category
- Whether it should be a new audit check, an automated fix, or both

## Development setup

1. Clone the repo.
2. Open Figma Desktop → **Plugins → Development → Import plugin from manifest…** and select `manifest.json`.
3. Edit `code.js` (plugin sandbox) and/or `ui.html` (plugin UI).
4. Reload the plugin in Figma to pick up changes (**Plugins → Development → Figma WordPress Optimizer v17**, or use the "Reload" option from the right-click menu while the plugin is running).

## Code guidelines

- **`code.js` must stay ES2017-compatible.** No optional chaining (`?.`), no nullish coalescing (`??`), no bare `catch {}` without a binding — Figma's plugin sandbox does not support newer syntax.
- Use `getLocalPaintStylesAsync()` / `getLocalTextStylesAsync()` and other async style APIs — the sync variants are deprecated and disabled under `documentAccess: "dynamic-page"`.
- Keep `ui.html` self-contained (HTML + CSS + inline JS) — no external scripts or stylesheets, since `networkAccess` is set to `none`.
- When adding a new audit check:
  1. Add the detection logic in `code.js` and push an issue with a unique `type` key.
  2. Add a `type → category` mapping in `CAT_MAP` in `ui.html`.
  3. Add a label/description and "Why & how to fix" entry in `ISSUE_DETAILS`.
  4. If it should appear in the stats grid, add an entry to `statDefs` and an `ISSUE_TO_STAT` mapping.
  5. Update the audit checks table in `README.md`.
- New CSS should use the existing custom-property theme (`--cat-*`, `--surface`, `--border`, etc.) rather than hardcoded colors, so light/dark mode and category color-coding stay consistent.

## Pull requests

- Keep PRs focused on a single change (one new check, one bug fix, one UI tweak).
- Describe what you tested and on what kind of Figma file (component-heavy, page-heavy, large file, etc.).
- Update `CHANGELOG.md` under "Unreleased" with a short description of your change.
