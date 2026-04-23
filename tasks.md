# Tasks — `logseq-ai-actions`

Primary task tracker for this project. See `REQUIREMENTS.md` for the signed-off v1 spec.

Legend: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` dropped.

---

## Phase 0 — Requirements & bootstrap

- [x] Kickoff Q&A and decision memos (2026-04-23)
- [x] Write `REQUIREMENTS.md` (2026-04-23)
- [x] Initialize `tasks.md` and `CHANGELOG.md`
- [x] Draft `AGENTS.md` (non-discoverable landmines only)
- [ ] Confirm author display name and GitHub repo URL *(before first public release, not before first commit)*
- [x] `git init` + first commit (requirements-only baseline) — `6c781b8`
- [ ] Decide whether the local dir rename `logseq-action/` → `logseq-ai-actions/` is worth it *(default: keep, document mismatch)*

## Phase 1 — Tooling scaffold

- [x] `pnpm init`; pin Node LTS in `.nvmrc` / `engines` (Node 22)
- [x] Add Vite (vanilla — `vite-plugin-logseq` unnecessary; Logseq loads from Vite dev server directly)
- [x] Add TypeScript (`tsc`), strict `tsconfig.json` with `moduleResolution: bundler`
- [x] Add Biome; minimal `biome.json`
- [x] Add Vitest + `@vitest/coverage-v8` with 80 % gate on `src/**` (excluding `index.ts`, `__sdk_guard__.ts`, `adapter/`, `ui/`)
- [x] Add Zod
- [x] Add Preact + `preact/compat` alias; JSX via `tsconfig.json` (esbuild reads it automatically — Vite 8 doesn't expose `esbuild.jsx` in types)
- [x] Add changesets (`.changeset/config.json` with `access: public`)
- [x] Add `simple-git-hooks` pre-commit: `biome check --write` + `tsc --noEmit`
- [x] `package.json` scripts: `dev`, `build`, `typecheck`, `test`, `test:watch`, `test:integration`, `test:e2e`, `lint`, `lint:fix`, `format`, `changeset`, `release`, `prepare`
- [x] `LICENSE` (MIT) — landed in Phase 0 baseline
- [x] `.gitignore` — landed in Phase 0 baseline
- [x] `src/__sdk_guard__.ts` — compile-time floor at `@logseq/libs ≥ 0.3.1` (references `getCurrentRoute`)
- [x] `index.html` with light/dark CSS variable scaffolding
- [ ] Add GitHub Actions workflow (Phase 1b — tracked as task #4): Tier 1 on push, Tier 3 on PR-to-main, Tier 2 nightly placeholder

## Phase 2 — Pure core (TDD)

Every item here: failing Vitest test first, implementation second.

- [x] `classifyEndpoint(baseUrl)` — LOCAL vs REMOTE (strict loopback; fail-closed on invalid)
- [x] Endpoint presets (LM Studio / Ollama / Goose / Custom) with `findPreset` lookup
- [x] Zod schema for `Action` (id, title, description, scope, outputMode, systemPrompt) — `src/action.ts`, 10 tests
- [ ] Action registry pipeline: `(builtinActions, userJson) => { actions, errors }` (shadowing, validation)
- [ ] Scope resolver: pure `(editorState) => { text, blockUuid, range? }` for each scope
- [ ] Subtree flattener (deterministic indent convention, round-trip safe)
- [ ] Prompt templater: `{{content}}`, `{{selection}}`, etc.
- [ ] Streaming chunk parser (OpenAI Chat Completions SSE format)
- [ ] Diff model: produce segments for the diff panel from `original`/`proposed`
- [ ] Debug log ring buffer (capped at 50, truncation rules)

## Phase 3 — LLM provider

- [x] `LLMProvider` interface (`src/provider.ts`)
- [x] OpenAI-compatible implementation, non-streaming (10 tests covering happy path, auth header, trailing slash, HTTP error, timeout, network error, empty choices, whitespace trim)
- [ ] Streaming variant (SSE parsing) — lands when we wire diff-panel in Phase 5
- [ ] Preset table (LM Studio / Ollama / Goose / Custom) with default base URLs
- [ ] Integration test (Tier 2) against a live endpoint, gated by `TEST_LIVE_LLM=1`

## Phase 4 — Logseq adapter (thin)

- [ ] `editor` adapter: read current block, selection, subtree
- [ ] `editor` adapter: write (replace, splice selection)
- [ ] `registry` adapter: register slash / context-menu / palette / shortcut / toolbar from a single list
- [ ] `settings` adapter: typed getter/setter wrapping `logseq.settings`

## Phase 5 — UI (Preact)

- [ ] First-run consent modal
- [x] Settings panel via **native** `logseq.useSettingsSchema` (preset picker, baseUrl, model, API key, temperature, timeout, debug-log toggle) + preset-change auto-fill for baseUrl/model
- [ ] Replace native settings with Preact settings panel (adds LOCAL/REMOTE badge, REMOTE warning modal, inline validation)
- [ ] LOCAL/REMOTE badge component (used in settings + palette + modals)
- [ ] Diff side panel (original / proposed / accept / reject / edit)
- [ ] Debug log viewer (opt-in panel)

## Phase 6 — Seed actions

- [x] `spellcheck` prompt + schema-validated literal
- [x] `grammar` prompt + schema-validated literal
- [x] `rewrite` prompt + schema-validated literal
- [x] `summarize` prompt + schema-validated literal
- [x] Slash commands registered for each: `/AI Spellcheck`, `/AI Grammar`, `/AI Rewrite`, `/AI Summarize`. Handler reads current block → calls `LLMProvider.complete` → `updateBlock` → success/failure toast. Busy toast while waiting.
- [ ] Golden-fixture tests for each prompt (record desired input→output pairs; run against a real local model in Tier 2 integration tests)
- [ ] Ship `actions.example.json` with 2–3 user-action examples

## Phase 7 — User JSON hot-reload

- [ ] File-watcher on `logseq/plugins/logseq-action/actions.json`
- [ ] Validation failure UX (toast + console, don't crash)
- [ ] Shadow-warning log line when user id matches a built-in

## Phase 8 — Documentation

- [x] `README.md` — install, preset table, LOCAL/REMOTE warning, "don't invoke on sensitive content", quick-start
- [x] Plugin icon (`public/icon.svg` + rendered `public/icon.png`, 128×128)
- [ ] Inline doc comments on public types (Action, LLMProvider — classifyEndpoint already documented)
- [ ] README: user JSON example (after Phase 7 hot-reload lands)

## Phase 9 — E2E

- [ ] Playwright setup against local Logseq (reuse `logseq-plugin-tester` skill)
- [ ] MSW mock LLM server for deterministic responses
- [ ] One golden-path e2e per seed action (slash → expected outcome)

## Phase 10 — Release 1.0.0

- [ ] Confirm author + repo URL with user
- [ ] First changeset summarizing v1.0.0
- [ ] Tag + GitHub release
- [ ] Submit to Logseq Marketplace (separate PR to marketplace repo)

---

## Backlog / v2 candidates

- Whole-page and multi-select scopes
- Per-invocation scope / output-mode override (e.g., Shift-click)
- Form-based settings UI for user actions
- Cloud LLM provider
- Embedded WebLLM provider
- Redaction / content filtering (e.g., skip `#private` blocks)
- Action history panel
- Prompt library / community action gallery
