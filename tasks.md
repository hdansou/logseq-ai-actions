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
- [ ] `git init` + first commit (requirements-only baseline)
- [ ] Decide whether the local dir rename `logseq-action/` → `logseq-ai-actions/` is worth it *(default: keep, document mismatch)*

## Phase 1 — Tooling scaffold

- [ ] `pnpm init`; pin Node LTS in `.nvmrc` / `engines`
- [ ] Add Vite + `vite-plugin-logseq` (verify exact package name + compatible version)
- [ ] Add TypeScript, `tsconfig.json` (strict, `"moduleResolution": "bundler"`)
- [ ] Add Biome; write minimal `biome.json`
- [ ] Add Vitest + coverage provider; wire into Vite config
- [ ] Add Zod
- [ ] Add Preact + `preact/compat` alias in Vite & Vitest
- [ ] Add changesets; `pnpm changeset init`
- [ ] Add `simple-git-hooks` with a pre-commit hook running `biome check --write` + `tsc --noEmit`
- [ ] Add `package.json` scripts: `dev`, `build`, `test`, `test:integration`, `test:e2e`, `lint`, `format`, `typecheck`, `changeset`, `release`
- [ ] Add `LICENSE` (MIT)
- [ ] Add initial `.gitignore`
- [ ] Add GitHub Actions workflow: Tier 1 on every push; placeholder jobs for Tier 2 (nightly) and Tier 3 (PR to main)

## Phase 2 — Pure core (TDD)

Every item here: failing Vitest test first, implementation second.

- [ ] `classifyEndpoint(baseUrl)` — LOCAL vs REMOTE
- [ ] Zod schema for `Action` (id, title, description, scope, outputMode, prompt, defaultShortcut?)
- [ ] Action registry pipeline: `(builtinActions, userJson) => { actions, errors }` (shadowing, validation)
- [ ] Scope resolver: pure `(editorState) => { text, blockUuid, range? }` for each scope
- [ ] Subtree flattener (deterministic indent convention, round-trip safe)
- [ ] Prompt templater: `{{content}}`, `{{selection}}`, etc.
- [ ] Streaming chunk parser (OpenAI Chat Completions SSE format)
- [ ] Diff model: produce segments for the diff panel from `original`/`proposed`
- [ ] Debug log ring buffer (capped at 50, truncation rules)

## Phase 3 — LLM provider

- [ ] `LLMProvider` interface
- [ ] `OpenAICompatibleProvider` implementation (non-streaming + streaming)
- [ ] Preset table (LM Studio / Ollama / Goose / Custom) with default base URLs
- [ ] Integration test (Tier 2) against a live endpoint, gated by `TEST_LIVE_LLM=1`

## Phase 4 — Logseq adapter (thin)

- [ ] `editor` adapter: read current block, selection, subtree
- [ ] `editor` adapter: write (replace, splice selection)
- [ ] `registry` adapter: register slash / context-menu / palette / shortcut / toolbar from a single list
- [ ] `settings` adapter: typed getter/setter wrapping `logseq.settings`

## Phase 5 — UI (Preact)

- [ ] First-run consent modal
- [ ] Settings panel (preset picker, baseUrl, model, API key, temperature, timeout, debug-log toggle)
- [ ] LOCAL/REMOTE badge component (used in settings + palette + modals)
- [ ] Diff side panel (original / proposed / accept / reject / edit)
- [ ] Debug log viewer (opt-in panel)

## Phase 6 — Seed actions

- [ ] `spellcheck` prompt + test harness (golden fixtures for common errors)
- [ ] `grammar` prompt + test harness
- [ ] `rewrite` prompt + test harness
- [ ] `summarize` prompt + test harness
- [ ] Ship `actions.example.json` with 2–3 user-action examples

## Phase 7 — User JSON hot-reload

- [ ] File-watcher on `logseq/plugins/logseq-action/actions.json`
- [ ] Validation failure UX (toast + console, don't crash)
- [ ] Shadow-warning log line when user id matches a built-in

## Phase 8 — Documentation

- [ ] `README.md` — install, preset table, LOCAL/REMOTE warning, "don't invoke on sensitive content", quick-start, user JSON example
- [ ] Inline doc comments on public types (Action, LLMProvider, classifyEndpoint)

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
