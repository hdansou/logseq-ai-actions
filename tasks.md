# Tasks — `logseq-ai-actions`

Primary task tracker for this project. See `REQUIREMENTS.md` for the signed-off v1 spec.

Legend: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` dropped.

---

## Phase 0 — Requirements & bootstrap

- [x] Kickoff Q&A and decision memos (2026-04-23)
- [x] Write `REQUIREMENTS.md` (2026-04-23)
- [x] Initialize `tasks.md` and `CHANGELOG.md`
- [x] Draft `AGENTS.md` (non-discoverable landmines only)
- [ ] Confirm author display name and GitHub repo URL — done for author (Danzu) and repo (`https://github.com/hdansou/logseq-ai-actions`), email exposure in `package.json` `author` still to confirm before first public release
- [x] `git init` + first commit (requirements-only baseline) — `6c781b8`
- [-] Local dir rename `logseq-action/` → `logseq-ai-actions/` — rejected, mismatch documented in AGENTS.md + README

## Phase 1 — Tooling scaffold

- [x] `pnpm init`; pin Node LTS in `.nvmrc` / `engines` (Node 22)
- [x] Add Vite (vanilla — no `vite-plugin-logseq`; Logseq loads from the dev-server URL directly)
- [x] Add TypeScript, strict `tsconfig.json` with `moduleResolution: bundler`
- [x] Add Biome; minimal `biome.json`
- [x] Add Vitest + `@vitest/coverage-v8` with 80 % gate
- [x] Add Zod
- [x] Add Preact + `preact/compat` alias; JSX via `tsconfig.json`
- [x] Add changesets (`.changeset/config.json` with `access: public`)
- [x] Add `simple-git-hooks` pre-commit: `biome check --write` + `tsc --noEmit`
- [x] `package.json` scripts wired (dev, build, typecheck, test, lint, lint:fix, format, changeset, release, prepare)
- [x] `LICENSE` (MIT) — Phase 0 baseline
- [x] `.gitignore` — Phase 0 baseline
- [x] `src/__sdk_guard__.ts` — compile-time floor at `@logseq/libs ≥ 0.3.1` (references `getCurrentRoute`)
- [x] `index.html` with light/dark CSS variable scaffolding
- [x] GitHub Actions workflow — Tier 1 (lint + typecheck + test + build) on every push and PR

## Phase 2 — Pure core (TDD)

- [x] `classifyEndpoint(baseUrl)` — LOCAL vs REMOTE (strict loopback; fail-closed on invalid)
- [x] Endpoint presets (LM Studio / Ollama / Goose / Custom) with `findPreset` lookup
- [x] `ActionSchema` (Zod) + `parseAction` — 10 tests
- [x] Registry pipeline — `buildRegistry` + `parseUserActions` (public split) — shadowing, dedup, individual entry validation, stable order
- [-] Scope resolver — block + subtree handled inline in `resolveInput`; selection deferred per REQUIREMENTS §14
- [x] Subtree flattener (`flattenSubtree` — Markdown outline, 2-space indent per depth, 10 tests)
- [x] Diff module — `computeDiff(original, proposed)` wrapping jsdiff (6 tests, 100 % coverage)
- [x] Streaming chunk parser (`src/sse.ts`, 11 tests, 100 % lines)
- [x] Debug log ring buffer — `createRingBuffer<T>(capacity)` + `truncate` + `debugLog` singleton (cap 50; 10 tests)
- [x] `parsePoints` — tolerates bullet prefixes, code fences, "Here are…" preambles (9 tests)
- [ ] Prompt templater (`{{content}}`, `{{selection}}`, etc.) — deferred; seed prompts use plain interpolation, no templating needed yet

## Phase 3 — LLM provider

