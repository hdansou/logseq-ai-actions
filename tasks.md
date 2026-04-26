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
- [x] Plugin icon (`public/icon.svg` + rendered `public/icon.png`, 128×128) — minimal indigo mark with bullet + 4-point AI sparkle; toolbar button reuses the same SVG inline (`currentColor`) instead of the `✨` emoji.
- [x] `REQUIREMENTS.md` §14 — selection-scope deferral memo with pain table, SDK gap, acceptance criteria for when we revisit
- [x] `AGENTS.md` — non-discoverable landmines (author name, package-vs-dir mismatch, SDK import pattern, `pnpm dev --port` quirk, dist/ + public/ timing)
- [ ] Inline doc comments on public types (`Action`, `LLMProvider`, `classifyEndpoint`, …) — partial; revisit before v1.0.0

## Phase 9 — E2E (blocker for v1.0.0)

- [ ] Playwright setup against local Logseq (reuse `logseq-plugin-tester` skill)
- [ ] MSW mock LLM server for deterministic responses
- [ ] One golden-path e2e per seed action (invoke → expected outcome on a DB graph fixture)
- [ ] CI Tier 3 job (`.github/workflows/ci.yml` placeholder to replace)

## Phase 10 — Release 1.0.0

- [ ] Confirm author email exposure in `package.json` `author` (currently `Danzu <hdansou@gmail.com>` — public OK?)
- [ ] First changeset summarising v1.0.0
- [ ] Tag + GitHub release
- [ ] Submit to Logseq Marketplace (separate PR to marketplace repo)
- [ ] Freeze REQUIREMENTS.md; future changes go through a versioned PR

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