- [x] `LLMProvider` interface (`src/provider.ts`)
- [x] Non-streaming implementation — 10 tests (happy path, auth header, trailing slash, HTTP error, timeout, network error, empty choices, whitespace trim)
- [x] Streaming implementation — `provider.stream(req, onChunk)`, 5 tests with mocked ReadableStreams
- [x] Preset table (Phase 2 item — same module)
- [x] `fetchImpl` injection + `logseqFetch` shim (falls back to `globalThis.fetch` when host scope unreachable)
- [ ] Tier 2 integration test against a live endpoint, gated by `TEST_LIVE_LLM=1` — placeholder

## Phase 4 — Logseq adapter (inlined)

Originally specced as separate adapter modules; v1 reality is all of this lives in `src/index.ts` as thin helpers. Works fine; extract to `src/adapter/*` only if multiple callers emerge.

- [x] Block read — `logseq.Editor.getCurrentBlock` / `getBlock(uuid, {includeChildren})` via `resolveInput(action, explicitBlockUuid?)`
- [x] Block write — `updateBlock` for replace / diff-panel accept; `insertBlock` with `sibling: false` for append-children
- [x] Registration — slash + palette + context menu + toolbar all wired from one action list (`rebuildRegistry`), gated by `registeredInvocationIds`
- [x] Settings adapter — `readSettings()` snapshot helper; `readPrivateSetting(k, fallback)` for the underscore-prefixed persistence keys (`_consentSeen`, `_lastEndpointTrust`)

## Phase 5 — UI (Preact)

- [x] Native settings via `logseq.useSettingsSchema` (preset picker, baseUrl, model, API key, temperature, timeout, debug-log toggle, userActionsJson) + preset-change auto-fill
- [x] First-run consent modal (one-time, backed by `_consentSeen` hidden setting)
- [x] LOCAL/REMOTE endpoint badge — `LocalRemoteBadge` component, rendered in every panel header
- [x] LOCAL → REMOTE one-time transition warning modal (`_lastEndpointTrust` tracks)
- [x] `DiffPanel` — side-by-side Original/Proposed with word-level highlights, Edit mode, action bar (Rewrite / Summarize re-run), streaming support
- [x] `ConfirmPanel` — single preview + Accept/Reject; `hideReject` for acknowledgement-only notices
- [x] `DiagnosticsPanel` + `/AI Diagnostics` — read-only debug-log viewer with Copy all / Clear all
- [x] `ManageActionsPanel` + `/AI Manage Actions` — full CRUD for user-defined actions, with Import / Export JSON
- [x] `ActionPickerPanel` + toolbar ✨ button — discovery surface listing every action plus Manage / Diagnostics links
- [ ] Replace native settings with a Preact settings panel (would enable inline validation + prettier LOCAL/REMOTE preview) — **v2**

## Phase 6 — Seed actions

- [x] `spellcheck` (block → diff-panel)
- [x] `grammar` (selection → block; diff-panel)
- [x] `rewrite` (selection → block; diff-panel, streaming)
- [x] `rewrite-formal` / `rewrite-casual` / `rewrite-friendly` tone variants (block → diff-panel)
- [x] `rewrite-professional` — "Writing the Amazon Way" style (block → diff-panel)
- [x] `outline-replace` / `outline-append` (subtree → nested outline tree via new `parseOutline` module; confirm-panel preview; recursive `insertBlock`; destructive variant wipes existing children first)
- [x] `image-title` (vision; `picker-replace` output; new `kind="vision"` Action field; new `visionModel` setting falling back to `model`; `image-asset.ts` + `parse-titles.ts` pure modules; `ChoicePanel` UI; `completeVision` provider method)
- [x] `extract-image-text` (vision OCR; `outline-append` output; reuses `parseOutline` extended with markdown-table-block support; `runVisionAction` dispatches on `outputMode`; verbatim system prompt with table syntax)
- [x] `summarize` (subtree; diff-panel, streaming)
- [x] `key-points` (subtree → append-children)
- [x] Slash commands registered for each + `/AI Diagnostics` + `/AI Manage Actions`
- [x] Command palette entries for each (`AI: <title>`) + Diagnostics + Manage Actions
- [x] Block context menu entries (`"AI: <title>"`) for each
- [x] Toolbar button → ActionPickerPanel listing all
- [ ] Golden-fixture tests per prompt — deferred; needs Tier 2 live-LLM infra
- [-] Ship `actions.example.json` — superseded by Manage Actions UI + inline README example

## Phase 7 — User actions

- [x] Storage via `userActionsJson` plugin setting (textarea) — works Web and Desktop alike
- [x] Validation failure UX (toast on startup + console detail; invalid entries skipped, valid ones still load)
- [x] Shadow handling (user id == built-in id → swaps in place; Manage UI shows "shadowed by user" badge)
- [x] Hot-reload: editing existing action's title/prompt applies on next invocation (handler resolves by id at call time); add/remove requires plugin toggle (Logseq has no deregister API)
- [x] `ManageActionsPanel` — CRUD UI with per-field validation, reorder, Import/Export JSON. Round-trips through the same `userActionsJson` setting.
- [x] `ManageActionsPanel` v2 — gallery redesign (Mockup C): card grid, search, inline detail editor with shared form for Create / Update / View, in-modal delete confirm, validation summary banner, "Duplicate as user action" for built-ins, empty-state CTA, real-radio pill selectors. CSS reuses the manage-* namespace and the new theme variables that defer to Logseq's `--ls-*` variables.
- [x] `parseUserActions` extracted from `buildRegistry` as a public helper so the Manage UI can list only user entries (including shadow cases)

## Phase 8 — Documentation

- [x] `README.md` — install, preset table, CORS guide, privacy note, user-actions primer, development commands
- [x] Plugin icon (`./icon.svg` source + 128×128 `./icon.png` rendered via `rsvg-convert`, at the project root where `package.json`'s `"icon": "./icon.png"` resolves) — teal 2D bot face on the existing charcoal `#171717` rounded-square background. Same identity as the toolbar button: rounded teal head (`#14B8A6`, Tailwind teal-500) + antenna, white eyes and smile inside the silhouette. The previous chrome-minion mark was retired alongside the toolbar redesign so both surfaces share one identity.
- [x] `REQUIREMENTS.md` §14 — selection-scope deferral memo with pain table, SDK gap, acceptance criteria for when we revisit
- [x] `AGENTS.md` — non-discoverable landmines (author name, package-vs-dir mismatch, SDK import pattern, `pnpm dev --port` quirk, dist/ + public/ timing)
- [ ] Inline doc comments on public types (`Action`, `LLMProvider`, `classifyEndpoint`, …) — partial; revisit before v1.0.0

## Phase 9 — E2E (blocker for v1.0.0)

- [ ] Playwright setup against local Logseq (reuse `logseq-plugin-tester` skill)
- [ ] MSW mock LLM server for deterministic responses
- [ ] One golden-path e2e per seed action (invoke → expected outcome on a DB graph fixture)
- [ ] CI Tier 3 job (`.github/workflows/ci.yml` placeholder to replace)

## Phase 10 — Release 1.0.0

- [x] Confirm author email exposure in `package.json` `author` — flipped to `"Danzu"` (no email) on 2026-05-02 ahead of marketplace listing.
- [x] First release notes summarising v1.0.0 — folded all `[Unreleased]` entries into `## [1.0.0] - 2026-05-02` with a paragraph blurb; six pending `.changeset/*.md` files removed (their content is in CHANGELOG).
- [x] Tag + GitHub release — `publish.yml` workflow added (mirrors `ci.yml` gates: lint + typecheck + test + build, then zips `README.md` + `LICENSE` + `package.json` + `icon.{png,svg}` + `dist/` and attaches to a generated GitHub Release on `v*` tag push).
- [x] Submit to Logseq Marketplace — [logseq/marketplace#796](https://github.com/logseq/marketplace/pull/796) is open with `packages/logseq-ai-actions/manifest.json` + `icon.svg`. Body now references the [v1.0.0 release](https://github.com/hdansou/logseq-ai-actions/releases/tag/v1.0.0). WIP check passes; awaiting maintainer review/merge.
- [ ] Freeze REQUIREMENTS.md; future changes go through a versioned PR — pending; do this once the marketplace PR merges so the spec is stable across the first round of user feedback.

Phase 9 (Tier 3 Playwright e2e) is **deferred** for v1.0.0 — relaxation noted in CHANGELOG. Revisit post-marketplace.

### Production-hardening pass (2026-04-26)

- [x] DRY: extract `closeBusyToast` + `formatProviderError` helpers in `src/index.ts`
- [x] DRY: extract `mountPanel<T>` helper in `src/ui/mount-panel.ts`; collapsed all six `show-*.ts` launchers
- [x] DRY: `src/provider.ts` consolidated around `postChat()` + `buildTextBody` / `buildVisionBody` / `parseChatContent` — text/stream/vision share URL, headers, timeout, error normalisation
- [x] DRY: merged `performLLMCall` + `performLLMStream` into one `performLLM(..., onChunk?)`
- [x] DRY: shared `ConfirmOverlay` component replaces bespoke `DeleteOverlay` and the new discard prompts
- [x] YAGNI: remove dummy `test:e2e` / `test:integration` scripts (no configs existed)
- [x] YAGNI: remove unverified `goose` endpoint preset (and its README rows)
- [x] UX: replace `window.confirm` in Manage Actions panel (`tryClose`) and Diff panel (`handleBarClick` switch-with-edits) with styled `ConfirmOverlay` (Esc cancels, Enter confirms)
- [x] Security: API key setting → single-line input; README + setting description state UNENCRYPTED disk storage
- [x] Security: comment on `LLMProviderErrorDetails.bodyExcerpt` re: reflected-header sensitivity
- [x] Security: `pnpm.overrides` for `lodash-es ^4.18.1` and `dompurify ^3.4.1`; `pnpm audit` now clean (was 1 high + 5 moderate)
- [x] Hygiene: vite dev server `host: 0.0.0.0` → `127.0.0.1` (LAN exposure was unintentional)
- [x] Hygiene: `.gitignore` adds `*.local.json`, `tmp/`, `scratch/`, `.cache/`; tightens `.env*`
- [x] UI: visual identity refreshed to a teal 2D bot face on both surfaces — toolbar icon (square 24×24 viewBox, was 88×120 portrait, now aligns with surrounding toolbar icons) and marketplace card icon (`./icon.svg` + `./icon.png` at project root, same bot face on the existing charcoal background). 2026-04-29.

### Production-hardening pass (2026-05-01)

- [x] Hygiene: `mockups/` → `docs/mockups/` with a `README.md` mapping each variant to where it landed in `src/ui/`. They are reference material, not bundled into `dist/`. The 2026-05-01 production-readiness pass found this was the only outstanding repo-hygiene item; everything else was clean (`pnpm audit` 0 vulns, typecheck/lint/tests all green, no `window.confirm`, no stray credentials, no tracked artifacts).
- [x] Refactor: split `src/ui/ManageActionsPanel.tsx` (1127-line monolith with 9 inline components) into `src/ui/manage-actions/` — one file per component (`ManageRoot`, `ActionRow`, `OverflowMenu`, `DetailEditor`, `DetailReadonly`, `ImportView`, `PillRadio`, `Field`) plus a shared `types.ts` (DraftAction, View, hint maps, helpers). Orchestrator `ManageActionsPanel.tsx` is now 417 lines; every other file is ≤220. Behaviour-preserving — 218 tests still pass, bundle size unchanged.
- [x] Refactor: extract `src/adapter/` from `src/index.ts` per the AGENTS.md "thin Logseq-touching surface" rule. Seven adapter modules: `host-scope.ts` (iframe probe + `logseqFetch` shim), `settings.ts` (`readSettings`, `readPrivateSetting`, `handlePresetChange`), `outline-writer.ts` (`removeBlockChildren`, `insertOutlineTree`), `resolve-input.ts` (block→LLM input), `image-loader.ts` (asset bytes for vision), `consent.ts` (first-run + remote-transition flows), `run-action.ts` (text + vision pipelines, performLLM, debug-log helpers; takes `RunActionContext` so the entry point owns the provider + active-registry state). `src/index.ts` shrunk from 1100 lines to 303; only it does `import "@logseq/libs"`. Behaviour-preserving — 218 tests pass, bundle size unchanged.

### DiffPanel UX pass (2026-05-02)

- [x] Sticky footer + scrollable body: cap `.diff-modal` to `calc(100vh - 96px)`, make `.diff-body` `flex: 1; min-height: 0; overflow-y: auto`. Reject / Edit / Accept stay reachable on long content; same pattern Manage Actions already uses. Picked Variant A from a 3-up HTML mockup (sticky footer / top action bar / inline header buttons).
- [x] Group `rewrite-*` actions into a single "Rewrite ▾" dropdown chip on the action bar. Chip row drops from up to 8 chips to 4. New helpers `partitionBarItems` + `rewriteMenuLabel` exported from `DiffPanel.tsx` with 12 unit tests; user-defined `rewrite-*` actions auto-join the group; menu uses the same outside-click + Esc-to-close pattern as `OverflowMenu`.

### Toolbar entry-point block capture (2026-05-02)

Bug: clicking the toolbar button blurs the editor before our handler runs (Logseq dismisses edit state on any click outside the editor area), so `getCurrentBlock()` / `checkEditing()` return null and the action errors out — directly contradicts the picker's "Click to run on the current block" subtitle. First fix attempt (sync probe in the click handler only) didn't work for that reason; final fix layers a polling cache on top.

- [x] Test: pure helper `derivePickerState(uuid: string | null) → { subtitle, cardsDisabled }` — has-block / no-block branches.
- [x] Implement: `derivePickerState` in `ActionPickerPanel.tsx` (extract the hardcoded subtitle literal).
- [-] Test: `ActionPickerPanel` renders empty-state subtitle + disables every action card — folded into the helper test + manual verify; no DOM test env in this project (vitest `environment: "node"`, UI excluded from coverage gate).
- [x] Implement: extend `ActionPickerPanelProps` with `targetBlockUuid: string | null`; thread through `showActionPicker` options. Picker disables `.picker-row` cards and shows the empty-state subtitle in red (`.diff-hint-warn`) when null.
- [x] Test: pure helper `isCacheFresh(cachedAt, now, staleMs)` for the polling cache — never-seen / fresh / stale branches (3 tests).
- [x] Implement: `src/adapter/editing-block-cache.ts` — three-tier probe (`checkEditing` → `getCurrentBlock` → `getSelectedBlocks`), polling at 500 ms, 10 s freshness, cleared on `onRouteChanged`. Started in `main()` after `registerAllInvocations`.
- [x] Implement: `openActionPicker` in `src/index.ts` runs the live probe first; falls back to the cache; threads the resolved UUID into the panel and into `runAction(action, ctx, uuid)` (third arg, same one the context-menu path uses — vision actions inherit the threading via `runAction` → `runVisionAction`).
- [x] Manual verify: confirmed working — block-text focus + toolbar click resolves the right block; bullet-selected fallback works via `getSelectedBlocks`; no-focus shows the disabled empty state.
- [x] Docs: REQUIREMENTS §3 entry-point capture invariant + resolution strategy (probe + cache) + no-block empty state.
- [x] Changelog: `.changeset/toolbar-block-capture.md` + `[Unreleased]` entry under Changed.

### Toolbar picker grouped layout (2026-05-02)

Goal: replace the single-column verbose-card list with a grouped 2-column grid (Fix / Rewrite / Transform / Vision / Custom) so all ~13 actions fit one viewport without scrolling. Picked Variant A from a 3-up HTML mockup. User-defined actions auto-route into matching built-in categories (id-prefix match) and carry a `custom` pill so authorship stays legible.

- [x] Test: pure helper `categorizeAction(action) → "fix" | "rewrite" | "transform" | "vision" | "custom"` in `src/ui/picker-categories.ts`. 23 cases (id-equals + id-prefix per category, vision short-circuit, partial-word non-matches).
- [x] Implement: `categorizeAction`.
- [x] Test: pure helper `groupActionsForPicker(actions) → ReadonlyArray<{ category, label, actions }>`. 7 cases — fixed category order; empty categories omitted; declared order preserved; labels stable; user `rewrite-*` auto-routes into Rewrite; `isBuiltin` flag carried through.
- [x] Implement: `groupActionsForPicker`.
- [x] Implement: `ActionPickerPanel` swaps the single-column `picker-list` for grouped sections; tags incoming actions with `isBuiltin = index < builtinCount`; new `PickerCard` renders title + scope/mode pills + conditional `custom` pill + `title=…` description tooltip. Empty-state disabling still applies card-by-card.
- [x] Implement: CSS for `.picker-group`, `.picker-group-head`, `.picker-grid` (2-col), refreshed `.picker-card` (compact, single-row), `.picker-pill` family with `.picker-pill-vision` (warning-colour) and `.picker-pill-custom` (accent-colour) variants. Picker modal widened to 640 px to give 2-col grids breathing room.
- [x] Manual verify: all 13 seed actions visible without scrolling; hover tooltips render; no-focus state still disables every card; user `rewrite-*` lands in Rewrite with the `custom` pill.
- [x] Docs: REQUIREMENTS §3 — Toolbar picker layout block.
- [x] Changelog: `.changeset/picker-grouped-grid.md` + `[Unreleased]` Changed entry.

### Theme integration — light/dark sync (2026-05-02)

Goal: plugin UI follows Logseq's light/dark toggle. CSS scaffolding (`html.dark` overrides) was already in place; nothing wired it up, so panels always rendered in light mode regardless of host. Custom community-theme palettes are out of scope — cross-origin iframe blocks `--ls-*` propagation.

- [x] Test: pure helper `resolveInitialTheme(probed: 'dark' | 'light' | null, prefersDark: boolean) → 'dark' | 'light'`. 3 cases — probed wins; falls back to `prefersDark`; defaults to 'light' when both unset.
- [x] Implement: `resolveInitialTheme` in `src/adapter/theme-sync.ts`.
- [x] Implement: `startThemeSync()` — async; try/catch around `logseq.App.getStateFromStore('ui/theme')` (any throw or non-`'dark'|'light'` → null); reads `window.matchMedia('(prefers-color-scheme: dark)').matches`; resolves via the pure helper; toggles `html.dark` on `document.documentElement`; registers `logseq.App.onThemeModeChanged` for live updates.
- [x] Implement: `void startThemeSync()` first thing in `main()` so the very first panel render uses the right palette (no light flash before the toggle catches up).
- [x] Manual verify: light/dark toggle inside Logseq propagates live; reload-while-dark renders dark on first paint.
- [x] Docs: REQUIREMENTS new §15 Theme integration.
- [x] Changelog: `.changeset/theme-sync.md` + `[Unreleased]` Changed entry.

## Deferred / v2 candidates

- True `selection` scope with block-range splicing — see REQUIREMENTS §14
- Whole-page and multi-select scopes
- Per-invocation scope / output-mode override
- Form-based settings UI replacing native settings
- Cloud LLM provider adapter
- Embedded WebLLM provider
- File-in-graph storage path for user actions (Desktop-Electron adapter)
- Redaction / content filtering
- Action history panel (piggybacks on the debug ring buffer)
- Prompt library / community action gallery
- Block-context-menu icon (toolbar button has been migrated to an inline SVG mark; context-menu items still render as text-only labels)
